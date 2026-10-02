/**
 * C2 (food order lifecycle) — pricing + timing config, as config not constants
 * (docs/plans/2026-07-28-restaurants-send-joint-launch-plan.md §5 Lane C, packages/design/
 * RESTAURANTS-DECISIONS.md). Mirrors the ./pricing.ts pattern (a single named FARE-shaped object +
 * pure functions), so a future tuning pass or per-corridor override touches this file, not a sweep
 * through the service. Money math goes through ./money (roundToCents) — the one arithmetic seam.
 */
import { addMoney, fromCents, roundToCents, toCents } from "./money";

export const RESTAURANTS_PRICING = {
  /** N-01: $0.80/km, rounded to the nearest $0.50, minimum $1.50. */
  deliveryFeePerKm: 0.8,
  deliveryFeeRoundingUnit: 0.5,
  deliveryFeeMin: 1.5,
  /** N-15: below this subtotal a $1.00 small-order fee applies instead of blocking checkout. */
  minOrderSubtotal: 4.0,
  smallOrderFee: 1.0,
} as const;

/** N-01 delivery fee for a trip of the given distance — config-driven, never a magic number inline. */
export function deliveryFeeForDistance(distanceKm: number): number {
  const km = Number.isFinite(distanceKm) ? Math.max(0, distanceKm) : 0;
  const raw = RESTAURANTS_PRICING.deliveryFeePerKm * km;
  const unit = RESTAURANTS_PRICING.deliveryFeeRoundingUnit;
  const rounded = roundToCents(Math.round(raw / unit) * unit);
  return Math.max(RESTAURANTS_PRICING.deliveryFeeMin, rounded);
}

/** N-15: $1.00 small-order fee below the $4.00 minimum, else 0 — a cart never blocks checkout. */
export function smallOrderFeeForSubtotal(subtotal: number): number {
  return subtotal < RESTAURANTS_PRICING.minOrderSubtotal ? RESTAURANTS_PRICING.smallOrderFee : 0;
}

/**
 * Free delivery, paid by the restaurant or shop (ledger D-71; handoffs calm-mint-v2 README §5 and
 * browse-v2 README §7: "a merchant-funded `free_delivery` flag per venue"; D-55 decision 2: "the venue
 * pays, the rider is paid in full"). Cash only, so nobody hands the rider a separate fare: the customer
 * pays $0 delivery at the door, the rider keeps the full `deliveryFee` out of that cash as always, and
 * the venue's money (what the rider returns, or pays first at a pay-upfront counter) is the goods
 * total LESS the fee.
 *
 * `merchantDeliveryShare` is the part of the rider's fee the venue pays. It is null on every order the
 * venue does not fund (and on every order placed before D-71), so all the formulas below collapse to
 * the old ones: customer total = goods + fee, venue's money = goods.
 *
 * It is never more than the goods total: the venue's money can't go below $0 and the rider is never
 * short. A venue funds delivery only when the goods cover the whole fee at placement
 * ({@link merchantDeliveryShareAtPlacement}); a later edit that drops the goods below the fee
 * ({@link recomputeMerchantDeliveryShare}) leaves the customer paying only the uncovered part.
 */
export function merchantDeliveryShareAtPlacement(input: {
  freeDelivery: boolean;
  paymentMethod: "cash" | "wallet";
  goodsTotal: number;
  deliveryFee: number;
}): number | null {
  if (!input.freeDelivery || input.paymentMethod !== "cash") return null;
  if (!(input.deliveryFee > 0) || toCents(input.goodsTotal) < toCents(input.deliveryFee)) return null;
  return roundToCents(input.deliveryFee);
}

/** The share after the goods total changed (an edit, a swap, a declined prescription). A funded order
 *  stays funded, capped by the new goods total; an unfunded one stays unfunded. */
export function recomputeMerchantDeliveryShare(
  previousShare: number | { toString(): string } | null | undefined,
  goodsTotal: number,
  deliveryFee: number,
): number | null {
  if (previousShare == null) return null;
  return fromCents(Math.max(0, Math.min(toCents(deliveryFee), toCents(goodsTotal))));
}

export interface FoodOrderMoney {
  /** What the customer pays for delivery: the fee less the venue's share ($0 on a free-delivery order). */
  customerDeliveryFee: number;
  /** What the customer pays in all (before any carried balance): goods + their delivery part. */
  customerTotal: number;
  /** What the rider earns: always the full fee. */
  riderFare: number;
  /** The venue's money: goods less its share — what the rider returns, or pays first at the counter. */
  merchantNet: number;
}

