# LC-B report — 2026-08-02 (Go-class runtime perf)

Two LC-B increments today. First: the confirmed Day-0 CRITICAL (B-D0/LC-B04), fixed with a
regression test. Second: B-T1 (boot-path trace) — audited clean, zero new defects, two backlog
items refined with concrete evidence, one new speculative optimization item appended. The rest of
the lane's checklist (`docs/plans/2026-08-01-low-connectivity-program.md` §5 Lane B) stays for the
next scheduled firing.

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

## Not done this run (LC-B's scheduled work)

B-T2 (re-render audit of home/`order/[id]`/rider board/food browse), B-T3 (list + memory audit),
B-T4 (animation/JS-thread audit), and the B-O1/B-O2/B-O5/B-O6/B-O7 optimization checklist remain on
the Lane B checklist for the next `0 4 * * *` firing.
