import type { LatLng, RestaurantListItem } from "@lynia/shared";
import { deliveryFeeForDistance, haversineKm, isMerchantOpenNow } from "@lynia/shared";
import { DEFAULT_PREP_MINUTES } from "./home-feed";
import { ETA_SPEED_KMH, ROAD_WINDING_FACTOR } from "./eta";

/**
 * The restaurant list's derived view model (RC.list, `r-customer-a.jsx:89`).
 *
 * The mock draws three things the screen used to fake or omit: a deliver-to that names WHERE the
 * customer is, four filter/sort pills, and a results summary ("5 places deliver to Belgravia ·
 * 25–45 min"). All three are functions of the same two inputs — the catalog and the customer's
 * point — so they are derived HERE, once, rather than three times inside the screen's render.
 *
 * The old deferral reason for this state said rating / distance / fee / ETA were "ALL absent from
 * the `RestaurantListItem` wire contract" and that "the list screen has no customer geolocation".
 * Both have since stopped being true: #673 added `ratingAvg` / `ratingCount` / `prepBaselineMinutes`
 * and `location` to the contract, and `home-location.ts` gave every customer face a live fix. So the
 * pills wire to real data — nothing here fabricates a figure to fill a drawn element.
 *
 * Distance/fee/ETA use exactly the path `home-feed.ts`'s `popularNearYou` and the checkout estimate
 * use (`haversineKm` → `deliveryFeeForDistance`, straight-line inflated by `ROAD_WINDING_FACTOR`),
 * so the same restaurant cannot quote one distance on the home carousel and a different one here.
 */

/** "Under $2 fee" — the drawn threshold. Strictly under, as the copy says. */
export const UNDER_FEE_MAX_USD = 2;

/**
 * How wide an ETA band is. A single haversine-derived number is a point estimate, and the mock never
 * shows one bare — every ETA it draws is a range ("25–35 min"). Showing `eta` alone would claim a
 * precision no straight-line estimate has.
 */
export const ETA_BAND_MINUTES = 10;

/** Sorts are mutually exclusive — a list has one order. `null` keeps the server's feed order. */
export type FoodListSort = "nearest" | "top_rated" | null;

export interface FoodListMeta {
  /** Straight-line km to the customer. Null with no customer fix, or no merchant location. */
  distanceKm: number | null;
  /** Prep + road-inflated travel, in whole minutes. Null when distance is unknown. */
  etaMinutes: number | null;
  /** Estimated delivery fee in USD. Null when distance is unknown. */
  feeUsd: number | null;
  /** The star average, only once at least one customer has actually rated. Null otherwise. */
  rating: number | null;
}

/** Everything derived for one restaurant against one customer point. Pure. */
export function restaurantMeta(r: RestaurantListItem, customer: LatLng | null): FoodListMeta {
  const distanceKm = customer && r.location ? haversineKm(r.location, customer) : null;
  const roadKm = distanceKm == null ? null : distanceKm * ROAD_WINDING_FACTOR;
  const prep = r.prepBaselineMinutes ?? DEFAULT_PREP_MINUTES;
  return {
    distanceKm,
    etaMinutes: roadKm == null ? null : prep + Math.max(1, Math.ceil((roadKm / ETA_SPEED_KMH) * 60)),
    feeUsd: distanceKm == null ? null : deliveryFeeForDistance(distanceKm),
    // An unrated shop shows no star rather than an invented "0" (not-drawn ⇒ not-rendered).
    rating: r.ratingCount > 0 && r.ratingAvg != null ? r.ratingAvg : null,
  };
}

export interface FoodListView {
  openOnly: boolean;
  cheapFee: boolean;
  sort: FoodListSort;
}

/**
 * Apply the drawn pills to the catalog: filter, then order.
 *
 * Open-before-closed leads EVERY ordering, including the sorts — the mock's list draws its two closed
 * shops last whatever else is true, and a closed kitchen ranked top for being 200m away would be a
 * worse list. Ties keep feed order: `sort` is stable in every engine the app runs on, so equal keys
 * never shuffle between renders.
 */
