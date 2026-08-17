# Plan — customer-journey load-perf fixes (code lanes of the 2026-08-17 RCA)

Implements the code-fixable findings of `docs/CUSTOMER-JOURNEY-LOAD-PERF-2026-08-17.md` (§7 items
2–3). Out of scope, with reasons: the Maps-key SHA-1 restriction (§3.2 — ops/GCP, no code);
`expo-image` adoption and any Maps SDK pre-warm (native → store-build train, needs device
measurement); the AddressConfirmSheet second-map rework (entangled with the SEN-04 crash trail —
owner call). Everything below is an API deploy + OTA-able JS.

## 1. API — byte-stable signed photo URLs (RCA §5.1, biggest win)

**Change:** `apps/api/src/merchant/merchant.service.ts` — wrap `signPhoto()` in a `MicroCache`
(`apps/api/src/common/micro-cache.ts`, the wave-1 primitive) keyed by the GCS object key, TTL
**50 min** of the 60-min URL validity (mirrors `PICKUP_PHOTO_URL_CACHE_TTL_MS`'s ~⅔ margin so a
customer never receives a URL with less than ~10 min of life). Single cache instance on the
service; single-flight dedupes the up-to-40-per-page concurrent mints; errors are never cached
(MicroCache contract) so a signing hiccup stays a one-response miss.

**Effect:** image URLs stable across responses for ~50 min → the phone's image cache and the
ETag/304 machinery both start working for `/restaurants`, menus and search; IAM `signBlob` RPCs
collapse from ~40/page to ~40/50 min.

**Risk:** a URL held in cache expires mid-window → mitigated by the 10-min margin (same accepted
trade-off as the order-snapshot pickup photo). Deleted/replaced photos: keys are content-addressed
upload keys and dish edits write a NEW key, so a stale cache entry can only reference an object
that still exists; acceptable within 50 min.

**Test:** service spec — two consecutive `listRestaurants` calls mint each key once (storage
adapter spy), a second key mints separately, an adapter rejection is not cached (next call mints
again), and a menu response reuses the list's cached URL for the same key.

## 2. Mobile — kill the white flash (RCA §1.2)

**Change:** `apps/mobile/app/_layout.tsx` — `Stack screenOptions` gains
`contentStyle: { backgroundColor: tokens.color.bg }` so no navigation transition can paint the
native-stack default white. One line; also covers `/send`, `/food`, and every later push.

**Test:** render-level assertion that the Stack receives the contentStyle (screenOptions pin), in
the existing `_layout`/role test style.

## 3. Mobile — measure the gap (`boot_home_paint`, RCA §1.2/§6)

**Change:** `apps/mobile/src/telemetry/rum.ts` — extend `enqueueBoot` union with
`"boot_home_paint"` (histogram `client_boot_home_paint_ms`, same validation/fallback as the other
two). `apps/mobile/app/(tabs)/home.tsx` — enqueue it from a mount effect wrapped in
`InteractionManager.runAfterInteractions` so it fires after the first frame is *presented*, not at
commit (the review-refined semantics). Idempotent per process like the existing boot events.
**Server side:** confirm `/client-metrics`' accepted-event vocabulary includes the new name (the
API pins a closed label set) — extend the API's allowlist + spec in the same PR so the event is
not silently dropped.

## 4. Mobile — map failure card staged by signature (RCA §3.1)

**Change:** `apps/mobile/src/ui/ComposeMap.tsx` —
- Keep the 9 s timer. When it expires: if the **rejected-key signature** holds (`onMapReady` fired,
  zero tiles, reachability online) → show the actionable failure card + Sentry report at 9 s,
  exactly as today (no regression in the true-failure branch — the review's constraint).
- Ambiguous branch (no `onMapReady` yet, or offline/reconnecting) → passive "The map is taking a
  while…" line (no alert role, no Sentry), promoting to the full card + report at **22 s**.
- The Sentry event gains `map_elapsed_ms` and `map_reachable` tags so late-tiles vs never-tiles
  sessions are separable in the fleet, making the staging measurable after the fact.

**Tests:** extend `compose-map-failure.test.tsx` — signature branch shows the card at 9 s;
ambiguous branch shows the passive line at 9 s and the card at 22 s; card still self-clears on
late `onMapLoaded`; tags present on the report.

## 5. Mobile — pickup landmark from the cached fix (RCA §4.1)

**Change:** `apps/mobile/src/logic/use-pickup-autolocate.ts` —
- Reverse-geocode the **cached** fix immediately (pin and address land together), then get the live
  fix; when the live point is accepted, its own reverse geocode **replaces** the cached landmark.
- Correctness per the review: each geocode result is bound to the point it was requested for and
  applied through a monotonic sequence guard, so an out-of-order completion can never overwrite the
  newer landmark; the distance threshold is used only to *skip a duplicate lookup* (<75 m ⇒ the
  cached result is re-emitted as the live result), never to discard a differing live geocode.
- `landmarkFor` bounded by the existing `withTimeout` (9 s) — UI-unblocking only; late native
  results are ignored by the sequence guard (documented in-code).

**Tests:** extend `use-pickup-autolocate.test.tsx` — cached-fix landmark emitted promptly;
live-fix landmark replaces it; out-of-order (cached geocode resolving after live) does not
clobber; <75 m skips the second lookup; geocode timeout leaves the last good landmark.

## 6. Mobile — restaurants snapshot in the first frame (RCA §1.3/§5.2)

**Change:** `apps/mobile/src/net/restaurant-list-store.ts` — keep the last-loaded snapshot in a
module-level memo (`prewarmRestaurantListSnapshot()`, same memoized-promise pattern as
`src/boot/prewarm.ts`, kicked from `prewarmBootReads()`’s call site in `_layout.tsx`), plus a
synchronous `getWarmRestaurantListSnapshot()` reader. `apps/mobile/src/query/use-restaurants.ts` —
`useState` initializer reads the warm value so the snapshot is in the **first** render when the
prewarm has settled (the normal case — the read starts at module evaluation, home mounts seconds
later); the existing async effect remains as the fallback for a not-yet-settled read. No cold-boot
stagger of the feed (paint-relevant, per review); no change to live-data-wins semantics.

**Tests:** warm value present ⇒ first render returns cached restaurants with `showingStale`;
warm value absent ⇒ unchanged behavior; live data still wins.

## Order & verification

Implement 2→3→6 (small, independent), then 5, then 4, then 1. Full `pnpm typecheck && pnpm test`
locally green before push; changes land on `claude/customer-journey-load-perf-f4egw3` (PR #805,
which carries the RCA these implement). Mobile changes are all JS/OTA-able; the API change deploys
with the next API release. No contract changes, no migrations.
