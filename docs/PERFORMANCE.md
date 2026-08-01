# PERFORMANCE.md — mobile speed, latency & cost strategy

**Owner intent (2026-07-19):** the app must feel *radically fast* on the target market's real
network — metered 2G/3G, high RTT (~200-600 ms), frequent dead zones, cheap Android — while
*lowering* server cost, not raising it. This doc is the strategy, what shipped, how to verify it,
and the ranked backlog.

The design borrows the three patterns the big marketplaces converged on, scaled to Lynia's
stack (NestJS/Express + Prisma/PostGIS + Redis on Cloud Run `africa-south1`; Expo/RN + TanStack
Query + Socket.IO):

1. **Cache close to the reader, coalesce identical work** — DoorDash's transparent proxy cache
   ("Entity Cache": read-through caching + request coalescing + short TTLs in front of hot
   services, >90% hit rates at ~1.5M rps; see
   <https://careersatdoordash.com/blog/high-performance-proxy-cache-for-doordash-services/> and
   their multi-layer caching write-ups). Our scale doesn't need a mesh proxy or Redis-backed
   response cache; it needs the same *semantics* in-process: `MicroCache` (single-flight TTL
   cache) on the snapshot hot path.
2. **Spend as few bytes and round-trips as possible on the wire** — Uber's networking work (QUIC
   adoption + edge termination to cut tail latency on lossy mobile links; Uber Lite's
   "server-side rendering" of heavy work). Until an edge/H3 hop exists, the wins with the same
   shape are: compression, ETag/`304` revalidation, stable URLs so device caches actually hit,
   connection reuse (RN default), and WS-first with polling as fallback (already in place).
3. **Paint from disk, revalidate behind** — the Swiggy/Zomato cold-start playbook (warm-render
   last-known state instantly, fetch in the background) and offline-first practice. Client side
   that's query-cache persistence + conditional GETs; the app already had socket-gated polling,
   reachability-driven query pausing, and per-feature snapshot stores to build on.

---

## What shipped (2026-07-19, PR "mobile perf: compression, 304s, micro-cache, warm boot")

### API

| Change | Where | Effect |
|---|---|---|
| **gzip/brotli response compression** (threshold 1 KB, brotli q4) | `apps/api/src/main.ts` | Every JSON body was previously uncompressed. Snapshot/offers/history/feed JSON compresses ~4-8× → proportionally lower transfer time on 2G/3G and lower LB egress cost. Engine.io/WS unaffected. |
| **Weak ETags pinned + deterministic `Cache-Control`** | `apps/api/src/main.ts`, `apps/api/src/common/cache-headers.middleware.ts` | GETs: `private, no-cache` (store-but-revalidate — kills iOS heuristic caching of authorized JSON); mutations: `no-store`. Express answers a matching `If-None-Match` with an empty `304`, which the mobile client now uses (below). |
| **`GET /app/version-gate` is `public, max-age=300`** | `apps/api/src/health/health.controller.ts` | Identical body for every caller, checked on every cold start; any HTTP cache (device or future CDN) may serve it for 5 min. |
| **`MicroCache` — in-memory read-through TTL cache with single-flight** | `apps/api/src/common/micro-cache.ts` (+ spec) | The Entity-Cache semantics at library size: coalesces concurrent identical loads (stampede guard), never caches errors, bounded FIFO. |
| **Nearby-rider count micro-cached (10s, ~110 m coordinate buckets + radius key)** | `apps/api/src/orders/orders.service.ts` `countNearbyForPickup` | Every open-auction 15s poll ran a PostGIS `ST_DWithin` radius query for an informational count. Now same-block auctions and the create→first-poll pair share one query. **Broadcast/push targeting deliberately bypasses this cache** (assignment-adjacent = always fresh). |
| **Pickup-photo signed read URL micro-cached (10 min of its 15-min validity)** | `apps/api/src/orders/orders.service.ts` `getSnapshot` | The URL was re-signed on *every* poll → new query string → the phone's image cache missed → the same photo re-downloaded every 15s for the whole delivery, plus one GCP `signBlob` IAM call per poll (project-shared quota, DS-07). URL is now byte-stable across polls; mint failures are not cached. |
| **`getSnapshot` side-reads parallelized** | `apps/api/src/orders/orders.service.ts` | Live position (Redis), nearby count, rebroadcast link, had-offers, photo URL ran as a sequential await chain on the hottest read path; now `Promise.all` — worst-case snapshot latency drops by the sum of the no-longer-serial hops. Behavior per slot unchanged (regression-tested). |

### Mobile

