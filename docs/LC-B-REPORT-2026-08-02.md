# LC-B report — 2026-08-02 (Go-class runtime perf)

First LC-B increment. One confirmed Day-0 CRITICAL fixed with a regression test; the rest of the
lane's checklist (`docs/plans/2026-08-01-low-connectivity-program.md` §5 Lane B) stays for the next
scheduled firing.

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

## Not done this run (LC-B's scheduled work)

B-T1 (boot-path trace), B-T2 (re-render audit of home/`order/[id]`/rider board/food browse), B-T3
(list + memory audit), B-T4 (animation/JS-thread audit), and the seeded B-O1..B-O6 optimization
checklist remain on the Lane B checklist for the next `0 4 * * *` firing.
