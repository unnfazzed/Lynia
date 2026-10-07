import type { LatLng, MerchantShopKind, RestaurantListItem, ShopListItem } from "@lynia/shared";
import { closingTimeToday, isMerchantOpenNow, minutesUntilClose, nextOpening } from "@lynia/shared";
import { DEFAULT_PREP_MINUTES } from "./home-feed";
import { ETA_BAND_MINUTES, restaurantMeta } from "./food-list";
import { comparePopularity, NO_POPULARITY, type PopularityIndex } from "./popularity";

/**
 * Browse v2 (`packages/design/handoff/browse-v2`, ledger D-57) — the venue list's view model, shared
 * by Restaurants, Shops and Pharmacy (one template, three skins; BRIEF §1). Pure: everything here is
 * a function of the catalogue, the customer's point and the clock, so the screen never fabricates a
 * number (README §3 "honest data") and the ordering is unit-testable off-device.
 */

export type BrowseService = "food" | "shops" | "pharmacy";

/**
 * The Sort sheet's rows (README §4 "Sort sheet"). "Fastest" is drawn but needs a live prep/queue
 * signal the backend doesn't send yet, so the work order (CLAUDE-CODE-PROMPT §5) hides it until it
 * exists. "Recommended" is the popularity ranking (ledger D-72: delivered orders over 30 days,
 * time-decayed), nearest first among equals and for every venue the ranking doesn't cover — so with no
 * ranking yet (cold start) it is nearest-open, as before.
 */
export type BrowseSort = "recommended" | "nearest" | "top_rated" | "lowest_fee";
export const BROWSE_SORTS: readonly BrowseSort[] = ["recommended", "nearest", "top_rated", "lowest_fee"];
/** The sorts that need a customer location (greyed out in the sheet without one, B5b). */
export const DISTANCE_SORTS: ReadonlySet<BrowseSort> = new Set<BrowseSort>(["nearest", "lowest_fee"]);

export interface VenueOpening {
  time: string;
  /** 0 = later today, 1 = tomorrow, … */
  dayOffset: number;
  day: string;
}

export interface VenueView {
  id: string;
  name: string;
  /** Cuisines (restaurants) or the shop kind — the filter vocabulary. */
  categories: string[];
  /** "Zimbabwean · Grills · $$" — the card's second line. */
  sub: string;
  /** A shop's kind label ("Auto parts"), null for a restaurant. Drives the no-photo tint + chip. */
  kind: string | null;
  photoUrl: string | null;
  /** D7: the cover's small variant, for the 104 row and the 48 search tile (the 16:9 card and the
   *  storefront cover keep `photoUrl`). Absent until the server has made it. */
  thumbUrl?: string | null;
  logoUrl: string | null;
  /** D7: the logo's small variant (it is only ever drawn as a small disc). */
  logoThumbUrl?: string | null;
  /** Null until at least one customer has rated ("New", never ★ 0). */
  rating: number | null;
  ratingCount: number;
  /** Null with no customer location (or no venue location): no km, fee or time is shown then. */
  km: number | null;
  feeUsd: number | null;
  etaLow: number | null;
  etaHigh: number | null;
  /** Merchant-funded delivery. No venue flag exists yet (README §7), so this is false today. */
  freeDelivery: boolean;
  open: boolean;
  /** "Closes in N min" — only while open and within 30 minutes of closing. */
  closesInMin: number | null;
  /** Today's close while open ("22:00"); null with no hours (open by default). */
  closeTime: string | null;
  /** When a closed venue next opens. */
  opens: VenueOpening | null;
  prepMinutes: number;
}

/** A restaurant from `GET /restaurants` → the browse view model. */
export function restaurantVenue(r: RestaurantListItem, customer: LatLng | null, now: Date): VenueView {
  const meta = restaurantMeta(r, customer);
  const open = isMerchantOpenNow(r.hours, now);
  const price = r.priceLevel ? "$".repeat(r.priceLevel) : null;
  return {
    id: r.id,
    name: r.name,
    categories: r.cuisineTags,
    sub: [...r.cuisineTags, ...(price ? [price] : [])].join(" · "),
    kind: null,
    photoUrl: r.coverPhotoUrl,
    thumbUrl: r.coverThumbUrl ?? null,
    logoUrl: r.logoUrl,
    logoThumbUrl: r.logoThumbUrl ?? null,
    rating: meta.rating,
    ratingCount: r.ratingCount,
    km: meta.distanceKm,
    feeUsd: meta.feeUsd,
    etaLow: meta.etaMinutes,
    etaHigh: meta.etaMinutes == null ? null : meta.etaMinutes + ETA_BAND_MINUTES,
    // D-71: "Free delivery" only when the venue funds it (browse-v2 README §7).
    freeDelivery: r.freeDelivery === true,
    open,
    closesInMin: open ? minutesUntilClose(r.hours, now) : null,
    closeTime: closingTimeToday(r.hours, now),
    opens: open ? null : nextOpening(r.hours, now),
    prepMinutes: r.prepBaselineMinutes ?? DEFAULT_PREP_MINUTES,
  };
}

