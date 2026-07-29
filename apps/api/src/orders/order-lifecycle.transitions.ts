/**
 * Order-lifecycle state machine — declarative transition table (roadmap 2.4).
 *
 * This is a **verification artifact**, NOT a runtime dependency. The order lifecycle is enforced
 * *implicitly* across several services (each transition is its own guarded compare-and-swap). This
 * module lifts that machine into ONE readonly, typed table so the diagram in
 * `docs/ARCHITECTURE.md §7` becomes machine-checkable and later work (roadmap 3.4) can assert the
 * services against it. Wiring the services to *consume* this table is deliberately out of scope —
 * nothing here imports Nest, Prisma, or any service, so it stays a pure spec that mirrors, but can
 * never change, the code's behaviour.
 *
 * Every row records what the code ALREADY does:
 *   - `from` / `event` / `to` — the state edge (see each `source`).
 *   - `actor`   — who drives it (customer / rider / system timer/worker).
 *   - `guard`   — the precondition the code checks before flipping (the CAS on the prior status, the
 *                 party/role check, plus any one-active-ride / liveness / attempt / trust gate).
 *   - `sideEffect` — what else the committed transition does (timestamp stamp, OrderEvent row, ledger
 *                 debit, WS/FCM push, board fan-out, reliability delta).
 *   - `compensation` — the corrective/rollback behaviour where one exists.
 *   - `source`  — `file:method` the transition lives in.
 *
 * Sources reconciled: `orders.service.ts` (create), `matching.service.ts` (selectOffer / expireOrder),
 * `offers.service.ts` (makeOffer — offer rows, NOT an order-state edge), and
 * `order-lifecycle.service.ts` (advance / confirmDelivery / markUndelivered / rate / completeOrder /
 * cancel / cloneForRebroadcast).
 *
 * C2 (status-keyed-query-audit A-11) added the `orderType` dimension to every row above (omitted ===
 * `"parcel"`, the audit's own "systemic finding" default) plus a second table,
 * {@link MERCHANT_PHASE_TRANSITIONS}, for the kitchen-side sub-state a merchant order carries in
 * `MerchantPhase` while `OrderStatus` itself sits at `requested` (plan §0b.1 locked decision — no new
 * OrderStatus values). Sources added: `merchant/food-order.service.ts` (placeOrder / rejectOrder /
 * acceptOrder / approveItems / confirmPayment / markReady / confirmPickup / cancelUnpaid /
 * releaseUnpaid / the sweepExpired* reconciler methods).
 */

/**
 * The twelve OrderStatus values (Prisma schema `enum OrderStatus`, `packages/shared` `OrderStatus`).
 * NOTE: `requested` is defined in the enum but the running code NEVER writes it — `create()` mints an
 * order directly at `open_for_offers`. It therefore never appears as a `to` below. See the
 * diagram-vs-code divergence recorded in the spec and in `docs/ARCHITECTURE.md §7`.
 */
export const ORDER_STATES = [
  "requested",
  "open_for_offers",
  "assigned",
  "confirmed",
  "en_route_pickup",
  "picked_up",
  "en_route_dropoff",
  "delivered",
  "completed",
  "cancelled",
  "expired",
  "undelivered",
] as const;
export type OrderState = (typeof ORDER_STATES)[number];

/** Terminal states — no outgoing edge (UI renders a closed order). Mirrors `shared` TERMINAL_STATUSES. */
export const TERMINAL_STATES = ["completed", "cancelled", "expired", "undelivered"] as const satisfies readonly OrderState[];
export type TerminalState = (typeof TERMINAL_STATES)[number];

/**
 * Pseudo-state for "no order row yet". `create` / `rebroadcast` are births, not edges on an existing
 * row, so they transition from `INITIAL`. It is deliberately NOT an OrderState (it is never a `to`).
 */
export const INITIAL = "(initial)" as const;
export type InitialState = typeof INITIAL;
export type TransitionFrom = OrderState | InitialState;

/** Who drives a transition. `system` = an offer-window timer, the auto-close worker, or the reconciler.
 *  `merchant` (C2) = the kitchen tablet. */
export type TransitionActor = "customer" | "rider" | "system" | "merchant";

/** C2 (docs/plans/2026-07-28-restaurants-send-joint-launch-plan.md §5 Lane C, status-keyed-query-audit
 *  A-11): which `Order.orderType` a transition applies to. `"both"` covers the Class-(b) edges the
 *  audit verified are reusable unmodified (forward rider CAS, cancel matrix, undelivered, the
 *  OTP-gated delivery). Omitted defaults to `"parcel"` (every row that predates this dimension). */
export type TransitionOrderType = "parcel" | "merchant" | "both";

