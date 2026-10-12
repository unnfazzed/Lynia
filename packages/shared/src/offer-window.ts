import { OFFER_WINDOW_MS } from "./contracts";

/**
 * How long a parcel auction stays open (owner, 2026-10-12, cold start). A fixed 90 s window assumes a
 * busy market: with a handful of riders online, 90 s is shorter than the time it takes a rider to notice a
 * push, pull the phone out and bid. So the window is chosen at create time from the supply the order was
 * broadcast to, and a price raise guarantees the riders time to answer the new price.
 *
 * The end is persisted on the order (`offerWindowEndsAt`) so the API, the customer countdown and the rider
 * board all read one value. A row written before this existed has none — {@link offerWindowEndsAt} falls
 * back to the old `createdAt + OFFER_WINDOW_MS`.
 */
export const OFFER_WINDOW_POLICY = {
  /** Window when supply is thin (fewer than {@link OFFER_WINDOW_POLICY.quietBelowRiders} riders online). */
  quietWindowMs: 4 * 60_000,
  /** At or above this many riders online the normal {@link OFFER_WINDOW_MS} applies. */
  quietBelowRiders: 10,
  /** A raise leaves at least this long on the clock, so riders can answer the new price. */
  raiseMinRemainingMs: 60_000,
  /** Raises never stretch an auction past this long after it was created. */
  maxWindowMs: 10 * 60_000,
} as const;

/** The window length for a new auction, from how many riders it reached. Unknown supply (`null`, a geo
 *  blip) keeps the normal window — never a guess in either direction. */
export function offerWindowMsForSupply(ridersOnline: number | null): number {
  if (ridersOnline === null) return OFFER_WINDOW_MS;
  return ridersOnline < OFFER_WINDOW_POLICY.quietBelowRiders ? OFFER_WINDOW_POLICY.quietWindowMs : OFFER_WINDOW_MS;
}

/** When bidding closes on an order. Rows from before the persisted end fall back to the fixed window. */
export function offerWindowEndsAt(order: { createdAt: Date | string; offerWindowEndsAt?: Date | string | null }): Date {
  if (order.offerWindowEndsAt) return new Date(order.offerWindowEndsAt);
  return new Date(new Date(order.createdAt).getTime() + OFFER_WINDOW_MS);
}

/** The window end after a raise at `nowMs`: at least {@link OFFER_WINDOW_POLICY.raiseMinRemainingMs} left,
 *  never shortened, never past {@link OFFER_WINDOW_POLICY.maxWindowMs} from creation. */
export function offerWindowEndAfterRaise(createdAt: Date | string, currentEnd: Date, nowMs: number): Date {
  const cap = new Date(createdAt).getTime() + OFFER_WINDOW_POLICY.maxWindowMs;
  const wanted = Math.max(currentEnd.getTime(), nowMs + OFFER_WINDOW_POLICY.raiseMinRemainingMs);
  return new Date(Math.max(currentEnd.getTime(), Math.min(wanted, cap)));
}
