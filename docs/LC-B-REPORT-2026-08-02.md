# LC-B report — 2026-08-02 (Go-class runtime perf)

Three LC-B increments today. First: the confirmed Day-0 CRITICAL (B-D0/LC-B04), fixed with a
regression test. Second: B-T1 (boot-path trace) — audited clean, zero new defects, two backlog
items refined with concrete evidence, one new speculative optimization item appended. Third: B-T2
(re-render audit) — 2 confirmed correctness defects fixed with regression tests (LC-B05, LC-B06),
2 pure-optimization findings appended to the checklist (B-O8, B-O9), 1 candidate refuted as
duplicate-of-known-backlog. The rest of the lane's checklist
(`docs/plans/2026-08-01-low-connectivity-program.md` §5 Lane B) stays for the next scheduled firing.

## Fixed — LC-B04 / B-D0 (CRITICAL): unbounded render loop pegging a core on every shift with an unanswered order

**Defect.** `KitchenConnectionProvider` (`apps/merchant/app/components/KitchenConnectionProvider.tsx`)
handed every context consumer — `KitchenBar`, `RearmBanner`, `ReconnectBanner`, the queue screen —
a brand-new `value`/`value.alarm` object literal on every render, and its `ring()`/`silence()`/
`testRing()`/`arm()` callbacks bumped the `alarmTick` re-render trigger **unconditionally**, even
when the underlying `AlarmController`'s ringing/armed state hadn't actually changed (`start()`/
`stop()` are themselves idempotent no-ops in that case).

The queue screen's own alarm-sync effect (`app/(app)/queue/page.tsx:52-55`) is what turned this into
an infinite loop, not just wasted renders:

```tsx
useEffect(() => {
  if (unansweredCount > 0) alarm.ring();
  else alarm.silence();
}, [unansweredCount, alarm]);
```

The moment one order went unanswered: the effect calls `ring()` → `alarmTick` bumps regardless of
whether the controller actually started ringing → the provider re-renders with a **new** `alarm`
object identity → the effect's own dependency (`alarm`) has changed, so it fires again → calls
`ring()` again (now a true no-op against the controller, but still bumps the tick) → loop, for as
long as an order sits unanswered — i.e. the entire time a merchant tablet has a NEW ORDER on
screen. On a 1-2 GB Go-class Android tablet in a browser tab, that's one core pegged doing pointless
re-renders of the alarm/reconnect/queue tree for the length of the takeover, competing with the
actual UI work and battery/thermal budget the shift needs.

**Fix.**

1. **Gate the tick bump on a real transition**, in every one of the five alarm callbacks
   (`arm`, `toggleMuted`, `testRing`, `ring`, `silence`): read the controller's relevant boolean
   before calling it, and only call `setAlarmTick` if the call actually changed it. This kills the
   loop at its source — independent of memoization, since the loop is really "any effect that
   depends on `alarm`", and four other consumers do.
2. **Memoize `alarm` and `value`** with `useMemo` (`alarm` keyed on `alarmTick` + the five stable
   `useCallback`s; `value` keyed on `session`/`signOut`/`alarm`/`reachability`/`wakeLock`), so a
   provider re-render that doesn't touch any of that state no longer hands every consumer a fresh
   object identity. This is the general fix DoorDash-style context providers need regardless of
   this specific loop — it's what makes (1) actually effective, and protects every future consumer
   that memoizes on `alarm`/`value` from an unrelated parent re-render.

**Regression test (`KitchenConnectionProvider.test.tsx`, new — this app had zero component-render
tests before this fix).** A probe component mirrors the queue screen's exact alarm-sync effect
(`unansweredCount`/`alarm` in the dependency array) rendered inside the real provider (with the
`next/navigation` router and the `AlarmController` singleton faked, so the test exercises the real
memoization/tick logic, not a mock of it):