/** The distinct events (actions) that move an order. Names track the code's method / argument. */
export const ORDER_EVENTS = [
  "create", // OrdersService.create
  "rebroadcast", // OrderLifecycleService.cloneForRebroadcast (rider-cancel auto re-broadcast)
  "select_offer", // MatchingService.selectOffer (customer accepts an offer → agreed price bound)
  "expire", // MatchingService.expireOrder (offer window elapses)
  "confirmed", // OrderLifecycleService.advance(to="confirmed")
  "en_route_pickup", // OrderLifecycleService.advance(to="en_route_pickup")
  "picked_up", // OrderLifecycleService.advance(to="picked_up")
  "en_route_dropoff", // OrderLifecycleService.advance(to="en_route_dropoff")
  "confirm_delivery", // OrderLifecycleService.confirmDelivery (OTP-gated)
  "rate", // OrderLifecycleService.rate (customer rates → close)
  "auto_close", // OrderLifecycleService.completeOrder (worker / reconciler backstop)
  "mark_undelivered", // OrderLifecycleService.markUndelivered
  "cancel_customer", // OrderLifecycleService.cancel (customer branch)
  "cancel_rider", // OrderLifecycleService.cancel (rider branch)
  // ── C2 (merchant orders, pre-dispatch) ──────────────────────────────────────────────────────────
  "place", // FoodOrderService.placeOrder — merchant order born at `requested`, not open_for_offers
  "reject", // FoodOrderService.rejectOrder (D-11, merchant declines while awaiting_accept)
  "expire_accept", // FoodOrderService.sweepExpiredAcceptWindows (N-03, 3:00 unanswered)
  "decline_items", // FoodOrderService.approveItems(approve=false) (D-23, customer declines the shortened order)
  "expire_item_approval", // FoodOrderService.sweepExpiredItemApprovals (N-18, 60s unanswered)
  "cancel_unpaid", // FoodOrderService.cancelUnpaid (R-17, customer free-cancel any time before paying)
  "release_unpaid", // FoodOrderService.releaseUnpaid (R-17, no-penalty merchant release)
  "expire_end_of_day", // FoodOrderService.sweepEndOfDayClose (N-23, shop closes with payment unconfirmed)
  "confirm_pickup", // FoodOrderService.confirmPickup (N-16, 4-digit code — wired for C3 dispatch to reach)
  // ── C3 (food dispatch) ──────────────────────────────────────────────────────────────────────────
  "dispatch_offer", // FoodDispatchService.tick (N-08, a candidate rider found — single-rider auto-offer)
  "dispatch_search", // FoodDispatchService.tick (self-loop: no candidate this attempt, budget remains)
  "dispatch_no_rider", // FoodDispatchService.tick (self-loop: N-07 NO_RIDER cap exhausted — D-34 hold begins)
  "dispatch_expire", // FoodDispatchService.sweepExpiredOffers (N-08, 60s offer window elapsed unanswered)
  "dispatch_decline", // FoodDispatchService.declineDispatch (the candidate's own "can't take it")
  "dispatch_accept", // FoodDispatchService.acceptDispatch (D-04 "rider secured")
  "dispatch_resume", // FoodDispatchService.resumeSearch (self-loop: D-34 merchant "keep searching")
  "dispatch_cancel_no_rider", // FoodDispatchService.cancelFromHold (D-34 merchant "cancel", D-13 apology)
  "dispatch_drop", // FoodDispatchService.dropDispatch (D-33, pre-pickup only — re-dispatch in place)
] as const;
export type OrderEvent = (typeof ORDER_EVENTS)[number];

export interface OrderTransition {
  readonly from: TransitionFrom;
  readonly event: OrderEvent;
  readonly to: OrderState;
  readonly actor: TransitionActor;
  /** The precondition the code checks before it flips the row (the guarded CAS + party/role/rate gates). */
  readonly guard: string;
  /** What else the committed transition does (timestamps, OrderEvent, ledger, pushes, reliability). */
  readonly sideEffect: string;
  /** Corrective / rollback behaviour, where one exists. */
  readonly compensation?: string;
  /** `file:method` the transition is enforced in. */
  readonly source: string;
  /** C2/A-11: which `orderType` this edge applies to. Omitted === `"parcel"` (see {@link orderTypeOf}). */
  readonly orderType?: TransitionOrderType;
}

/** Defaulted accessor — every row written before C2 is implicitly parcel-only (status-keyed-query-audit
 *  A-11's "systemic finding": nothing carried an orderType filter before merchant orders existed). */
export function orderTypeOf(t: OrderTransition): TransitionOrderType {
  return t.orderType ?? "parcel";
}

/** True iff `type` can legally traverse this edge (`"both"` rows apply to either). */
export function appliesToOrderType(t: OrderTransition, type: "parcel" | "merchant"): boolean {
  const ot = orderTypeOf(t);
  return ot === "both" || ot === type;
}

/**
 * The transition table. Exhaustive over the order-state edges the services actually perform. Each
 * `from`+`event` pair is unique (asserted in the spec), so the helpers below are total functions.
 */