export function applyFoodListView(
  restaurants: readonly RestaurantListItem[],
  now: Date,
  customer: LatLng | null,
  view: FoodListView,
): RestaurantListItem[] {
  const open = new Map<string, boolean>();
  const meta = new Map<string, FoodListMeta>();
  for (const r of restaurants) {
    open.set(r.id, isMerchantOpenNow(r.hours, now));
    meta.set(r.id, restaurantMeta(r, customer));
  }

  let out = restaurants.slice();
  if (view.openOnly) out = out.filter((r) => open.get(r.id) === true);
  if (view.cheapFee) {
    // A restaurant we cannot price is NOT quietly kept: "Under $2 fee" is a claim about every row it
    // leaves standing, and an unpriced row would break that claim.
    out = out.filter((r) => {
      const fee = meta.get(r.id)?.feeUsd;
      return fee != null && fee < UNDER_FEE_MAX_USD;
    });
  }

  if (view.sort === null) return out;
  return out.sort((a, b) => {
    const aClosed = open.get(a.id) !== true;
    const bClosed = open.get(b.id) !== true;
    if (aClosed !== bClosed) return aClosed ? 1 : -1;
    const am = meta.get(a.id);
    const bm = meta.get(b.id);
    if (view.sort === "nearest") {
      const ad = am?.distanceKm ?? null;
      const bd = bm?.distanceKm ?? null;
      // Unrankable rows hold their feed position behind the ranked ones rather than sorting to top.
      if (ad == null || bd == null) return (ad == null ? 1 : 0) - (bd == null ? 1 : 0);
      return ad - bd;
    }
    const ar = am?.rating ?? null;
    const br = bm?.rating ?? null;
    if (ar == null || br == null) return (ar == null ? 1 : 0) - (br == null ? 1 : 0);
    return br - ar;
  });
}

/** The low/high of the drawn ETA range across a set of restaurants, or null when none can be timed. */
export function etaRange(metas: readonly FoodListMeta[]): { low: number; high: number } | null {
  const etas = metas.map((m) => m.etaMinutes).filter((m): m is number => m != null);
  if (etas.length === 0) return null;
  return { low: Math.min(...etas), high: Math.max(...etas) + ETA_BAND_MINUTES };
}

/**
 * The deliver-to line RC.list draws: a street address QUALIFIED BY ITS SUBURB — "12 Lanark Rd,
 * Belgravia", not the bare "12 Lanark Rd" the home header draws.
 *
 * The two customer faces genuinely differ here and both mocks are right: the home's 8c header is a
 * greeting row where the street alone reads as "you", while this screen is choosing WHERE TO BROWSE
 * FROM, and the suburb is the part that tells a customer which corridor's kitchens they are about to
 * see. So the composition lives here rather than in `homeAddressLabel`, which the home shares.
 *
 * Never duplicates: a fix that degraded to the district already HAS the area as its label, and
 * "Belgravia, Belgravia" would be worse than either half.
 */
export function deliverToLabel(label: string, area: string | null): string {
  if (!area) return label;
  const l = label.trim();
  const a = area.trim();
  if (!l || !a) return label;
  // Case-insensitive: the geocoder is not consistent about casing between fields.
  if (l.toLowerCase().includes(a.toLowerCase())) return label;
  return `${l}, ${a}`;
}

/**
 * The results summary the mock draws above the list: "5 places deliver to Belgravia · 25–45 min".
 *
 * Both halves degrade independently and honestly. With no suburb resolved it says "deliver here"
 * rather than naming a guess; with nothing timeable (no customer fix, or no merchant has a location)
 * the ETA clause is dropped entirely rather than shown as a placeholder range. It is never rendered
 * for an empty list — the empty state is the screen's answer there, not a "0 places" line.
 */
export function deliverySummary(count: number, area: string | null, range: { low: number; high: number } | null): string {
  const subject = count === 1 ? "1 place delivers" : `${count} places deliver`;
  const where = area ? `to ${area}` : "here";
  // En dash, matching the mock's "25–45 min" (and every other range the app draws).
  const eta = range ? ` · ${range.low}–${range.high} min` : "";
  return `${subject} ${where}${eta}`;
}