- Asserts the render count stays bounded (and that the alarm did in fact end up ringing) — the
  pre-fix code hangs the test outright (a genuine synchronous infinite `act()` loop, not just "many
  renders"), confirmed by checking out the pre-fix file and re-running: the test process had to be
  killed rather than failing an assertion.
- A second test asserts zero further renders once state has settled — pins the "no spurious ticks"
  half of the fix independently of the loop-termination half.

**New test infra (added because the merchant app had no jsdom/DOM-render test path at all):**
`jsdom` + `@testing-library/react` + `@testing-library/dom` as devDependencies; `vitest.config.ts`
now also picks up `app/**/*.test.tsx` (still `environment: "node"` by default — component tests opt
into jsdom per-file via a `// @vitest-environment jsdom` docblock, so the existing DOM-free
pure-logic suite is unaffected) plus `esbuild: { jsx: "automatic" }` (needed because the merchant
app's `tsconfig.json` sets `"jsx": "preserve"` for Next's own SWC compiler, which vitest's plain
esbuild transform doesn't understand — it silently fell back to the classic transform, which needs
`React` in scope in every source file under test). This is reusable for B-O2 (memo boundaries for
ComposeMap/JobDetailsCard/board-card, the AuctionClock render-isolation pattern) and any future
merchant/admin component test.

**Verification:** `pnpm --filter @lynia/merchant typecheck` clean; `pnpm --filter @lynia/merchant
test` 87/87 (2 new); confirmed the new test hangs against the pre-fix file and passes against the
fix; repo-wide `pnpm typecheck` (6/6 packages) and `pnpm lint` (merchant: 0 warnings/errors) both
green; repo-wide `pnpm test` green (api 1500, mobile 668, merchant 87, plus admin/shared/design).

## Audited — B-T1: boot-path trace (`app/_layout.tsx` chain), zero new defects

**Method.** Read every module in the signed-in + signed-out cold-boot chain end to end: module-load
(`initSentry`, `SplashScreen.preventAutoHideAsync`, `applyInterToTextComponents`) → `RootLayout`'s
font gate → the provider tree (`AnalyticsProvider` → `PersistQueryClientProvider` → `AuthProvider` →
`PushSync`/`BootstrapSync`/`SessionGate` → `AppNavigator` → `Stack`) → `app/index.tsx`'s
onboarding/session/role reads → `bootDestination()`. Cross-checked two race hypotheses against the
actual code (not just docs) rather than trusting priors.

**Classification.**

| First-frame-critical (gates the splash) | Deferrable (already deferred) |
|---|---|
| `useAppFonts()` — bundled, no network | `PersistQueryClientProvider` disk restore — renders children immediately, hydrates in background (TanStack `isRestoring` gate) |
| `AuthProvider`'s `loadSession()` — local SecureStore | `usePushRegistration`/`PushSync` — check-don't-request, null-returning sibling, never blocks render (ALR-04) |
| `index.tsx`'s `loadOnboardingSeen()`/`loadRolePreference()` — local SecureStore | `useServerMinVersion`/`AppNavigator` — fail-open null while pending, renders `Stack` immediately |
| | `useBootstrap`/`BootstrapSync` — fire-and-forget seed, screens self-serve on failure/404 |
| | Sentry/RUM/PostHog init — inert-until-configured or fire-and-forget |

**Zero network round-trips gate first paint.** The DoveMark splash → `bootDestination()` redirect
is 100% local (keychain) reads — matches the §2 "warm boot paints with ZERO network round-trips
before first frame" target. The signed-in boot's network calls (`/app/bootstrap`,
`/app/version-gate`, the push-token register POST) fire concurrently from independent effects
mounted in the same commit, not chained — the §2 "≤3 sequential round-trips" target holds as coded.

**Two race hypotheses checked, both intact:**
1. *Concurrent-401 refresh storm at boot* (bootstrap fetch + push-register POST both authed, firing
   the same instant) — `api/client.ts`'s `refreshSession()` single-flights via `inflightRefresh`, so
   a simultaneous 401 on both requests coalesces into one refresh. Intact.
2. *Bootstrap-seeded fresh data clobbered by a slower-resolving persisted-cache restore* — TanStack's
   hydrate only applies incoming state when its `dataUpdatedAt` is newer than what's already cached;
   `seedQueryCacheFromBootstrap`'s `setQueryData` always stamps "now", so it wins regardless of
   which resolves first. Intact.