export const TRANSITIONS: readonly OrderTransition[] = [
  // ── Creation (born at open_for_offers — `requested` is skipped by the code) ──────────────────────
  {
    from: INITIAL,
    event: "create",
    to: "open_for_offers",
    actor: "customer",
    guard:
      "customer not on hold (profile.onHold=false) AND, if the caller is a rider, accountStatus not banned/suspended; both pickup and drop-off inside SERVICE_CORRIDOR; idempotencyKey replay returns the prior order instead of a second auction",
    sideEffect:
      "insert order row (status=open_for_offers) + OrderEvent(open_for_offers); schedule offer-window expiry (best-effort); broadcast to nearby riders + WS board push",
    source: "orders.service.ts:create",
    // A-1..A-4: this Express-auction path is parcel-only by construction — orders.service.ts:create
    // always writes orderType:"parcel" (the P0 seam); a merchant order is born via the "place" event
    // below instead, directly at `requested`, never at open_for_offers.
    orderType: "parcel",
  },
  {
    from: INITIAL,
    event: "rebroadcast",
    to: "open_for_offers",
    actor: "system",
    guard:
      "only reached from a rider-cancel: clones a cancelled (pre-pickup) order's broadcast params into a NEW open_for_offers row; back-links rebroadcastOfId; the old row stays terminal cancelled and is never reopened",
    sideEffect:
      "insert clone row (status=open_for_offers, same price) + OrderEvent(open_for_offers); post-commit announceOpenOrder re-runs schedule-expiry + board/FCM fan-out; pushes the customer a 'follow your re-sent request' notice",
    compensation: "same-price re-broadcast that replaces the job the rider bailed on (F-01)",
    source: "order-lifecycle.service.ts:cloneForRebroadcast",
    // A-4: cloneForRebroadcast is reachable only from a rider-cancel, which itself is reachable only
    // once a merchant order has a rider — i.e. only after C3's dispatch exists. Parcel-only until then.
    orderType: "parcel",
  },

  // ── Matching (offer selection / offer-window expiry) ─────────────────────────────────────────────
  {
    from: "open_for_offers",
    event: "select_offer",
    to: "assigned",
    actor: "customer",
    guard:
      "guarded CAS status=open_for_offers; caller === order.customerId; offer belongs to the order and is status=pending; NOT a self-offer (offer.riderId !== customerId); pair not blocked; rider isOnline AND heartbeat < 60s (ET3) AND account standing OK (onlineRefusalReason); one_active_ride partial-unique blocks a rider already on another ride (ET2)",
    sideEffect:
      "MONEY: bind agreedFare = offer.offeredFare; set riderId, otpHash (delivery code minted once, hash stored), deliveryOtpAttempts=0, deliveryCodeRotatedAt; offer→selected, all other pending offers→declined; OrderEvent(assigned); post-commit notify rider + emitOrderTaken to close the board card",
    compensation:
      "CAS count 0 / P2002 one_active_ride → ConflictException('Order was just taken' / 'Rider just became unavailable'); nothing persisted, customer picks another offer",
    source: "matching.service.ts:selectOffer",
    // A-2/A-3: unreachable for a merchant order — offers.service.ts:makeOffer and the rider bid
    // boards now filter orderType:"parcel" (this PR), so no Offer row can exist against one.
    orderType: "parcel",
  },
  {
    from: "open_for_offers",
    event: "expire",
    to: "expired",
    actor: "system",
    guard: "guarded CAS status=open_for_offers (same CAS as selection, so a just-selected order no-ops); fired by the offer-window timer / reconciler",
    sideEffect:
      "pending offers→expired; OrderEvent(expired); post-commit emitBidExpired + emitOrderStatus(expired) + notifyOrderExpired; persists expiryNoSupply when zero bids AND nobody online nearby",
    source: "matching.service.ts:expireOrder",
    // A-1: unreachable for a merchant order — offer-expiry.service.ts's reconcile sweep now filters
    // orderType:"parcel" (this PR), so expireOrder's CAS never observes a merchant order.
    orderType: "parcel",
  },

  // ── Forward rider-driven edges (advance) — each stamps one milestone timestamp ────────────────────
  // Class (b), status-keyed-query-audit: reusable for merchant orders unmodified — once C3's dispatch
  // exists, a food order rides the SAME assigned→confirmed→en_route_pickup edges as a parcel.
  {
    from: "assigned",
    event: "confirmed",
    to: "confirmed",
    actor: "rider",
    guard: "guarded CAS status=assigned; caller === order.riderId (assigned rider only)",
    sideEffect: "stamp confirmedAt; OrderEvent(confirmed); best-effort WS order:status + FCM push",
    source: "order-lifecycle.service.ts:advance",
    orderType: "both",
  },
  {
    from: "confirmed",
    event: "en_route_pickup",
    to: "en_route_pickup",
    actor: "rider",
    guard: "guarded CAS status=confirmed; caller === order.riderId",
    sideEffect: "stamp pickupStartedAt; OrderEvent(en_route_pickup); best-effort WS + FCM push",
    source: "order-lifecycle.service.ts:advance",
    orderType: "both",
  },
  {
    from: "en_route_pickup",
    event: "picked_up",
    to: "picked_up",
    actor: "rider",
    guard: "guarded CAS status=en_route_pickup; caller === order.riderId",
    sideEffect:
      "stamp collectedAt (drives the cancel hand-back UI + the post-pickup cancellation cutover); OrderEvent(picked_up); best-effort WS + FCM push",
    source: "order-lifecycle.service.ts:advance",
    // N-16: a merchant order collects via the CODE-GATED confirm_pickup event below instead — the
    // rider at the counter must prove they're the assigned one, which this codeless parcel edge does
    // not check.
    orderType: "parcel",
  },
  {
    from: "picked_up",
    event: "en_route_dropoff",
    to: "en_route_dropoff",
    actor: "rider",
    guard: "guarded CAS status=picked_up; caller === order.riderId",
    sideEffect: "no timestamp stamped; OrderEvent(en_route_dropoff); best-effort WS + FCM push",
    source: "order-lifecycle.service.ts:advance",
    orderType: "both",
  },

  // ── C2: merchant pickup (N-16, 4-digit code) — mirrors confirm_delivery's shape one hop earlier.
  // Wired now so the mechanic exists; unreachable via HTTP until C3's dispatch assigns a rider and
  // mints pickupCodeHash (this PR mints it at markReady — see MERCHANT_PHASE_TRANSITIONS below).
  {
    from: "en_route_pickup",
    event: "confirm_pickup",
    to: "picked_up",
    actor: "rider",
    guard:
      "SELECT ... FOR UPDATE row lock; caller === order.riderId; status=en_route_pickup; pickup_code_attempts < DELIVERY_OTP_MAX_ATTEMPTS (5); constant-time hash compare of the rider's 4-digit code === stored pickupCodeHash",
    sideEffect: "stamp collectedAt; OrderEvent(picked_up); best-effort WS + FCM push",
    compensation:
      "a wrong code is COMMITTED as pickupCodeAttempts += 1 (persists, the 401 tells the merchant how many tries remain)",
    source: "merchant/food-order.service.ts:confirmPickup",
    orderType: "merchant",
  },

  // ── Delivery (OTP-gated) ─────────────────────────────────────────────────────────────────────────
  {
    from: "en_route_dropoff",
    event: "confirm_delivery",
    to: "delivered",
    actor: "rider",
    guard:
      "SELECT ... FOR UPDATE row lock; caller === order.riderId; status=en_route_dropoff; delivery_otp_attempts < DELIVERY_OTP_MAX_ATTEMPTS (5); constant-time hash compare of the recipient's delivery code === stored otpHash",
    sideEffect:
      "set deliveredAt; OrderEvent(delivered); best-effort WS + FCM push; schedule the rating auto-close job (BullMQ delayed, reconciler backstops)",
    // status-keyed-query-audit P0 unknown #1, closed: no orderType assumption — reusable for merchant
    // orders unmodified. The doorstep dual-confirm handshake (R-04) that GATES this call for a CASH
    // merchant order is C4's job; this edge itself needs no change.
    orderType: "both",
    compensation:
      "a wrong code is COMMITTED as deliveryOtpAttempts += 1 (persists, the 401 tells the rider how many tries remain); the code re-issue path is rotateDeliveryCode, which is a status-preserving action (not an edge)",
    source: "order-lifecycle.service.ts:confirmDelivery",
  },

  // ── Completion (customer rating OR auto-close backstop — mutually exclusive, both CAS status=delivered) ─
  {
    from: "delivered",
    event: "rate",
    to: "completed",
    actor: "customer",
    guard: "guarded CAS status=delivered AND customerId === caller (the rating closes the order)",
    sideEffect:
      "MONEY: chargeCommission ledger debit ONLY for orderType=parcel (A-5 type branch, this PR — a merchant order's own commission/settlement is C4's ledger, not the Express ride-commission wallet); re-reads agreedFare under the CAS row lock, WD-005; set completedAt; create Rating; OrderEvent(completed); rider tripsCount += 1 always, but ratingAvg/ratingCount + reliability recovery move ONLY when the rating counts toward the aggregate (distinct pair, FRAUD P1-6, AND established customer, customerRatingCarriesWeight); a low rating from a trusted customer always applies its penalty; post-commit supply eviction if the penalty newly holds the rider",
    source: "order-lifecycle.service.ts:rate",
    // A-5: the STATE edge (delivered->completed) is Class-b shared; the money side effect is now
    // type-branched in code (this PR) rather than deferred — a merchant order can't reach `delivered`
    // without C3's dispatch yet, but the guard is cheap and belongs here, not left latent.
    orderType: "both",
  },
  {
    from: "delivered",
    event: "auto_close",
    to: "completed",
    actor: "system",
    guard: "guarded CAS status=delivered (idempotent; no-op if already completed/rated or never delivered); fired by the BullMQ auto-close job or the DB reconciler after the rating window elapses",
    sideEffect:
      "MONEY: chargeCommission ledger debit ONLY for orderType=parcel (A-5 type branch, this PR); the unrated counterpart to rate()'s debit; the two completion edges are mutually exclusive so it fires once; set completedAt; OrderEvent(completed); rider tripsCount += 1 + slow reliability recovery (a clean, complaint-free completion)",
    source: "order-lifecycle.service.ts:completeOrder",
    orderType: "both",
  },

  // ── Undelivered (rider gave up post-pickup) — terminal ───────────────────────────────────────────
  {
    from: "picked_up",
    event: "mark_undelivered",
    to: "undelivered",
    actor: "rider",
    guard: "guarded CAS status ∈ {picked_up, en_route_dropoff} (POST_PICKUP_FOR_UNDELIVERED); caller === order.riderId (a hand-off can only FAIL once the parcel is on the bike)",
    sideEffect:
      "set undeliveredReason + undeliveredAt; deliveryAttempts += 1; OrderEvent(undelivered); reliability penalty by reason (breakdown/unreachable ding the rider; refused/wrong_address do not); FRAUD P0-3 velocity auto-hold when the recent undelivered rate is abnormal (forces isOnline=false); post-commit geo + board eviction of a newly-held rider",
    source: "order-lifecycle.service.ts:markUndelivered",
    orderType: "both",
  },
  {
    from: "en_route_dropoff",
    event: "mark_undelivered",
    to: "undelivered",
    actor: "rider",
    guard: "guarded CAS status ∈ {picked_up, en_route_dropoff} (POST_PICKUP_FOR_UNDELIVERED); caller === order.riderId",
    sideEffect:
      "set undeliveredReason + undeliveredAt; deliveryAttempts += 1; OrderEvent(undelivered); reliability penalty by reason + FRAUD P0-3 velocity auto-hold; post-commit geo + board eviction of a newly-held rider",
    source: "order-lifecycle.service.ts:markUndelivered",
    orderType: "both",
  },

  // ── Cancellation — customer may cancel at ANY live status (pre- OR post-pickup) ──────────────────
  ...(["open_for_offers", "assigned", "confirmed", "en_route_pickup", "picked_up", "en_route_dropoff"] as const).map(
    (from): OrderTransition => ({
      from,
      event: "cancel_customer",
      to: "cancelled",
      actor: "customer",
      guard: `caller === order.customerId; status ∈ CUSTOMER_CANCELLABLE_STATUSES (${from} is a member); guarded CAS on the observed status`,
      sideEffect:
        "set cancelledAt/cancelledBy/cancelReason; OrderEvent(cancelled); release pending offers→declined; NO rider reliability impact; if a rider is assigned, post-commit emitJobCancelled(collected) hand-back signal; if it was open_for_offers, post-commit board-close (emitBidExpired); push 'Order cancelled' to the affected party excluding the canceller",
      source: "order-lifecycle.service.ts:cancel",
      orderType: "both",
    }),
  ),

  // ── Cancellation — rider may cancel ONLY pre-pickup (assigned…en_route_pickup); picked_up+ is blocked ─
  ...(["assigned", "confirmed", "en_route_pickup"] as const).map(
    (from): OrderTransition => ({
      from,
      event: "cancel_rider",
      to: "cancelled",
      actor: "rider",
      guard: `caller === order.riderId; status ∈ RIDER_CANCELLABLE_STATUSES (${from} is a member); picked_up onward is REJECTED (post-pickup failure is mark_undelivered, not cancel); guarded CAS on the observed status`,
      sideEffect:
        "set cancelledAt/cancelledBy/cancelReason; OrderEvent(cancelled); release pending offers→declined; rider cancelStrikes += 1 + prePickupCancel reliability penalty; every CANCEL_STRIKE_LIMIT (3rd) strike forces isOnline=false on a cooldown; cloneForRebroadcast mints a NEW open_for_offers order at the same price (see rebroadcast); post-commit supply eviction of a demoted rider",
      compensation: "the bailed job is auto re-broadcast as a fresh open_for_offers order (rebroadcast edge); the old row stays terminal cancelled",
      source: "order-lifecycle.service.ts:cancel",
      // A-4: this branch's cloneForRebroadcast is parcel-only (see the "rebroadcast" row above). A
      // merchant order's rider-cancel needs C3's own reassignment handling, not this auto-rebroadcast —
      // parcel-only until C3 lands it.
      orderType: "parcel",
    }),
  ),

  // ── C2: merchant orders (pre-dispatch). Born at `requested` — never open_for_offers, so the
  // Express machinery above genuinely cannot see one (A-1..A-4). Kitchen-side progress is carried by
  // MerchantPhase while OrderStatus stays `requested`; see MERCHANT_PHASE_TRANSITIONS below for that
  // finer dimension. Every terminal exit lands at the SAME `cancelled` state a parcel uses — no new
  // OrderStatus values (plan §0b.1 locked decision).
  {
    from: INITIAL,
    event: "place",
    to: "requested",
    actor: "customer",
    guard:
      "RestaurantsEnabledGuard + Merchant.pilotEnabled allowlist; merchant has a location set; every dishId belongs to the merchant, is not draft/out-of-stock; customer not on hold; idempotencyKey replay returns the prior order",
    sideEffect:
      "MONEY: server computes merchantGoodsTotal (dish snapshots + N-15 small-order fee) + deliveryFee (N-01, packages/shared/restaurants-order) + agreedFare=sum; insert order row (status=requested, merchantPhase=awaiting_accept) + MerchantOrderItem rows (price snapshot, D-35) + OrderEvent(requested); stamp acceptDeadlineAt=+3:00 (N-03)",
    source: "merchant/food-order.service.ts:placeOrder",
    orderType: "merchant",
  },
  {
    from: "requested",
    event: "reject",
    to: "cancelled",
    actor: "merchant",
    guard: "caller owns the merchant; merchantPhase=awaiting_accept; guarded CAS on status=requested",
    sideEffect: "set cancelledAt/cancelledBy/rejectionReason (D-11, the reason IS the customer copy); clear merchantPhase; OrderEvent(cancelled)",
    source: "merchant/food-order.service.ts:rejectOrder",
    orderType: "merchant",
  },
  {
    from: "requested",
    event: "expire_accept",
    to: "cancelled",
    actor: "system",
    guard: "merchantPhase=awaiting_accept AND now >= acceptDeadlineAt; guarded CAS on status=requested; fired by the DB reconciler (packages/shared/restaurants-order RESTAURANTS_TIMING.sweepIntervalMs)",
    sideEffect: "set cancelledAt/rejectionReason='shop_closed'-shaped N-03 copy; clear merchantPhase; OrderEvent(cancelled); never a silent hang (D-13 apology grammar)",
    source: "merchant/food-order.service.ts:sweepExpiredAcceptWindows",
    orderType: "merchant",
  },
  {
    from: "requested",
    event: "decline_items",
    to: "cancelled",
    actor: "customer",
    guard: "caller === order.customerId; merchantPhase=awaiting_item_approval; guarded CAS on status=requested",
    sideEffect: "D-23: the customer rejects the shortened (item-level accept) order; set cancelledAt; clear merchantPhase; OrderEvent(cancelled)",
    source: "merchant/food-order.service.ts:approveItems",
    orderType: "merchant",
  },
  {
    from: "requested",
    event: "expire_item_approval",
    to: "cancelled",
    actor: "system",
    guard: "merchantPhase=awaiting_item_approval AND now >= itemApprovalDeadlineAt; guarded CAS on status=requested",
    sideEffect:
      "N-18: unanswered 60s approval window — mocked default (surfaced in the PR, not silently decided): treated as a decline, same as decline_items. Set cancelledAt; clear merchantPhase; OrderEvent(cancelled)",
    source: "merchant/food-order.service.ts:sweepExpiredItemApprovals",
    orderType: "merchant",
  },
  {
    from: "requested",
    event: "cancel_unpaid",
    to: "cancelled",
    actor: "customer",
    guard:
      "caller === order.customerId; merchantPhase ∈ {awaiting_accept, awaiting_item_approval, awaiting_payment} (R-17: free, any time before paying — once preparing/ready_for_pickup the kitchen has committed, no free cancel); guarded CAS on status=requested",
    sideEffect: "set cancelledAt/cancelledBy=customer; clear merchantPhase; OrderEvent(cancelled)",
    source: "merchant/food-order.service.ts:cancelUnpaid",
    orderType: "merchant",
  },
  {
    from: "requested",
    event: "release_unpaid",
    to: "cancelled",
    actor: "merchant",
    guard: "caller owns the merchant; merchantPhase=awaiting_payment; guarded CAS on status=requested",
    sideEffect:
      "R-17: no-penalty release (the zombie-order mitigation — an awaiting-payment lane that never blocks the board); set cancelledAt/rejectionReason; clear merchantPhase; OrderEvent(cancelled)",
    source: "merchant/food-order.service.ts:releaseUnpaid",
    orderType: "merchant",
  },
  {
    from: "requested",
    event: "expire_end_of_day",
    to: "cancelled",
    actor: "system",
    guard: "merchantPhase=awaiting_payment AND now >= the shop's closing time for today (Merchant.hours); guarded CAS on status=requested; fired by the DB reconciler",
    sideEffect:
      "N-23: end-of-day close is the only automatic exit for an unpaid WALLET order (R-17 — no payment clocks otherwise); nothing charged; set cancelledAt/rejectionReason='shop_closed'; clear merchantPhase; OrderEvent(cancelled); customer notified",
    source: "merchant/food-order.service.ts:sweepEndOfDayClose",
    orderType: "merchant",
  },

  // ── C3: food dispatch. `merchantPhase` stays `ready_for_pickup` for the entire dispatch lifetime
  // (searching, offered, holding) — cleared to null only on the genuine hand-offs out (dispatch_accept
  // below, and every terminal cancel), the same "no MERCHANT_PHASE_TRANSITIONS row for an exit" shape
  // the C2 cancel/reject/expire rows above already use. `open_for_offers` is deliberately the SAME
  // status value Express's own auction uses (plan §0b.1 "no new OrderStatus values") — safe because
  // every Express read/write keyed on it already carries an orderType filter (status-keyed-query-audit
  // A-1..A-4, C1/C2). Self-loop rows (`to` === `from`) are included rather than omitted: unlike
  // expandBroadcast (a pure side-effect tick that never touches `status` and so was left out of this
  // table entirely), dispatch_search/dispatch_no_rider/dispatch_resume each commit a real, guarded
  // status=status CAS with meaningful field-level side effects — honestly an edge, just a short one.
  {
    from: "requested",
    event: "dispatch_offer",
    to: "open_for_offers",
    actor: "system",
    guard:
      "merchantPhase=ready_for_pickup; noRiderHoldAt IS NULL; dispatchAttempt+1 <= RESTAURANTS_DISPATCH.maxAttempts (N-07); DispatchStrategy finds a candidate within the attempt's widening radius (N-08); guarded CAS on status=requested AND dispatchAttempt=(observed) AND noRiderHoldAt IS NULL",
    sideEffect:
      "set dispatchOfferedRiderId/dispatchOfferExpiresAt(+60s)/dispatchNextCheckAt(same); dispatchAttempt+=1; dispatchStartedAt stamped on the FIRST attempt only; INSERT FoodDispatchAttempt(pending); OrderEvent(open_for_offers) on attempt 1 only (retries don't re-log — the FoodDispatchAttempt row IS the per-attempt audit trail); best-effort push to the candidate rider",
    source: "merchant/food-dispatch.service.ts:tick",
    orderType: "merchant",
  },
  {
    from: "requested",
    event: "dispatch_search",
    to: "requested",
    actor: "system",
    guard: "same as dispatch_offer, but the strategy finds NO candidate at this attempt's radius; guarded CAS on status=requested AND dispatchAttempt=(observed) AND noRiderHoldAt IS NULL",
    sideEffect: "dispatchAttempt+=1; dispatchStartedAt stamped on the FIRST attempt only; dispatchNextCheckAt=+60s (sweepSearch's next pass retries at the next attempt's wider radius); no FoodDispatchAttempt row (nothing to log)",
    source: "merchant/food-dispatch.service.ts:tick",
    orderType: "merchant",
  },
  {
    from: "requested",
    event: "dispatch_no_rider",
    to: "requested",
    actor: "system",
    guard: "dispatchAttempt+1 > RESTAURANTS_DISPATCH.maxAttempts (N-07, ~6:00 NO_RIDER cap); guarded CAS on status=requested AND dispatchAttempt=(observed) AND noRiderHoldAt IS NULL",
    sideEffect: "D-34: set noRiderHoldAt=now, dispatchNextCheckAt=null — sweepSearch stops touching this order until the merchant explicitly resumes or cancels (no auto-timeout on the hold itself; a named mocked default, surfaced in the PR body per §9)",
    source: "merchant/food-dispatch.service.ts:tick",
    orderType: "merchant",
  },
  {
    from: "open_for_offers",
    event: "dispatch_expire",
    to: "requested",
    actor: "system",
    guard: "dispatchOfferExpiresAt < now (N-08, 60s unanswered); guarded CAS on status=open_for_offers AND dispatchOfferedRiderId=(observed)",
    sideEffect: "FoodDispatchAttempt(that rider, pending)→expired; append the rider to dispatchExcludedRiderIds (never re-offered this cycle); clear dispatchOfferedRiderId/dispatchOfferExpiresAt; dispatchNextCheckAt=now (sweepSearch's next pass tries the next candidate immediately)",
    source: "merchant/food-dispatch.service.ts:sweepExpiredOffers → releaseCurrentOffer",
    orderType: "merchant",
  },
  {
    from: "open_for_offers",
    event: "dispatch_decline",
    to: "requested",
    actor: "rider",
    guard: "caller === dispatchOfferedRiderId; guarded CAS on status=open_for_offers AND dispatchOfferedRiderId=caller",
    sideEffect: "same as dispatch_expire's side effect (shared releaseCurrentOffer helper) — the candidate's own \"can't take it\", freeing the offer before the 60s window elapses rather than making the kitchen wait it out",
    source: "merchant/food-dispatch.service.ts:declineDispatch",
    orderType: "merchant",
  },
  {
    from: "open_for_offers",
    event: "dispatch_accept",
    to: "assigned",
    actor: "rider",
    guard: "caller === dispatchOfferedRiderId; dispatchOfferExpiresAt >= now; guarded CAS on status=open_for_offers AND dispatchOfferedRiderId=caller; one_active_ride partial-unique blocks a rider already on another ride (same P2002 handling as matching.service.ts:selectOffer)",
    sideEffect:
      "D-04 \"rider secured\": set riderId=caller, mint otpHash (delivery code, mirrors selectOffer — the food order rides the SAME assigned→…→confirm_delivery edges as a parcel from here on, orderType:\"both\"), deliveryOtpAttempts=0, deliveryCodeRotatedAt; clear merchantPhase to null (hand-off out of the merchant-phase machine — no MERCHANT_PHASE_TRANSITIONS row, same shape as every other exit) and every dispatch field; FoodDispatchAttempt(caller, pending)→accepted; OrderEvent(assigned); post-commit emitOrderStatus(assigned) to the order room (reaches customer+rider) + push to both — no merchant-side push yet (Lane C5's job; the kitchen tablet has no realtime channel until then, sees it via REST poll)",
    compensation: "CAS count 0 / P2002 one_active_ride → ConflictException; nothing persisted, the rider stays free for their next offer",
    source: "merchant/food-dispatch.service.ts:acceptDispatch",
    orderType: "merchant",
  },
  {
    from: "requested",
    event: "dispatch_resume",
    to: "requested",
    actor: "merchant",
    guard: "caller owns the merchant; merchantPhase=ready_for_pickup; noRiderHoldAt IS NOT NULL; guarded CAS on status=requested",
    sideEffect: "D-34 \"keep searching\": clear noRiderHoldAt, reset dispatchAttempt=0/dispatchStartedAt=null/dispatchNextCheckAt=null — a fresh NO_RIDER budget; dispatchExcludedRiderIds is NOT reset (already-tried riders stay excluded); sweepSearch's next pass resumes",
    source: "merchant/food-dispatch.service.ts:resumeSearch",
    orderType: "merchant",
  },
  {
    from: "requested",
    event: "dispatch_cancel_no_rider",
    to: "cancelled",
    actor: "merchant",
    guard: "caller owns the merchant; merchantPhase=ready_for_pickup; noRiderHoldAt IS NOT NULL; guarded CAS on status=requested",
    sideEffect: "D-34 \"cancel\" / D-13 apology: set cancelledAt, rejectionReason='no_rider' (the apology copy, MERCHANT_REJECTION_REASONS); clear merchantPhase; OrderEvent(cancelled); customer notified. The cooked-food loss this represents is C4's ledger to book, not this PR's — flagged, not silently decided.",
    source: "merchant/food-dispatch.service.ts:cancelFromHold",
    orderType: "merchant",
  },

  // D-33: pre-pickup drop only (assigned/confirmed/en_route_pickup — RIDER_CANCELLABLE_STATUSES'
  // own pre-pickup set); picked_up+ has no edge here, matching "no drop after pickup". Distinct from
  // the parcel `cancel_rider` rows above: those clone-and-rebroadcast a NEW order; this re-enters
  // dispatch IN PLACE on the SAME order (the food is already cooked and waiting — nothing to
  // re-broadcast a fresh listing for). See food-dispatch.service.ts's class docstring for the D-33/
  // D-04 "prep clock"/"cooking" language reconciliation against the locked R-11/R-17 ordering.
  ...(["assigned", "confirmed", "en_route_pickup"] as const).map(
    (from): OrderTransition => ({
      from,
      event: "dispatch_drop",
      to: "requested",
      actor: "rider",
      guard: `caller === order.riderId; status=${from}; orderType=merchant; guarded CAS on the observed status`,
      sideEffect:
        "re-enter dispatch on the SAME order: merchantPhase restored to ready_for_pickup, riderId/otpHash cleared, dispatchAttempt reset to 0 (fresh NO_RIDER budget) with the dropped rider added to dispatchExcludedRiderIds; OrderEvent(requested); reliability penalty IDENTICAL to order-lifecycle.service.ts:cancel's rider branch (prePickupCancel, cancelStrikes+=1, CANCEL_STRIKE_LIMIT→cooldown+offline+evictRiderFromSupply — the SAME axis, not a second counter, so \"three drops in a week pauses offers\" (D-33) composes with a rider's parcel cancel strikes); customer notified (no charge, re-dispatching)",
      source: "merchant/food-dispatch.service.ts:dropDispatch",
      orderType: "merchant",
    }),
  ),
];

