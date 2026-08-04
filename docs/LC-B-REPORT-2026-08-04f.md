# LC-B report — 2026-08-04f (Go-class runtime perf)

Phase 0: `docs/plans/2026-08-01-low-connectivity-program.md` was present on `main`. Open PRs at
firing time: only `#581` (`release-please`'s automated release PR, unrelated to any lane). No
`claude/lc-b*` PR existed to babysit instead. `docs/KNOWN_BUGS.md` and the sibling `claude/*` PR
diffs were checked — nothing overlaps this firing's scope (there were no other lane PRs open at
all this firing).

All Lane B audit territory (B-D0, B-T1..B-T4) was already checked, so this firing ran in OPTIMIZE
MODE. The first unchecked item in checklist order was `B-O13`.

## B-O13 — bound `expiredOrderIds`/`takenOrderIds` (landed)

`useRiderBoard` (`apps/mobile/src/realtime/use-rider-board.ts`) maintains two `Set<string>`
members, `expiredOrderIds` and `takenOrderIds`, tracking auction outcomes pushed over the board
socket (`bid:expired`, `order:taken`). Neither had a removal path: every push added an id via
`new Set(prev).add(orderId)`, and nothing ever took one back out for the life of the online
session — the same unbounded-growth shape `LC-B08` fixed for the `sentOffers` list, flagged by
that same `B-T3` audit as a lower-priority sibling worth revisiting once `B-O12` (the `openOrders`
cache cap) landed.

Confirmed by reading every call site (`apps/mobile/app/rider/(tabs)/index.tsx`) that both Sets are
read ONLY for two purposes: the `sentOffers` cards' `taken`/`expired` props, and clearing the
transient `selected` compose card once its order resolves. `sentOffers` itself already gets swept
`SENT_OFFER_RETENTION_MS` (60s) past close by `LC-B08`'s periodic sweep — so once an offer the
rider actually bid on ages out of that list, its id in `expiredOrderIds`/`takenOrderIds` is dead
weight from that point on. But an order the rider never bid on (any board order can trigger a
`bid:expired`/`order:taken` push, not just ones the rider offered on) never enters `sentOffers` at
all, so that existing sweep can't reach it — its id in these two Sets is dead weight from the
very first tick. A time-based sweep keyed to `SENT_OFFER_RETENTION_MS` (mirroring `LC-B08`)
wouldn't cover that never-bid-on case, since the hook has no `closesAt` to time against for an
id it only ever received as a bare string.

**Fix:** a size cap with FIFO eviction, the same shape `B-O12` already uses for the sibling
`openOrders` cache. `Set` iteration preserves insertion order in JS, so `addBoundedId(prev, id,
cap)` — add the id, and if the Set now exceeds `cap`, delete `next.values().next().value` (the
oldest entry) — bounds memory regardless of whether the id ever belonged to a real `sentOffers`
card, without needing a timer or any extra state. `BOARD_RESOLVED_ID_CAP = 200` — generous enough
that no realistic single shift's resolved-order count evicts anything a still-visible
`sentOffers` card needs (that list itself never exceeds `sentOffers.length`, bounded by `LC-B08`'s
own 60s sweep), while still being a real, enforced bound instead of "the OS will kill the app
first."

Wired into both call sites (`onBidExpired`'s `setExpiredOrderIds`, `onOrderTaken`'s
`setTakenOrderIds`), replacing the previous unbounded `new Set(prev).add(orderId)`.

**Regression tests** (`apps/mobile/src/realtime/__tests__/use-rider-board.test.tsx`, new
`describe("useRiderBoard resolved-id caps (B-O13)")` block): fires 250 `bid:expired` pushes with
distinct order ids and asserts `expiredOrderIds.size` stays at 200, the last-pushed id (249)
survives, and the first-pushed id (0) is gone — pinning FIFO eviction, not an arbitrary
truncation. A second test does the same for `takenOrderIds` via 250 `order:taken` pushes, awaiting
the handler's `invalidateQueries(["activeJob"]).then(...)` microtask chain (no `["activeJob"]`
query is mounted in the harness, so `active?.id === orderId` is always false and every push
resolves as "not our own win," reaching the `setTakenOrderIds` call). Both tests fail against the
pre-fix code (`expiredOrderIds.size`/`takenOrderIds.size` would be 250, not 200).

No `KNOWN_BUGS.md` ledger row — pure memory-bound optimization, correctness-intact both before and
after (no rendered state depended on unbounded growth), matching this lane's own `B-O1`/`B-O10`/
`B-O12` precedent of reserving `LC-B##` ledger rows for fixed defects or confirmed-but-deferred
bugs, not optimization-checklist items.

`pnpm typecheck && pnpm lint && pnpm test` all green repo-wide.

## Next unchecked item

`B-O14` (merchant kitchen board's `ackSecuredIds`/`ackHoldIds` Sets — same shape, next firing).
