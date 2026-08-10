/**
 * C2 (food order lifecycle) — pricing + timing config, as config not constants
 * (docs/plans/2026-07-28-restaurants-send-joint-launch-plan.md §5 Lane C, packages/design/
 * RESTAURANTS-DECISIONS.md). Mirrors the ./pricing.ts pattern (a single named FARE-shaped object +
 * pure functions), so a future tuning pass or per-corridor override touches this file, not a sweep
 * through the service. Money math goes through ./money (roundToCents) — the one arithmetic seam.
 */
import { roundToCents } from "./money";

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
} as const;

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
  /** N-08: how long a single candidate rider has to accept before the next attempt fires. */
  offerWindowMs: 60 * 1000,
  /** N-07: "~6 sequential 60s offers" — six ticks total (whether or not each finds a candidate) is
   *  the NO_RIDER cap, ≈6:00 end to end. */
  maxAttempts: 6,
  /** Widening search radius (meters) per attempt (1-indexed via {@link dispatchRadiusForAttempt}).
   *  Starts tighter than Express's own base broadcast radius (a food order wants the CLOSEST rider
   *  first, not the widest audience) and widens faster than the cap is reached, so a genuinely
   *  sparse area still gets a shot at every attempt. */
  radiusStepsM: [1500, 2500, 3500, 4500, 6000, 8000],
  /** How often the DB reconciler ticks pending dispatches — same cadence as RESTAURANTS_TIMING's
   *  pre-dispatch sweep, for the same "sub-minute precision, not BullMQ infra" reasoning. */
  sweepIntervalMs: 20 * 1000,
} as const;

/** Widening radius (meters) for the given 1-indexed dispatch attempt, clamped to the last step for
 *  any attempt beyond the configured schedule (defensive; maxAttempts already bounds real callers). */
export function dispatchRadiusForAttempt(attempt: number): number {
  const steps = RESTAURANTS_DISPATCH.radiusStepsM;
  const i = Math.min(Math.max(1, Math.trunc(attempt)), steps.length) - 1;
  // i is clamped into [0, steps.length - 1] above, so the index is always in range —
  // noUncheckedIndexedAccess still types it as possibly-undefined, hence the assertion.
  return steps[i]!;
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