/**
 * C2/A-11 "parallel merchant table": kitchen-side sub-state OrderStatus has no room for, while
 * OrderStatus itself stays `requested` throughout (see the `place`..`expire_end_of_day` rows above,
 * every one of which reads/writes `merchantPhase` alongside status). Same verification-artifact
 * contract as {@link TRANSITIONS} — mirrors what the code already does, drives nothing at runtime.
 * A `to` is an array because one method can legally land in more than one next phase depending on the
 * order's own `merchantPaymentMethod` (fixed at placement, not a runtime branch on unrelated state).
 */
export const MERCHANT_PHASES = [
  "awaiting_accept",
  "awaiting_item_approval",
  "awaiting_payment",
  "preparing",
  "ready_for_pickup",
] as const;
export type MerchantPhaseState = (typeof MERCHANT_PHASES)[number];
export type MerchantPhaseFrom = MerchantPhaseState | InitialState;

export const MERCHANT_PHASE_EVENTS = [
  "place",
  "accept_full",
  "accept_partial",
  "approve_items",
  "confirm_payment",
  "mark_ready",
] as const;
export type MerchantPhaseEvent = (typeof MERCHANT_PHASE_EVENTS)[number];

export interface MerchantPhaseTransition {
  readonly from: MerchantPhaseFrom;
  readonly event: MerchantPhaseEvent;
  readonly to: readonly MerchantPhaseState[];
  readonly actor: TransitionActor;
  readonly guard: string;
  readonly sideEffect: string;
  readonly source: string;
}

