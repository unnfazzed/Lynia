import type { LatLng } from "@lynia/shared";
import { isInServiceArea } from "@lynia/shared";

/**
 * Ledger D-72: the "Popular" ranking, client half. The server ranks a list's live venues by their
 * delivered orders over 30 days, time-decayed (`GET /restaurants/popular`, `GET /shops/popular`); the
 * phone applies what only it knows — the clock (open now) and the customer's point (does it deliver
 * here) — and falls back to nearest-open when the server has nothing to rank (cold start, a failed
 * read, an old server). Pure, so the ordering is unit-testable off-device.
 */

export interface VenuePopularity {
  /** The sum of 0.5^(age / 7 days) over the venue's delivered orders in the window. The ordering key. */
  score: number;
  orders: number;
}

/** Venue id → its popularity. Empty means "no ranking": every caller then orders exactly as before. */
export type PopularityIndex = ReadonlyMap<string, VenuePopularity>;

export const NO_POPULARITY: PopularityIndex = new Map();

/**
 * The `PopularVenuesResponse` body → an index. Tolerant by design: a malformed body (CF-04's lesson),
 * an error page or a fixture that answers a different shape reads as "no ranking", never as a crash or
 * a half-ranked list.
 */
export function popularityIndex(body: unknown): PopularityIndex {
  const venues = (body as { venues?: unknown } | null | undefined)?.venues;
  if (!Array.isArray(venues)) return NO_POPULARITY;
  const index = new Map<string, VenuePopularity>();
  for (const v of venues) {
    const r = v as { id?: unknown; score?: unknown; orders?: unknown } | null;
    if (!r || typeof r.id !== "string" || typeof r.score !== "number" || !Number.isFinite(r.score) || r.score <= 0) continue;
    index.set(r.id, { score: r.score, orders: typeof r.orders === "number" && Number.isFinite(r.orders) ? r.orders : 0 });
  }
  return index.size > 0 ? index : NO_POPULARITY;
}

/** Two lists' rankings as one index (Home's "Popular shops" mixes Shops and Pharmacy — one formula, so
 *  their scores compare). */
export function mergePopularity(a: PopularityIndex, b: PopularityIndex): PopularityIndex {
  if (a.size === 0) return b;
  if (b.size === 0) return a;
  return new Map([...a, ...b]);
}

/** Does the ranking name a venue the paged list hasn't loaded yet? Then the list drains its next page
 *  (B-O10's rule for any ordering that needs the whole list), so a popular venue on page 2 still leads. */
export function rankedVenueMissing(index: PopularityIndex, loaded: readonly { id: string }[] | null): boolean {
  if (index.size === 0 || loaded == null) return false;
  const have = new Set(loaded.map((v) => v.id));
  for (const id of index.keys()) if (!have.has(id)) return true;
  return false;
}

/** Ranked venues before unranked ones, the higher score first. 0 when both are unranked or tie. */
export function comparePopularity(a: string, b: string, index: PopularityIndex): number {
  if (index.size === 0) return 0;
  const pa = index.get(a);
  const pb = index.get(b);
  if (!pa || !pb) return (pa ? 0 : 1) - (pb ? 0 : 1);
  return pb.score - pa.score || pb.orders - pa.orders;
}

/**
 * Can this venue deliver to the customer? Food orders are refused for a drop-off outside the service
 * area (food-order.service, owner 2026-10-02) and need the venue's own pin; there is no distance cap
 * inside the area. With no customer point yet the answer is "as far as we know, yes".
 */
export function deliversTo(venueLocation: LatLng | null, customer: LatLng | null): boolean {
  if (!venueLocation) return false;
  return customer == null || isInServiceArea(customer);
}