type MoneyLike = number | { toString(): string } | null | undefined;

/** The one split of a merchant order's money. Every total the customer, the rider and the venue see
 *  comes from here, so the three always add up: customerTotal = merchantNet + riderFare. */
export function foodOrderMoney(input: { goodsTotal: MoneyLike; deliveryFee: MoneyLike; merchantDeliveryShare?: MoneyLike }): FoodOrderMoney {
  const goods = toCents(Number(input.goodsTotal ?? 0));
  const fee = toCents(Number(input.deliveryFee ?? 0));
  const share = Math.max(0, Math.min(fee, goods, toCents(Number(input.merchantDeliveryShare ?? 0))));
  return {
    customerDeliveryFee: fromCents(fee - share),
    customerTotal: fromCents(goods + fee - share),
    riderFare: fromCents(fee),
    merchantNet: fromCents(goods - share),
  };
}

export const RESTAURANTS_TIMING = {
  /** N-03: unanswered merchant accept auto-cancels. */
  acceptWindowMs: 3 * 60 * 1000,
  /** D-23/N-18: customer's window to approve a shortened (item-level accept) order. */
  itemApprovalWindowMs: 60 * 1000,
  /** How often the DB reconciler sweeps for accept/approval-window/end-of-day expiries. Tighter than
   *  the Express rating-autoclose sweep (order-lifecycle.constants RECONCILE_INTERVAL_MS = 15min) —
   *  N-03's 3:00 window needs sub-minute precision to read as "auto-cancel", not "eventually". */
  sweepIntervalMs: 20 * 1000,
  /** N-22: one soft reminder push if a payment request goes unanswered this long — not a clock (R-17
   *  retired those), just a nudge; the order itself never expires from this. */
  paymentReminderWindowMs: 15 * 60 * 1000,
  /** Order flow v2 (BRIEF §8): the customer's window to answer a substitution round (swaps). No answer
   *  by then ⇒ swaps declined, those lines removed, the order carries on. Swept on `sweepIntervalMs`. */
  substitutionWindowMs: 3 * 60 * 1000,
} as const;

/**
 * Auto-accept (docs/plans/2026-09-30-restaurant-auto-accept.md): for restaurants still taking orders by
 * phone. A new cash order skips the accept window and goes straight to cooking, but no rider is sent
 * until the kitchen is confirmed — in the merchant app, or by LyniaGo ops after calling the restaurant.
 */
export const RESTAURANTS_AUTO_ACCEPT = {
  /** Prep time when the restaurant hasn't set its usual one (`prepBaselineMinutes`). */
  defaultPrepMinutes: 20,
  /** An order still unconfirmed this long after placement turns urgent on the ops call list. */
  escalateAfterMs: 5 * 60 * 1000,
  /** An order nobody confirmed this long after placement is cancelled; the customer is told nothing
   *  was charged (owner decision 2026-10-01). */
  autoCancelAfterMs: 60 * 60 * 1000,
  /** The rider search starts this long before prep time runs out (roughly a rider's trip to the
   *  counter), or straight away when the kitchen is confirmed later than that. */
  dispatchLeadMs: 8 * 60 * 1000,
  /** "Collected" (no pickup code) is only accepted this close to the restaurant's pin. */
  pickupGeofenceM: 150,
} as const;

/** N-16 / Order flow v2 (ledger D-59, BRIEF §16): every code is six digits, the pickup code included,
 *  shown 3+3 ("731 604") and typed into six boxes. The handoff's `ofCode.pickup`. */
export const PICKUP_CODE_DIGITS = 6;
/** The pickup code's length before Order flow v2. Still accepted on the wire (never minted) so an
 *  installed rider app's attempt fails cleanly as a wrong code, and a code minted before the switch
 *  still verifies. */
export const LEGACY_PICKUP_CODE_DIGITS = 4;

/** N-04: five prep-time chips, minutes. Free text is deliberately not offered (design rationale:
 *  invites "5 min" fiction). */
export const PREP_CHIPS_MIN = [10, 15, 20, 30, 45] as const;

/** N-17: busy mode adds this many minutes to the chosen prep chip at accept time. */
export const BUSY_MODE_EXTRA_MIN = 10;

