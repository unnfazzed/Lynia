# Logic-model audit — 2026-08-23 — Order assignment (C3 food dispatch)

Second run of the weekly logic-model-audit routine (`docs/ROUTINES.md`). Lane rotation: **bid
acceptance → order assignment → agreed-price → KYC gating → wallet/top-up/earnings → cancellation &
hand-back.** Bid acceptance was modeled 2026-08-16 (`docs/LOGIC-MODEL-AUDIT-2026-08-16.md`, LM-01/
LM-01-pin); this run modeled the next lane in rotation, **order assignment** — the single-rider
auto-dispatch mechanism that gets a rider actually assigned to a merchant/food order, as distinct from
the Express/parcel reverse-auction already covered.

## Phase 0 — baseline + dedup

- `docs/KNOWN_BUGS.md` read in full. Prefix is **LM-**. Re-verified LM-01 (`MatchingService.
  expandBroadcast`'s re-check ordering) and LM-01-pin (`OffersService.makeOffer`'s counter-offer
  accept-guard bypass) against current code — both intact, no regression.
- Grepped the ledger for `C3`, `C4`, `assign`, `dispatch`, `claim` — four prior findings touch this
  lane by name: `X2-OBS-1` (C4, out of scope — see below), `X2-OBS-2` (in scope — the divergent
  "holding another live food offer" predicate, confirmed below to sit inside this lane's own file
  set), `LC-B-SIB-1` and `LC-B-SIB-4` (both C4/admin-reporting adjacent, not this lane's own logic).
  The lane itself had never been the subject of its own dedicated audit before this run.
- Zero open `claude/*` PRs relevant to this lane at Phase 0 (`list_pull_requests` state=open →
  `#880` crash-fuzz, `#879` release-please — neither touches `merchant/food-dispatch*` or
  `common/food-dispatch-lock.ts`).
- Fresh checkout: `pnpm install`, then `pnpm exec prisma generate` (client wasn't pre-built), then
  `pnpm typecheck && pnpm test` on clean `main`: **green** (6/6 typecheck tasks; api 100 files/1727
  tests, mobile 190 files/1559 tests, admin+merchant included).

## Phase 1 — modeling the lane

**Scope.** `FoodDispatchService` (`apps/api/src/merchant/food-dispatch.service.ts`) — a DB-only
20s-interval reconciler (no BullMQ) that, once a merchant order reaches `status=requested` /
`merchantPhase=ready_for_pickup` (C2's kitchen phase hands off here), auto-offers the order to exactly
ONE candidate rider at a time (unlike Express's broadcast-to-everyone auction), waits up to 60s
(N-08) for accept/decline, widens the search radius and retries on no response, and enters a
merchant-visible hold (D-34) after 6 exhausted attempts (N-07). `NearestRiderDispatchStrategy`
(`dispatch-strategy.ts`) is the pluggable candidate-selection seam. `common/food-dispatch-lock.ts`
holds the cross-lane soft-lock predicate the parcel side also reads. `food-order.service.ts:
confirmPickup` is the lane's own terminal edge — the rider action that closes out the hand-off once
secured.

**Entities / states.**
- `Order.status` (shared 12-value enum): this lane uses `requested → open_for_offers → assigned`,
  then rejoins the shared parcel edges (`confirmed → en_route_pickup → picked_up → …`).
- `Order.merchantPhase`: stays `ready_for_pickup` for the entire dispatch lifetime (search, offered,
  held); cleared to `null` only on `assigned` or a terminal cancel.
- `Order.noRiderHoldAt`: `null` while searching/offering; set once the NO_RIDER cap (6 attempts) is
  exhausted (D-34 merchant hold); cleared by `resumeSearch`.
- `FoodDispatchOutcome` (Prisma enum, per-attempt audit row `FoodDispatchAttempt`): `pending →
  accepted | declined | expired`.
- Sub-fields driving the machine: `dispatchOfferedRiderId`, `dispatchOfferExpiresAt`,
  `dispatchAttempt`, `dispatchExcludedRiderIds`, `dispatchStartedAt`, `dispatchNextCheckAt`.

**Actors.** system (the 20s sweep: `sweepExpiredOffers` + `sweepSearch`→`tick`), rider (the offered
candidate; the secured/assigned rider), merchant (D-34 hold-screen `resumeSearch`/`cancelFromHold`).
No **admin** or **webhook** actor reaches a transition inside this lane (admin's post-delivery
adjudication of a merchant order is a separate, already-ledgered concern — `LC-B-SIB-1`/`LC-B-SIB-4`,
outside this lane's scope). **Customer** has no direct transition here either — only notifications.

### FoodDispatchAttempt sub-state machine (per rider, per order — mirrors the Offer sub-machine the
2026-08-16 audit wrote down for the parcel side)

| From | Event | To | Actor | Guard |
|---|---|---|---|---|
| (none) | `tick` offers this rider | `pending` | system | order `requested`+`ready_for_pickup`+`noRiderHoldAt=null`; CAS on `dispatchAttempt`; unique `(orderId, riderId)` |
| `pending` | `acceptDispatch` | `accepted` | rider (candidate) | order CAS `open_for_offers`+`dispatchOfferedRiderId=caller`; `one_active_ride` unique index |
| `pending` | `declineDispatch` | `declined` | rider (candidate) | order CAS `open_for_offers`+`dispatchOfferedRiderId=caller` |
| `pending` | `sweepExpiredOffers` | `expired` | system | `dispatchOfferExpiresAt < now`; order CAS `open_for_offers`+`dispatchOfferedRiderId=riderId` |

### Order-state × actor × action truth table

| State | Actor | Action | Code does | Should do | Test | Verdict |
|---|---|---|---|---|---|---|
| `requested`, searching, no candidate at this radius | system | `tick` (no candidate) | self-loop: `dispatchAttempt++`, `dispatchNextCheckAt` set | same | `food-dispatch.service.spec.ts:126` | OK |
| `requested`, searching, candidate found | system | `tick` (candidate) | CAS→`open_for_offers`, sets offer fields+attempt, logs `FoodDispatchAttempt(pending)`, pushes + WS-emits to candidate | same | `:75` | OK |
| `requested`, searching, candidate found, offer-write CAS loses race | system | `tick` | returns `"skipped"` | same, and must NOT log a phantom attempt or push | **UNTESTED → pinned (LM-03)**, `:188` | now OK |
| `requested`, searching, no candidate, self-loop CAS loses race | system | `tick` | returns `"skipped"` (not `"searching"`) | same | **UNTESTED → pinned (LM-03)**, `:214` | now OK |
| `requested`, attempt would exceed cap (6) | system | `tick` | CAS sets `noRiderHoldAt=now` (D-34 hold), emits C5 queue-changed | same | `:165` | OK |
| `requested`/`open_for_offers`/etc, already changed since `sweepSearch`'s own `SELECT` | system | `tick` | re-reads and returns `"skipped"` before even asking the strategy | same (defensive re-check) | `:228` | OK |
| `open_for_offers`, offer window elapsed | system | `sweepExpiredOffers` | CAS→`requested`, excludes rider, marks attempt `expired`, emits offer-closed | same | `:241` | OK |
| `open_for_offers`, rider already in excluded list | system | `sweepExpiredOffers` | doesn't double-append | same (idempotent) | `:275` | OK |
| `open_for_offers`, live unexpired offer | rider (candidate) | `acceptDispatch` | CAS→`assigned`, sets `riderId`, mints delivery code, clears offer fields, marks attempt `accepted`, pushes all 3 actors | same | `:301` | OK |
| `open_for_offers` | rider (NOT candidate) | `acceptDispatch` | 403 "isn't yours" | same | `:328` | OK |
| `open_for_offers`, offer expired but not yet swept | rider (candidate) | `acceptDispatch` | 409 "just expired" | same | `:333` | OK |
| `open_for_offers` | rider (candidate), already on another active ride | `acceptDispatch` | CAS wins, then `one_active_ride` unique index → P2002 → 409 "already on another active job", nothing persisted | same | `:341` | OK |
| `open_for_offers` | rider (candidate) | `declineDispatch` | frees offer immediately (shared `releaseCurrentOffer`) | same | `:352` | OK |
| `open_for_offers` | rider (NOT candidate) | `declineDispatch` | 403 | same | `:371` | OK |
| `assigned`/`confirmed`/`en_route_pickup` | rider (assigned) | `dropDispatch` | `$transaction`: CAS→`requested`/`ready_for_pickup`, rider cleared+excluded, fresh dispatch budget, reliability penalty + strike (< limit) | same | `:381` | OK |
| same, strike hits `CANCEL_STRIKE_LIMIT` | rider | `dropDispatch` | forces `isOnline=false` + cooldown, evicts from supply | same | `:417` | OK |
| `picked_up`+ | rider (assigned) | `dropDispatch` | 409 "already with you" | same | `:439` | OK |
| `assigned`/`confirmed`/`en_route_pickup`, in-tx CAS loses race | rider (assigned) | `dropDispatch` | 409 "Order changed, retry", rolls back, no strike applied | same | **UNTESTED → pinned (LM-03)**, `:449` | now OK |
| `requested`, `noRiderHoldAt` set | merchant (owner) | `resumeSearch` | CAS clears hold, resets attempt budget | same | `food-dispatch.service.spec.ts:512` | OK |
| `requested`, `noRiderHoldAt` null | merchant | `resumeSearch` | 409 "isn't waiting on a rider decision" | same | `:525` | OK |
| `requested`, `noRiderHoldAt` set | merchant (owner) | `cancelFromHold` | CAS→`cancelled`, `rejectionReason="no_rider"`, notifies customer, no fault to merchant standing | same (D-13 no-fault) | `:533` | OK |
| `open_for_offers`, live offer | rider (candidate) | `getOfferForRider` (poll/reconnect) | returns redacted offer | same | `:479` | OK |
| no live offer | rider | `getOfferForRider` | returns `null` | same | `:505` | OK |
| `en_route_pickup`, correct code | rider (assigned) | `confirmPickup` | `SELECT…FOR UPDATE` row lock, →`picked_up`, opens C4 debt in same tx | same | `food-order.service.spec.ts:453` (`picked_up`+`collectedAt`), `:468` (C4 debt wiring) | OK |
| `en_route_pickup` | rider (NOT assigned) | `confirmPickup` | 403 | same | `:424` | OK |
| not `en_route_pickup` | rider (assigned) | `confirmPickup` | 409 | same | `:429` | OK |
| `en_route_pickup`, wrong code | rider (assigned) | `confirmPickup` | commits attempt increment (deliberate, mirrors `confirmDelivery`), reports remaining attempts | same | `:434` | OK |
| `en_route_pickup`, attempts exhausted | rider (assigned) | `confirmPickup` | 403 too-many-attempts | same | `:448` | OK |
| n/a — cross-cutting | `NearestRiderDispatchStrategy` vs `hasLiveFoodDispatchOffer` | "is candidate mid-offer elsewhere" check | **two divergent predicates** (one filtered `orderType`+`status`, the other didn't) | one shared predicate | none, until this PR | **DUPLICATED → fixed (LM-02)** |
| `requested`, `noRiderHoldAt` set indefinitely | system | (no event — by design) | no reconciler ever auto-resolves a merchant hold; waits forever for `resumeSearch`/`cancelFromHold` | documented as intentional (D-34) — a named scope boundary, not a silent gap | `order-lifecycle.transitions.ts:512-517` names it explicitly | OK (by design, cross-referenced) |
| `requested→cancelled` via `cancelFromHold` | merchant | `cancelFromHold` | doesn't book a C4 loss record for the already-cooked food | documented as C4's ledger to own, not this lane's (`transitions.ts:568`) | n/a | OK (by design, cross-referenced) |

**Concurrency cells (the routine's required focus).** Every write in this lane is a compound
`updateMany` CAS (`status`/`dispatchAttempt`/`dispatchOfferedRiderId` match, never a bare `update`),
except `confirmPickup`, which uses a real `SELECT…FOR UPDATE` row lock inside a transaction. The true
"two riders claim the same order" scenario is structurally impossible in this lane (only one rider is
ever offered at a time — `dispatchOfferedRiderId` is a single column, unlike the parcel side's
broadcast-to-everyone auction), so the actual races this lane must defend are: a second overlapping
sweep tick racing the first, a rider's own decision racing the sweep's expiry, and a rider's drop
racing anything else that might have already moved the order. All three guard shapes were already
correct; three of their losing-race branches had never been exercised by a test (now fixed — LM-03),
and the double-booking-across-orders case is covered by the DB-level `one_active_ride` partial unique
index (tested at `:294`).

## Phase 2 — fixes (same run)

1. **LM-02 (DUPLICATED → unified).** `dispatch-strategy.ts`'s batched "holding another live offer"
   query was missing the `orderType`/`status` filters `food-dispatch-lock.ts`'s single-rider version
   always applied (previously ledgered as `X2-OBS-2`, OPEN). Extracted the shared condition as
   `LIVE_FOOD_DISPATCH_OFFER_WHERE` and spread it into both call sites — the two can no longer diverge
   independently. Regression test added asserting the actual `where` object.
2. **LM-03 (3× UNTESTED concurrency cells → pinned).** No code changes — all three guards were already
   correct — but the losing-race branch of `tick`'s offer-write CAS, `tick`'s no-candidate self-loop
   CAS, and `dropDispatch`'s in-transaction CAS had never been exercised by a test. Added three pinning
   tests confirming clean degradation (no phantom side effects) in each case.
3. **Stale comment (not a logic defect).** `food-order.service.ts:confirmPickup`'s docstring claimed
   the endpoint was "unreachable via HTTP until C3's dispatch sets `Order.riderId`" — false, since
   `merchant-order.controller.ts` wires it live and `acceptDispatch` (this lane, already shipped) sets
   `riderId`. Corrected to describe the actual, current reachability.

No DUPLICATED logic remained unaddressed inside this lane after the LM-02 fix. `X2-OBS-1`
(`FoodDebtService.confirmReturnedCash`'s missing order-status guard) is C4 debt-ledger scope, adjacent
to but outside this lane, and was left as-is — same scope-boundary reasoning the 2026-08-16 audit used
when it deliberately left `X2-OBS-2` for this lane to pick up.

## Phase 3 — evidence

- `pnpm typecheck && pnpm test` green locally after all edits (api: +4 tests over the Phase 0
  baseline — 1 unification regression, 3 concurrency pins, plus the pre-existing suite unaffected).
- `pnpm run depcruise`: 8 pre-existing violations (0 errors/warnings, 16 known-ignored) — unchanged
  by the new `merchant/dispatch-strategy.ts → common/food-dispatch-lock.ts` import (both anchor points
  the `express-no-merchant-coupling` rule already permits).
- `docs/KNOWN_BUGS.md` updated in this same PR: `X2-OBS-2` marked FIXED (superseded by LM-02); new
  `LM-02`/`LM-03` rows added under a new "Logic-model audit 2026-08-23" section.
