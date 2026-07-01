# Lynia vs inDrive — Usability, UX & Architecture Review (Speed / Responsiveness)

**Date:** 2026-07-01 · **Scope:** perceived speed, latency, realtime smoothness, interface
friction, and the architecture that backs them — measured against the bar inDrive sets for a
polished native ride/courier app.

> **How to read this.** The existing [`COMPETITOR-REVIEW.md`](COMPETITOR-REVIEW.md) already grades
> the *architecture* against inDrive/Gojek/Grab (location-on-OLTP, WS-on-serverless) and the
> [`DESIGN-REVIEW.md`](DESIGN-REVIEW.md) grades the *visual system*. Neither measures **perceived
> speed** — how fast the app *feels* in the hand. That is the gap this review fills. Findings are
> first-hand, cite `file:line`, and each carries a severity and the concrete inDrive delta.

---

## TL;DR

Lynia is built on a genuinely strong foundation — a real WebSocket layer with a Redis fan-out
adapter, BullMQ for durable offer-expiry, PostGIS + GiST for geo, guarded compare-and-swap for the
offer loop, skeleton loaders, honest empty/error states, single-flight token refresh, and bounded
request timeouts. For a pilot, the *correctness* bar is high.

**But the app does not yet *feel* like inDrive, and the reason is specific:** the single most
latency-sensitive, delightful moment in an inDrive-style product — the live reverse auction where
bids stream in and seconds matter — is implemented with **HTTP polling on both sides**, not push.
Riders discover new orders on a **5 s poll**; customers see incoming offers on a **4 s poll**; and
**no socket is even opened during the bidding phase**. On top of that, the live-tracking map
**teleports the rider marker** and **re-frames the camera on every GPS fix** (fighting the user's
own pan/zoom), and **no user action is optimistic** — every tap costs a full round trip plus a
second round trip to refetch.

None of these are hard architectural problems. The realtime plumbing already exists; it is simply
not used for the moments that matter most. The headline fixes below are days of work, not a
re-platform.

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

## Part A — The core latency gap: the reverse auction is polled, not pushed

This is the headline. inDrive's identity is the live auction. In Lynia it runs entirely on HTTP
polling, and the existing WebSocket is dark for its whole duration.

### A1. No socket during `open_for_offers` — the bidding phase is pure polling · **HIGH**
`order/[id].tsx:60`
```ts
useOrderSocket(isActive || status === "delivered" ? orderId : null);
```
The socket is only opened once the order is **active** (assigned onward) or delivered.
During `open_for_offers` — the entire auction — there is no socket. The customer's view of incoming
bids is driven solely by:
```ts
// order/[id].tsx:62-67
const offersQ = useQuery({ ... enabled: status === "open_for_offers",
  refetchInterval: status === "open_for_offers" ? 4000 : false });
```
**inDrive delta:** inDrive streams each bid to the screen sub-second over a persistent connection.
Lynia shows bids in **4-second batches**. In a 90 s window (`OFFER_WINDOW_MS`,
`offer-expiry.service.ts:10`), up to ~4.4% of the auction is spent waiting on a poll tick, and three
riders bidding at once appear as one lump. The competitive, "watch the bids fly in" feeling — the
reason to build a reverse auction at all — is flattened.
**Fix:** emit an `offer:new` / `offers:changed` event to the order room from `OffersService.makeOffer`
(post-commit, best-effort, exactly like `notifyNewOffer` already is at `offers.service.ts:48`), and
open the socket during `open_for_offers`, not just when active. Keep the poll as a slow self-heal
(e.g. 15 s), don't drive the UI with it.

### A2. Riders discover new work on a 5 s poll · **HIGH**
`rider/index.tsx:99-104`
```ts
const openQ = useQuery({ queryKey: ["openOrders"], queryFn: getOpenOrders,
  enabled: online, refetchInterval: online ? 5000 : false });
```
The rider board is a 5 s poll. A new order can sit invisible for up to 5 s before any nearby rider
sees it on-screen. There **is** an FCM broadcast push at creation (`orders.service.ts:59` →
`notifyNewBroadcast`), but push is best-effort, is throttled/delayed by the OS, and does nothing for
a rider who already has the board open. In a 90 s auction, 5 s of blind time on the supply side
directly shrinks the number of bids a customer receives.
**Fix:** push new broadcasts to online riders over the WS board (a `board:new-order` room keyed by
corridor/geo-cell), so the board updates the instant an order opens. Poll becomes the fallback.