| Change | Where | Effect |
|---|---|---|
| **Conditional GETs (ETag / If-None-Match / 304)** | `apps/mobile/src/api/client.ts` (+ tests) | The client remembers the last ETag+body per GET path and revalidates. An unchanged poll — order snapshot (15s), offers (15s), home active-order (30s), `me` during KYC-pending (5s) — now costs ~0.2 KB of headers instead of the full body. Memory-only; scrubbed on **both** sign-out paths (S1 shared devices). |
| **Query-cache persistence — warm boot** | `apps/mobile/src/query/persist.ts`, `app/_layout.tsx` (+ tests) | Allowlisted queries (`me`, `history`, `earnings`, `wallet`, `notifications`) persist to one app-private expo-file-system JSON file (throttled 3s) and hydrate on launch: cold start on a slow/dead link paints last-known data instantly and revalidates behind it. **Live marketplace state (`order`, `offers`, `activeJob`, `activeCustomerOrder`, `openOrders`) is deliberately never persisted** — a stale "rider arriving" render misleads. Purged on sign-out alongside `queryClient.clear()`. Max age 24h; busted per app version. |
| **Order-draft keychain writes debounced (500 ms trailing + unmount flush)** | `apps/mobile/app/home.tsx` | The compose form saved the full draft to SecureStore on **every keystroke** in landmark/note/item fields — serialized keychain round-trips on the typing path. One write per quiet half-second now; nothing lost on navigate-away. |

Existing strengths this builds on (verified during the audit, unchanged): 15s request timeout
budget; reachability-driven `onlineManager` pausing + `/health` recovery probe with backoff;
socket-gated polling nearly everywhere; server-side WS position coalescing (≤1/s); focus-manager
pause of polling in background; batched RUM; upload downscaling (1280 px / q0.7); direct-to-GCS
presigned uploads.

### Expected effect (to be confirmed by RUM — see below)

- **Steady-state polling bandwidth** while tracking/auctioning: dominated by unchanged-body polls
  → ~90%+ reduction (304s), and compressed 4-8× when bodies do change. The pickup-photo
  re-download loop (tens of KB × every 15s × the whole delivery leg) disappears entirely.
- **Perceived cold start** on a bad link: last-known home/profile/history/wallet paint in
  milliseconds instead of after the first successful round-trip (or never, offline).
- **Server cost:** less egress (compression + 304s), fewer PostGIS radius queries and `signBlob`
  IAM calls, snapshot handler does less serial waiting per request. No new infra, no new
  standing cost.

---

## Wave 2 (2026-07-19, PR "perf wave 2") — the agentic-loop program

User-approved program (`docs/ROUTINES.md` gained the standing half — the weekly performance
watch). What shipped, mapped to the DoorDash principles it implements:

| Change | Where | Principle / effect |
|---|---|---|
| **`GET /app/bootstrap` — BFF cold-start aggregate** | `apps/api/src/app-bootstrap/*`; mobile `src/api/bootstrap.ts`, `src/query/use-bootstrap.ts`, seeded at the root (`app/_layout.tsx`) | DoorDash "better API design" (their aggregation cut order-detail P99 >2s→<100ms). One authed, compressed, ETag-able response (me + role-appropriate active order + version minimum) seeds the query cache as soon as the session is known — the signed-in boot becomes ONE round trip and the first screens paint without their own fetches. Old clients/endpoints untouched; 404 ⇒ seed nothing, screens self-serve. |
| **Layered-cache upgrade: metrics + runtime flags + optional Redis L2 + TTL jitter** | `apps/api/src/common/micro-cache.ts`, `observability/metrics.service.ts` (`micro_cache_requests_total{cache,outcome}`), `config/env.ts` (`MICRO_CACHE_*`), wiring in `orders.service.ts` | DoorDash standardized caching: hit rates first-class observable (closed label vocabularies), per-revision runtime control (kill-switch + per-cache TTL override, `0` disables one cache), opt-in shared L2 over Redis (instances share warm entries; every command best-effort, L1-only degradation), ±10% TTL jitter (stampede hardening). Defaults = wave-1 behavior exactly. |
| **`POST /riders/heartbeat` — lightweight liveness beat** | `apps/api/src/riders/{rider.service,riders.controller}.ts`, `tracking.service.ts` (`hasNotifyWaiters` O(1) probe); mobile `src/api/riders.ts` (`sendHeartbeat` with 404→legacy fallback), `app/rider/index.tsx` | The 20s beat was the full `setOnline` mutation (gate read + CAS + waitlist GEOSEARCH per rider per beat — the dominant per-rider write cost). Now: ONE guarded UPDATE carrying the same standing predicate (demoted/offline ⇒ same precise 403 as before — regression-tested), `recordFix` for position, and the waitlist drain gated on a ZCARD probe (GEOSEARCH only when someone is actually waiting; go-online transitions still drain unconditionally). ~3-4× fewer statements per beat. |
| **Notifications feed parallelized** | `apps/api/src/notifications/notifications-feed.service.ts` | 9 serial reads → 2 dependency levels (user-scoped ∥, then order-scoped ∥). Output byte-identical (final sort owns ordering); all 50 specs unchanged-green. |
| **KYC-pending `/me` poll cadence by review mode** | `apps/mobile/app/rider/index.tsx` | `auto` mode keeps 5s (vendor answers in minutes); `manual` mode (ops review — hours/days) drops to a 60s safety net: was ~17k requests/day of radio wakeups per waiting rider. Focus/foreground refetch still gives instant flips to an active checker. |
| **Snapshot `events[]` payload trim** | `apps/api/src/orders/orders.service.ts` (+ contract-pinning spec), mobile `OrderEvent` type | `lat`/`lng` were serialized on every event of every snapshot poll forever-null (no writer ever set them, no client ever read them). Dropped from the select; DB columns untouched. |

