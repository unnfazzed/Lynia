import type { PopularVenueRank } from "@lynia/shared";

/**
 * Ledger D-72: the "Popular" ranking — one definition of "popular" for the whole customer side.
 *
 * Every popularity read counts the same thing: DELIVERED orders (`delivered` / `completed`) at venues a
 * customer can see, over the same 30-day window. The X1 "Popular near you" search chips (D-57,
 * `MerchantService.searchPopular`) and a storefront's "Popular" dish rail rank dishes with it; the Home
 * "Popular restaurants" / "Popular shops" rails and the browse "Recommended" sort rank venues with it.
 */

/** The window every popularity read looks back over. */
export const POPULAR_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;
/** The order states that count: the customer received it. A cancelled or undelivered order is no vote. */
export const POPULAR_ORDER_STATUSES = ["delivered", "completed"] as const;
/** A dish or a venue needs this many delivered orders in the window to count as popular — one lucky order isn't. */
export const POPULAR_MIN_ORDERS = 3;
/** Venue ranking: an order's weight halves every week, so last week's favourite beats last month's. */
export const VENUE_POPULARITY_HALF_LIFE_MS = 7 * 24 * 60 * 60 * 1000;
/** Cold start: the ranking engages only once this many venues clear {@link POPULAR_MIN_ORDERS} — a ranking
 *  of one is not a ranking, and a thin corridor keeps the nearest-open order it had before. */
export const VENUE_POPULARITY_MIN_VENUES = 2;
/** The ranking carries at most this many venues (a Home rail draws 8; browse sorts the rest by distance). */
export const VENUE_POPULARITY_MAX = 50;

/** The window's start, for a read made at `now`. */
export function popularSince(now: Date): Date {
  return new Date(now.getTime() - POPULAR_WINDOW_MS);
}

/** One venue's aggregate over the window, as the orders query returns it. */
export interface VenueOrderAggregate {
  merchantId: string;
  orders: number;
  /** Σ 0.5^(age / half-life) over its delivered orders. */
  score: number;
}

/**
 * Venues → the ranking. Keeps the venues with enough delivered orders, most popular first: the decayed
 * score, then the raw order count, then the id (so equal venues never swap between two reads). Answers
 * nothing — the cold-start signal — while fewer than {@link VENUE_POPULARITY_MIN_VENUES} venues qualify.
 */
export function rankVenuesByPopularity(rows: readonly VenueOrderAggregate[]): PopularVenueRank[] {
  const ranked = rows
    .filter((r) => r.orders >= POPULAR_MIN_ORDERS && Number.isFinite(r.score) && r.score > 0)
    .sort((a, b) => b.score - a.score || b.orders - a.orders || (a.merchantId < b.merchantId ? -1 : a.merchantId > b.merchantId ? 1 : 0))
    .slice(0, VENUE_POPULARITY_MAX)
    // Three decimals is plenty to order by, and keeps the cached body small and byte-stable.
    .map((r) => ({ id: r.merchantId, orders: r.orders, score: Math.round(r.score * 1000) / 1000 }));
  return ranked.length >= VENUE_POPULARITY_MIN_VENUES ? ranked : [];
}