/** D-11: a merchant rejection/release reason IS the customer's copy — one lookup, never a raw code
 *  leaked to the client. `other` is the fallback for a reason not in this set. */
export const MERCHANT_REJECTION_REASONS = {
  out_of_ingredient: "The kitchen is out of an ingredient for this order.",
  too_busy: "The kitchen can't take any more orders right now.",
  closing_soon: "The kitchen is closing and can't finish this order in time.",
  // R-17 regression #5 grammar ("couldn't reach you", never a silent drop).
  unreachable_customer: "We couldn't reach you to confirm your order.",
  // N-23 end-of-day auto-close.
  shop_closed: "The shop closed before your order could be confirmed.",
  // D-13/C3: NO_RIDER is an apology, not an error — nothing charged, doesn't count against the
  // merchant. Reached either by the reconciler (cap exhausted, never held) or the merchant's own
  // "cancel" choice from the D-34 hold screen.
  no_rider: "We couldn't find a rider for your order in time — nothing was charged, sorry about that.",
  // Auto-accept: nobody confirmed the kitchen within RESTAURANTS_AUTO_ACCEPT.autoCancelAfterMs.
  kitchen_unconfirmed: "The restaurant didn't confirm your order in time — nothing was charged, sorry about that.",
  // Order flow v2 (BRIEF §13): every line needed the prescription the pharmacist declined.
  rx_declined: "Your prescription wasn't approved, so there was nothing left to pack. Nothing was charged.",
  // Order flow v2 U5: every line ended up removed (out of stock, or every swap declined).
  all_out_of_stock: "They're out of every item. Your order is cancelled and nothing was charged.",
  other: "The restaurant couldn't take this order.",
} as const;

export function rejectionCopy(reason: string): string {
  return (MERCHANT_REJECTION_REASONS as Record<string, string>)[reason] ?? MERCHANT_REJECTION_REASONS.other;
}

/**
 * C3 — food dispatch config, as config not constants (same pattern as RESTAURANTS_PRICING/TIMING
 * above): a single named object + pure helpers, so a tuning pass touches this file, not a sweep
 * through food-dispatch.service.ts.
 */
export const RESTAURANTS_DISPATCH = {
  /** N-08: how long one offer round holds before the next round fires. */
  offerWindowMs: 60 * 1000,
  /** N-07: six 60s rounds total (whether or not each finds a rider) is the NO_RIDER cap, about 6:00
   *  end to end. */
  maxAttempts: 6,
  /** How far from the kitchen a rider can be offered the job (meters). */
  radiusM: 8000,
  /** Owner decision 2026-10-01 (ledger D-54): the first round offers the job to this many of the best
   *  nearby riders at once (the restaurant's own riders first, then the nearest); every later round
   *  offers it to everyone eligible. The first rider to accept gets it. */
  firstRoundSize: 10,
  /** How often the DB reconciler ticks pending dispatches — same cadence as RESTAURANTS_TIMING's
   *  pre-dispatch sweep, for the same "sub-minute precision, not BullMQ infra" reasoning. */
  sweepIntervalMs: 20 * 1000,
} as const;

/** How many riders a dispatch round offers the job to: the best {@link RESTAURANTS_DISPATCH.firstRoundSize}
 *  on the first round, everyone eligible (null) after. */
export function dispatchRoundSize(attempt: number): number | null {
  return attempt <= 1 ? RESTAURANTS_DISPATCH.firstRoundSize : null;
}

/**
 * E3 — merchant statement config (weekly statement + end-of-day summary). N-13: commission is 0%
 * while the corridor grows, with a purely illustrative "would have been" comparator shown alongside
 * it — never a committed rate, and never derived from the parcel side's {@link COMMISSION_RATE_PCT_ENV}
 * (food and parcel commissions are separate levers; food has no env override yet).
 */
export const RESTAURANTS_COMMISSION = {
  /** N-13: the rate actually charged today — nothing deducted at launch. */
  currentRatePct: 0,
  /** N-13: "would have been" comparator on the weekly statement — illustrative only. */
  illustrativeRatePct: 10,
} as const;

/**
 * C4 — food money evidence layer config, as config not constants (same pattern as
 * RESTAURANTS_PRICING/TIMING/DISPATCH above). Backs the doorstep dual-confirm handshake (R-04/R-05),
 * the no-show wait (N-10), and the refund SLA (N-12).
 */
