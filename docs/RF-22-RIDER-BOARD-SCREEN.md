# RF-22 — `apps/mobile/app/rider/(tabs)/index.tsx` rider board screen: design pass

**Status:** design decision, first pass (2026-08-04). Scopes the RF-22 refactor-ledger item —
"1212-line rider board screen, needs its own reviewed design note before any extraction, same
disposition RF-05b/RF-18/RF-21 had before their own design passes" — into executable, ledger-sized
work items, following the same method: read every seam before proposing a split, and only sanction
a PR-sized extraction where props stay bounded and the move is genuinely prop-driven, not a
relocation of the same complexity behind a wider interface.

## Why this isn't an RF-18 repeat, and only partly an RF-21 repeat

RF-18 (`food/order/[orderId].tsx`) split cleanly because the component was a **switch**: ~9
mutually-exclusive `merchantPhase`/`status` branches, only one of which renders at a time, most
pure functions of `order`/`now`/`error`/`busy` props with no cross-branch state sharing.

This screen is closer to RF-21's shape (`send.tsx`): **one continuous board**, not a phase switch —
online/offline is a single boolean gate, not a branch tree, and most of the screen's ~25 pieces of
state (GPS, heartbeat, KYC reconcile, bid-draft hydrate/persist, sent-offers hydrate/persist/sweep)
run concurrently regardless of which JSX is on screen. Two things make it *more* tractable than
`send.tsx`, though:

1. **The screen already has a working two-branch split.** `showOpenOrdersList` (line 672) picks
   between a `FlatList`-based return (line 897, the online/verified/no-gate state, added by B-O1b)
   and a `ScrollView`-based return (line 969, every other state: loading, `getMe` error, KYC gate,
   no-GPS, online-gate refusal, or plain offline). The prior run (B-O9/B-O1b) already hoisted six
   JSX blocks to local consts — `activeJobBanner`, `onlineToggleCard`, `sentOffersSection`,
   `selectedCard`, `trailingFooterContent`, `boardBanner` — specifically so both returns render
   byte-identical markup for the pieces they share. That hoisting is most of the seam-finding work
   RF-18/RF-21 had to do from scratch; this design pass mostly has to classify the six blocks
   already found rather than discover new ones.
2. **No single derived-state web ties them together.** `send.tsx`'s draft-persistence/idempotency-
   key/`submit()` triangle reads ~8 fields each and is why a "whole form body" extraction there was
   WONT-DO. Here, each of the six hoisted consts closes over a genuinely bounded, mostly disjoint
   slice of the ~25 state pieces — there's no single cross-cutting derivation that touches all six.

So this is not a from-scratch RF-05b-style "trace every boundary call" exercise; it's classifying
six already-isolated JSX blocks by (a) how bounded their prop set actually is and (b) which ones sit
in the hotspot map's SENSITIVE bid-acceptance-UI bucket and need extra care regardless of how
mechanical the move looks.

## The state inventory (why this screen is 1212 lines regardless of any JSX split)

`online`, `userToggledRef`, `didSeedOnlineRef`, `confirmSwitch`, `error`, `info`, `loc`, `locDenied`,
`locHint`, `selected`, `fare`, `eta`, `offerMode`, `sentOffers` (+ 2 hydrate/persist effects),
`bidDraftHydrated` (+ hydrate/persist effects for the compose card), `ackedHandbacks`, `beatStale`
(+ the 20s heartbeat interval), `takenNotice`, `offerSlow`, `gate`, plus `prevJobStatus`,
`prevHadJobRef`, `locRef`, `prevOpenCount` refs; four queries (`board` via `useRiderBoard`, `activeQ`,
`meQ`, `openQ`) and three mutations (`onlineM`, `retryM`, `offerM`). None of this shrinks by moving
JSX around — same conclusion RF-05b/RF-21 reached for their own non-JSX cores. This design pass
scopes **JSX extraction only**; the hooks/effects/queries stay in the screen.

