# LC-B report — 2026-08-04b (Go-class runtime perf)

Phase 0: `docs/plans/2026-08-01-low-connectivity-program.md` was present on `main`, but PR #556
(`claude/lc-steer-20260804`, the 2026-08-04 steer) was open, CI-green, and unreviewed —
squash-merged first per this repo's merge-on-green policy so this firing worked off the current
Lane B ranking rather than a stale one. No other open `claude/lc-b*` PR existed to babysit instead.

One LC-B increment this firing: **B-O16 + B-O17**, bundled in one pass per `B-O17`'s own
"bundle with B-O16" note (both are B-T4 findings on the same file pair, `OrderCard`/`QueueBoard`)
and this lane's existing bundling precedent (`B-O1b`/`B-O12`, `B-O2`/`B-O9`). All audit territory
(B-D0, B-T1..B-T4) was already checked; the 2026-08-04 steer (PR #556) re-ranked the optimization
checklist, promoting `B-O16`/`B-O17`/`B-O18` to #1-3 ahead of the previously-first `B-O5` (a
zero-evidence backlog placeholder) — so this firing took `B-O16`, the new first unchecked item.

## B-O16 — gate the merchant OrderCard clock to buckets that actually read it

`apps/merchant/app/lib/use-now.ts`'s shared `useNow()` hook started a 1000ms `setInterval`
unconditionally on every mount. `OrderCard.tsx:244` called it with no gating, so every mounted
card — regardless of `bucket` — re-rendered once/sec for as long as it stayed mounted. Only the
`waiting` branch (item-approval countdown) and `preparing` branch (prep-time countdown) actually
read the returned `now` value; `PaymentBucketActions` (`payment` bucket) and the `ready` bucket's
JSX are both fully static/callback-driven. An order can sit in `payment` or `ready` for minutes on
the always-mounted kitchen tablet this whole lane's mandate targets — a real, sustained,
zero-benefit re-render cost.

**Fix:** added an `enabled` param to `useNow` (default `true`, so the three other call sites —
`hours/page.tsx`, `NoRiderHoldTakeover.tsx`, `NewOrderTakeover.tsx` — are unaffected) that skips
starting the interval effect entirely when `false`, mirroring the mobile app's own `B-O8`
`needsClock`-gating convention rather than inventing a new pattern. `OrderCard` now computes
`needsClock = bucket === "waiting" || bucket === "preparing"` and calls `useNow(1000, needsClock)`.
This was one of the two fixes the checklist item itself suggested (gating the call vs. extracting
self-ticking sub-components per bucket) — gating was lower-risk and equally effective, since it
touches one line at the call site instead of restructuring `OrderCard`'s four bucket branches.

**Regression tests** (`OrderCard.test.tsx`, new `describe("OrderCard — clock ticker gating
(B-O16)")`): spy on `global.setInterval`, filter for the 1000ms clock call specifically (not just
"was setInterval called at all", to stay robust against unrelated intervals in the test
environment) — assert zero such calls for `payment`/`ready` buckets, at least one for
`waiting`/`preparing`. Confirmed to FAIL against the pre-fix code (reverted just the source files,
kept the new tests) before landing: both "does not start" cases failed, showing the 1000ms interval
firing regardless of bucket.

## B-O17 — memo boundary for OrderCard/QueueBoard, made to actually work

`QueueBoard`/`OrderCard` had no `React.memo` boundary at all (confirmed via grep — zero `memo(`
usage in either file before this pass), so every mounted `OrderCard` re-rendered in lockstep on
`use-queue-poll.ts`'s 5s poll tick regardless of whether its own order's data changed.

The checklist item's own reasoning ("TanStack Query's structural sharing would otherwise let an
unchanged order skip re-render if the card were memoized") flagged the real subtlety here: this
poll hook is a hand-rolled `useState`/`setInterval` loop, not TanStack Query, so a naive
`React.memo(OrderCard)` alone would have been dead weight — every poll tick, `useQueuePoll`
deserializes a brand-new `MerchantOrderResponse[]` from `listQueue()`, so even an order whose
content is byte-identical to the last poll arrives as a new object reference, and a shallow-prop
memo comparison sees "changed" every single tick regardless. On top of that, `QueueBoard` itself
rebuilt every `OrderCard`-bound handler (`onMarkReady`, `onRevealPickupCode`, `onOpenHold`,
`onLogCall`, `onRequestPayment`, `onConfirmPayment`, `onReleaseUnpaid`, `onRefund`) as a fresh
closure on every render — so even holding `order` referentially stable, the memo boundary would
still bail on the handler props alone.

