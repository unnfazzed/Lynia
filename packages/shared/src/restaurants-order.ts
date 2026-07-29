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
} as const;

/** N-04: five prep-time chips, minutes. Free text is deliberately not offered (design rationale:
 *  invites "5 min" fiction). */
export const PREP_CHIPS_MIN = [10, 15, 20, 30, 45] as const;
export type PrepChipMinutes = (typeof PREP_CHIPS_MIN)[number];

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
  other: "The restaurant couldn't take this order.",
} as const;
export type MerchantRejectionReason = keyof typeof MERCHANT_REJECTION_REASONS;

export function rejectionCopy(reason: string): string {
  return (MERCHANT_REJECTION_REASONS as Record<string, string>)[reason] ?? MERCHANT_REJECTION_REASONS.other;
}