export const RESTAURANTS_DEBT = {
  /** N-19: the doorstep handshake window — long enough to count notes twice, short enough that a
   *  stalling rider is caught at the door, not down the road. Past this (or an explicit rider
   *  dispute) the trip freezes (R-05) and support is notified. */
  handshakeWindowMs: 2 * 60 * 1000,
  /** D-48 (merchant mobile B7): how long the rider has, after delivery, to bring the merchant's cash
   *  back before it shows as overdue ("Due by 13:00 · 22 min left"). Shown, never chased: no penalty
   *  or reminder hangs off it. */
  cashReturnWindowMs: 30 * 60 * 1000,
  /** N-10: minimum wait before a rider may report a customer no-show. */
  noShowWindowMs: 8 * 60 * 1000,
  /** N-10: minimum logged calls before a no-show report is accepted. */
  noShowMinCalls: 2,
  /** N-12: refund SLA before escalating to support (visibility only — LyniaGo never holds the
   *  money, D-12/N-12). */
  refundSlaMs: 2 * 60 * 60 * 1000,
  /** How often the DB reconciler sweeps for a handshake past its N-19 deadline — same cadence as
   *  RESTAURANTS_TIMING/RESTAURANTS_DISPATCH's sweeps, for the same sub-minute-precision reasoning. */
  sweepIntervalMs: 20 * 1000,
} as const;

/**
 * Order flow v2 (ledger D-59, BRIEF §12) — scheduled orders, as config not constants. A slot is
 * `slotMinutes` long; the customer picks its start. The venue starts making it (the order rings, like a
 * new order) `prep + delivery` minutes before the slot starts, so it arrives inside the slot.
 */
export const ORDER_SCHEDULE = {
  slotMinutes: 30,
  /** "Full": scheduled orders a venue takes per slot. Generous on purpose — one busy kitchen's half
   *  hour — so it only bites on a genuine pile-up; a per-venue setting is a later tuning pass. */
  slotCapacity: 12,
  /** Prep when the venue hasn't set its usual one (`prepBaselineMinutes`). */
  defaultPrepMinutes: 20,
  /** Delivery leg when there's no drop-off to measure (the slots read before an address is known). */
  defaultDeliveryMinutes: 15,
  /** Same rough urban-motorbike model the app's ETA uses (apps/mobile/src/logic/eta.ts). */
  speedKmh: 22,
  roadWindingFactor: 1.3,
  /** Time for a rider to be found and reach the counter, on top of the ride itself. */
  riderLeadMinutes: 5,
} as const;

/** BRIEF §12: the delivery-leg estimate a slot is planned with — straight-line km, inflated for roads,
 *  at ORDER_SCHEDULE.speedKmh, plus the rider's lead time. Unknown distance → the default. */
export function deliveryMinutesForKm(distanceKm: number | null | undefined): number {
  if (distanceKm == null || !Number.isFinite(distanceKm)) return ORDER_SCHEDULE.defaultDeliveryMinutes;
  const ride = Math.ceil(((Math.max(0, distanceKm) * ORDER_SCHEDULE.roadWindingFactor) / ORDER_SCHEDULE.speedKmh) * 60);
  return Math.max(1, ride) + ORDER_SCHEDULE.riderLeadMinutes;
}

// ── Order flow v2 (packages/design/handoff/order-flow-v2, ledger D-59) ───────────────────────────────
// Pure, zod-free helpers the API and the phones share, so a phone draws exactly what the server
// computes (reachable through the zod-free `@lynia/shared/restaurants-order` entry).

/** N-15 applied to an items subtotal: the merchant's goods total (items + small-order fee). */
export function merchantGoodsForSubtotal(itemsSubtotal: number): { itemsSubtotal: number; smallOrderFee: number; goodsTotal: number } {
  const smallOrderFee = smallOrderFeeForSubtotal(itemsSubtotal);
  return { itemsSubtotal, smallOrderFee, goodsTotal: addMoney(itemsSubtotal, smallOrderFee) };
}

/** BRIEF §4: the four-step track every merchant order shows. */
export const MERCHANT_ORDER_TRACK_STEPS = ["confirmed", "making", "on_the_way", "delivered"] as const;
export type MerchantOrderTrackStep = (typeof MERCHANT_ORDER_TRACK_STEPS)[number];

