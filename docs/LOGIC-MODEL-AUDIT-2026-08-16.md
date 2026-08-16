# Logic-model audit — 2026-08-16 — Bid acceptance (Express/parcel offer auction)

First run of the weekly logic-model audit routine (`docs/routines/logic-model-audit.md`) — no prior
`LM-` rows or `docs/LOGIC-MODEL-AUDIT-*.md` reports to dedup against, so lane selection fell back to
the rotation order in the routine spec: **bid acceptance → order assignment → agreed-price → KYC
gating → wallet/top-up/earnings → cancellation & hand-back.** This run modeled **bid acceptance**.

## Phase 0 — baseline + dedup

- `docs/KNOWN_BUGS.md` read in full. No `LM-` rows exist yet. Grepped `offer|bid|select_offer` across
  the ledger — the lane has been touched by nearly every prior routine (DS17-01..03, WD-001/005/013/021,
  ET1-ET7, C3/C4 soft-locks, the Object-authz/IDOR cluster, BH-01/13/14/23/24, CF-02) and every "FIXED"
  claim overlapping this lane was spot-checked against the current code in the course of Phase 1 below
  (the guard comments in `offers.service.ts`/`matching.service.ts` cite the fixing ticket inline, so the
  spot-check was to open each cited line, not re-derive the finding) — all intact.