### A3. The rider board is not geo-scoped server-side · **MED**
`orders.service.ts:90-105`
```ts
async listOpen() {
  const orders = await this.prisma.order.findMany({
    where: { status: "open_for_offers" }, orderBy: { createdAt: "desc" }, take: 50, ... });
}
```
`listOpen` returns the 50 newest open orders **city-wide**; the rider app filters/sorts by haversine
distance **client-side** (`rider/index.tsx:106-109`). Two consequences: (1) every 5 s poll ships up
to 50 orders' worth of JSON to every online rider regardless of proximity — wasteful on the
"expensive data" market this app explicitly targets; (2) at higher volume, `ORDER BY createdAt DESC
LIMIT 50` means a rider in a quiet suburb can be crowded out of the list by 50 newer CBD orders and
**never see the order two blocks away**. The geo-scoping that already exists for the *push*
(`nearbyRiders`, `ST_DWithin`) is not applied to the *board*.
**Fix:** accept the rider's location on `GET /orders/open` and reuse `ST_DWithin` to return only
in-radius orders, ordered by distance server-side. Smaller payloads, correct locality.

### A4. Rider ETA defaults to a hardcoded "10" · **LOW**
`rider/index.tsx:135` — `setEta("10")`. Every offer a rider doesn't hand-edit shows the customer
"ETA 10 min," which then feeds the "Fastest" sort and the "best-match" ranking (`rankOffers`). The
customer is ranking on a placeholder. **Fix:** seed ETA from the haversine distance already computed
on the board (`km` at `rider/index.tsx:108`) — even a crude `distance / avg_speed` beats a constant.

---

## Part B — Live-tracking smoothness

Once a rider is assigned, tracking *does* use the socket — but the render layer makes smooth GPS
look janky.

### B1. The rider marker teleports — no interpolation · **HIGH**
`use-rider-location.ts:25-30` streams a fix at most every 10 s / 25 m
(`{ accuracy: Balanced, distanceInterval: 25, timeInterval: 10_000 }`), and the client applies each
fix by overwriting the marker coordinate (`use-order-socket.ts:32-38`). There is no tween between
fixes, so the gold pin **jumps** 25 m+ every ~10 s.
**inDrive delta:** inDrive interpolates the marker along the path so it glides continuously; the eye
reads it as "the rider is moving," not "the app updated." Jumps read as unreliable GPS.
**Fix:** animate the marker between fixes (`Marker.animateMarkerToCoordinate` / a `MarkerAnimated` +
`Animated.timing` over the ~10 s cadence), and consider tightening cadence near pickup/drop-off.

### B2. The camera re-frames on every fix and fights the user · **HIGH**
`LiveMap.tsx:24-34`
```ts
useEffect(() => {
  mapRef.current?.fitToCoordinates(coords, { edgePadding: {...}, animated: true });
}, [pickup..., dropoff..., props.rider?.lat, props.rider?.lng]);
```
Every rider fix triggers an **animated `fitToCoordinates`** over pickup + drop-off + rider. Two
problems: (1) it re-pans/zooms the whole map every ~10 s, which is visually restless; (2) if the
user has pinched or panned to inspect something, the next fix **yanks the camera back** — the map
literally fights the user. On a constrained device the repeated animated refit is also a frame-rate
cost.
**inDrive delta:** inDrive fits once, then holds a stable camera (follow-mode you can break by
touching the map, re-centred only via an explicit "recenter" button).
**Fix:** `fitToCoordinates` once on first render / on status change; after that, keep the camera
stable (or gently follow only the rider), and add a manual "recenter" affordance. Stop keying the
refit on `rider.lat/lng`.

### B3. GPS write sits in the realtime hot path, ahead of the broadcast · **MED**
`tracking.gateway.ts:83-90`
```ts
await this.tracking.updateRiderLocation(user.sub, body.lat, body.lng); // raw UPDATE + geog recompute
this.server.to(orderRoom(body.orderId)).emit("position", { ... });
```
The customer's live update is emitted **after** awaiting a Postgres write that recomputes the
`geog` point and bumps the GiST index on every ping (`tracking.service.ts:35-44`). The DB latency is
added to the customer's perceived tracking lag, and it's the exact OLTP-hot-path write
`COMPETITOR-REVIEW §3.1` already flags as "the first thing that breaks at scale."
**Fix:** emit to the room **first**, then persist — and move the persist off the hot path: write the
live position to Redis (`GEOADD` / a per-rider key, TTL ~30 s) for the "nearby" query and the
reconnect snapshot, and flush to Postgres on a throttled cadence (every Nth fix / every ~30 s)
rather than every ping. This both drops tracking lag and removes the 20-writes/sec-per-corridor
churn.

