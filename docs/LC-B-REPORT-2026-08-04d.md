# LC-B report — 2026-08-04d (Go-class runtime perf)

Phase 0: `docs/plans/2026-08-01-low-connectivity-program.md` was present on `main`. No open
`claude/lc-b*` PR existed to babysit instead (open PRs at firing time: `#571` on the `lc-a`
lane, `#573` an unrelated docs PR). `docs/KNOWN_BUGS.md` and the sibling `claude/*` PRs' diffs
were checked — nothing overlaps this firing's scope.

All Lane B audit territory (B-D0, B-T1..B-T4) was already checked, so this firing ran in OPTIMIZE
MODE. The first unchecked item in checklist order is `B-O5` — the prior firing's own report
(`LC-B-REPORT-2026-08-04c.md`) flagged it as "a zero-evidence backlog placeholder that will need
its own investigation pass before it's actionable."

## B-O5 — socket self-heal refetch cadence on reconnect attempts

**Investigation:** all three of this app's realtime hooks —
`apps/mobile/src/realtime/use-order-socket.ts` (customer live tracking), `use-rider-board.ts`
(rider board), and `use-rider-job-socket.ts` (rider active job) — run the same "self-heal"
pattern: on the socket's `connect` event AND its `connect_error` event, fire a full REST
invalidate/refetch so a push missed while the socket was down gets picked up immediately. Every
one of those three call sites had nothing bounding how often that refetch could fire. Socket.IO's
own reconnection manager retries repeatedly, seconds apart, while a connection is flapping — the
exact profile of the Harare dead-zone case this whole lane targets (a rider or customer moving
through a marginal-signal patch sees `connect_error` → `connect` → `disconnect` → `connect_error`
cycles within a single short window). Each cycle was paying a full self-heal cascade: two
`invalidateQueries` calls for the order-tracking hook (order snapshot + customer trip history),
two for the rider board (`openOrders` + `activeJob`), one (an aggregate of history/earnings/active
job) for the rider job hook — real REST bytes and battery burned on the exact network this app is
supposed to tolerate, potentially many times over a single flapping episode.

**Fix:** a new shared primitive, `apps/mobile/src/realtime/self-heal-gate.ts`
(`createSelfHealGate(heal, minIntervalMs = 5000)`), wraps a self-heal callback with a minimum-
interval floor: the first call always fires immediately (a fresh mount's initial self-heal
shouldn't wait on anything), and any call within `minIntervalMs` of the last one that fired is
dropped, since the refetch it would have triggered is either still in flight or was just
satisfied. All three hooks now route their `onConnect`/`onConnectError` self-heal call through a
gate created fresh inside the same effect that opens the socket:
- `use-order-socket.ts`: `gatedRefetchOrder` wraps `refetchOrder`.
- `use-rider-board.ts`: `gatedHealBoard` wraps `healBoard`.
- `use-rider-job-socket.ts`: `gatedRefetchJob` wraps `refetchJob`.

Deliberately left ungated: each hook's listener for a genuine server-pushed event
(`order:status`, `presence:recovered`) still calls its hook's own refetch function directly,
un-gated — those are real signals a state actually changed, not reconnect noise, and gating them
by the same clock as the connect handlers could suppress a legitimate refetch that happens to
land inside the post-reconnect window.

**Regression tests:**
- `src/realtime/__tests__/self-heal-gate.test.ts` (new) — pure unit tests on the gate itself
  (fake timers): fires on the first call; drops a call inside the floor; fires again once the
  floor has elapsed; the floor resets from the last call that actually fired, not from a dropped
  attempt.
- Each of the three hooks' existing test files gained a "self-heal cadence (B-O5)" case: firing
  `connect_error` immediately followed by `connect` in the same `act()` (the reconnect-flap shape)
  now produces exactly ONE self-heal invalidate per hook, not two. `use-order-socket.test.tsx` and
  `use-rider-job-socket.test.tsx` each also gained a case confirming a genuine `order:status` push
  still refetches even immediately after a `connect` — proving the gate doesn't accidentally
  swallow a real event. `use-rider-board.test.tsx` also gained a case (fake timers) confirming a
  reconnect past the 5s floor heals again, not just once ever.
- All the new hook-level assertions were confirmed to FAIL against the pre-fix code (temporarily
  reverted just the three source files, kept the new tests) before landing: each burst produced 2
  self-heal invalidations where the fixed code produces 1.

No on-device network-flap capture was available in this environment (same caveat `B-O7`/`B-O18`
flagged for their own claims) — the evidence is the code-level reconnect-cascade shape (three
independent connect/connect_error handlers with no cadence floor, each firing on Socket.IO's own
retry loop) and the gate's own unit-tested behavior, not a measured on-device byte/battery delta.
No `KNOWN_BUGS.md` ledger row — this is a pure-waste, correctness-intact optimization (the
self-heal still happens, just rate-limited), matching this lane's `B-T3`/`B-T4`/`B-O16`/`B-O17`/
`B-O18` precedent of keeping that class of finding in the program-doc checklist only.

`pnpm typecheck && pnpm lint && pnpm test` all green, repo-wide (after generating the Prisma
client — a one-time environment step, not a code change): 1540 API tests, 803 mobile tests (113
suites, including the 4 new/expanded files here).

## Next firing

`B-O5` is now ticked. The next unchecked optimization item in checklist order is `B-O3` (overlap/
defer boot keystore reads — deprioritized in the 2026-08-02 steer, blocked on on-device
systrace/logcat profiling this environment doesn't have), followed by `B-O6` (native font
embedding, needs a native build train) and the struck-through `B-O4`. `B-O10`/`B-O13`/`B-O14`/
`B-O15` (all `B-T3` findings, lower-priority/optional per their own text) remain further down the
list. Lane B has no remaining item this environment can act on without either on-device hardware
access (`B-O3`) or a native build train (`B-O6`) until the weekly steer re-ranks or a future audit
appends fresh findings — worth flagging to the steer.