## Classifying the six hoisted blocks

**Cleanly separable, not sensitive (recommended extraction order, smallest/most self-contained
first — mirrors RF-18/RF-21's ordering heuristic):**

- **`activeJobBanner`** (lines 677-698, plus the already-standalone `ActiveJobCheckFailedBanner`
  helper at lines 67-80) — reads only `activeJob`, `activeQ.isError`, `activeQ.isFetching`,
  `activeQ.refetch`, and calls `pushOnce(router, pathname, "/rider/job")`. Five bounded props, no
  local state, purely a display of query results — the RF-18/RF-21 "full alternate view, bounded
  props, no local state" shape. **Smallest and safest — recommended first extraction.**
- **`sentOffersSection`** (lines 741-763) — reads `online`, `sentOffers`, `activeJob?.id`,
  `board.takenOrderIds`, `board.expiredOrderIds`. A pure filtered-list render into `SentOfferCard`
  (itself already extracted and memo-friendly per B-O9's doc comment). Five bounded props, no local
  state. **Second.**
- **`trailingFooterContent`** (lines 848-885) — reads `confirmSwitch`, `activeJob`, `onlineM`
  (`.mutate`), `router`, `error`, `info`, plus the `setConfirmSwitch` setter. Bounded (~7 props +
  1 callback), no state of its own beyond what's threaded in. **Third.**
- **`onlineToggleCard`** (lines 700-739) — reads `online`, `onlineM` (`.mutate`/`.isPending`),
  `board.connected`, `beatStale`, `merchantDispatchAutoEnabled`, `locHint`. This is a **presence**
  toggle (online/offline), not bid-acceptance, order-assignment, agreed-price, or KYC-gating — it
  does not fall in the hotspot map's SENSITIVE bucket (that bucket is specifically
  `order/[id].tsx`/`rider/job.tsx`'s bid-selection/execution UI and this screen's own `selectedCard`,
  see below). It's presence/standing-*adjacent* (the deep-sweep/bug-hunt lane's "rider standing"
  seam owns *correctness* of `isOnline`), but moving its JSX changes no logic — `onPress` handlers
  stay one-line delegations to the same `onlineM.mutate(...)` calls already in the parent. Six
  bounded props. **Fourth** — sequenced after the three fully "just a query display" blocks so the
  first three PRs are unambiguously non-sensitive, and this one's PR body can call out explicitly
  *why* it isn't SENSITIVE (no bid/order-assignment/agreed-price/KYC action, only `setOnline`)
  rather than leaving that judgment implicit.
- **`boardBanner`** (lines 887-895) — a six-line `BrandHeader` wrapper with no props worth
  abstracting (`label`, `address`, `showSearch` are static string/bool literals; only `onBell`/
  `onProfile` close over `router`). Not worth its own file — extracting six lines into a component
  with two callback props is net-negative indirection for zero complexity reduction, the same
  "cosmetic move" the RF-21 design doc declined for `send.tsx`'s map-hero wrapper. **WONT-DO as its
  own extraction** — leave inline, or fold into whichever neighboring extraction lands last if a
  future pass wants to tidy imports (not a reason to do it alone).

**Cleanly separable, but SENSITIVE — needs its own care, not a purely mechanical treatment:**