**Loop A (hunt + adversarial verify) outcome — honest accounting** (after the resumed run
completed the verification pass):

- **CONFIRMED by both skeptics and SHIPPED (wave-2b follow-up PR):**
  - *Home's 30s full-snapshot poll ran for the entire life of every order* — home stays mounted
    beneath `/order/[id]` and the focus manager is AppState-only, so the poll duplicated the
    order screen's own socket-gated stream on a second cache key over metered data
    (**PERF20-01**). Fixed: navigation-focus-gated interval + on-focus revalidation
    (`app/home.tsx`).
  - *The auction countdown ticker re-rendered the whole ~1200-line order screen every second*
    for the length of every auction, on the JS thread the Choose tap competes with
    (**PERF20-02**). Fixed: extracted `<AuctionClock/>` (`src/ui/order/AuctionClock.tsx`) owning
    the 1s tick, SR thresholds, urgency crossfade and the zero-crossing refetch nudge; the
    parent hears only threshold crossings, keyed by orderId for rebroadcast resets — the same
    pattern the rider board's SentOfferCard already used. Render-isolation regression test pins
    it (`auction-clock.test.tsx`).
- **REFUTED with reasons** (the gate working — none of these are worth touching): per-fix order
  SELECT before position emits (~2ms behind a 600-1200ms RTT); `activeForRider` probe merge
  (safety-refuted: rewrites DS16-02/R8 ordering pins and drags stale status into the §5d
  phone-reveal choke point); `subscribeOrder` double-read (off every latency path — the room
  join precedes it and the ack never hits the wire); `ratings.by_profile_id` index (a once-per-
  order-lifetime ~5-30ms count at pilot scale).
- **STILL UNVERIFIED** (a second usage-limit window killed rounds 2-3 + 16 verifier pairs;
  queued as KNOWN for the weekly performance watch — not fixed blind):
  ComposeMap/JobDetailsCard/board-card re-renders per keystroke (memo boundaries); offers-list
  15s poll while the socket is live (socket-gate like UX15-11, keep a slow safety net);
  rider-offline 8s activeJob poll; socket self-heal refetch cadence on reconnect ATTEMPTS;
  `recordFix` Redis pipelining; presence-watchdog + `kickRiderFromBoard` fetchSockets scans;
  boot keystore-read overlap; native font embedding (config plugin — needs an EAS build);
  push-registration timing vs first paint; KYC 5s→mode-aware poll and dead `events[].lat/lng`
  were self-verified and shipped in the main wave-2 PR (PERF19-03/04).

## How to verify

- **Client RUM** (`apps/mobile/src/telemetry/rum.ts` → `/client-metrics`): watch `apifetch`
  p50/p95 by role before/after rollout — 304s shrink transfer time, so the poll-heavy screens'
  `apifetch` distribution should drop. `position_glass`/`offer_glass`/`board_glass` are the
  glass-to-glass latency signals.
- **API side** (OTel → Cloud Trace / Managed Prometheus, `docs/OBSERVABILITY.md`): `getSnapshot`
  handler latency; DB QPS attributable to `nearbyRiders`; response byte counts at the LB.
- **On-device sanity** (`/qa` or a dev build): airplane-mode cold start paints history/profile
  from the warm cache with the offline banner; a second visit to an unchanged screen produces a
  `304` in the API logs, not a full body.

## Rollout / compatibility notes

- All changes are backward-compatible: older clients ignore ETags and simply keep getting full
  (now compressed) bodies; new clients against an older API just never see a `304`.