**Fix, three parts, landed together because the first two are useless without the third:**

1. **`OrderCard` wrapped in `React.memo`** (`export const OrderCard = memo(OrderCardImpl)`,
   `OrderCard.tsx`).
2. **`QueueBoard`'s `OrderCard`-bound handlers memoized** off the already-stable `refetch`
   reference (`useQueuePoll`'s `fetchOnce`, itself `useCallback`'d against a stable `useRef` latch,
   confirmed by tracing `apps/merchant/app/(app)/queue/page.tsx`'s wiring) — `handleMarkReady`,
   `handleLogCall`, `handleRequestPayment`, `handleConfirmPayment`, `handleReleaseUnpaid`,
   `handleRefund` via `useMemo(() => withRefetch(..., refetch), [refetch])`;
   `handleRevealPickupCode` and `handleOpenHold` via `useCallback` (neither closes over anything
   that changes across renders). `handleAccept`/`handleReject`/the hold/returns handlers were left
   as-is — they feed `NewOrderTakeover`/`NoRiderHoldTakeover`/`ReturnsSection`, not `OrderCard`, so
   memoizing them is out of this item's scope.
3. **New `apps/merchant/app/lib/merge-orders.ts` (`mergeOrders`)** gives `useQueuePoll` the
   structural sharing the checklist item's own reasoning assumed already existed: for each order in
   a fresh poll result, if a previous order with the same `id` has content that's
   `JSON.stringify`-equal, the PREVIOUS object reference is reused instead of the freshly
   deserialized one. `use-queue-poll.ts`'s `setOrders(result)` became
   `setOrders((prevOrders) => mergeOrders(prevOrders, result))`. This is the piece that makes (1)
   and (2) pay off on the primary real-world trigger this item describes: an order untouched by a
   given 5s poll now keeps the exact same `order` prop reference, so `OrderCard`'s memo boundary
   genuinely skips re-rendering it.

**Regression tests**, all confirmed to FAIL against the pre-fix code (reverted the four source
files, kept the new/changed tests, re-ran) before landing:

- `apps/merchant/app/lib/merge-orders.test.ts` (new) — unchanged content keeps the previous
  reference, changed content gets the new reference, a never-seen id passes through as-is, a
  dropped id is excluded, ordering follows the next snapshot.
- `apps/merchant/app/lib/use-queue-poll.test.ts` — new case polls the hook twice with one order
  whose content is identical both times and one whose content changes; asserts the unchanged
  order's reference survives the second poll (`toBe`, not `toEqual`) while the changed order's does
  not.
- `apps/merchant/app/components/queue/OrderCard.test.tsx` — new render-isolation case using a new
  `apps/merchant/app/testing/render-count.ts` (`countMemoRenders`), a direct port of the mobile
  app's `B-O2` `.type`-patching technique (that file's own doc comment explains why
  `React.Profiler`'s `onRender` can't distinguish "ran" from "bailed" for a memoized child — the
  same React major version applies here). Rerendering `OrderCard` with the exact same prop
  references leaves the render count at 1; rerendering with a genuinely new `order` object bumps it
  to 2.

Pre-fix-code check: with only `use-now.ts`/`OrderCard.tsx`/`QueueBoard.tsx`/`use-queue-poll.ts`
stashed back to their pre-fix state (test files kept), all four new/changed assertions failed as
expected — two `B-O16` ticker-gating cases (`payment`/`ready` unexpectedly starting the 1000ms
interval), the `B-O17` structural-sharing case (`Object.is` mismatch — a fresh reference every
poll), and the `B-O17` render-isolation case (render count 0, since `countMemoRenders` can't even
wrap a non-memoized export the same way, and the assertion that a first render occurred failed).

`pnpm typecheck && pnpm lint && pnpm test` all green, repo-wide (after generating the Prisma
client, a one-time environment step unrelated to this change): 1540 API tests, 769 mobile tests,
and the merchant app's full suite (26 files, 180 tests including the 37 new/changed assertions
across the four touched files). No KNOWN_BUGS.md ledger row — both items are pure-waste,
correctness-intact optimizations, matching this lane's B-T3/B-T4 precedent of keeping that class of
finding in the program-doc checklist only.

## Next firing

`B-O16`/`B-O17` are now ticked. The next unchecked optimization item in checklist order is `B-O18`
(`AuctionClock`'s 20s urgency-color crossfade — likely switchable to `useNativeDriver: true`, a
trivial one-line fix once confirmed safe on-device), then `B-O5` (socket self-heal refetch cadence
— still a zero-evidence backlog placeholder).