export const MERCHANT_PHASE_TRANSITIONS: readonly MerchantPhaseTransition[] = [
  {
    from: INITIAL,
    event: "place",
    to: ["awaiting_accept"],
    actor: "customer",
    guard: "see the `place` row in TRANSITIONS — same call, same commit",
    sideEffect: "merchantPhase=awaiting_accept, acceptDeadlineAt=+3:00 (N-03)",
    source: "merchant/food-order.service.ts:placeOrder",
  },
  {
    from: "awaiting_accept",
    event: "accept_full",
    // N-04/N-17 prep chip (+10 if Merchant.busyMode) chosen, no item marked unavailable.
    to: ["preparing", "awaiting_payment"],
    actor: "merchant",
    guard:
      "caller owns the merchant; every item's `available` left null (full accept — any false routes to accept_partial instead); guarded CAS on merchantPhase=awaiting_accept",
    sideEffect:
      "R-01/R-11: CASH → preparing directly (prepStartedAt=now; collect-and-return fronts nothing, nothing to confirm upfront); WALLET → awaiting_payment (prep does NOT start — R-17, prep starts at payment confirm, not accept). prepMinutes stored either way.",
    source: "merchant/food-order.service.ts:acceptOrder",
  },
  {
    from: "awaiting_accept",
    event: "accept_partial",
    to: ["awaiting_item_approval"],
    actor: "merchant",
    guard: "caller owns the merchant; at least one item marked unavailable=false (D-23 \"don't have it\"); guarded CAS on merchantPhase=awaiting_accept",
    sideEffect: "recompute merchantGoodsTotal off the remaining items; stamp itemApprovalDeadlineAt=+60s (N-18); prepMinutes stored for use once approved",
    source: "merchant/food-order.service.ts:acceptOrder",
  },
  {
    from: "awaiting_item_approval",
    event: "approve_items",
    to: ["preparing", "awaiting_payment"],
    actor: "customer",
    guard: "caller === order.customerId; approve=true; guarded CAS on merchantPhase=awaiting_item_approval AND now < itemApprovalDeadlineAt",
    sideEffect: "same CASH/WALLET branch as accept_full, off the RECOMPUTED (shorter) total — no refund step needed here (the money difference is stated before any payment moves, D-23)",
    source: "merchant/food-order.service.ts:approveItems",
  },
  {
    from: "awaiting_payment",
    event: "confirm_payment",
    to: ["preparing"],
    actor: "merchant",
    guard:
      "caller owns the merchant; reference+amount match the merchant's own statement (amount === merchantGoodsTotal, R-11/D-06 — a mismatch blocks and names the gap in dollars, never just displays it); guarded CAS on merchantPhase=awaiting_payment",
    sideEffect: "R-11: THIS is what starts the prep clock, not acceptance; prepStartedAt=now; merchantPaymentConfirmedAt=now; merchantPaymentReference stored",
    source: "merchant/food-order.service.ts:confirmPayment",
  },
  {
    from: "preparing",
    event: "mark_ready",
    to: ["ready_for_pickup"],
    actor: "merchant",
    guard: "caller owns the merchant; guarded CAS on merchantPhase=preparing",
    sideEffect:
      "readyAt=now; mint pickupCodeHash (N-16, 4-digit, hashed like otpHash) so it exists by the time C3's dispatch assigns a rider and confirmPickup can verify it. Hand-off point to C3: broadcasting this order (status requested -> open_for_offers) is dispatch's job, not this method's.",
    source: "merchant/food-order.service.ts:markReady",
  },
];