- **`selectedCard`** (lines 765-843) — the bid-compose card itself: accept-or-counter segmented
  control, the fare/ETA fields, and the `offerM.mutate(...)` submit button (`makeOffer` — the same
  bid-acceptance action `order/[id].tsx`/`rider/job.tsx` gate behind the hotspot map's SENSITIVE
  row). Its prop set is bounded and enumerable (`selected`, `offerMode`, `fare`, `eta`, `offerSlow`,
  `canOffer`, `offerM.isPending`, plus `setOfferMode`/`setFare`/`setEta`/`onSubmit`/`onCancel`
  callbacks — roughly the same shape as RF-18's third extraction, which also threaded several
  setters down as one-line callback props to a state-heavy branch) — so a byte-identical prop-driven
  move is mechanically sound, unlike RF-05b's four gateway structures or RF-21's whole-form-body.
  What makes this different from the four blocks above is *not* extraction difficulty, it's the
  hard rule: "Never refactor uncovered sensitive-area code (bid acceptance…) — characterize first or
  skip and ledger." This screen already carries 242 lines of coverage
  (`app/rider/(tabs)/__tests__/index.test.tsx`) including the compose-card open/segmented-toggle/
  submit flow (the B-O9 describe block exercises opening it via "Make an offer" and asserts
  `FlatList` prop stability across a keystroke in its fields), so it is **not BLOCKED-NO-TESTS** —
  but per the sensitive-lane doctrine, its extraction PR must say so explicitly and add one
  regression test that would fail if the move broke the accept/counter/submit wiring, not rely on
  the existing suite continuing to pass as the only evidence. **Fifth and last** — sequenced after
  the four non-sensitive blocks so its own PR is small, isolated, and easy to review against the
  sensitive-lane checklist on its own, without other unrelated JSX movement in the same diff.

## The FlatList/ScrollView duplication itself — not in scope

The two returns (line 897 `FlatList`, line 969 `ScrollView`) don't just share the six hoisted
consts — they also each carry their own copy of the "Open orders" section body (header + taken-
notice line + list of `JobCard`s / `ListHeaderComponent`+`ListEmptyComponent`+`renderJobCard`),
because a `FlatList` and a `ScrollView`+`.map()` fundamentally can't share one render path (the
whole point of B-O1b's split was to virtualize one and not the other). Unifying this further is a
structural question of *whether* the two return paths can be merged, not a JSX-extraction question
— out of scope for this design pass and not recommended: it's exactly the kind of "port nearly as
wide as the parent's own constructor" a merge would need (both paths would have to speak a common
interface a `FlatList` and a bare `.map()` don't share), the same failure mode RF-05b's and RF-21's
design docs declined for their own "combine the branches" candidates.

## Recommended sequence

1. **This run:** design note only (this document) + ledger update. No code change.
2. `activeJobBanner` (+ `ActiveJobCheckFailedBanner`) → `src/ui/rider/RiderActiveJobBanner.tsx`.
3. `sentOffersSection` → `src/ui/rider/RiderSentOffersSection.tsx`.
4. `trailingFooterContent` → `src/ui/rider/RiderBoardFooter.tsx`.
5. `onlineToggleCard` → `src/ui/rider/RiderOnlineToggleCard.tsx` — PR body states explicitly why
   this isn't a SENSITIVE-lane change (presence toggle only, no bid/order-assignment/agreed-price/
   KYC action).
6. `selectedCard` → `src/ui/rider/RiderOfferComposeCard.tsx` — PR body follows the sensitive-lane
   doctrine's four-question format even though this isn't an `apps/api` money/trust-lane file
   (idempotency: none needed, one bid per order already enforced server-side; state transition:
   none, pure UI; money arithmetic: none, fare is a passthrough string to the existing `makeOffer`
   call; regression test: one new test asserting the extracted card's accept/counter/submit callbacks
   still reach the same `offerM.mutate` call with the same arguments). One extraction per PR, in this
   order, each ≤400 changed lines per the routine's guideline.
7. **Not recommended at any point:** `boardBanner` as its own extraction (net-negative indirection),
   or merging the `FlatList`/`ScrollView` return paths (a structural redesign, not a refactor).

## Ledger update

RF-22 stays **OPEN**, re-scoped from "needs a design pass" to "design pass done — next increment is
the `activeJobBanner` extraction (item 2 above)". Not done this run: per priority order (a), the
design note is its own increment; the extraction itself is next run's actionable row.
