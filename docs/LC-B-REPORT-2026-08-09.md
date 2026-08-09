# LC-B report — 2026-08-09 (Go-class runtime perf)

Phase 0: `docs/plans/2026-08-01-low-connectivity-program.md` was present on `main`. Open PRs at
firing time: `#627` (RF-22 mobile refactor), `#626` (LC loop A), `#625` (LC loop C), `#624` (LC
steer) — none on a `claude/lc-b*` branch, so no in-flight Lane B PR to babysit instead.
`docs/KNOWN_BUGS.md` and the sibling `claude/*` PR diffs were checked — none overlap this firing's
scope (Lane A/C/steer PRs, none touching the merchant kitchen board).

All Lane B audit territory (B-D0, B-T1..B-T4) was already checked, so this firing ran in OPTIMIZE
MODE. The first unchecked item in checklist order was `B-O14`.

## B-O14 — bound `ackSecuredIds`/`ackHoldIds` (landed)

`QueueBoard` (`apps/merchant/app/components/queue/QueueBoard.tsx`) maintains two
`Set<string>` members, `ackSecuredIds` and `ackHoldIds`, tracking which rider-secured / no-rider-
hold takeovers the merchant has already dismissed ("Got it" / hold-dismiss). Neither had a removal
path: every dismissal added an id via `new Set(prev).add(id)`, and nothing ever took one back out
for the always-mounted kitchen tablet's whole shift — the same unbounded-growth shape `LC-B08`/
`B-O13` already fixed for the mobile rider board's `sentOffers`/`expiredOrderIds`/`takenOrderIds`.
Bounded in practice by one restaurant's daily order volume (tens to a few hundred orders per
shift), so real-world impact is low — which is exactly why the checklist rated this (S) effort and
left it for a routine sweep rather than a forced fix, same triage as `B-O13`'s own siblings
`B-O14`/`B-O15` when they were first seeded.

**Fix:** ported the mobile app's `addBoundedId` helper verbatim into a new shared
`apps/merchant/app/lib/bounded-id-set.ts` (this app had no prior "capped Set" precedent to reuse —
`merge-orders.ts`/`use-queue-poll.ts` solve a different problem) — a size cap with FIFO eviction:
add the id, and if the Set now exceeds `cap`, delete `next.values().next().value` (the oldest
entry, since `Set` iteration preserves insertion order in JS). `ACK_ID_CAP = 200`, matching the
mobile lane's own `BOARD_RESOLVED_ID_CAP` precedent. Wired into both call sites —
`RiderSecuredTakeover`'s `onDismiss` (`setAckSecuredIds`) and `handleHoldDismiss`
(`setAckHoldIds`) — replacing the previous unbounded `new Set(prev).add(id)`.

**Regression tests:**
- `apps/merchant/app/lib/bounded-id-set.test.ts` (new) — pure unit tests on `addBoundedId`: stays
  under the cap while adding fewer than `cap` ids; FIFO-evicts the oldest id once the cap is
  exceeded (not an arbitrary truncation — the newest id survives, the oldest is gone); re-adding
  an already-present id is a no-op that returns the same `Set` reference (no wasted allocation).
- `apps/merchant/app/components/queue/QueueBoard.test.tsx`, new
  `describe("QueueBoard ackSecuredIds is capped, not unbounded for the whole shift (B-O14)")` —
  a behavioral test that proves the cap actually holds, not just that the helper is correct in
  isolation: renders 201 distinct rider-secured orders, dismisses each takeover in order
  (`s0..s200`), and asserts `s0`'s takeover reappears — since its ack id fell off the 200-entry
  cap when `s200`'s dismissal (the 201st ack) evicted it. Under the pre-fix unbounded `Set`, `s0`
  would stay acked forever and this assertion times out. **Confirmed to fail against the pre-fix
  code** (temporarily reverted the `QueueBoard.tsx` change and re-ran the suite): the new test
  fails on `await screen.findByText(/Order #S0/)` timing out, while the other 9 pre-existing tests
  in the file stay green — restored the fix afterward.

No `KNOWN_BUGS.md` ledger row — pure memory-bound optimization, correctness-intact both before and
after (no rendered state depended on unbounded growth), matching this lane's own `B-O1`/`B-O10`/
`B-O12`/`B-O13` precedent of reserving `LC-B##` ledger rows for fixed defects or
confirmed-but-deferred bugs, not optimization-checklist items.

`pnpm typecheck && pnpm lint && pnpm test` all green repo-wide.

## Next unchecked item

`B-O15` (mobile delivery-code device index, `CODE_INDEX_KEY` — same unbounded-growth shape, next
firing). `B-O3`/`B-O6` remain blocked on native/on-device access this environment doesn't have.
