/**
 * Delivery price ceiling (docs/plans/2026-11-05-delivery-price-ceiling.md, ledger D-125, owner 2026-11-05).
 *
 * The customer of a restaurant / shop / pharmacy order sets a ceiling ("Pay no more than"). Dispatch offers the
 * job below it and raises the offer one 50c step per round until a rider accepts, never above the ceiling plus any
 * shop top-up. The customer pays the accepted price (minus the top-up the shop funds). Every amount sits on the 50c
 * fare grid (`roundFare`).
 *
 * Pure functions only: the API validates and stores, the apps display. Both import these, so the bounds the
 * checkout stepper shows are the bounds the API enforces.
 */
import { fromCents, roundFare, toCents } from "./money";
import { suggestFare } from "./pricing";

const UNIT_CENTS = 50;

export const DELIVERY_CEILING = {
  /** The lowest ceiling a customer may set, as a share of Recommended (plan §4). */
  floorShare: 0.8,
  /** The highest ceiling, as a multiple of Recommended (stops a mistyped amount). */
  maxMultiple: 2,
  /** Where the ladder starts, as a share of Recommended, rounded DOWN to 50c (plan §4). */
  startShare: 0.85,
  /** Never below the restaurant fee's old minimum. */
  minUsd: 1.5,
  /** The narrowest price range the browse screens show (owner 2026-11-06, D-128). */
  displayRangeMinUsd: 1,
  /** One rung of the ladder and one stepper tap. */
  stepUsd: 0.5,
  /** The shop's top-up choices on the hold (M4h). */
  topUpsUsd: [0.5, 1, 2] as const,
  /** A customer raise from the hold prompt, by default (T11c). */
  raiseStepUsd: 0.5,
  /** After the hold, how long the shop has to top up before the customer is asked (M4h "We'll ask … in 1:42"). */
  askCustomerAfterMs: 2 * 60 * 1000,
} as const;

/** Round DOWN to the 50c grid (the starting offer never rounds up past 85%). */
function down50(usd: number): number {
  return fromCents(Math.floor(toCents(usd) / UNIT_CENTS) * UNIT_CENTS);
}

/** Recommended delivery price for a trip: Send's suggested fare ($1.50 + $0.60/km, 50c, min $1.50). */
export function recommendedDeliveryUsd(distanceKm: number): number {
  return suggestFare(distanceKm);
}

export interface CeilingBounds {
  recommended: number;
  /** Lowest ceiling the customer can set. */
  min: number;
  /** Highest ceiling the customer can set. */
  max: number;
}

/** The ceiling the customer may choose, for a given Recommended price. */
export function ceilingBounds(recommended: number): CeilingBounds {
  const rec = roundFare(recommended);
  const min = Math.max(DELIVERY_CEILING.minUsd, roundFare(rec * DELIVERY_CEILING.floorShare));
  const max = fromCents(toCents(rec) * DELIVERY_CEILING.maxMultiple);
  return { recommended: rec, min: Math.min(min, rec), max };
}

/** Whether a requested ceiling is on the 50c grid and inside the bounds. */
export function isValidCeiling(ceiling: number, recommended: number): boolean {
  if (!Number.isFinite(ceiling)) return false;
  const c = toCents(ceiling);
  if (c % UNIT_CENTS !== 0) return false;
  const b = ceilingBounds(recommended);
  return c >= toCents(b.min) && c <= toCents(b.max);
}

/** Where the ladder starts: 85% of Recommended rounded down, never below the floor, never above the ceiling. */
export function startingOffer(recommended: number, ceiling: number): number {
  const b = ceilingBounds(recommended);
  const start = Math.max(b.min, down50(b.recommended * DELIVERY_CEILING.startShare));
  return fromCents(Math.min(toCents(start), toCents(ceiling)));
}

/**
 * The delivery price range the browse screens show (D-128): from the starting offer up to Recommended, and at least
 * `displayRangeMinUsd` wide, so Recommended always sits inside it. Display only: Review sets the real ceiling.
 */
export function deliveryPriceRange(distanceKm: number): { low: number; high: number } {
  const recommended = roundFare(recommendedDeliveryUsd(distanceKm));
  const low = startingOffer(recommended, recommended);
  return { low, high: fromCents(Math.max(toCents(recommended), toCents(low) + toCents(DELIVERY_CEILING.displayRangeMinUsd))) };
}

/**
 * The offer for a 1-based round: start + $0.50 per round after the first, capped at the ceiling, plus the shop's
 * top-up on top of whatever the ladder reached. `floor` lifts the start (a re-dispatch never offers below the
 * price the customer was already told).
 */
export function offerForRound(input: {
  round: number;
  start: number;
  ceiling: number;
  topUp?: number;
  floor?: number;
}): number {
  const round = Math.max(1, Math.floor(input.round));
  const ceiling = toCents(input.ceiling);
  const base = Math.max(toCents(input.start), toCents(input.floor ?? 0));
  const climbed = Math.min(ceiling, base + (round - 1) * UNIT_CENTS);
  return fromCents(climbed + toCents(input.topUp ?? 0));
}

/** The customer's part of an accepted offer: the offer less the shop's top-up (never below 0). */
export function customerDeliveryPart(offer: number, topUp: number): number {
  return fromCents(Math.max(0, toCents(offer) - toCents(topUp)));
}

/**
 * The order's money for a ladder rung: the rider's fee (rung + top-up), the shop's share of it (the whole fee on a
 * free-delivery venue, else the top-up), capped by the goods total as D-71's share always is, and what the customer
 * pays in all. The one place the API turns a rung into `deliveryFee` / `merchantDeliveryShare` / `agreedFare`.
 */
export function ceilingMoney(input: { goods: number; ladder: number; topUp?: number | null; venueFunded?: boolean | null }): {
  deliveryFee: number;
  merchantDeliveryShare: number | null;
  customerTotal: number;
} {
  const goods = Math.max(0, toCents(input.goods));
  const topUp = Math.max(0, toCents(input.topUp ?? 0));
  const fee = toCents(input.ladder) + topUp;
  const rawShare = input.venueFunded ? fee : topUp;
  const share = rawShare > 0 ? Math.min(rawShare, fee, goods) : null;
  return {
    deliveryFee: fromCents(fee),
    merchantDeliveryShare: share == null ? null : fromCents(share),
    customerTotal: fromCents(goods + fee - (share ?? 0)),
  };
}

/** The top-up amounts a shop may still add: each must keep the total top-up within the goods total. */
export function topUpChoices(goods: number, topUpSoFar: number): number[] {
  const room = toCents(goods) - toCents(topUpSoFar);
  return DELIVERY_CEILING.topUpsUsd.filter((t) => toCents(t) <= room);
}
