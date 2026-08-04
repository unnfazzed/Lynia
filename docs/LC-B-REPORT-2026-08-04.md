# LC-B report — 2026-08-04 (Go-class runtime perf)

One LC-B increment today: **B-O7** (OPTIMIZE MODE — every audit territory, B-D0/B-T1..B-T4, was
already checked off before this firing started, and B-O1/B-O1b/B-O2/B-O9/B-O11 above it in
checklist order were already ticked, so this ran straight to the first unchecked item).

## B-O7 — cold-boot request prioritization: deferred the register POST / version-gate / feature-flags fetches a beat behind mount

B-T1's boot-path trace (2026-08-02) found that a signed-in cold boot fires three network calls
concurrently, with no ordering between them: the first-paint-critical `/app/bootstrap` aggregate
(`BootstrapSync`), the push-token register POST (`PushSync`'s `usePushRegistration`), and
`/app/version-gate` (`AppNavigator`'s `useServerMinVersion`, mounted unconditionally regardless of
session). `PushSync` and `BootstrapSync` mount as siblings under `AuthProvider` in
`app/_layout.tsx`, in that JSX order — so on the JS side the push-token register POST was actually
issued *before* the bootstrap aggregate's fetch, the exact inverse of the two calls' relative
importance. On a 300-600ms-RTT corridor, every simultaneous request the client opens competes with
`/app/bootstrap` for the same limited connection/bandwidth budget, at the exact moment first paint
is waiting on that one round trip.

Fixed by deferring the non-critical calls' actual fetch a fixed 250ms behind their effect's mount,
using a plain `setTimeout` (not `InteractionManager`/an idle callback — this codebase has no
existing precedent for either, and a fixed delay is simpler to reason about and test than "after
interactions settle" semantics that don't exist yet elsewhere in the app):

- **`usePushRegistration`** (`apps/mobile/src/push/use-push-registration.ts`) — only the *initial*
  `attempt()` call is delayed (`BOOT_REGISTER_DELAY_MS = 250`). Every retry trigger (reachability
  recovery, foreground transition, the permission-just-granted kick, an OS/FCM token rotation) still
  fires immediately — those are reactions to a real event, not part of the initial boot burst, and
  delaying them would just be added latency for no bandwidth-contention benefit.
- **`useServerMinVersion`** (`apps/mobile/src/net/use-server-version-gate.ts`) — the whole hook body
  is a single effect with no retry path, so the fetch itself moved inside the `setTimeout`
  (`BOOT_VERSION_GATE_DELAY_MS = 250`). This hook mounts on every boot regardless of session (it
  gates the force-update screen pre-auth too), so on a pre-auth boot with no bootstrap fetch to
  contend with, the 250ms is simply inert added latency on a background check the app never blocks
  first paint on — already true before this change (fail-open by design, checked once per cold
  start).
- **`useFeatureFlags`** (`apps/mobile/src/net/use-feature-flags.ts`) — same shape
  (`BOOT_FEATURE_FLAGS_DELAY_MS = 250`), fixed once in the shared hook rather than at each of its 6
  call sites (home, orders, rider board, food index/search, rider food-offer). This is orthogonal to
  A-O10 (Lane A's already-tracked finding that home.tsx's two call sites both independently fetch,
  doubling the request count) — that's a de-duplication/caching gap, this is a scheduling change to
  when an already-happening fetch fires; fixing the shared hook doesn't touch or duplicate A-O10's
  scope. Safe by construction: the hook already defaults to `DEFAULT_FEATURE_FLAGS` (fail-safe-OFF)
  until the fetch resolves, so a screen governed by a flag renders closed for a quarter second longer
  regardless of network speed — imperceptible next to the fetch's own multi-hundred-ms-to-seconds
  RTT on the target hardware.

No JSX reordering in `app/_layout.tsx` was needed — deferring the register POST's actual firing
point is sufficient regardless of `PushSync`/`BootstrapSync`'s mount order, and touching that file
would have widened the diff for no additional effect.

**Regression tests.** All three hooks gained cold-boot-timing coverage asserting the fetch does NOT
fire synchronously on mount and DOES fire once the boot-defer timer elapses — the same shape as this
lane's `B-O8` interval-gating tests (assert on scheduling, not on render counts, since scheduling
*is* the bug here):

- `src/push/__tests__/use-push-registration.test.tsx` gained a dedicated case; the shared `flush()`
  helper used by every other test in the file now runs pending timers first (`jest.runOnlyPendingTimers()`)
  so the file's existing 10 tests keep observing the same post-attempt state they did before this
  change, with the file switched to fake timers (`jest.useFakeTimers()`) to drive the new delay
  deterministically.
- `src/net/__tests__/use-server-version-gate.test.tsx` and `src/net/__tests__/use-feature-flags.test.tsx`
  gained a new `useServerMinVersion`/`useFeatureFlags` describe block each (previously these files only
  exercised the pure `fetchServerMinVersion`/`fetchFeatureFlags` functions, not the hooks) — both
  renamed `.test.ts` → `.test.tsx` to allow the `react-test-renderer` JSX harness. Each asserts a
  mocked `global.fetch` is untouched immediately after mount, then called exactly once (against the
  right endpoint) once `jest.runOnlyPendingTimers()` runs.

Confirmed each new "not called on mount" assertion genuinely fails against the pre-fix code (a quick
local revert of the `setTimeout` wrapper in each of the three hooks reproduced an immediate call)
before landing, matching this lane's regression-pin discipline. `pnpm typecheck && pnpm lint &&
pnpm test` all green (756 mobile tests, including the 5 new/expanded cases above; API unaffected —
this is a mobile-only change).

Impact is directional, not device-measured (no on-device 2G trace available in this environment,
same caveat B-T1 itself flagged for this item) — the fix removes a real, traceable request-ordering
inversion (push-token register POST literally issued before the boot-critical aggregate) and adds a
small, bounded, always-safe delay to two background checks that were never on the first-paint path.

## Next firing

B-O7 is now ticked. The next unchecked optimization item in checklist order is `B-O5` (socket
self-heal refetch cadence on reconnect attempts — KNOWN backlog, no evidence gathered yet).
