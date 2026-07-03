# Lynia vs inDrive — Usability, UX & Architecture Review (Speed / Responsiveness)

**Date:** 2026-07-01 · **Scope:** perceived speed, latency, realtime smoothness, interface
friction, and the architecture that backs them — measured against the bar inDrive sets for a
polished native ride/courier app.

> **How to read this.** The existing [`COMPETITOR-REVIEW.md`](COMPETITOR-REVIEW.md) already grades
> the *architecture* against inDrive/Gojek/Grab (location-on-OLTP, WS-on-serverless) and the
> [`DESIGN-REVIEW.md`](DESIGN-REVIEW.md) grades the *visual system*. Neither measures **perceived
> speed** — how fast the app *feels* in the hand. That is the gap this review fills. Findings are
> first-hand, cite `file:line`, and each carries a severity and the concrete inDrive delta.

> **Status note.** This review is a **decision-history log**: every finding below (Parts A–E, the smell
> index) has since **shipped** and is written as *was X → now Y*. The live build status — the T0–T13
> scorecard, the deployment, the current test count — is owned solely by **`docs/PILOT-READINESS.md`**;
> the roadmap table further down maps each finding to the batch that closed it, and the short
> *still deferred* note records the handful of items intentionally left for later.

---

## TL;DR

Lynia is built on a genuinely strong foundation — a real WebSocket layer with a Redis fan-out
adapter, BullMQ for durable offer-expiry, PostGIS + GiST for geo, guarded compare-and-swap for the
offer loop, skeleton loaders, honest empty/error states, single-flight token refresh, and bounded
request timeouts. For a pilot, the *correctness* bar is high.