/** The single merchant-phase transition for a `from`+`event` pair, or undefined if illegal. */
export function findMerchantPhaseTransition(
  from: MerchantPhaseFrom,
  event: MerchantPhaseEvent,
): MerchantPhaseTransition | undefined {
  return MERCHANT_PHASE_TRANSITIONS.find((t) => t.from === from && t.event === event);
}

// ── Pure helpers ──────────────────────────────────────────────────────────────────────────────────

/** The single transition for a `from`+`event` pair, or undefined if the pair is not legal. */
export function findTransition(from: TransitionFrom, event: OrderEvent): OrderTransition | undefined {
  return TRANSITIONS.find((t) => t.from === from && t.event === event);
}

/** True iff the code performs an edge for this `from`+`event`. */
export function isLegalTransition(from: TransitionFrom, event: OrderEvent): boolean {
  return findTransition(from, event) !== undefined;
}

/** The resulting state for a legal `from`+`event`, else null. */
export function nextState(from: TransitionFrom, event: OrderEvent): OrderState | null {
  return findTransition(from, event)?.to ?? null;
}

/** Every transition whose source is `from`. */
export function transitionsFrom(from: TransitionFrom): readonly OrderTransition[] {
  return TRANSITIONS.filter((t) => t.from === from);
}

/** Every event legal from `from`. */
export function eventsFor(from: TransitionFrom): readonly OrderEvent[] {
  return transitionsFrom(from).map((t) => t.event);
}

/** True iff `state` is terminal (no outgoing edge). */
export function isTerminalState(state: OrderState): state is TerminalState {
  return (TERMINAL_STATES as readonly string[]).includes(state);
}