/** A shop kind as the handoff names it (`B.kinds`; "Pharmacy" for the pharmacy section). These are the
 *  customer's words, not the merchant web's sign-up labels ("Car parts", "Clothes & shoes"). */
export const SHOP_KIND_LABEL: Readonly<Record<MerchantShopKind, string>> = {
  pharmacy: "Pharmacy",
  grocery: "Grocery",
  butchery: "Butchery",
  fashion: "Fashion",
  auto_parts: "Auto parts",
  hardware: "Hardware",
  electronics: "Electronics",
  other: "Other",
};

/** A shop from `GET /shops` → the browse view model (ledger D-58). The kind is its category and sub-line. */
export function shopVenue(s: ShopListItem, customer: LatLng | null, now: Date): VenueView {
  const kind = SHOP_KIND_LABEL[s.shopKind] ?? SHOP_KIND_LABEL.other;
  return { ...restaurantVenue(s, customer, now), categories: [kind], sub: kind, kind };
}

export interface BrowseFilters {
  sort: BrowseSort;
  /** A cuisine / shop kind, or null for All. */
  category: string | null;
  free: boolean;
}

export const DEFAULT_FILTERS: BrowseFilters = { sort: "recommended", category: null, free: false };

/** Nulls (unknown) sort after every known value, keeping their feed order among themselves. */
function byKnown(a: number | null, b: number | null, dir: 1 | -1): number {
  if (a == null || b == null) return (a == null ? 1 : 0) - (b == null ? 1 : 0);
  return (a - b) * dir;
}

function compare(sort: BrowseSort, a: VenueView, b: VenueView, popularity: PopularityIndex): number {
  switch (sort) {
    case "top_rated":
      return byKnown(a.rating, b.rating, -1) || b.ratingCount - a.ratingCount;
    case "lowest_fee":
      return byKnown(a.freeDelivery ? 0 : a.feeUsd, b.freeDelivery ? 0 : b.feeUsd, 1) || byKnown(a.km, b.km, 1);
    // D-72: popular first (the server ranks only live venues; `browseList` hands this open ones only),
    // then nearest — which is the whole order while there's no ranking (cold start).
    case "recommended":
      return comparePopularity(a.id, b.id, popularity) || byKnown(a.km, b.km, 1);
    case "nearest":
      return byKnown(a.km, b.km, 1);
  }
}

/** The opening that comes first, for ordering the "Closed now" group. Unknown last. */
function openingKey(v: VenueView): number {
  if (!v.opens) return Number.POSITIVE_INFINITY;
  const [h, m] = v.opens.time.split(":");
  return v.opens.dayOffset * 24 * 60 + Number(h) * 60 + Number(m);
}

export interface BrowseList {
  open: VenueView[];
  /** Closed venues are never hidden: they form the "Closed now" group at the end (BRIEF §5). */
  closed: VenueView[];
}

/** Filter, then order: open venues by the chosen sort, then the closed group by who opens first. */
export function browseList(venues: readonly VenueView[], filters: BrowseFilters, popularity: PopularityIndex = NO_POPULARITY): BrowseList {
  const kept = venues.filter((v) => (filters.category == null || v.categories.includes(filters.category)) && (!filters.free || v.freeDelivery));
  // Array.prototype.sort is stable, so equal keys keep the feed order between renders.
  const open = kept.filter((v) => v.open).sort((a, b) => compare(filters.sort, a, b, popularity));
  const closed = kept.filter((v) => !v.open).sort((a, b) => openingKey(a) - openingKey(b));
  return { open, closed };
}

/** The categories the results actually contain, most common first (the Sort sheet's dropdown). */
export function browseCategories(venues: readonly VenueView[]): string[] {
  const count = new Map<string, number>();
  for (const v of venues) for (const c of v.categories) count.set(c, (count.get(c) ?? 0) + 1);
  return [...count.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c);
}

/** The "25–45 min" beside the count: the fastest open venue's low to the slowest one's high. */
export function browseRange(open: readonly VenueView[]): { a: number; b: number } | null {
  const lows = open.map((v) => v.etaLow).filter((n): n is number => n != null);
  const highs = open.map((v) => v.etaHigh).filter((n): n is number => n != null);
  if (lows.length === 0 || highs.length === 0) return null;
  return { a: Math.min(...lows), b: Math.max(...highs) };
}

/** Whether any venue funds its own delivery — the "Free delivery" pill shows only then (BRIEF §4). */
export function anyFreeDelivery(venues: readonly VenueView[]): boolean {
  return venues.some((v) => v.freeDelivery);
}

/** Whether `now` falls inside a category's serving window. Null bounds = always served. Lives in
 *  `@lynia/shared` (MJ-RM12 / U25) so the API refuses the same dishes at placement; re-exported here
 *  so the storefronts keep their import. */
export { categoryServedNow } from "@lynia/shared";

/** Whether a category's window is still ahead today (else it next opens tomorrow). */
export function windowLaterToday(from: string, now: Date): boolean {
  const [fh, fm] = from.split(":");
  return now.getHours() * 60 + now.getMinutes() < Number(fh) * 60 + Number(fm);
}