### B4. `transports: ["websocket"]` with no polling fallback · **MED**
`use-order-socket.ts:22` and `use-rider-location.ts:24` both force
`transports: ["websocket"]`. On the constrained/proxied mobile networks this app targets, the WS
upgrade can fail outright; with no `polling` fallback in the transport list, the socket silently
never connects and tracking degrades to the 10 s REST self-heal — a worse experience with no signal
to the user that "live" is actually "every 10 s." **Fix:** allow `["websocket", "polling"]` so
Socket.IO can fall back, and surface a subtle "reconnecting…" state when it does.

### B5. Reconnect invalidates the cache and flashes the map · **MED**
`use-order-socket.ts:25-29` — on `connect` and on `connect_error`, the handler calls
`qc.invalidateQueries(orderKey)`, which drops the cached snapshot and triggers a fresh REST fetch.
During a brief network blip the map/rider data blanks and re-pops. **Fix:** on reconnect, refetch in
the background without invalidating (`refetchType: 'active'` / a keepPreviousData pattern) so the map
never flashes empty.

---

## Part C — Perceived responsiveness (the "feels instant" layer)

### C1. No optimistic UI anywhere · **HIGH**
Every mutation waits for the server, then `invalidateQueries` triggers a **second** round trip
before the UI reflects the change:
- Select a rider — `order/[id].tsx:92-98` (spinner, then refetch; the offer list doesn't collapse
  and the assigned state doesn't appear until the refetch lands).
- Cancel — `order/[id].tsx:114-117`. Rate — `order/[id].tsx:107-113`. Rider advance/deliver —
  `rider/job.tsx:37-57`.
**inDrive delta:** inDrive reflects the tap immediately and reconciles in the background; taps feel
weightless. Here each tap costs round-trip #1 (mutation) + round-trip #2 (refetch) before anything
visibly changes — commonly 1–3 s on a constrained link.
**Fix:** `onMutate` optimistic writes to the query cache with rollback on error (React Query's
standard pattern). The delivery-code and assigned state can paint instantly from the mutation's own
response (`selectOffer` already returns the code at `order/[id].tsx:95`).

### C2. Query client has no `staleTime`/`gcTime` — every navigation refetches · **MED**
`query/client.ts:3-5`
```ts
new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } });
```
React Query defaults `staleTime` to 0, so a screen you just left is stale the instant you return —
History → Order → back to History refetches from scratch with a skeleton, instead of showing the
cached list instantly and revalidating quietly. **Fix:** set a small `staleTime` (e.g. 30 s for
history/profile) so back-navigation is instant; leave the live order/offers queries driven by their
own `refetchInterval`.

### C3. No prefetch / optimistic navigation into the order screen · **MED**
`home.tsx:54-57` awaits `createOrder`, then navigates; the order screen then shows a `SkeletonList`
while it fetches the order it was just handed (`order/[id].tsx:119-124`). That's create-latency +
navigate + fetch-latency of blank-then-skeleton-then-content. **Fix:** seed the order cache from the
`createOrder` response with `queryClient.setQueryData(orderKey(id), ...)` before navigating so the
screen paints immediately, or prefetch on submit.

### C4. Multiple concurrent pollers drain battery and data · **MED**
On the target market ("cheap Android, expensive data") a single active session runs several timers at
once: order poll 4–10 s (`order/[id].tsx:50-56`), offers poll 4 s (`:66`), rider active-job poll 6 s
(`rider/job.tsx:26`) / 8 s (`rider/index.tsx:40`), open-orders poll 5 s (`:103`), `me` poll 5 s while
KYC pending (`:49`), and a 20 s online heartbeat (`:88-97`). Replacing the offer/board polls with the
push events above (A1, A2) removes the two hottest ones; the rest should widen once push is
authoritative. **Fix:** make WS the source of truth for live state and treat polling strictly as a
slow fallback (≥15 s).

---

## Part D — Interface & interaction friction

### D1. The order form is long and loses everything on an accidental back · **MED**
`home.tsx` puts two map-pins + six text fields (pickup landmark/phone, drop landmark/phone, item,
declared value) + a fare on one screen before "Broadcast request." It's a lot of typing for a
courier request, and the whole form is local `useState` with no draft persistence — an accidental
Android back or app switch drops it all. **inDrive delta:** inDrive front-loads *pin + price* and
defers the rest. **Fix:** reduce the required set to pin-pickup, pin-drop, price (everything else
optional/expandable), and persist a draft so an interruption doesn't cost the whole form.

### D2. "Use my location" doesn't fill the landmark (no reverse-geocode) · **MED**
`MapPicker.tsx:44-63` centres the map and drops the pin from GPS but leaves the landmark field blank
for the user to type — even though the coordinates are in hand. **Fix:** reverse-geocode the pinned
point to pre-fill the landmark (editable), removing a text-entry step.

### D3. Star rating is a two-step, loseable action · **LOW**
`order/[id].tsx:235-246` — tapping stars only sets local state; a second "Submit rating" tap is
required, and navigating away before it loses the rating. inDrive submits on tap. **Fix:** submit on
star tap (optimistically), with an undo affordance.

### D4. Small hit targets on sort pills and stars · **LOW**
Sort pills use `hitSlop={6}` (`order/[id].tsx:171-176`) and rating stars `hitSlop={8}` (`:240`),
below the 44 px target the design system otherwise enforces (`ui/index.tsx:80`). Easy mis-taps on
small phones. **Fix:** pad to ≥44 px effective touch area.

### D5. Fixed 200 px tracking map · **LOW**
`LiveMap.tsx:37` hardcodes `height: 200`, roughly half a small screen and small for reading a moving
pin during delivery. inDrive uses a near-full-bleed map while tracking. **Fix:** make the tracking
map taller (or expandable) during active statuses.

### D6. Rider can be knocked offline silently · **LOW/MED**
`rider/index.tsx:88-97` — a failed 20 s heartbeat flips the rider offline and shows a reactive error,
but there's no persistent, glanceable online/offline indicator; a rider can believe they're online
and be missing orders. **Fix:** a always-visible connection/online chip, with tap-to-reconnect.

---

## Part E — Architecture & scale smells (verified)

The realtime/geo/concurrency choices are sound; these are the sharp edges that bite as the pilot
grows. (I checked the two "unindexed" claims that came up in review: `DeviceToken` **does** have
`@@index([profileId])` at `schema.prisma:98`, and Prisma's nested `select` is a single joined query,
not classic N+1 — those are *not* problems. The below are.)

### E1. Live-position write is on the OLTP hot path · **HIGH (at scale)**
As in B3: every GPS ping is a synchronous raw `UPDATE ... geog = ST_SetSRID(...)` that churns the
GiST index (`tracking.service.ts:35-44`). ~20 writes/s per busy corridor today, linear in active
riders. Already flagged in `COMPETITOR-REVIEW §3.1`; the fix (Redis live index + throttled Postgres
flush) is the single highest-leverage scale change and also improves B3's latency.

### E2. Offer-expiry thundering herd at T+90 s · **MED**
`offer-expiry.service.ts:60-66` schedules one job per order at a fixed 90 s delay. A burst of orders
created together fire their `expireOrder` transactions together — each doing order + offers + event
writes — as a synchronized DB spike. **Fix:** jitter the delay (`OFFER_WINDOW_MS + random(0, 10s)`),
or reconcile expiries on a short sweep instead of per-order jobs.

### E3. WS fan-out has no backpressure/throttle guard · **MED**
`tracking.gateway.ts:84-91` emits every received fix straight to the room with no server-side
coalescing. Combined with a fast/misbehaving client emitter, one rider can flood a room. The client
throttle (B1/C4) helps, but the server should not trust the client. **Fix:** coalesce per-room
position emits to ≤1/second server-side.

### E4. In-memory OTP/rate-limit store must never run in prod multi-instance · **MED**
`auth/otp-store.ts` keeps OTP + rate-limit counters in a process `Map` when `REDIS_URL` is unset. On
>1 Cloud Run instance that makes the brute-force limit per-instance, i.e. effectively multiplied.
**Fix:** hard-fail boot if `NODE_ENV=production` and `REDIS_URL` is unset (the tracking adapter has
the same in-memory-fallback footgun at `tracking.gateway.ts:42` — same guard covers both).

### E5. History query is an unindexed OR scan · **LOW/MED**
`orders.service.ts:135-155` filters `OR: [{customerId}, {riderId}]` ordered by `createdAt` with only
single-column `@@index([riderId])` and no `customerId` index. Fine at pilot size, a full-scan sort as
`orders` grows. **Fix:** `orders(customer_id, created_at DESC)` + `orders(rider_id, created_at DESC)`
and a UNION rewrite. Similarly, composite `orders(status, created_at DESC)` and
`order_events(order_id, created_at)` turn today's filter-then-sort into index-order reads.

### E6. Connection pool / graceful-shutdown not tuned · **LOW**
`PrismaService` uses the default 10-connection pool with no explicit `connection_limit`. Under
concurrent offer-loop transactions on multi-instance Cloud Run this can serialize. Worth setting
explicitly before load, not a launch blocker.

---

## Prioritized roadmap (mapped to inDrive parity)

| # | Change | Files | Effort | inDrive parity unlocked |
|---|--------|-------|--------|--------------------------|
| **P0-1** | Push offers to the customer over WS during `open_for_offers`; poll → 15 s fallback | `offers.service.ts`, `order/[id].tsx:60,66`, `use-order-socket.ts` | S | Live auction feels live (A1) |
| **P0-2** | Push new broadcasts to online riders' board over WS | `orders.service.ts`, `tracking.gateway.ts`, `rider/index.tsx:103` | M | Instant supply-side pickup (A2) |
| **P0-3** | Optimistic UI on select/cancel/rate/advance | `order/[id].tsx`, `rider/job.tsx` | S | Weightless taps (C1) |
| **P0-4** | Interpolate marker + fit-camera-once + recenter button | `LiveMap.tsx`, `use-order-socket.ts` | S/M | Smooth tracking (B1, B2) |
| **P1-1** | Emit-before-persist; move live position to Redis, throttle PG flush | `tracking.gateway.ts:83`, `tracking.service.ts:35` | M | Low-lag tracking + scale (B3, E1) |
| **P1-2** | Geo-scope the rider board server-side (`ST_DWithin`) | `orders.service.ts:90`, `tracking.service.ts` | M | Correct locality, smaller payloads (A3) |
| **P1-3** | `staleTime`/cache + seed order cache on create; add `polling` transport | `query/client.ts`, `home.tsx:56`, socket hooks | S | Instant nav, resilient connect (C2, C3, B4) |
| **P1-4** | Trim required order form to pin+pin+price; persist draft; reverse-geocode landmark | `home.tsx`, `MapPicker.tsx` | M | Fewer taps to broadcast (D1, D2) |
| **P2-1** | Jitter offer-expiry; server-side WS coalesce; prod REDIS_URL boot guard | `offer-expiry.service.ts`, `tracking.gateway.ts`, `config/env.ts` | S | Smooth under load (E2, E3, E4) |
| **P2-2** | Composite indexes + UNION history; explicit Prisma pool | migrations, `orders.service.ts`, `prisma.service.ts` | S | Headroom as data grows (E5, E6) |
| **P2-3** | Rating-on-tap, ≥44 px targets, taller tracking map, online chip, seeded ETA | `order/[id].tsx`, `LiveMap.tsx`, `rider/index.tsx` | S | Interface polish (D3–D6, A4) |

**P0 is the whole story:** four changes (three of them small) that reuse plumbing already in the
repo take the auction and the tracking map from "polled and jumpy" to "live and smooth." Everything
after is depth and scale headroom.

---

## Smell index (quick scan)

- 🔴 Auction is polled, socket dark during bidding — `order/[id].tsx:60,66`; rider board polled — `rider/index.tsx:103`
- 🔴 Marker teleports (no tween) — `use-order-socket.ts:32`; camera refits every fix & fights the user — `LiveMap.tsx:24`
- 🔴 Zero optimistic UI — `order/[id].tsx:92-117`, `rider/job.tsx:37-57`
- 🟠 GPS DB write ahead of broadcast, on OLTP hot path — `tracking.gateway.ts:83`, `tracking.service.ts:35`
- 🟠 Board not geo-scoped server-side; ships 50 city-wide orders per poll — `orders.service.ts:90`
- 🟠 `transports:["websocket"]` only, no fallback — `use-order-socket.ts:22`, `use-rider-location.ts:24`
- 🟠 No `staleTime`; every back-nav refetches — `query/client.ts:3`
- 🟠 Many concurrent pollers on an "expensive data" market — see C4
- 🟠 Offer-expiry thundering herd at T+90 s — `offer-expiry.service.ts:60`
- 🟡 Reconnect invalidates & flashes the map — `use-order-socket.ts:25`
- 🟡 Hardcoded ETA "10", long form, no reverse-geocode, small hit targets, 200 px map — see A4, D1–D5
