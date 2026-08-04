# LC-B report — 2026-08-04c (Go-class runtime perf)

Phase 0: `docs/plans/2026-08-01-low-connectivity-program.md` was present on `main`. No open
`claude/lc-b*` PR existed to babysit instead. `docs/KNOWN_BUGS.md` and the sibling `claude/*` PRs'
diffs were checked — nothing overlaps this firing's scope.

All Lane B audit territory (B-D0, B-T1..B-T4) was already checked, so this firing ran in OPTIMIZE
MODE. `B-O16`/`B-O17` (the 2026-08-04 steer's #1/#2) were already done; the first unchecked item in
checklist order is `B-O18`, ranked #3 by that same steer.

## B-O18 — AuctionClock's urgency crossfade, off the JS thread

`apps/mobile/src/ui/order/AuctionClock.tsx:105` drove the last-20s amber urgency-color crossfade
(`Animated.Text`'s `color`, interpolated between `tokens.color.muted` and `tokens.color.danger`)
with `Animated.timing(urgencyAnim, { toValue: to, duration: 200, useNativeDriver: false })` — every
frame of that 200ms fade ran on the JS thread, competing with whatever else is running there (a
countdown tick, a socket message, a tap handler) on the exact Go-class hardware this lane targets.
The neighboring `LiveMap.tsx` region-glide animation is `useNativeDriver: false` too, but for a
documented reason (`AnimatedRegion` can't use the native driver) — `AuctionClock` had no such
comment, and nothing in the codebase explained why this one opted out.

**Confirmed safe before touching the source**, since the checklist item itself flagged this as the
prerequisite: RN 0.76.9's `Animated` native driver does support color-style interpolation.
`node_modules/react-native/.../Libraries/Animated/nodes/AnimatedInterpolation.js` has a dedicated
`isColor`/`outputType = 'color'` path (via `processColor`) alongside the numeric path — this isn't
a recent addition gated behind a version check, and there's no allowlist anywhere in
`NativeAnimatedHelper.js` restricting which style properties (e.g. `color` on `Animated.Text`) can
run on the native driver. The old "only `opacity`/`transform`" native-driver restriction some RN
folklore still references predates color-interpolation support by several years and doesn't apply
to 0.76.

**Fix:** one line — `useNativeDriver: false` → `true` on the `Animated.timing` call (still only in
the non-`reduceMotion` branch; `reduceMotion` continues to snap via `urgencyAnim.setValue(to)`,
unchanged).

**Regression tests** (`src/ui/order/__tests__/auction-clock.test.tsx`, new):
- spies on `Animated.timing`, drives the clock from calm into the last-20s urgent window, and
  asserts every recorded call's config is `useNativeDriver: true` — confirmed to FAIL against the
  pre-fix code (reverted just the source line, kept the test) before landing, with the mismatch
  showing `useNativeDriver: false` as received.
- a second new test asserts `Animated.timing` is never called at all under `reduceMotion` (the
  `setValue` snap path), pinning that branch stays untouched by this change.
- added `jest.restoreAllMocks()` to the file's existing `afterEach` so the new `Animated.timing`
  spy's call history can't leak from one test into the next (jest reuses the same spy instance
  across repeated `jest.spyOn` calls on the same method within a file).

No on-device profile was available in this environment (same caveat this item's own checklist text
flagged, and the same one `B-O7`/`B-O3` noted for their own boot-path/native-timing claims) — the
evidence here is the RN source confirming native-driver color support exists and is unrestricted,
not a measured frame-timing delta. This is a strictly lower-risk change than most items in this
lane: a single 200ms transition fired at most twice per ~90s auction (entering/leaving the last 20s
window), moving from the JS to the native thread, with no behavioral change to what's rendered.

`pnpm typecheck && pnpm lint && pnpm test` all green, repo-wide (after generating the Prisma client
— a one-time environment step, not a code change): 1540 API tests, 786 mobile tests (112 suites,
including the 2 new cases here). No `KNOWN_BUGS.md` ledger row — this is a pure-waste,
correctness-intact optimization, matching this lane's `B-T3`/`B-T4`/`B-O16`/`B-O17` precedent of
keeping that class of finding in the program-doc checklist only.

## Next firing

`B-O18` is now ticked. The next unchecked optimization item in checklist order is `B-O5` (socket
self-heal refetch cadence on reconnect attempts — still a zero-evidence backlog placeholder that
will need its own investigation pass before it's actionable), followed by `B-O3` (deprioritized,
blocked on on-device profiling this environment doesn't have) and `B-O6` (needs native build
train). `B-O10`/`B-O13`/`B-O14`/`B-O15` (all `B-T3` findings, lower-priority/optional per their own
text) remain further down the list.
