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

## Ranked backlog (next wins, deliberately not in this PR)

1. **Lightweight rider heartbeat endpoint.** The 20s heartbeat reuses the full `setOnline`
   mutation: standing gate `findUnique` + CAS `UPDATE` + `recordFix` + a `drainNotifyWaiters`
   GEOSEARCH per rider per beat — the dominant per-rider write cost at scale
   (`apps/api/src/riders/rider.service.ts:262-354`, client `app/rider/index.tsx:313-350`).
   A dedicated heartbeat that only refreshes presence/position would cut it ~3-4×. Deferred:
   presence/assignment-adjacent (waitlist drain timing is product behavior) → design carefully,
   conservative implementation + regression tests per repo policy.
2. **Materialize the notifications feed.** `feedForUser` rebuilds from ~9 sequential queries per
   open (`apps/api/src/notifications/notifications-feed.service.ts`). Either `Promise.all` the
   independent reads (cheap, same shape as the snapshot fix) or introduce a notifications table.
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
