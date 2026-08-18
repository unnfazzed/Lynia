# Plan — customer-journey load-perf fixes (code lanes of the 2026-08-17 RCA)

> **Revision 3 addendum (2026-08-18, owner instruction "execute the deferred items — I ship full EAS
> builds, not OTA-only"):** the ship model being full EAS store builds dissolved the native/OTA split
> that justified most of the "NOT in scope" list, and every code-executable deferral shipped in the
> follow-up PR: **D1** `withTimeout` deduped into `src/util.ts` (6 copies → 1); **D2** cold-start
> splash HOLD (`app/boot-splash-hold.view.tsx` — green frame until the first real screen's presented
> frame, dismiss-on-any-route + settle/absolute caps); **D3** Android Maps SDK pre-warmed from
> launcher idle (transient 1×1 map, unmounts on ready/cap); **D4** the AddressConfirmSheet's map
> mounts one interaction after the modal opens (PERF-SEND-01's deferral — confirm/landmark were
> never tile-dependent); **D5** `expo-image` (~2.0.7) behind the new `RemoteImage` seam for all
> eight remote-photo components (disk cache + downsampling; bundle measured WITHIN budget, 268 KiB
> headroom; native → ships with the next EAS build); **D6** the shared Redis L2
> (`common/micro-cache-l2.provider.ts`, @Global) now backs BOTH the merchant photo cache and
> OrdersService's caches — OrdersService's private client deleted, cross-instance byte-stable URLs
> when `MICRO_CACHE_REDIS_L2` is on. Still open, with reasons: the **Maps-key SHA-1 restriction**
> (ops/GCP console — not reachable from the repo), and **`/media/:key`** — now REJECTED rather than
> deferred: with 24 h URLs + the L2 it would add Cloud Run egress/CPU on every image byte to solve a
> problem that no longer exists.

**Revision 2 — post /plan-eng-review.** Implements the code-fixable findings of
`docs/CUSTOMER-JOURNEY-LOAD-PERF-2026-08-17.md` (§7 items 2–3), as revised by the engineering
review below (4 architecture + 2 code-quality findings folded in) and the outside-voice challenge
(9 findings; 7 accepted, 2 partially — see the review report). Out of scope, with reasons: the
Maps-key SHA-1 restriction (§3.2 — ops/GCP, no code); `expo-image` adoption and Maps SDK pre-warm
(native → store-build train); the AddressConfirmSheet second-map rework (entangled with the SEN-04
crash trail — owner call); a stable `/media/:key` authenticated media route (bigger fix for
cross-session image caching — TODO); Redis L2 for the merchant photo cache (needs a shared
L2-provider extraction — TODO). Everything below is an API deploy + OTA-able JS.

## 1. API — byte-stable signed photo URLs (RCA §5.1, biggest win)

`apps/api/src/merchant/merchant.service.ts`:

- **Raise `PHOTO_READ_URL_TTL_SECONDS` from 1 h to 24 h** (outside-voice #6). These are public
  menu/marketing photos, not KYC documents — the 1 h validity was inherited reasoning, and it is
  what makes the phone's image cache miss across sessions (lunchtime vs evening opens) no matter
  how well one response window caches. 24 h validity + a **14 h** URL cache: with the cache's ±10%
  TTL jitter the worst-case entry lives 15.4 h, so any served URL keeps **≥8.6 h** of signed life
  (jitter-aware bound per PR review — a naive 16 h cache would have left only 6.4 h). The env
  override (`MICRO_CACHE_TTL_MS_MERCHANT_PHOTO_URL`) is capped at the same 14 h so an operator
  can only tighten the margin, never erode it.
- **`MicroCache<string>` for photo URLs**, wired exactly like `OrdersService`'s
  `pickupPhotoUrlCache` (`orders.service.ts:135-140, 888-894`): 500 entries, `ttlJitterRatio: 0.1`,
  `onEvent → metricsSvc?.recordMicroCache("merchant_photo_url", o)` (new closed-vocabulary member
  in `MicrocacheName`, `metrics.service.ts:78`), TTL overridable via a new optional
  `MICRO_CACHE_TTL_MS_MERCHANT_PHOTO_URL` env key, and the `MICRO_CACHE_DISABLED` / TTL-0 bypass
  honored via the same `microCacheBypassed` rule. `MerchantService` gains TS-optional
  `@Inject(ENV) env?` + `metricsSvc?` constructor params (the OrdersService pattern — existing
  specs' constructions stay valid).
- **The `.catch(() => null)` moves OUTSIDE the cache** (outside-voice #5, and exactly how
  orders.service wires it): `getOrLoad(key, ttl, () => storage.createReadUrl(key, TTL)).catch(() => null)`.
  A rejected mint is never cached; a cached `null` blanking photos for 14 h is impossible by
  construction, and the spec exercises this through the real service wiring.
- **Known limitation (documented, accepted):** L1 is per-instance; 2-3 Cloud Run instances mint
  independent URLs, so a phone can see up to ~3 URL variants per photo per 14 h window and JSON
  ETag hits are per-instance. The 24 h validity keeps the device image cache effective regardless
  (variants are stable for hours and each caches); full cross-instance stability needs the Redis
  L2 (TODO) or the `/media/:key` route (TODO).
- **Failure mode (documented, accepted):** a photo object purged while its URL is cached serves a
  404 image for ≤15.4 h (worst-case jittered cache life); `FoodThumb`/covers degrade to their fallback tiles, non-blocking. Dish
  edits mint NEW object keys (uploads are `randomUUID()`-keyed), so stale-key reuse cannot occur.

**Tests:** merchant.service spec — consecutive `listRestaurants` calls mint each object key once
(storage spy); distinct keys mint separately; menu reuses the list's cached URL for a shared key;
a rejected mint is NOT cached (next call re-mints) through the real wiring; `MICRO_CACHE_DISABLED`
bypasses; the 24 h TTL reaches `createReadUrl`.

## 2. Mobile — soften the splash→home cut (RCA §1.2, revised)

`apps/mobile/app/_layout.tsx` — `Stack screenOptions` gains
`contentStyle: { backgroundColor: tokens.color.accentWash }`. **Not `tokens.color.bg`** — that is
`#FFFFFF` (`design-tokens.ts:22`), i.e. exactly the default white being fixed; the review's
outside voice caught that a token-sourced white is a literal no-op. `accentWash` (`#E9F8EF`) makes
the transition green splash → pale-green wash → home (whose header field is already accentWash).
The full fix — holding the splash until the first real screen's frame — is deliberately deferred
until §3's measurement says how big the gap actually is (it needs a dismiss-on-any-route +
timeout-fallback overlay to avoid a stuck-green-screen failure mode; build it against data, not
blind).

**Tests:** screenOptions pin asserting the accentWash contentStyle (and specifically not #FFFFFF).

## 3. Mobile + API — measure the gap (`boot_home_paint`, RCA §1.2/§6)

This is a **wire-contract change**, stated plainly (review finding A1): `ClientMetricEvent` is a
closed zod enum (`packages/shared/src/contracts.ts:510`) and the API maps it exhaustively
(`CLIENT_EVENT_HISTOGRAM`, `metrics.service.ts:137`), behind a `.strict()` batch schema — an
unknown event 400s the whole batch, losing the other samples riding in it.

- `packages/shared/src/contracts.ts`: add `"boot_home_paint"` with a doc comment stating BOTH the
  semantics (same origin → the customer home's first *presented* frame, i.e. after
  `InteractionManager.runAfterInteractions`) and the scope caveat (outside-voice #9: it never
  fires on deep-link cold starts or rider boots — the histogram is conditioned on landing on
  customer home; read it next to `boot_home`, not as a universal cold-start number).
- `apps/api/src/observability/metrics.service.ts`: `client_boot_home_paint_ms` histogram +
  mapping (the exhaustive `Record` makes the compiler enforce it); client-metrics int spec covers
  the new event; `pnpm contract:snapshot` regenerated in the same commit.
- `apps/mobile/src/telemetry/rum.ts`: widen `enqueueBoot`'s union; `apps/mobile/app/(tabs)/home.tsx`
  enqueues it from a mount effect wrapped in `runAfterInteractions` (post-frame, per the
  presented-frame semantics; idempotent via the existing `bootEventsSent` set).
- **Deploy ordering (hard requirement, outside-voice #3):** the API must be live with the enum
  before any OTA carries the client half. Concretely: **dispatch `mobile-ota.yml` only after the
  `release.yml` run for the merging commit has gone green through its production deploy** —
  release.yml deploys the API on every merge to `main`, so ordering is structurally satisfied on
  the normal path; if `GCP_DEPLOY_ENABLED` is off (deploys dormant) or the release run failed,
  verify the serving API first (POST a `boot_home_paint` sample batch to `/client-metrics` and
  check for 204 vs 400) before publishing the OTA. Worst case on a violated ordering is bounded
  and self-healing — RUM batches carrying the new event 400 and their samples are lost until the
  API deploys; no user-facing behavior is affected — which is why this is an operational check,
  not a new workflow gate. Recorded in the PR body so a future cherry-pick can't invert it.

## 4. Mobile — map failure card staged uniformly (RCA §3.1, revised)

Review finding A2 + outside-voice #2 (cross-model agreement): the RCA's "rejected-key signature"
is **not client-observable** — react-native-maps exposes no tile-progress event, `onMapReady` is
local SDK init that fires in ~1-2 s on any link, and `isReachable()` measures the Lynia API, not
Google's tile servers. So `mapReady && !mapLoaded && reachable` at 9 s describes every slow-2G
session AND the rejected-key session identically; branching on it keeps today's false positive.
The staging is therefore **uniform**, `apps/mobile/src/ui/ComposeMap.tsx`:

- 9 s (`MAP_SLOW_TIMEOUT_MS`): passive "The map is taking a while…" line — no alert
  role, no Sentry, locate pill + search unaffected.
- 22 s (`MAP_FAIL_TIMEOUT_MS`): the existing actionable failure card + Retry + one Sentry
  report per attempt. Self-clear on late `onMapLoaded` unchanged at both stages.
- Sentry event gains `map_elapsed_bucket` and `map_reachable` tags (bucketed, not raw ms —
  outside-voice #9: tags must stay bounded-cardinality; raw ms goes in `extra`). Bucket boundaries
  are **half-open on the left edge** (PR review): `<9s` = [0, 9 s), `9-15s` = [9 s, 15 s),
  `15-22s` = [15 s, 22 s), `>=22s` = [22 s, ∞) — exactly 15 s lands in `15-22s` and exactly 22 s in
  `>=22s`, pinned by boundary tests on the exported `mapElapsedBucket` helper. Because the failure
  report fires at a fixed 22 s, the *varying* elapsed values live on a `compose-map-recovered`
  breadcrumb recorded when tiles land after the slow stage began — slow links recover, rejected
  keys never do, and that breadcrumb is what separates them in the field.
- Trade-off recorded: the true-failure case sees Retry 13 s later than today. Accepted because a
  remount cannot repair a rejected key (Retry is not a fix there, only an affordance), while the
  9 s card is a false accusation in every slow-tile session — and the tags exist precisely to
  revisit this with data.

**Tests:** extend `compose-map-failure.test.tsx` — passive line (no alert) at 9 s; card + report
at 22 s; self-clear at both stages; tags present and bucketed; iOS (`onMapReady` signal) branch
unchanged.

## 5. Mobile — pickup landmark from the cached fix (RCA §4.1, revised)

`apps/mobile/src/logic/use-pickup-autolocate.ts`:

- Reverse-geocode the cached fix **concurrently** with `getCurrentPositionAsync` (outside-voice
  #8: a sequential "geocode then locate" could burn the geocoder's timeout before the live fix
  even starts, making the pin correction *slower* than today). The cached landmark lands as soon
  as its geocode resolves; the live fix's own geocode replaces it when the live point is accepted.
- Correctness rules (review C2 + PR-review consensus): every geocode result is bound to the point
  it was requested for and applied through a monotonic sequence guard, so out-of-order completions
  can never overwrite a newer landmark. **No distance threshold**: the live point's geocode always
  wins when the live point differs from the cached point at all; only literally identical
  coordinates reuse the cached result.
- `landmarkFor` bounded by the file's existing `withTimeout` (9 s) — documented in-code as
  UI-unblocking only (`Promise.race` does not cancel native geocoder work; late results are
  discarded by the sequence guard).
- The hook's `onLandmark` docstring changes from "fires at most once" to "may fire twice (cached,
  then live)" — the callers' existing guards (`pickupPinTouched`, `pickupLandmarkTouched` in
  send.tsx) already treat a second call as a correction, and the caller tests pin that.

**Tests:** extend `use-pickup-autolocate.test.tsx` — cached landmark emitted promptly while the
live fix is still pending; live landmark replaces it; identical-coords reuse (one geocode call);
out-of-order cached result discarded; geocode timeout leaves the last good landmark; re-broadcast
(`enabled: false`) unchanged.

## 6. Mobile — restaurants warm-paint via the canonical persistence layer (RCA §1.3/§5.2, replaced)

Outside-voice #7, accepted in full — it replaces both the plan's module-memo/prewarm design and
the review's SecureStore→file migration: `src/query/persist.ts` already exists to "generalise the
hand-rolled per-feature snapshots", restores allowlisted query roots from disk at boot, is
version-busted, and is cleared on sign-out. The hand-rolled snapshot also stores ~30 KB of
signed-URL JSON against SecureStore's 2 KB Android advisory (`restaurant-list-store.ts:19`), so
today's save may already be failing silently on exactly the target devices.

- Add `"restaurants"` to `PERSISTED_KEY_ROOTS` in `src/query/persist.ts` — the infinite query
  (`RESTAURANTS_KEY`) hydrates from `rq-cache.json` before home's first frame, giving "Popular
  near you" and `/food` cached cards in the first render with revalidation behind (the exact
  Swiggy warm-boot pattern the file documents). Restaurant listings are catalog data like
  history/notifications, not live marketplace state, so the file's "never persist live state"
  rule is respected.
- **Delete `src/net/restaurant-list-store.ts`** and its save/load effects in
  `use-restaurants.ts`. The legacy SecureStore blob is NOT orphaned on upgraded installs (PR
  review): its literal key survives as `LEGACY_RESTAURANT_LIST_SNAPSHOT_KEY` in
  `auth/device-state.ts`, wiped at sign-out exactly as before AND opportunistically once per boot
  (`src/boot/prewarm.ts`, fire-and-forget), removable once the ≤0.40.x install base is gone. The
  new persisted entry itself is sign-out-cleared via `clearPersistedQueries`.
- `useRestaurantListFeed` derives the D-19 stale banner from query state instead of the
  hand-rolled snapshot: `showingStale = data != null && !q.isFetchedAfterMount`, extended by
  `q.isError` after a failed revalidation; `staleSavedAt = new Date(q.dataUpdatedAt).toISOString()`
  (react-query persists `dataUpdatedAt`, so the "Showing what we had at HH:MM" copy stays honest).
  `RestaurantListFeed`'s public shape is unchanged — food/index.tsx and home.tsx compile untouched.
- Synergy with §1: with 24 h URL validity, a restored snapshot's image URLs are usually still
  live, so warm-painted cards also warm-paint their photos.

**Tests:** rewrite `use-restaurants` feed tests — hydrated cache paints in the first render with
`showingStale` + correct `staleSavedAt`; live fetch flips `showingStale` off; failed revalidation
over hydrated data keeps data + sets `isError`; persist allowlist test gains the `restaurants`
root; session/device-state tests updated for the deleted key.

## Order & verification

Implement 2 → 3 → 6 (small, independent), then 5, then 4, then 1. Full
`pnpm typecheck && pnpm test` green locally before push (plus `pnpm contract:snapshot` for §3);
changes land on `claude/customer-journey-load-perf-f4egw3` (PR #805, which carries the RCA these
implement). Mobile changes are all JS/OTA-able; the API half deploys automatically on merge
(release.yml), which must precede the OTA dispatch (§3 ordering). No DB migrations; the one
wire-contract change is additive (§3).

## NOT in scope (considered, deferred — one line each)

- **Maps-key SHA-1 restriction fix** — ops/GCP console action (`MOB-MAP-02`), no code.
- **Splash-hold-until-first-frame overlay** — build after `boot_home_paint` sizes the gap; needs
  dismiss-on-any-route + timeout fallback to avoid a stuck-splash failure mode.
- **`expo-image` + Maps SDK pre-warm** — native, next store-build train; pre-warm needs a device
  memory measurement first.
- **AddressConfirmSheet second-map rework** — entangled with the SEN-04 Paper-teardown crash trail.
- **Redis L2 for the merchant photo cache** — needs extracting OrdersService's private L2 provider
  into a shared seam; L1 + 24 h validity captures most of the win meanwhile.
- **Stable `/media/:key` authenticated media route** — the complete fix for cross-session image
  caching; new endpoint + client change, tracked as a TODO.
- **`withTimeout` dedupe (6 copies)** — cross-model resolution: pure churn inside an auto-merging
  perf PR; land separately (Beck: never structural + behavioral together).

## What already exists (reused, not rebuilt)

- `MicroCache` + metrics + env kill-switch/TTL-override conventions (`common/micro-cache.ts`,
  `orders.service.ts:129-190`) — §1 reuses wholesale, including the catch-outside-the-cache wiring.
- `PersistQueryClientProvider` + `persist.ts` allowlist — §6 reuses instead of a third snapshot
  mechanism; the legacy per-feature store is deleted, not migrated.
- RUM boot machinery (`rum.ts:157-170` idempotent boot events, `bootElapsedMs` clock guards) — §3
  adds one enum member, no new plumbing.
- `withTimeout` in `use-pickup-autolocate.ts` — §5 reuses the file's own helper.
- Existing test suites (`compose-map-failure.test.tsx`, `use-pickup-autolocate.test.tsx`,
  merchant/service + client-metrics specs) — extended, not replaced.

## Test coverage map

```text
CODE PATHS                                                USER FLOWS
[1] merchant.service signPhoto→MicroCache                 [H] Cold start → home
  ├── cache hit (same key, 2nd call)      [test: spec]      ├── hydrated restaurants first frame [test]
  ├── distinct keys mint separately       [test: spec]      ├── stale banner shows + clears      [test]
  ├── mint rejection NOT cached           [test: spec]      └── white→wash transition            [pin test]
  ├── MICRO_CACHE_DISABLED bypass         [test: spec]    [S] Send → map
  └── 24h TTL reaches createReadUrl       [test: spec]      ├── slow tiles: passive @9s          [test]
[2] _layout contentStyle=accentWash       [pin test]        ├── card+report @22s, tags bucketed  [test]
[3] boot_home_paint                                         ├── late tiles self-clear            [test]
  ├── enum+histogram mapping (compile-enforced Record)      └── iOS onMapReady branch unchanged  [test]
  ├── API ingest accepts event            [int spec]      [P] Pickup autofill
  └── fires once, post-interaction        [test]            ├── cached landmark lands early      [test]
[6] restaurants feed via persist                            ├── live landmark replaces it        [test]
  ├── warm first render + showingStale    [test]            ├── out-of-order cached discarded    [test]
  ├── staleSavedAt = dataUpdatedAt        [test]            ├── identical coords → 1 geocode     [test]
  ├── error-over-hydrated keeps data      [test]            └── re-broadcast: hook inert         [test]
  └── sign-out clears (persist layer)     [existing]
```

Every listed gap ships WITH its test on this branch — the implementation lands in the same PR as
this plan (#805), not a follow-up — so there is no deferred coverage.

## Failure modes

| Codepath | Production failure | Test | Handling | User sees |
|---|---|---|---|---|
| §1 cache | purged object's URL cached ≤15.4 h | doc'd | image error → fallback tile | placeholder, not a break |
| §1 cache | signing outage | spec | not cached; per-response null | photos missing this response |
| §3 skew | OTA before API deploy | ordering doc | batch 400, samples lost until API live | nothing (telemetry-only) |
| §4 staging | genuine key rejection | tags | card at 22 s instead of 9 s | later, honest failure card |
| §5 geocode | geocoder hangs | test | 9 s timeout, seq guard drops late result | landmark stays last-good |
| §6 persist | corrupt rq-cache | existing persist guards | cold start, no hydration | skeleton (today's behavior) |

No silent-and-unhandled-and-untested cell → no critical gaps.

## Parallelization

Sequential implementation, no parallelization opportunity worth the coordination: §§2/3/6 share
`_layout.tsx`/`home.tsx`/query-layer files, §§4/5 are small single-file changes, and §1 is the
only independent lane — not worth a worktree for one file + spec.

## Implementation Tasks

Synthesized from this review's findings. Each task derives from a specific finding above.

- [x] **T1 (P1, human: ~½d / CC: ~20min)** — api/merchant — signed-URL MicroCache + 24 h TTL + metrics + kill-switch, catch outside the cache
  - Surfaced by: Architecture A4 + outside-voice #4/#5/#6 — `merchant.service.ts:544-547` quote
  - Files: `apps/api/src/merchant/merchant.service.ts`, `apps/api/src/observability/metrics.service.ts`, `apps/api/src/config/env.ts`, merchant spec
  - Verify: merchant.service.spec cache cases; `pnpm --filter @lynia/api test`
- [x] **T2 (P1, human: ~1h / CC: ~5min)** — mobile/root — `contentStyle: accentWash` (NOT bg/#FFFFFF)
  - Surfaced by: outside-voice #1 (`design-tokens.ts:22 bg:"#FFFFFF"`)
  - Files: `apps/mobile/app/_layout.tsx` + pin test
  - Verify: new pin test red-if-white
- [x] **T3 (P1, human: ~½d / CC: ~20min)** — contracts+api+mobile — `boot_home_paint` end to end + snapshot + ordering note
  - Surfaced by: Architecture A1 + outside-voice #3/#9 — `contracts.ts:510`, `metrics.service.ts:137`
  - Files: `packages/shared/src/contracts.ts`, `apps/api/src/observability/metrics.service.ts` (+int spec), `apps/mobile/src/telemetry/rum.ts`, `apps/mobile/app/(tabs)/home.tsx` (+test), contract snapshot
  - Verify: `pnpm contract:check` green after snapshot; int spec accepts event
- [x] **T4 (P1, human: ~½d / CC: ~25min)** — mobile/map — uniform staged failure card + bucketed tags
  - Surfaced by: Architecture A2 + outside-voice #2/#9 — `ComposeMap.tsx:96` quote
  - Files: `apps/mobile/src/ui/ComposeMap.tsx`, `compose-map-failure.test.tsx`
  - Verify: staged-timeline tests
- [x] **T5 (P1, human: ~½d / CC: ~25min)** — mobile/autolocate — concurrent cached-fix geocode, seq guard, no distance rule, timeout
  - Surfaced by: Code-quality C2 + outside-voice #8 — `use-pickup-autolocate.ts:139-155` quote
  - Files: `apps/mobile/src/logic/use-pickup-autolocate.ts` (+test)
  - Verify: extended autolocate tests incl. out-of-order case
- [x] **T6 (P1, human: ~1d / CC: ~30min)** — mobile/restaurants — persist-layer warm paint; delete legacy snapshot store
  - Surfaced by: Architecture A3 + outside-voice #7 — `restaurant-list-store.ts:19`, `persist.ts:90-103`
  - Files: `apps/mobile/src/query/persist.ts`, `apps/mobile/src/query/use-restaurants.ts`, delete `apps/mobile/src/net/restaurant-list-store.ts`, `apps/mobile/src/auth/device-state.ts`, tests (feed/persist/session)
  - Verify: warm-first-render + stale-banner tests; `pnpm --filter @lynia/mobile test`
- [ ] **T7 (P3, follow-up TODO, not this PR)** — mobile — dedupe the 6 `withTimeout` copies into `src/util.ts`
  - Surfaced by: Code-quality C1, deferred by cross-model resolution (churn in an auto-merging perf PR)

## GSTACK REVIEW REPORT

| Review | Trigger | Why | Runs | Status | Findings |
|--------|---------|-----|------|--------|----------|
| CEO Review | `/plan-ceo-review` | Scope & strategy | 0 | — | — |
| Codex Review | `/codex review` | Independent 2nd opinion | 0 | — | (codex CLI not installed) |
| Eng Review | `/plan-eng-review` | Architecture & tests (required) | 1 | CLEAN | 7 issues (4 arch, 2 quality, 1 perf-adjacent), 0 critical gaps |
| Design Review | `/plan-design-review` | UI/UX gaps | 0 | — | — |
| DX Review | `/plan-devex-review` | Developer experience gaps | 0 | — | — |

**Mode note:** run autonomously (auto-decide, /autoplan-style) — the owner's instruction
("deploy engineering reviews … before implementation", then implement) pre-answered the scope
question; every per-finding decision is recorded inline above with its rationale.

**OUTSIDE VOICE (Claude subagent, fresh context):** 9 findings. Accepted: #1 (bg token is
`#FFFFFF` — contentStyle switched to accentWash), #3 (deploy-skew ordering made a hard, documented
requirement), #4 (MicroCache conventions + per-instance limitation documented), #5 (catch outside
the cache), #6 (24 h photo-URL validity), #7 (persist-layer warm paint replaces both the memo
design and the SecureStore migration; legacy store deleted), #8 (concurrent cached-fix geocode +
contract docstring). Partially: #2 (agreed the signature is unobservable — resolved to uniform
staging rather than the also-offered "don't touch until ops fixes the key", because the false
card harms every slow-link session today and the tags make the trade-off measurable), #9 (all
three small items adopted: bucketed tag, enum scope caveat, withTimeout dedupe deferred out of
this PR).

**CROSS-MODEL TENSION (resolved):**
- *Map staging*: internal review and outside voice independently found the RCA's "rejected-key
  signature" unobservable — agreement, uniform staging adopted.
- *withTimeout dedupe*: internal review said extract now (DRY-aggressive); outside voice said keep
  churn out of an auto-merging perf PR. Resolved toward the outside voice (minimal-diff for a perf
  PR; T7 follow-up records it).
- *Restaurant snapshot*: internal review proposed SecureStore→file migration; outside voice showed
  the canonical persist layer makes the whole store deletable. Resolved toward the outside voice
  (less code, one mechanism).

**VERDICT:** ENG CLEARED — ready to implement. (CEO/Design reviews not applicable: perf fixes, no
product-scope or visual-design change beyond a transition wash color drawn from the existing palette.)

NO UNRESOLVED DECISIONS