- Zero open `claude/*` PRs at Phase 0 (`list_pull_requests` state=open → `[]`).
- `pnpm install` (fresh checkout, ran `prisma generate` — the client wasn't pre-built), then
  `pnpm typecheck && pnpm test` on clean `main`: **green** (6/6 typecheck tasks; api 100 files/1727
  tests, mobile 160 files/1201 tests, admin+merchant included). One mobile Jest run flaked with a
  worker-teardown warning unrelated to any file this PR touches; a clean re-run passed 160/160.

## Phase 1 — modeling the lane

**Scope.** The Express (parcel) reverse-auction: a customer's order sits `open_for_offers`; riders bid
(`OffersService.makeOffer`); the customer picks one (`MatchingService.selectOffer`, binds `agreedFare`
and mints the delivery code); an un-picked auction closes on its own 90s clock
(`MatchingService.expireOrder`, driven by `OfferExpiryService`'s BullMQ job + a 2-minute DB reconciler
backstop) or is cut short by a cancel. Merchant (food) orders never enter this machine — every read/write
here is `orderType:"parcel"`-scoped by the status-keyed-query-audit (A-1..A-4).

**Entities.** `Order.status` (`open_for_offers → assigned | expired | cancelled`, from
`order-lifecycle.transitions.ts`) and, layered inside it, `Offer.status`
(`pending → selected | declined | expired`, undocumented in the existing declarative transitions table —
it only models `OrderStatus`. This audit is the first pass to write the Offer sub-machine down.)

**Actors.** customer, rider, system (the BullMQ expiry job, the 2-min reconciler, the widening-broadcast
ticks), admin (ops console cancel/fare-adjust).

### Offer entity — sub-state machine (new; not in `order-lifecycle.transitions.ts`)

| From | Event | To | Actor | Guard |
|---|---|---|---|---|
| (none) | `makeOffer` | `pending` | rider | order `open_for_offers` + `orderType=parcel` (re-checked under `SELECT…FOR UPDATE`); not self-bid; pair not blocked; rider KYC-verified + online + in good standing (`onlineRefusalReason`); no live C3 food-dispatch offer; no open C4 merchant debt/handshake; `type=accept` ⇒ fare must equal `proposedFare` exactly; **one row per (order, rider) — unique index** |
| `pending` | `selectOffer` (this offer) | `selected` | customer | see Order-machine row below |
| `pending` | `selectOffer` (a sibling offer on the same order) | `declined` | customer | same tx, `updateMany` on every other pending offer |
| `pending` | `expireOrder` | `expired` | system | order's guarded CAS fires (window elapsed or reconciler catch-up) |
| `pending` | order cancelled (customer/rider/admin) | `declined` | customer/rider/admin | same tx as the cancel, `updateMany({status:"pending"} → declined)` |

### Order-state × actor × action truth table (bid-acceptance edges only)

| State | Actor | Action | Code does | Should do | Test | Verdict |
|---|---|---|---|---|---|---|
| (initial) | customer | `create` → `open_for_offers` | corridor + on-hold + idempotency-key-replay guards; schedules expiry + widening ticks | same | `orders.service.spec.ts` (out of this lane's file set, not re-audited here) | OK |
| `open_for_offers` | rider | `makeOffer` type=accept, fare = proposedFare | inserts `pending` offer | same | `offers.service.spec.ts` "creates the offer…" | OK |
| `open_for_offers` | rider | `makeOffer` type=accept, fare ≠ proposedFare | 403, no insert | same | `offers.service.spec.ts` "403s an accept whose fare doesn't match…" | OK |
| `open_for_offers` | rider | `makeOffer` type=counter, any fare (≤100k, 2dp) | accept-match guard is gated on `type==="accept"` — a counter bypasses it entirely | same (by design — a counter IS the rider's own price) | **none, until this PR** | **UNTESTED → pinned (LM-01)** |
| `open_for_offers` | rider | `makeOffer` twice (double-submit / retry) | unique `(orderId, riderId)` index → P2002 → 409 "already responded" | same | `offers.service.spec.ts` "409s on the one-round-per-rider unique violation" | OK |
| `open_for_offers` | rider | `makeOffer` on own order | 403 self-bid | same | `offers.service.spec.ts` "403s a rider bidding on their own order" | OK |
| `open_for_offers` | rider | `makeOffer`, blocked pair | 403, no insert, no push | same | `offers.service.spec.ts` "403s a rider bidding on an order whose customer is a blocked pair" | OK |
| `open_for_offers` | rider | `makeOffer`, KYC/offline/banned/suspended/on-hold/cooldown | 403 with reason-specific `REFUSAL_MESSAGE` | same | `offers.service.spec.ts` (verified/offline cases); other `onlineRefusalReason` branches share the map, unit-tested at `riders/online-gate` | OK |
| `open_for_offers` | rider | `makeOffer` holding a live C3 food-dispatch offer | 403 soft-lock | same | `offers.service.spec.ts` "403s a rider currently holding a live food dispatch offer" | OK |
| `open_for_offers` | rider | `makeOffer` with an open C4 merchant debt/handshake | 403 soft-lock | same | `offers.service.spec.ts` "403s a rider with an open merchant debt / pending handshake" | OK |
| `open_for_offers` | rider | `makeOffer` **race**: order flips (select/expire) between the pre-check read and the tx | `SELECT…FOR UPDATE` re-verifies inside the tx → 409, no orphan offer | same | `offers.service.spec.ts` "rejects (no orphan offer) when the order closes under the FOR UPDATE re-check" | OK |
| `open_for_offers` | rider | `makeOffer`, standing changes (e.g. an admin ban) in the gap between the pre-tx `rider.findUnique` read and the tx commit | offer can be inserted (no row lock on `Rider` inside the tx) | acceptable by design — the money-moving action is `selectOffer`, which re-checks standing fresh inside its own tx | n/a (narrow, sub-millisecond race; the actual gate is downstream) | OK (accepted, gated downstream) |
| `open_for_offers` | customer | `listForOrder` | ownership-gated (403 if not the order's customer); filters offers from either-direction blocked riders | same | `offers.service.spec.ts` (3 cases: ownership, block-by-customer, block-by-rider) | OK |
| `open_for_offers` | customer | `selectOffer`, happy path | guarded CAS `open_for_offers→assigned`; binds `agreedFare=offer.offeredFare`; mints+hashes delivery code; selected offer→`selected`, siblings→`declined`; `OrderEvent`; post-commit notify + `order:taken` board close | same | `matching.service.spec.ts` "records outcome=assigned…"; `offer-loop.int.spec.ts` ET1/ET2 (real Postgres) | OK |
| `open_for_offers` | customer | `selectOffer`, offer not found / wrong order | 404 | same | `matching.service.spec.ts` | OK |
| `open_for_offers` | customer | `selectOffer`, caller ≠ order's customer | 403 | same | `matching.service.spec.ts` | OK |
| `open_for_offers` | customer | `selectOffer`, self-offer (belt-and-braces vs. makeOffer's own self-bid guard) | 403 | same | code path present (`offer.riderId === customerId`); no dedicated unit test — covered transitively since `makeOffer` already blocks the row from existing | UNTESTED (low value: unreachable via HTTP given the upstream guard) | 
| `open_for_offers` | customer | `selectOffer`, blocked pair | 403, order never claimed | same | `matching.service.spec.ts` "rejects selecting an offer from a blocked rider" | OK |
| `open_for_offers` | customer | `selectOffer`, order already left `open_for_offers` | 409 "no longer open" | same | `matching.service.spec.ts` "not_open" | OK |
| `open_for_offers` | customer | `selectOffer`, offer not `pending` (already selected/declined/expired) | 409 "no longer available" | same | `matching.service.spec.ts` "unavailable" | OK |
| `open_for_offers` | customer | `selectOffer`, rider heartbeat stale (≥60s) or offline | 409 "just became unavailable" | same | `matching.service.spec.ts` KB-HEARTBEAT-MARGIN (45s passes, 90s rejects) | OK |
| `open_for_offers` | customer | `selectOffer`, rider standing changed post-bid (banned/suspended/held/cooldown) | 409 "just became unavailable" | same | code path present via `onlineRefusalReason`; no dedicated `selectOffer`-level unit test isolating each standing branch (only the heartbeat/C3/C4/block branches have direct tests) | UNTESTED (shares the well-tested `onlineRefusalReason` unit) |
| `open_for_offers` | customer | `selectOffer`, rider holding a live C3 food-dispatch offer | 409 soft-lock | same | `matching.service.spec.ts` C3 describe block | OK |
| `open_for_offers` | customer | `selectOffer`, rider with an open C4 merchant debt | 409 soft-lock | same | `matching.service.spec.ts` C4 describe block | OK |
| `open_for_offers` | customer×customer | **concurrent** `selectOffer` on two different pending offers, same order | guarded CAS — exactly one wins | same | `offer-loop.int.spec.ts` ET1 (real DB, `Promise.allSettled`) | OK |
| `open_for_offers`×2 | customer, customer | **concurrent** `selectOffer` picking the SAME rider on two different orders | `one_active_ride` partial-unique index → P2002 on the loser → 409 | same | `offer-loop.int.spec.ts` ET2 (real DB) | OK |
| `open_for_offers` | customer, system | **concurrent** `selectOffer` vs. `expireOrder` | both guarded CAS on the same `status="open_for_offers"` precondition — exactly one commits, order lands in exactly one terminal-for-this-race state | same | `offer-loop.int.spec.ts` ET1 select-vs-expire (real DB) | OK |
| `open_for_offers` | system | `expireOrder` (primary BullMQ job) | guarded CAS → `expired`; pending offers→`expired`; persists `expiryNoSupply` when zero bids AND nobody online; best-effort board/FCM | same | `matching.service.spec.ts` (no-supply persistence, both branches) | OK |
| `open_for_offers` | system | `expireOrder` (2-min DB reconciler, past grace window) | same CAS, idempotent re-entry if the primary job already fired | same | `offer-expiry.spec.ts` "expires every order still open_for_offers past the reconcile grace window, tolerating per-order failures" | OK |
| `open_for_offers` | system, system | **concurrent** primary job + reconciler on the same stale order | second caller's CAS sees count=0 → `{expired:false}` no-op | same | `offer-expiry.spec.ts` reconciler test mocks a `{expired:false}` result for exactly this case | OK |
| `open_for_offers` | system | `reconcileStaleOffers` itself throws (DB blip) | caught, logged, resolves `{expired:0}` (never an unhandled rejection that could crash the fleet) | same | `offer-expiry.spec.ts` "resolves (never rejects)…F-12 fire-and-forget guard" | OK |
| `open_for_offers` | system | `expandBroadcast` widening tick, order still open | re-emits board card to the widened ring; FCM-pushes only the newly-claimed riders; push TTL sized to the order's *remaining* window (DS17-01) | same | `matching.service.spec.ts` (6 cases: radius, claim-fallback, no-claims, DS17-01 TTL sizing + elapsed-window skip) | OK |
| `open_for_offers` | system | `expandBroadcast`, order already left `open_for_offers` **at the initial read** | no-op | same | `matching.service.spec.ts` "no-ops once the order has left open_for_offers" | OK |
| `open_for_offers` | system | `expandBroadcast`, order leaves `open_for_offers` **between** the initial read and the FCM send (customer selects/cancels while the tick is mid-flight doing its geo lookup + Redis claim) | **the only status check ran before those two async round-trips — a stale "bid now" push fired for a dead auction** | must not push once the auction is no longer live | **none, until this PR** | **GAP → FIXED (LM-01)** |
| `open_for_offers` | customer | `cancel` (order-lifecycle) | guarded CAS `open_for_offers→cancelled`; pending offers→`declined`; board-close signal (DS13-07); no rider reliability impact (no rider assigned yet) | same | out of this lane's file set (`order-lifecycle.service.spec.ts`/`.int.spec.ts`) — transition table + DS13-07 entry both confirm the behavior; not re-derived here | OK |
| `open_for_offers` | rider | `cancel` | **not reachable** — `RIDER_CANCELLABLE` starts at `assigned`; no `riderId` is set pre-selection | correctly absent | `order-lifecycle.transitions.ts` (rider-cancel rows start at `assigned`) | OK (by construction) |
| `open_for_offers` | admin | `cancelOrder` | guarded CAS on the observed status; declines pending offers; DS13-07 board-close; audit row | same | out of this lane's file set (`admin-orders.service.spec.ts`) | OK |
| `open_for_offers` | admin | `adjustFare` | rejected — `agreedFare == null` on an unassigned order | same (nothing to adjust before a fare is agreed) | `admin-orders.service.ts` comment + guard; not independently re-tested here | OK |

## Phase 2 — fixes + pinning tests (this run)

### LM-01 (GAP, LOW severity — notification hygiene, not money/security) — FIXED

**`MatchingService.expandBroadcast`** (widening-broadcast tick, `apps/api/src/matching/matching.service.ts`)
checked `order.status !== "open_for_offers"` exactly once, at the top of the method, then performed two
more async round-trips — a geo `nearbyRiders` lookup and a Redis `claimBroadcastRecipients` call — before
sending the FCM "a new order is nearby, tap to bid" push. A customer `selectOffer` or a cancel landing in
that window was invisible to the one check that had already passed, so a widened ring of riders could
still receive an invitation to bid on an auction that had already closed. This is a **different** race
than the one **DS17-01** already fixed: DS17-01 bounds a push from **outliving** the order's own natural
90-second window (TTL sizing); it does nothing for a push whose auction closed **early**, mid-tick, before
the TTL logic even runs. Confirmed exploitable via a unit test that stages the order as still-open on the
tick's opening read and `assigned` on a second read timed to land where the real code's second DB
round-trip sits — the test failed against the pre-fix code (`findUnique` called once, `notifyNewBroadcast`
still fired) and passes after.

**Fix** (smallest safe change, sensitive-lane doctrine): re-read `order.status` immediately before the
`notifyNewBroadcast` call — the one genuinely disruptive side effect (an FCM push reaches the rider's
lock screen regardless of app state; the preceding best-effort board-cell re-emit is left alone, since
WS clients already reconcile via `order:taken`/`bid:expired` and dedupe by id). No behavior change for the
already-covered no-op cases (order closed before the tick even starts, or the order's own window elapsed —
both still short-circuit exactly as before). **Ordering matters**: the re-check runs *before* DS17-01's
`remainingMs`/TTL computation, not after — CodeRabbit's first-pass review on this PR correctly flagged
that computing the TTL first and then awaiting the re-check would let the re-check's own round-trip go
stale-uncounted into a TTL that's supposed to reflect the order's remaining life at send time. Re-check
first, then compute the TTL fresh right before the send, so the two guarantees compose instead of one
silently degrading the other.

- **Idempotency:** n/a — this is a read-only re-check gating a best-effort push, not a state mutation.
- **State transition:** none — `expandBroadcast` never writes `OrderStatus`; this only tightens when its
  side effect is allowed to fire.
- **Money arithmetic:** none.
- **Regression test:** `matching.service.spec.ts` "LM-01: does NOT push when the order left
  open_for_offers WHILE the tick was mid-flight (post-initial-read)" — verified failing pre-fix (reverted
  the source change, re-ran, confirmed red), passing post-fix. Asserts the actual call *order* (opening
  read → geo lookup → recipient claim → re-check), not just a call count, so a re-check placed anywhere
  else in the method can't accidentally satisfy it.

### LM-01-pin (UNTESTED cell, pinned — no behavior change)

`OffersService.makeOffer`'s accept-must-match-`proposedFare` guard is gated on `input.type === "accept"`,
so a `type:"counter"` offer bypasses it by design (a counter IS the rider's own asking price, which
later becomes `agreedFare` verbatim if selected — this is the one place in the lane where the money that
ends up bound to the order is NOT the customer's original number). No test exercised offer creation at a
counter fare that would have failed the accept guard, only downstream `admin-orders.service.spec.ts`
coverage of how an already-selected counter offer displays in `fareProvenance`. Added
`offers.service.spec.ts` "accepts a counter offer at a fare that would have failed the accept-match guard
(LM-01)" — passes against the current code unmodified (behavior was already correct; this only pins it so
a future change to the guard's `type` condition trips a red test instead of silently starting to reject
legitimate counters, or silently starting to accept fare-tampered "accepts").

## Phase 3 — verification

- `pnpm typecheck && pnpm test` green on the branch: api 100 files / **1729** tests (1727 + 2 new), mobile
  160 files / 1201 tests, admin + merchant unchanged. Full changed-file scope for this PR: one source
  file (`apps/api/src/matching/matching.service.ts`, the LM-01 fix), two spec files
  (`apps/api/src/matching/matching.service.spec.ts`, `apps/api/src/offers/offers.service.spec.ts`, the two
  new regression/pinning tests), and these two docs (`docs/KNOWN_BUGS.md`, this report). No other file in
  the repo was touched.
- No DUPLICATED logic found *inside* this lane (both `open_for_offers` checks in `offers.service.ts` and
  `matching.service.ts` use the identical predicate). `X2-OBS-2` (an existing OPEN ledger row about two
  divergent "is this rider holding a live food offer" predicates) is a C3/merchant-dispatch concern
  adjacent to, not inside, this lane's Express/parcel scope — left as-is, not re-litigated here.
- Ledger updated in the same PR: `docs/KNOWN_BUGS.md` gets an `LM-01` row.
