# LC-B report — 2026-08-03b (Go-class runtime perf)

One LC-B increment today: **B-T4**, the animation/JS-thread audit (native-driver coverage,
tickers, work in render bodies). Zero defects — every candidate confirmed correctness-intact.
Three new optimization findings appended to the Lane B checklist (`B-O16`..`B-O18`); two more
candidates turned out to be re-derivations of the already-tracked `B-O8`. This closes out Lane
B's audit-territory list — B-D0/B-T1/B-T2/B-T3/B-T4 are all now checked, so **every subsequent
Lane B firing runs in OPTIMIZE MODE**, starting from `B-O1`.

## Tooling note: the lane-bug-hunt custom-lane bug reproduced again

Following B-T3's precedent, this run first attempted `Workflow({name: 'lane-bug-hunt'}, args:
{key: 'animation-jsthread', context: ..., lenses: [...]})` scoped to native-driver/ticker/
render-body lenses. It again silently fell back to the hardcoded wallet lane — the same
tooling misconfiguration already documented at `LC-B-SIB-1..4` (2026-08-02, 2026-08-03) and not
fixable from a Lane B PR (it's an infra-level issue in how the custom-lane argument crosses the
tool-call boundary, not a bug in `resolveLane()`'s own logic). B-T4 was run instead as a
**linear audit**: three read-only Explore agents in parallel, one per B-T4's three named
sub-areas (native-driver coverage; tickers; render-body work), each told to read the program
doc's Lane B section first so findings were genuinely new, then read full source (not just grep
hits) before reporting. I then independently re-verified every candidate against source myself
before deciding disposition — no candidate was accepted on the finder's word alone.

## Findings

### B-O16 (new) — merchant `OrderCard`'s ticker ignores its own bucket

`apps/merchant/app/components/queue/OrderCard.tsx:244` calls `useNow()`
(`apps/merchant/app/lib/use-now.ts`, a shared 1000ms-interval clock) unconditionally at the top
of the component. `now` is read only in the `waiting` branch (line 272, approval-deadline
countdown) and the `preparing` branch (line 291, prep-time countdown). The `payment` branch
renders `PaymentBucketActions`, whose own doc comment states outright: *"No clock (M2·7 never
blocks the board) — this only ever renders as an ordinary card, never a takeover"* (line 47-48)
— confirming `now` is genuinely dead there. The `ready` branch (lines 307-346) is entirely
static/callback-driven (cash-rule note, "Searching for a rider…" text, pickup-code reveal) with
no time-based display at all. `QueueBoard` renders one `OrderCard` per order across the New/
Cooking/Ready columns, so every order sitting in `payment` or `ready` — states that can last
minutes on the kitchen tablet, the single always-mounted Go-class device this lane exists to
protect — re-renders once/sec for the duration, for zero visible benefit.

Verified directly against source (`OrderCard.tsx` and `use-now.ts` both read in full): the
`useNow()` default arg is `1000`, and grep confirms no other reference to `now` exists outside
the two named branches. Classified as OPTIMIZATION, not a defect — nothing renders incorrectly
today, this is pure wasted re-render cadence. Appended as `B-O16` (impact: real recurring cost
on the merchant tablet; effort S — either bucket-gate the `useNow()` call or extract the two
clock-consuming branches into self-ticking sub-components, mirroring the `SentOfferCard`/
`AuctionClock` pattern this codebase already uses for exactly this problem on mobile).

### B-O17 (new) — merchant `QueueBoard`/`OrderCard` has no memo boundary

Grep confirms zero `memo(` usage in either `QueueBoard.tsx` or `OrderCard.tsx`. The board polls
every 5s (`use-queue-poll.ts`, `POLL_INTERVAL_MS = 5_000`) and rebuilds its bucket arrays via
`groupQueue()` (lines ~204-209) on every render regardless of whether the underlying order data
changed. Without a memo boundary on `OrderCard`, every card re-renders in lockstep with the poll
even when TanStack Query's structural sharing would otherwise keep an individual unchanged
order's object reference stable across a no-diff poll — the same missed-memoization shape
`B-O2` already tracks for the mobile rider board's `JobCard`/`ComposeMap`, just never
cross-swept into the merchant app. Classified as OPTIMIZATION. Appended as `B-O17`, bundled
with `B-O16` since implementing `B-O16`'s bucket-scoped extraction is the natural point to also
add the memo boundary in the same pass (impact: moderate, scales with queue size; effort M).

### B-O18 (new) — `AuctionClock`'s urgency-color crossfade isn't native-driven

`apps/mobile/src/ui/order/AuctionClock.tsx:105`: `Animated.timing(urgencyAnim, { toValue: to,
duration: 200, useNativeDriver: false })`, feeding an `Animated.Text`'s `color` interpolation
(lines 121-124, muted → danger crossfade in the auction's last 20 seconds). Unlike
`LiveMap.tsx`'s `AnimatedRegion.timing(..., useNativeDriver: false)`, which carries an explicit
doc-comment explaining `AnimatedRegion` can't run on the native driver, nothing in `AuctionClock`
documents `useNativeDriver: false` as a deliberate choice — and this app's `react-native@0.76.9`
has supported native-driven color-style interpolation for several RN major versions, well
predating 0.76, so no `AnimatedRegion`-style hard blocker applies here. Classified as
OPTIMIZATION and given lowest priority of this batch: the transition fires at most twice per
~90s auction (entering/leaving the urgent window) for 200ms each — real but infrequent JS-thread
work, not a sustained tax. Appended as `B-O18` (effort S — flip the flag; verify on-device before
landing per the finder's own caveat that native-driven color animation has had minor
platform-version edge cases historically, though none expected on this RN version).

## Confirmed already-tracked, not re-ledgered

The render-body finder, working independently, re-derived both already-known `B-O8` sites
(`apps/mobile/app/food/order/[orderId].tsx:82-86` and `apps/mobile/app/rider/food-job.tsx:
177-181`, both unconditional 1s tickers) — expected, since B-T4's brief necessarily overlaps
B-T2's ticker territory. It also surfaced one genuinely new supporting detail: `food/order/
[orderId].tsx`'s `awaiting_item_approval` branch recomputes an unmemoized `order.items`
`.filter()`/`.filter()`/`.reduce()` chain (building the "kept"/"unavailable" splits and the
revised goods total) on every one of those 60-ish ticks/minute. This isn't a new item — gating
`B-O8`'s ticker fixes this cost too, since the array work only runs because the whole ~900-line
tree re-renders every second — but it's noted here so whoever implements `B-O8` sees the full
scope of what the fix buys.

## Marginal notes considered, not ticketed

- `apps/mobile/app/send.tsx`'s two `LayoutAnimation.configureNext` call sites are gated on OS
  reduce-motion but not on device tier/RAM. No precedent anywhere in this codebase for
  device-tier gating exists, so this would mean inventing a new pattern for a soft, unconfirmed
  benefit — left unticketed per the finder's own low-confidence assessment.
- `apps/mobile/app/(tabs)/orders.tsx:107`'s unmemoized `.filter()` over the (already server-capped
  ~30-50 row) history list, and `apps/mobile/app/food/index.tsx:36`'s unmemoized `.filter()` over
  the restaurant feed (which ties into the already-tracked, uncapped-catalog `B-O10`, not a fresh
  concern) were both rated too low-impact by the finder to warrant a dedicated item, and I agree
  on inspection — both are O(n) over small-to-moderate n, not a meaningful JS-thread cost today.

No KNOWN_BUGS.md ledger rows were added this run, matching the B-T3 precedent: `B-O10`..`B-O15`
(pure-waste, correctness-intact findings) were never given separate `LC-B##` rows either — those
are reserved for fixed defects (`LC-B04`..`LC-B08`) or confirmed-but-deferred actual bugs
(`LC-C07`/`LC-C08`-style). `B-O16`..`B-O18` are the same "waste, not wrong" category.

## Lane B audit territory is now complete

B-D0, B-T1, B-T2, B-T3, B-T4 are all checked. Every future Lane B firing runs in **OPTIMIZE
MODE**, taking the first unchecked checklist item in order (`B-O1` first, per current ranking).

## Verification

No code changed this run (docs-only: program-doc ticks/checklist appends + this report,
replacing `docs/LC-B-REPORT-2026-08-03.md` per the report-retention rule). `pnpm typecheck &&
pnpm lint && pnpm test` run green regardless, per the lane's SHIP gate.