/** The track's current step. Steps before `index` are done; `step` itself is in progress, except
 *  `delivered`, which is done. `rxChecked` (pharmacy step 1 reads "Prescription checked") is true once a
 *  prescription on the order was approved (BRIEF §13, backend B). */
export interface MerchantOrderTrack {
  step: MerchantOrderTrackStep;
  index: 0 | 1 | 2 | 3;
  rxChecked: boolean;
}

export interface MerchantOrderTrackInput {
  status: string;
  merchantPhase: string | null | undefined;
  autoAccepted?: boolean | null;
  kitchenConfirmedAt?: string | Date | null;
  /** BRIEF §13: the order's prescription check (pending | approved | declined); absent = no prescription. */
  rxStatus?: string | null;
}

const TRACK_MAKING_STATUSES: ReadonlySet<string> = new Set(["open_for_offers", "assigned", "confirmed", "en_route_pickup"]);
const TRACK_ON_THE_WAY_STATUSES: ReadonlySet<string> = new Set(["picked_up", "en_route_dropoff"]);
const TRACK_DELIVERED_STATUSES: ReadonlySet<string> = new Set(["delivered", "completed"]);

/**
 * BRIEF §4 derivation, from the order's status + kitchen phase. Rider found / at the venue / collected
 * are sheet content inside steps 2–3, not steps of their own. Returns null for an order that ended
 * without being delivered (cancelled, expired, undelivered) — those screens draw no track.
 *  - confirmed: waiting for the venue (accept window, a substitution answer at accept, legacy payment,
 *    or an auto-accepted order the kitchen hasn't confirmed yet)
 *  - making: cooking/packing, through to the rider collecting it
 *  - on_the_way: collected
 *  - delivered
 */
export function deriveMerchantOrderTrack(o: MerchantOrderTrackInput): MerchantOrderTrack | null {
  const at = (step: MerchantOrderTrackStep): MerchantOrderTrack => ({
    step,
    index: MERCHANT_ORDER_TRACK_STEPS.indexOf(step) as MerchantOrderTrack["index"],
    rxChecked: o.rxStatus === "approved",
  });
  if (TRACK_DELIVERED_STATUSES.has(o.status)) return at("delivered");
  if (TRACK_ON_THE_WAY_STATUSES.has(o.status)) return at("on_the_way");
  if (TRACK_MAKING_STATUSES.has(o.status)) return at("making");
  if (o.status !== "requested") return null;
  // BRIEF §13: "Pharmacist is checking your prescription" comes before Packing.
  if (o.rxStatus === "pending") return at("confirmed");
  if (o.merchantPhase === "ready_for_pickup") return at("making");
  if (o.merchantPhase === "preparing") return o.autoAccepted && !o.kitchenConfirmedAt ? at("confirmed") : at("making");
  return at("confirmed");
}

/** "Order #A1B2": the short id the handoff draws on the customer, merchant and rider phones. */
export function orderShortId(orderId: string): string {
  return orderId.replace(/-/g, "").slice(0, 4).toUpperCase();
}

/** One swap a substitution round asks the customer about. */
export interface SubstitutionSwapPrice {
  lineId: string;
  swapPriceUsd: number;
  quantity: number;
}

/**
 * BRIEF §8 totals for a substitution round, given which swaps the customer accepts. `keptSubtotal` is
 * the items subtotal of every line the round doesn't ask about (removals and quantity drops are already
 * applied); each accepted swap adds its price × quantity; the small-order fee is re-applied; the
 * delivery fee never changes. While a round is open the server stores the "every swap declined"
 * outcome (the no-answer default) and commits this on confirm.
 */
export function substitutionTotals(input: {
  keptSubtotal: number;
  deliveryFee: number;
  swaps: readonly SubstitutionSwapPrice[];
  acceptedLineIds: Iterable<string>;
}): { itemsSubtotal: number; smallOrderFee: number; goodsTotal: number; total: number } {
  const accepted = new Set(input.acceptedLineIds);
  const swapCents = input.swaps
    .filter((sw) => accepted.has(sw.lineId))
    .reduce((cents, sw) => cents + toCents(sw.swapPriceUsd) * sw.quantity, 0);
  const itemsSubtotal = addMoney(input.keptSubtotal, fromCents(swapCents));
  const goods = merchantGoodsForSubtotal(itemsSubtotal);
  return { ...goods, total: addMoney(goods.goodsTotal, input.deliveryFee) };
}