**Confirmed via trace, not re-ledgered (Lane A's territory, already seeded as A-O10):** the customer
home screen calls `useFeatureFlags()` twice independently — `app/(tabs)/home.tsx:46`
(`LauncherHomeScreen`) and `:109` (nested `RestaurantsRail`) — and `src/net/use-feature-flags.ts`
has no cross-call-site cache (bare `useState`/`useEffect` per hook instance, unlike a React Query
key), so both fire their own `/app/feature-flags` GET on every home mount. This is exactly what
A-O10 already describes ("refetched per hook, no dedup") — left to Lane A, not double-ledgered here.

**Zero new defects.** No fresh correctness bug found in the boot chain — it already reflects
ALR-01 (session→null stranding), ALR-02 (keychain-read hang), ALR-04 (immediate permission popup),
and the warm-boot/bootstrap-aggregate perf work. This is a clean-audit outcome (same shape as the
2026-07-26 deep-sweep's "zero new findings"), not a skipped audit.

**Backlog refined (see §5 Lane B for the full evidence text):**
- **B-O3** (overlap/defer boot keystore reads) — the three boot SecureStore reads already fire
  concurrently at the JS-effect level; the only unverified risk left is native-side Keystore
  serialization, which needs an on-device trace, not a code change.
- **B-O4** (push-registration off first-paint path) — already true for *render-blocking* (ALR-04);
  rescoped to the real remaining question, bandwidth contention on 2G/3G, as new item B-O7.
- **B-O7** (new, speculative) — stagger the push-register POST / version-gate / feature-flags fetch
  behind `/app/bootstrap` on cold start so they don't compete for a constrained uplink with the
  first-paint-critical aggregate. Not implemented — impact is unconfirmed without an on-device 2G
  trace, so it's an audit finding for a future firing to implement or dismiss with evidence, not a
  defect fixed here.

**Verification:** docs-only change (no code touched by B-T1) — `pnpm typecheck` and `pnpm test`
confirmed still green (unchanged from the B-D0 fix above).

## Audited — B-T2: re-render audit (home / `order/[id]` / `food/order/[orderId]` / rider board / food browse + memo boundaries), 2 confirmed defects fixed

**Method.** `lane-bug-hunt` workflow (Find → adversarial Verify → sibling-sweep) with a custom lane
scoped to the 4 named screens plus the ComposeMap/JobDetailsCard/JobCard memo-boundary audit item —
5 finder lenses, each candidate voted on by 3 independent skeptics (real/false-positive/
already-ledgered angles), confirmed findings then repo-wide sibling-swept. 5 candidates → 4 survived
adversarial verify → 2 were genuine correctness defects (wrong data shown) and fixed this run with
regression tests per universal policy 2; 2 were pure re-render/CPU-churn optimizations (no wrong
output) and were appended to the checklist instead, per the audit-mode defect/optimization split.

**Note on process:** the first attempt at this workflow mis-resolved its lane argument and ran
against the *wallet & data-lifecycle* default lane instead of the intended re-render lane (a
`Workflow` args-passing issue, not a code bug) — that run's findings are out of Lane B's mandate and
are NOT part of this section; they're ledgered separately below under "Out-of-lane findings" so
they aren't lost, and the workflow was re-run with the lane hardcoded directly into the script,
which produced the findings below.

### Fixed — LC-B05 (MEDIUM): blurred home/send screens could clobber the live tracking map's rider position

**Defect.** `app/(tabs)/home.tsx` and `app/send.tsx` each poll `["activeCustomerOrder"]` only while
their own screen is focused (`homeFocused`, PERF20-01's existing gate) — but each ALSO ran an
unconditional `useEffect(() => { if (activeOrder) qc.setQueryData(orderKey(id), activeOrder) }, ...)`
that fired on ANY change to that query's data, regardless of `homeFocused`. Since expo-router keeps
home/send mounted-but-blurred underneath `/order/[id]` for the length of an active order, and
`useForegroundRefetch`'s AppState listener invalidates `["activeCustomerOrder"]` on every
foreground transition with no idea which route is visible, a customer backgrounding and
foregrounding the app while looking at the live tracking screen could trigger this effect while
blurred — and its raw full-object `setQueryData(orderKey(id), activeOrder)` replaces the SAME cache
entry `src/realtime/use-order-socket.ts` streams live GPS `position` events into for that visible
screen, bypassing that hook's own `lastPositionRef`/`reconcileAfterRefetch` anti-rollback guard
entirely. Net effect: the rider's pin could visibly roll backward on the map (or other fields —
`itemsCollected`, `deliveryOtpAttempts`, `codeRotatedAt` — regress for a tick) whenever the stale
HTTP snapshot lands after a fresher socket push.

**Fix.** Gate both write-back effects on `homeFocused` (mirroring the existing poll gate): the write
now only ever seeds the cache ahead of navigating TO the order screen, never while already there.

**Regression test.** `app/(tabs)/__tests__/home.test.tsx` gained a controllable focus/blur mock for
expo-router's `useFocusEffect` (existing tests never exercised blur) and a new test that: renders
home focused (sanity: write-back seeds the cache), blurs it, applies a fresher rider position via a
functional `setQueryData` update (mirroring `use-order-socket.ts`'s own pattern), then triggers an
unrelated `activeOrderQ` invalidate that resolves with a snapshot carrying the OLDER rider fix —
and asserts the fresher position survives. Confirmed failing against the pre-fix code (asserted
`-17.9`, pre-fix code produced the clobbered `-17.8`) before restoring the fix. `send.tsx` got the
identical structural fix (same shape, confirmed by sibling-sweep) but not a duplicate render test —
its render harness would need substantial new mocking (places/disclaimer/ComposeMap) disproportionate
to a mechanically-identical one-line gate; typecheck + the shared mechanism give confidence.

### Fixed — LC-B06 (MEDIUM): restaurant open/closed status could freeze stale for the life of a screen

**Defect.** Three sites derived the restaurant open/closed badge and "closing in N min" countdown
from a `now: Date` computed via `useMemo(() => new Date(), deps)`, intending "recompute when the
data changes": `food/search.tsx` used `[]` (never recomputes after mount at all); `food/index.tsx`
and `(tabs)/home.tsx`'s `RestaurantsRail` both used `[feed.restaurants]`. But
`useRestaurantListFeed` is a plain `useQuery` with TanStack Query's default structural sharing,
which keeps the SAME object reference across a refetch that returns unchanged data — the common
case for a restaurant list. So `now` stayed pinned at whatever it was on first successful fetch for
as long as the screen stayed mounted without a genuinely-different fetch (given `staleTime` and
`refetchOnWindowFocus:false`, potentially indefinitely) — a restaurant open when the screen opened
kept reading "Open now" / a stale "Closing in N min" (and stayed included in `food/index.tsx`'s
"Open now" filter) after it had actually closed.

**Fix.** New shared hook `apps/mobile/src/logic/use-now.ts` — `useNow(intervalMs = 60_000)`, a real
`setInterval`-driven clock (minute-granularity, matching what `isMerchantOpenNow`/
`minutesUntilClose` actually need) — replacing all three broken `useMemo` call sites.

**Regression test.** `src/logic/__tests__/use-now.test.tsx` (fake timers): renders a probe component,
advances the fake clock across 3 separate 1s ticks (each in its own `act()` so React's batching
doesn't collapse them into one render), and asserts the observed `Date` actually advances each time
rather than freezing after the first render.

### Appended to the checklist (optimizations, no wrong output — not fixed this run)

- **B-O8** (new) — `food/order/[orderId].tsx`'s countdown ticker (unconditional 1s `setInterval`, no
  phase gating) re-renders the whole ~900-line screen for the entire order lifetime even once none
  of the three countdown-ring branches that read `now` can render — the exact `PERF20-02` anti-pattern
  already fixed in the sibling `order/[id].tsx` via `AuctionClock`, but that sibling-sweep never
  reached this screen. Sibling-sweep also found the identical shape in `rider/food-job.tsx`.
- **B-O9** (new, refines B-O2) — the rider board's `ranked` haversine-distance sort (line ~491) is
  computed inline with no `useMemo` (unlike its sibling `bidIds`, which is memoized), and each row's
  `onAction` allocates a fresh closure per render — so a keystroke in the unrelated compose fare/ETA
  field re-runs the sort and re-renders every `JobCard`, and `React.memo` on `JobCard` alone (B-O2's
  current scope) won't stop this without also memoizing `ranked` and the row callback.

### Refuted (not a fresh finding)

ComposeMap's inline `Marker coordinate={{ latitude, longitude }}` object was reported as causing a
draggable-pin snap-back on every unrelated parent re-render; 2 of 3 adversarial verifiers ruled it a
duplicate of the already-tracked `B-O2` backlog item (missing memo boundary) rather than a distinct
new defect, so it was not added as a separate ledger entry.

**Verification:** `pnpm --filter @lynia/mobile typecheck` clean; `pnpm --filter @lynia/mobile test`
670/670 (2 new suites: the LC-B05 case in `home.test.tsx`, the new `use-now.test.tsx`); repo-wide
`pnpm typecheck` (6/6 packages), `pnpm lint` (0 errors across all packages), and `pnpm test` (api
1500, mobile 670, plus admin/merchant/shared) all green.

## Out-of-lane findings (not fixed here — ledgered for the right lane)

The workflow mis-fire noted above (ran the wallet & data-lifecycle default lane instead of Lane B's
re-render lane) surfaced two adversarially-confirmed findings genuinely outside Lane B's mandate.
Rather than discard confirmed work or force a money-path fix into a runtime-perf PR without the
sensitive-lane treatment it needs, both are ledgered OPEN in `docs/KNOWN_BUGS.md` for Lane D / the
wallet & data-lifecycle audit routine to triage:

- **LC-B-SIB-1** (HIGH, dormant at 0% commission) — `AdminOrdersService.adjudicateDelivered` charges
  Express ride-commission on a merchant/food order's FULL goods+delivery total, missing the
  `orderType==="parcel"` guard its siblings (`rate()`/`completeOrder()`) have.
- **LC-B-SIB-2** (MEDIUM) — the rider Money tab's wallet ledger silently truncates at 25 entries with
  an unused pagination cursor; the admin-side sibling of this exact truncation shape is already
  known and OPEN as `LC-D07`, so this extends that item's scope to the mobile client.

## Not done this run (LC-B's scheduled work)

B-T3 (list + memory audit), B-T4 (animation/JS-thread audit), and the B-O1/B-O2/B-O3/B-O5/B-O6/B-O7/
B-O8/B-O9 optimization checklist remain on the Lane B checklist for the next `0 4 * * *` firing.
