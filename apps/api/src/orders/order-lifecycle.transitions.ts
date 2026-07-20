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

/** Who drives a transition. `system` = an offer-window timer, the auto-close worker, or the reconciler. */
export type TransitionActor = "customer" | "rider" | "system";

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
  },

  // ── Forward rider-driven edges (advance) — each stamps one milestone timestamp ────────────────────
  {
    from: "assigned",
    event: "confirmed",
    to: "confirmed",
    actor: "rider",
    guard: "guarded CAS status=assigned; caller === order.riderId (assigned rider only)",
    sideEffect: "stamp confirmedAt; OrderEvent(confirmed); best-effort WS order:status + FCM push",
    source: "order-lifecycle.service.ts:advance",
  },
  {
    from: "confirmed",
    event: "en_route_pickup",
    to: "en_route_pickup",
    actor: "rider",
    guard: "guarded CAS status=confirmed; caller === order.riderId",
    sideEffect: "stamp pickupStartedAt; OrderEvent(en_route_pickup); best-effort WS + FCM push",
    source: "order-lifecycle.service.ts:advance",
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
  },
  {
    from: "picked_up",
    event: "en_route_dropoff",
    to: "en_route_dropoff",
    actor: "rider",
    guard: "guarded CAS status=picked_up; caller === order.riderId",
    sideEffect: "no timestamp stamped; OrderEvent(en_route_dropoff); best-effort WS + FCM push",
    source: "order-lifecycle.service.ts:advance",
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
      "MONEY: chargeCommission ledger debit (re-reads agreedFare under the CAS row lock, WD-005); set completedAt; create Rating; OrderEvent(completed); rider tripsCount += 1 always, but ratingAvg/ratingCount + reliability recovery move ONLY when the rating counts toward the aggregate (distinct pair, FRAUD P1-6, AND established customer, customerRatingCarriesWeight); a low rating from a trusted customer always applies its penalty; post-commit supply eviction if the penalty newly holds the rider",
    source: "order-lifecycle.service.ts:rate",
  },
  {
    from: "delivered",
    event: "auto_close",
    to: "completed",
    actor: "system",
    guard: "guarded CAS status=delivered (idempotent; no-op if already completed/rated or never delivered); fired by the BullMQ auto-close job or the DB reconciler after the rating window elapses",
    sideEffect:
      "MONEY: chargeCommission ledger debit (the unrated counterpart to rate()'s debit; the two completion edges are mutually exclusive so it fires once); set completedAt; OrderEvent(completed); rider tripsCount += 1 + slow reliability recovery (a clean, complaint-free completion)",
    source: "order-lifecycle.service.ts:completeOrder",
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
    }),
  ),
];

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