**The gap this review found — and which has since been closed — was specific:** the single most
latency-sensitive, delightful moment in an inDrive-style product — the live reverse auction where
bids stream in and seconds matter — *was* implemented with **HTTP polling on both sides**, not push.
Riders discovered new orders on a 5 s poll; customers saw incoming offers on a 4 s poll; and **no
socket was even opened during the bidding phase**. On top of that, the live-tracking map *teleported*
the rider marker and *re-framed* the camera on every GPS fix (fighting the user's own pan/zoom), and
*no* user action was optimistic — every tap cost a full round trip plus a second round trip to refetch.

None of these were hard architectural problems — the realtime plumbing already existed; it was simply
not used for the moments that matter most. **All of them have now shipped** (WS push during
`open_for_offers` and on the rider board, marker-glide + fit-once camera, optimistic UI everywhere),
alongside the scale hardening in Part E. Each finding below records *was → now* with the current code
pointer; the roadmap table maps every item to the batch that closed it.

---

## What is already top-tier (keep it)

Credit where due — these are at or near inDrive parity and should not be touched:

- **Realtime transport done right.** Socket.IO with the `@socket.io/redis-adapter` fans events
  across Cloud Run instances (`tracking.gateway.ts:41-48`) — this is the piece most pilots get
  wrong, and it's correct here.
- **Durable, idempotent offer expiry** via BullMQ with `jobId = orderId`
  (`offer-expiry.service.ts:60-67`) — not a fragile in-process `setInterval`.
- **Correct concurrency.** The select/expire path is a guarded CAS in one transaction with a
  `one_active_ride` partial-unique backstop (`matching.service.ts:35-105`) — "first writer wins,"
  no double-assign.
- **Geo done with the right tool** — `ST_DWithin` over a GiST `geog` index
  (`tracking.service.ts:47-58`, `schema.prisma:120`).
- **Design-system discipline** — content-shaped skeletons over spinners, warm actionable empty
  states, a two-sided journey stepper, spec'd touch targets (`ui/index.tsx`).
- **Resilient API client** — 15 s request timeout with friendly copy, and single-flight refresh so
  the two concurrent pollers don't false-sign-out (`api/client.ts:35-55`).
- **Honest UX** — real 404 vs transient-error split with a Retry (`order/[id].tsx:126-135`), honest
  KYC declined state with a real retry (`rider/index.tsx:170-179`).

The problems below are almost all about **using this good plumbing for the right moments**, not
about building new plumbing.

---

## Part A — The core latency gap: the reverse auction was polled, now pushed

This was the headline. inDrive's identity is the live auction; in Lynia it **used to** run entirely on
HTTP polling with the existing WebSocket dark for its whole duration. It now runs on WS push on both
sides, with polling demoted to a slow self-heal.

### A1. The bidding phase now streams over the socket · **was HIGH → shipped**
**Was:** the socket only opened once the order was *active* (assigned onward) or delivered, so during
`open_for_offers` — the entire auction — there was no socket; the customer's view of bids was driven
by a **4 s poll**. inDrive streams each bid sub-second, so Lynia showed bids in 4-second batches and
three riders bidding at once appeared as one lump — the "watch the bids fly in" feeling was flattened.

**Now:** the socket is opened during `open_for_offers` too — `socketExpected` includes it
(`apps/mobile/app/order/[id].tsx`: `const socketExpected = isActive || status === "delivered" ||
status === "open_for_offers"`), and `OffersService.makeOffer` emits `offers:changed` to the order room
post-commit so bids land on-screen sub-second. The offers query is now only a **15 s** fallback
(`refetchInterval: status === "open_for_offers" ? 15_000 : false`), not the UI driver; a live bid-count
and streaming-bid animation ride the pushed events.

### A2. Riders now get new work pushed to the board · **was HIGH → shipped**
**Was:** the rider board was a 5 s poll, so a new order could sit invisible for up to 5 s before any
nearby rider saw it. The FCM broadcast push at creation was best-effort/OS-delayed and did nothing for
a rider already staring at the board — and 5 s of supply-side blind time directly shrank the bids a
customer received.

**Now:** new broadcasts are pushed to online riders over a **WS board room** the instant an order opens.
The client holds a board socket while online (`apps/mobile/src/realtime/use-rider-board.ts` — joins on
connect, subscribes with the rider's location, prepends the pushed order with no refetch), and the
gateway broadcasts into geo-scoped `board:geo:<cell>` rooms (`tracking.gateway.ts` `emitBoardNewOrder`).
The 5 s poll is now the fallback.

### A3. The rider board is now geo-scoped server-side · **was MED → shipped**
**Was:** `listOpen` returned the 50 newest open orders *city-wide* and the rider app filtered/sorted by
haversine client-side — every poll shipped up to 50 orders' JSON to every rider regardless of proximity
(wasteful on an "expensive data" market), and at volume a rider in a quiet suburb could be crowded out
of the `ORDER BY createdAt DESC LIMIT 50` by newer CBD orders and never see the order two blocks away.

**Now:** the board is geo-scoped server-side — a `pickup_geog` GENERATED column + GiST index lets the
board filter/order by `ST_DWithin` proximity (index scan, not per-row JSON extract), and the WS board
push is scoped to the same 3×3 ~5 km-cell neighbourhood (`packages/shared/src/geo.ts`), with a
city-wide fallback. Smaller payloads, correct locality.

### A4. Rider ETA is now seeded from distance · **was LOW → shipped**
**Was:** every offer a rider didn't hand-edit showed the customer a hardcoded "ETA 10 min" — a
placeholder that then fed the "Fastest" sort and the best-match ranking (`rankOffers`), so the customer
ranked on a constant. **Now:** the offer ETA is seeded from the haversine distance already computed on
the board (a crude `distance / avg_speed`), editable by the rider — the ranking sees a real signal.

---

## Part B — Live-tracking smoothness

Once a rider is assigned, tracking already used the socket — but the render layer *used to* make smooth
GPS look janky. That layer has been reworked; the fixes below all shipped.

### B1. The rider marker now glides between fixes · **was HIGH → shipped**
**Was:** `use-rider-location.ts` streams a fix at most every 10 s / 25 m, and the client applied each
fix by overwriting the marker coordinate — no tween, so the gold pin *jumped* 25 m+ every ~10 s and
read as unreliable GPS. **Now:** the marker glides between fixes via a `MarkerAnimated` bound to an
`AnimatedRegion` that `.timing()`s over a `GLIDE_MS` (900 ms) window (`apps/mobile/src/ui/LiveMap.tsx`),
so the eye reads "the rider is moving," not "the app updated." (Native driver isn't supported for
region animation, so it animates the region fields directly.)

### B2. The camera fits once and no longer fights the user · **was HIGH → shipped**
**Was:** every rider fix triggered an animated `fitToCoordinates` over pickup + drop-off + rider —
visually restless, and if the user had pinched/panned to inspect something the next fix *yanked the
camera back*. **Now:** `LiveMap.tsx` fits pickup/dropoff/rider **once on mount / on status change** and
then holds a stable camera — a subsequent fix must not re-frame the map — with an explicit bottom-right
**Recenter** control (`accessibilityLabel="Recenter map on the trip"`) that re-fits on demand. The refit
is no longer keyed on `rider.lat/lng`.

### B3. The GPS write is now off the realtime hot path · **was MED → shipped**
**Was:** the customer's live update was emitted *after* awaiting a Postgres write that recomputed the
`geog` point and bumped the GiST index on every ping — DB latency added straight to perceived tracking
lag, and the exact OLTP-hot-path write `COMPETITOR-REVIEW §3.1` flagged. **Now:** the gateway emits to
the room **first**, then persists (`tracking.gateway.ts` `riderLocation`: `coalescePositionEmit(...)`
then `await this.tracking.recordFix(...)`), and the persist is off the hot path — `TrackingService`
writes the freshest position to Redis (`SET … EX`) + a Redis GEO set (`GEOADD`) and **throttles** the
heavy `lat/lng/geog` PG flush (every ~Nth fix / on disconnect), while the ET3 heartbeat stays an
un-throttled single-column write (`apps/api/src/tracking/tracking.service.ts`). Drops tracking lag and
removes the per-corridor write churn. *(No-Redis dev/test keeps the old per-fix flush.)*

### B4. Transport now falls back to polling · **was MED → shipped**
**Was:** the sockets forced `transports: ["websocket"]`, so on the constrained/proxied mobile networks
this app targets a failed WS upgrade meant the socket silently never connected and tracking degraded to
the REST self-heal with no signal to the user. **Now:** `apps/mobile/src/realtime/socket.ts` uses
`transports: ["websocket", "polling"]` so Socket.IO can fall back, and the order screen surfaces a
subtle "reconnecting…" `OfflineBanner` when the socket is down.

### B5. Reconnect no longer flashes the map · **was MED → shipped**
**Was:** on `connect`/`connect_error` the handler could drop the cached snapshot and trigger a fresh
fetch, so a brief network blip blanked and re-popped the map. **Now:** `use-order-socket.ts` refetches
in the **background** (React Query keeps previous data on screen while the snapshot re-loads — it
invalidates rather than `setQueryData(undefined)`), and `connected` drives a "reconnecting" affordance
instead of a flash.

---

## Part C — Perceived responsiveness (the "feels instant" layer)

### C1. Optimistic UI now shipped on the key mutations · **was HIGH → shipped**
**Was:** every mutation waited for the server, then `invalidateQueries` triggered a *second* round trip
before the UI reflected the change (select a rider, cancel, rate, rider advance/deliver) — so each tap
cost round-trip #1 (mutation) + round-trip #2 (refetch) before anything visibly changed, commonly 1–3 s
on a constrained link. **Now:** the select path writes optimistically to the query cache with a
rollback on error (`apps/mobile/app/order/[id].tsx`: `onMutate` applies the assigned state / collapses
the offer list; a rolled-back select is shown **muted, not red** because it's a race outcome, not a user
error), and the rider-advance path is likewise optimistic. Taps feel weightless; the server reconciles
in the background.

### C2. Query client now sets a `staleTime` · **was MED → shipped**
**Was:** the client left `staleTime` at React Query's default 0, so a screen you'd just left was stale
the instant you returned — History → Order → back-to-History refetched from scratch with a skeleton.
**Now:** `apps/mobile/src/query/client.ts` sets `staleTime: 30_000`, so back-navigation paints the
cached list instantly and revalidates quietly; the live order/offers queries stay driven by their own
`refetchInterval` + the WS pushes (which fire regardless of `staleTime`).

### C3. The order screen now paints from a seeded cache · **was MED → shipped**
**Was:** `home.tsx` awaited `createOrder` then navigated, and the order screen showed a skeleton while
it fetched the order it was just handed — create-latency + navigate + fetch-latency of
blank-then-skeleton-then-content. **Now:** `home.tsx` seeds the order cache from the `createOrder`
response (`qc.setQueryData<OrderSnapshot>(orderKey(order.id), …)`) before navigating, so the screen
paints immediately.

### C4. Pollers demoted to a slow fallback · **was MED → shipped**
**Was:** on the "cheap Android, expensive data" target market a single session ran several timers at
once — order/offers polls at 4 s, board poll at 5 s, plus the job/heartbeat timers — draining battery
and data. **Now:** WS push is the source of truth for the two hottest paths (A1 offers, A2 board), and
the offers poll is demoted to a **15 s** self-heal fallback; the online heartbeat stays (it's the ET3
liveness signal). Polling is strictly the slow fallback, not the driver.

---

## Part D — Interface & interaction friction

### D1. The order form now front-loads pin+price and persists a draft · **was MED → shipped**
**Was:** `home.tsx` put two map-pins + six text fields + a fare on one screen before "Broadcast," all
local `useState` with no draft persistence — an accidental Android back or app switch dropped it all.
**Now:** the required set is pin-pickup / pin-drop / price as the hero in a thumb-zone `BottomSheet`,
with landmarks/phones/declared-value collapsed under "Add details," and a **PII-free persisted draft**
survives an interruption (the two phone numbers are deliberately *not* stored). *(The full
single-full-bleed-map + draggable-sheet build is spec'd under DESIGN.md DT5, device-gated — see "still
deferred" below.)*

### D2. "Use my location" now reverse-geocodes the landmark · **was MED → shipped**
**Was:** `MapPicker` centred the map and dropped the pin from GPS but left the landmark field blank to
type, even with the coordinates in hand. **Now:** the pinned point is reverse-geocoded to pre-fill an
editable landmark ("• from map"), removing a text-entry step.

### D3. Star rating is now rating-on-tap with undo · **was LOW → shipped**
**Was:** tapping stars only set local state; a second "Submit rating" tap was required and navigating
away first lost the rating. **Now:** a star tap submits optimistically after a short undo window
(`apps/mobile/app/order/[id].tsx` — rating is terminal server-side → `completed`, so the window holds
the commit rather than un-rating; Undo cancels, re-tap re-arms, the pending submit is cleared on unmount
so it can't fire after teardown).

### D4. Hit targets padded to ≥44 px · **was LOW → shipped**
**Was:** sort pills (`hitSlop={6}`) and rating stars (`hitSlop={8}`) sat below the 44 px target the
design system otherwise enforces. **Now:** the sort pills and stars are padded to a ≥44 px effective
touch area.

### D5. Tracking map is now taller / expandable · **was LOW → shipped**
**Was:** `LiveMap` hardcoded `height: 200`, roughly half a small screen — small for reading a moving pin
during delivery. **Now:** the tracking map is taller and expandable during active statuses (an expand
control alongside Recenter), closer to inDrive's near-full-bleed tracking view.

### D6. Rider now has an always-visible online chip · **was LOW/MED → shipped**
**Was:** a failed heartbeat flipped the rider offline with only a reactive error — no glanceable
indicator, so a rider could believe they were online and be missing orders. **Now:** a persistent
online/offline chip is always visible on the rider home, so the connection state is glanceable.

---

## Part E — Architecture & scale smells (verified, now closed)

The realtime/geo/concurrency choices were sound; these were the sharp edges that would bite as the pilot
grows — all now shipped. (For the record, the two "unindexed" claims that came up in review were *not*
problems: `DeviceToken` **does** have `@@index([profileId])`, and Prisma's nested `select` is a single
joined query, not classic N+1.)

### E1. Live-position write is now off the OLTP hot path · **was HIGH (at scale) → shipped**
**Was:** every GPS ping was a synchronous raw `UPDATE ... geog = ST_SetSRID(...)` that churned the GiST
index — linear in active riders, and the exact write `COMPETITOR-REVIEW §3.1` flagged. **Now (= B3):**
`TrackingService` writes the freshest position to Redis (`SET … EX`) + a Redis GEO set (`GEOADD`) and
throttles the heavy PG flush (every ~Nth fix / on disconnect), with the ET3 heartbeat kept un-throttled;
`nearbyRiders` `GEOSEARCH`es the Redis index and uses PG only as the `is_online` authority
(`apps/api/src/tracking/tracking.service.ts`, `apps/api/src/common/redis.ts`). The single
highest-leverage scale change.

### E2. Offer-expiry thundering herd is now jittered · **was MED → shipped**
**Was:** one expiry job per order at a fixed 90 s delay meant a burst of orders created together fired
their `expireOrder` transactions together — a synchronized DB spike. **Now:** the expiry delay is
jittered (`OFFER_WINDOW_MS + random(0, ~10s)`) so the herd spreads out.

### E3. WS fan-out now has a server-side coalesce guard · **was MED → shipped**
**Was:** the gateway emitted every received fix straight to the room with no server-side coalescing, so
a fast/misbehaving client could flood a room. **Now:** `coalescePositionEmit` (`tracking.gateway.ts`)
caps `position` emits at **≤1/sec per room** — leading edge fires immediately (preserving
emit-before-persist), a trailing timer flushes the latest buffered fix — while the durable per-fix
persist runs untouched. The server no longer trusts the client emitter.

### E4. Prod multi-instance now hard-fails without Redis · **was MED → shipped**
**Was:** `auth/otp-store.ts` kept OTP + rate-limit counters in a process `Map` when `REDIS_URL` was
unset, so on >1 Cloud Run instance the brute-force limit became per-instance (effectively multiplied) —
the tracking adapter had the same in-memory-fallback footgun. **Now:** a prod `REDIS_URL` **boot-guard**
hard-fails boot when `NODE_ENV=production` and `REDIS_URL` is unset, covering both.

### E5. History OR-scan is now index-order · **was LOW/MED → shipped**
**Was:** the history query filtered `customer_id OR rider_id` ordered by `created_at` with only a
single-column `riderId` index and no `customerId` index — a full-scan-then-sort as `orders` grows.
**Now:** migration `0007_history_indexes` adds `orders(customer_id, created_at)` +
`orders(rider_id, created_at)` + `order_events(order_id, created_at)` (subsuming and dropping the old
single-column indexes), so both OR sides and the snapshot timeline resolve as index-order reads. The
UNION rewrite was intentionally skipped — with both sides indexed and a bounded `take`, it buys nothing.

### E6. Connection pool now set explicitly · **was LOW → shipped**
**Was:** `PrismaService` used the default pool with no explicit `connection_limit`, which could serialize
under concurrent offer-loop transactions on multi-instance Cloud Run. **Now:** a deterministic
`connection_limit` (default 10, `DATABASE_CONNECTION_LIMIT` / `DATABASE_POOL_TIMEOUT` overrides) is set
on the datasource URL (`apps/api/src/prisma/prisma.service.ts`); a URL-present or unparseable value is
left untouched so a bad value can't block boot.

---

## Prioritized roadmap (mapped to inDrive parity)

| # | Change | Files | Effort | inDrive parity unlocked | Status |
|---|--------|-------|--------|--------------------------|--------|
| **P0-1** | Push offers to the customer over WS during `open_for_offers`; poll → 15 s fallback | `offers.service.ts`, `order/[id].tsx:60,66`, `use-order-socket.ts` | S | Live auction feels live (A1) | ✅ done (batch 1) |
| **P0-2** | Push new broadcasts to online riders' board over WS | `orders.service.ts`, `tracking.gateway.ts`, `rider/index.tsx:103` | M | Instant supply-side pickup (A2) | ✅ done (batch 1; geo-scoped push added batch 3) |
| **P0-3** | Optimistic UI on select/cancel/rate/advance | `order/[id].tsx`, `rider/job.tsx` | S | Weightless taps (C1) | ✅ done (batch 1) |
| **P0-4** | Interpolate marker + fit-camera-once + recenter button | `LiveMap.tsx`, `use-order-socket.ts` | S/M | Smooth tracking (B1, B2) | ✅ done (batch 1) |
| **P1-1** | Emit-before-persist; move live position to Redis, throttle PG flush | `tracking.gateway.ts:83`, `tracking.service.ts:35` | M | Low-lag tracking + scale (B3, E1) | ✅ done (emit-before-persist batch 1; Redis index batch 2) |
| **P1-2** | Geo-scope the rider board server-side (`ST_DWithin`) | `orders.service.ts:90`, `tracking.service.ts` | M | Correct locality, smaller payloads (A3) | ✅ done (batch 2; `pickup_geog` GiST batch 3) |
| **P1-3** | `staleTime`/cache + seed order cache on create; add `polling` transport | `query/client.ts`, `home.tsx:56`, socket hooks | S | Instant nav, resilient connect (C2, C3, B4) | ✅ done (batch 1) |
| **P1-4** | Trim required order form to pin+pin+price; persist draft; reverse-geocode landmark | `home.tsx`, `MapPicker.tsx` | M | Fewer taps to broadcast (D1, D2) | ✅ done (draft + reverse-geocode batch 2; map-anchored IA slice batch 3) |
| **P2-1** | Jitter offer-expiry; server-side WS coalesce; prod REDIS_URL boot guard | `offer-expiry.service.ts`, `tracking.gateway.ts`, `config/env.ts` | S | Smooth under load (E2, E3, E4) | ✅ done — jitter (E2) + boot-guard (E4) batch 3; server-side WS coalesce (E3) PR #85 |
| **P2-2** | Composite indexes + UNION history; explicit Prisma pool | migrations, `orders.service.ts`, `prisma.service.ts` | S | Headroom as data grows (E5, E6) | ✅ done — `pickup_geog` GiST + Redis GEO batch 3; history composite indexes (E5) + explicit pool (E6) PR #85 (the UNION rewrite was intentionally skipped — the composites make it unnecessary at the bounded 100-row take) |
| **P2-3** | Rating-on-tap, ≥44 px targets, taller tracking map, online chip, seeded ETA | `order/[id].tsx`, `LiveMap.tsx`, `rider/index.tsx` | S | Interface polish (D3–D6, A4) | ✅ done — ≥44 px targets, taller map (D5), online chip (D6), seeded ETA (A4) batches 1–2; rating-on-tap (D3) PR #85 |

**P0 is the whole story:** four changes (three of them small) that reuse plumbing already in the
repo take the auction and the tracking map from "polled and jumpy" to "live and smooth." Everything
after is depth and scale headroom. **Every roadmap item — P0 through P2 — has now shipped**
(P0/P1 in batches 1–2, the P2 remainder in PR #85). What's left below is only the
intentionally-deferred / device-gated set.

---

## Still deferred (intentional — not pilot blockers)

Everything this review flagged (P0–P2) has shipped; live build status lives in
`docs/PILOT-READINESS.md`. The handful of items left open are deliberate:

- **Redis online-set for `nearbyRiders`** — the safe GEOSEARCH-then-PG-filter ships; the online-set/ZREM
  design is a ghost-rider consistency trap, intentionally avoided.
- **Per-region WS board rooms** at multi-city scale — the geo-scoped mechanism already ships (the gateway
  broadcasts into `board:geo:<cell>` rooms over a 3×3 ~5 km-cell neighbourhood, `tracking.gateway.ts`
  `emitBoardNewOrder` + `packages/shared/src/geo.ts`). Only *named multi-city regions* on top of the cells
  are deferred — not needed at pilot volume, and the cell grid scales without a schema migration.
- **Full single-full-bleed-map DT5 build** — the map-anchored IA slice and the gesture-driven `BottomSheet`
  ship; the full map-behind + 3-stop peek/half/full + keyboard-lift re-architecture stays device-gated
  (tunable only on-device). Spec in `docs/DESIGN.md` DT5.

---

## Smell index (quick scan — all resolved)

Every smell this scan flagged has since shipped a fix; kept as a resolution ledger.

- 🟢 Auction now pushed, socket open during bidding (`order/[id].tsx` `socketExpected`); rider board pushed (`use-rider-board.ts`) — was A1/A2
- 🟢 Marker glides via `AnimatedRegion` (`LiveMap.tsx` `GLIDE_MS`); camera fits once + Recenter button (`LiveMap.tsx`) — was B1/B2
- 🟢 Optimistic UI on select/rate/advance with muted rollback (`order/[id].tsx`) — was C1
- 🟢 Emit-before-persist + Redis live index off the OLTP hot path (`tracking.gateway.ts`, `tracking.service.ts`) — was B3/E1
- 🟢 Board geo-scoped server-side via `pickup_geog` GiST + cell-scoped push — was A3
- 🟢 `transports:["websocket","polling"]` fallback (`socket.ts`) — was B4
- 🟢 `staleTime: 30_000` on the query client (`query/client.ts`) — was C2
- 🟢 Pollers demoted to a ≥15 s fallback; WS authoritative — was C4
- 🟢 Offer-expiry jittered (`offer-expiry.service.ts`) — was E2
- 🟢 Server-side WS coalesce ≤1/sec/room (`tracking.gateway.ts` `coalescePositionEmit`) — was E3
- 🟢 Reconnect refetches in the background (keeps previous data, no flash) (`use-order-socket.ts`) — was B5
- 🟢 ETA seeded from distance, front-loaded form + PII-free draft, reverse-geocode, ≥44 px targets, taller map — was A4, D1–D5