- The RQ persistence file (`rq-cache.json` in the app sandbox) and the ETag store are both
  purged on sign-out (S1); the persistence buster is the app version, so a schema-shape change
  in a release starts cold rather than hydrating stale shapes.
- `NEARBY_COUNT_TTL_MS` (10s) and `PICKUP_PHOTO_URL_CACHE_TTL_MS` (10 min) are constants in
  `orders.service.ts` — tune there; per-instance caches need no invalidation wiring.

---

## Ranked backlog (next wins)

> **2026-08-01 — LC program takeover:** several items below are now scheduled checklist items of
> the Harare low-connectivity program (`docs/plans/2026-08-01-low-connectivity-program.md` §5,
> loops `docs/routines/harare-loops.md`) — items 3/4/5/6 and the ALR/PW device-side tails map to
> lanes A/B/C there. This backlog keeps the ranking; the LC loops burn it down; the weekly
> performance watch stays the standing owner of server-side latency/cost. Two forward-looking
> notes from the 2026-08-01 DoorDash research pass: (a) if/when the MicroCache Redis L2 carries
> large blobs, compress them at the cache layer choosing the codec by *decompression* cost
> (DoorDash used LZ4 for cached menus — <https://careersatdoordash.com/blog/speeding-up-redis-with-compression/>);
> (b) if real travel-time ETAs ever replace straight-line distance, precompute a coarse geo-grid
> offline rather than calling a routing engine per request
> (<https://careersatdoordash.com/blog/doordash-fast-travel-estimates/>).

1. ~~**Lightweight rider heartbeat endpoint.**~~ **SHIPPED in wave 2** (`POST /riders/heartbeat`,
   see the wave-2 table above). Remaining tail: `recordFix`'s two sequential Redis RTTs could
   pipeline (PW candidate queue).
2. ~~**Parallelize the notifications feed.**~~ **SHIPPED in wave 2** (two dependency levels).
   The bigger lift — a materialized notifications table — stays here if the feed's query count
   itself ever matters again.
3. **`expo-image` for remote photos** (disk/memory cache, downsampling, `recyclingKey`) — now
   worth it since URLs are stable. Native module → new dev-build/fingerprint, so batch with the
   next EAS build train.
4. **Share one Socket.IO connection across realtime hooks** (order/board/job/location each open
   their own) — fewer TLS handshakes and keepalives on radio. Touches 4 hooks + tests.
5. **History/board/notifications lists → `FlatList`** (virtualization) and cursor pagination via
   `useInfiniteQuery` when row counts grow past the current 50-cap.
6. **Cap/paginate `getSnapshot.events[]`** — unbounded today; fine at pilot scale, payload growth
   with long trips.
7. **Edge/CDN layer.** Today Cloudflare is DNS-only *by explicit decision* (managed TLS +
   cert-pinning + single-hop `trust proxy`, see `docs/CLOUDFLARE.md`) and the GCP LB has no CDN.
   When revisited: Cloud CDN on the LB (respects the `Cache-Control` semantics shipped here,
   `public` routes + signed media only), or an H3/QUIC-capable edge — the Uber-style tail-latency
   win — weighed against the pinning/trust-proxy constraints.
8. **Known open device-side items:** ALR-07 (double GPS stream while foregrounded, ~2× location
   upload) and ALR-09 (offline mutation UX) in `docs/KNOWN_BUGS.md`.
9. **Ops cost trims:** LB `log_config.sample_rate` is 1.0 (100% request logging) and Cloud Run
   `max_instances = 3` is a low capacity ceiling for launch spikes (`infra/terraform/`).

## Sources / further reading

- DoorDash — *Building a transparent high-performance proxy cache*:
  <https://careersatdoordash.com/blog/high-performance-proxy-cache-for-doordash-services/>
- DoorDash — *How DoorDash standardized and improved microservices caching* (request-local →
  local → Redis layering, runtime flags):
  <https://careersatdoordash.com/blog/how-doordash-standardized-and-improved-microservices-caching/>
- DoorDash — *Avoiding cache stampede*:
  <https://careersatdoordash.com/blog/avoiding-cache-stampede-at-doordash/>
- Uber — *Employing QUIC to optimize Uber's app performance*:
  <https://www.uber.com/blog/employing-quic-protocol/>
- Uber — *Failover handling in Uber's mobile networking infrastructure* (edge termination,
  25-30% tail-latency cut): <https://www.uber.com/blog/eng-failover-handling/>
- Uber — *Engineering Uber Lite*: <https://www.uber.com/blog/engineering-uber-lite/>
- Swiggy — cold-start engineering (iOS 12× load, Android cold start −53%):
  <https://bytes.swiggy.com/>
