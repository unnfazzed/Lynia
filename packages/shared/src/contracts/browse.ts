/**
 * Contracts: the customer read API for Restaurants, Shops and Pharmacy. Re-exported by ../contracts.ts
 * (the front door).
 */
import { z } from "zod";
import { LatLng } from "./core";
import { MerchantHours, MerchantShopKind } from "./merchant";

// --- Customer read API (flag + per-merchant pilotEnabled allowlist gated) ---

export const RestaurantListItem = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    coverPhotoUrl: z.string().nullable(),
    logoUrl: z.string().nullable(),
    /** D7 (2026-10-07): signed URLs of the cover's and logo's small variants (shorter side 400 px), for the
     *  small venue tiles and the logo disc; the 16:9 card and the storefront cover keep `coverPhotoUrl`.
     *  Absent until the thumb exists (and from older servers): use `coverThumbUrl ?? coverPhotoUrl`. */
    coverThumbUrl: z.string().optional(),
    logoThumbUrl: z.string().optional(),
    cuisineTags: z.array(z.string()),
    priceLevel: z.number().int().nullable(),
    // D1 (browse): open/closed + "closing soon"/"opens at" are derived client-side from this via
    // ./restaurant-hours — the server sends the raw weekly hours only, never a stale precomputed
    // boolean. Additive on the customer read API (C1 shipped this response without it).
    hours: MerchantHours.nullable(),
    // D2 (checkout): the geo-point ONLY, never the full Merchant.location Waypoint — that object's
    // `landmark`/`contactPhone` are the shop's own address label + raw contact number, and D-17
    // ("merchant phone numbers are masked everywhere") forbids shipping the latter to a customer
    // client. This lets checkout compute an honest delivery-fee ESTIMATE the same way the server
    // will (haversineKm + deliveryFeeForDistance, ./restaurants-order + ./pricing) before placing
    // the order — null until the merchant has set a location (placeOrder itself requires one).
    location: LatLng.nullable(),
    // #673 discovery: the restaurant's star rating, a denormalised aggregate of customers' food
    // scores (Rating.foodScore, #672). `ratingAvg` is null until `ratingCount > 0` — the card shows
    // no star rather than an invented "0" or "new" for an unrated shop (not-drawn ⇒ not-rendered).
    ratingAvg: z.number().nullable(),
    ratingCount: z.number().int(),
    // #673 discovery: the merchant's typical kitchen prep time (minutes). The card's ETA is this +
    // a delivery-leg estimate the client computes from `location` (same haversine path as the fee
    // above). Null until the merchant sets it → the client falls back to a default prep. All three
    // fields are additive (C1 shipped this response without them; an old client ignores them).
    prepBaselineMinutes: z.number().int().nullable(),
    // D-71: the venue pays the delivery fee (handoffs calm-mint-v2 §5, browse-v2 §7 — "Free delivery"
    // only when the venue funds it). Optional/additive: absent on an older server = not free.
    freeDelivery: z.boolean().optional(),
  })
  .strict();
export type RestaurantListItem = z.infer<typeof RestaurantListItem>;

// B-O10: `nextCursor` is additive (omitted = no more pages) — the same opaque-cursor shape as
// `WalletLedgerPage`, so an already-deployed client reading only `.restaurants` keeps working
// unchanged against a server that starts paginating.
export const RestaurantListResponse = z
  .object({ restaurants: z.array(RestaurantListItem), nextCursor: z.string().optional() })
  .strict();
export type RestaurantListResponse = z.infer<typeof RestaurantListResponse>;

/** #673: a search hit on a specific dish, across all pilot restaurants — the mock's cross-restaurant
 *  "DISHES" section under search (r-customer-a.jsx). Carries the dish's restaurant id + name so the
 *  row renders "Dish · Restaurant · $price" and can deep-link to that restaurant's menu. */
export const RestaurantSearchDish = z
  .object({
    dishId: z.string().uuid(),
    name: z.string(),
    priceUsd: z.number(),
    photoUrl: z.string().nullable(),
    /** D7 (2026-10-07): a signed URL of the photo's small variant (shorter side 400 px), for list rows,
     *  tiles and thumbnails; the full `photoUrl` stays for the large views. Absent until the thumb exists
     *  (and from older servers): use `thumbUrl ?? photoUrl`. */
    thumbUrl: z.string().optional(),
    merchantId: z.string().uuid(),
    merchantName: z.string(),
  })
  .strict();
export type RestaurantSearchDish = z.infer<typeof RestaurantSearchDish>;

/** #673: cross-restaurant search result — matching PLACES (restaurants) + DISHES (menu items across
 *  the pilot corridor). Both arrays are empty for a blank / too-short query (the search screen only
 *  shows results once the customer types). This is the server dish index the client search screen
 *  noted it was missing (it could only filter the already-loaded restaurant list before). */
export const RestaurantSearchResponse = z
  .object({ restaurants: z.array(RestaurantListItem), dishes: z.array(RestaurantSearchDish) })
  .strict();
export type RestaurantSearchResponse = z.infer<typeof RestaurantSearchResponse>;

/** Browse v2 X1 (ledger D-57): "Popular near you" — the most-ordered dish names, most popular first. */
export const SearchPopularResponse = z.object({ terms: z.array(z.string()) }).strict();
export type SearchPopularResponse = z.infer<typeof SearchPopularResponse>;

/** Ledger D-72: one venue's place in the "Popular" ranking — its delivered orders over the window and
 *  their time-decayed weight (a fresh order counts 1, one a half-life old counts 0.5). */
export const PopularVenueRank = z.object({ id: z.string().uuid(), orders: z.number().int().nonnegative(), score: z.number().nonnegative() }).strict();
export type PopularVenueRank = z.infer<typeof PopularVenueRank>;

/** Ledger D-72: `GET /restaurants/popular` and `GET /shops/popular` — the live venues of that list ranked
 *  by recent delivered orders, most popular first. EMPTY while the corridor's order history is too thin
 *  to rank (cold start): the client then keeps its nearest-open order. Open-now and "delivers to you"
 *  are applied on the phone, which already owns the clock and the customer's location. */
export const PopularVenuesResponse = z.object({ venues: z.array(PopularVenueRank) }).strict();
export type PopularVenuesResponse = z.infer<typeof PopularVenuesResponse>;

/** A single customer-facing menu item. `outOfStock` is derived server-side from `outOfStockUntil`
 *  (N-14 daily auto-reset — a past timestamp reads as back in stock, no reset job needed). Draft
 *  (photoless) dishes never appear here at all (D-31). */
export const RestaurantMenuDish = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    description: z.string().nullable(),
    priceUsd: z.number(),
    photoUrl: z.string().nullable(),
    /** D7 (2026-10-07): a signed URL of the photo's small variant (shorter side 400 px), for list rows,
     *  tiles and thumbnails; the full `photoUrl` stays for the large views. Absent until the thumb exists
     *  (and from older servers): use `thumbUrl ?? photoUrl`. */
    thumbUrl: z.string().optional(),
    outOfStock: z.boolean(),
    /** Order flow v2 (BRIEF §13): sent (true) only on a pharmacy item that needs a prescription, and only
     *  while RX_ENABLED is on — with it off such items are not listed at all. Absent = no. */
    rxRequired: z.boolean().optional(),
  })
  .strict();
export type RestaurantMenuDish = z.infer<typeof RestaurantMenuDish>;

export const RestaurantMenuCategory = z
  .object({
    id: z.string().uuid(),
    name: z.string(),
    dishes: z.array(RestaurantMenuDish),
    // Browse v2 (D-57): a category's time window ("Breakfast 07:00–11:00", D-29), "HH:MM" or null =
    // always served. Additive and optional: an installed client ignores it, and a server that predates
    // it simply omits it.
    availableFrom: z.string().nullable().optional(),
    availableTo: z.string().nullable().optional(),
  })
  .strict();
export type RestaurantMenuCategory = z.infer<typeof RestaurantMenuCategory>;

export const RestaurantMenuResponse = z
  .object({
    restaurant: RestaurantListItem,
    categories: z.array(RestaurantMenuCategory),
    // Browse v2 (D-57): the storefront's "Popular" rail — this kitchen's most-ordered dishes over the
    // last 30 days, most-ordered first. Ids only (each one is also in `categories`). Empty when the
    // kitchen has too little history to rank honestly. Additive and optional.
    popularDishIds: z.array(z.string().uuid()).optional(),
  })
  .strict();
export type RestaurantMenuResponse = z.infer<typeof RestaurantMenuResponse>;

// --- Customer Shops & Pharmacy read API (browse-v2 B2–B4, S3–S4; ledger D-58) ---
// A shop is the same row as a restaurant with `businessType = shop` (plan 2026-09-29 D1), so the
// customer shapes reuse the restaurant ones and add the kind. Pharmacy is the `pharmacy` kind, listed
// on its own; Shops is every other kind. Gated by SHOPS_ENABLED / PHARMACY_ENABLED + `pilotEnabled`.

/** Which customer section a shop belongs to. */
export const ShopService = z.enum(["shops", "pharmacy"]);
export type ShopService = z.infer<typeof ShopService>;

export const ShopListItem = RestaurantListItem.extend({ shopKind: MerchantShopKind }).strict();
export type ShopListItem = z.infer<typeof ShopListItem>;

export const ShopListResponse = z.object({ shops: z.array(ShopListItem), nextCursor: z.string().optional() }).strict();
export type ShopListResponse = z.infer<typeof ShopListResponse>;

/** A shop's catalogue: categories → items, drafts and hidden categories already removed. */
export const ShopCatalogueResponse = z.object({ shop: ShopListItem, categories: z.array(RestaurantMenuCategory) }).strict();
export type ShopCatalogueResponse = z.infer<typeof ShopCatalogueResponse>;

/** Search inside one section: PLACES (shop names) + ITEMS (catalogue items across its shops). */
export const ShopSearchResponse = z.object({ shops: z.array(ShopListItem), items: z.array(RestaurantSearchDish) }).strict();
export type ShopSearchResponse = z.infer<typeof ShopSearchResponse>;

/**
 * D1 `menu_closed` / `list_empty` — "Remind me when they open". `set` is whether the customer is
 * currently waiting on this kitchen. `alreadyOpen` only comes back from the POST: the kitchen was open
 * when they asked, so no reminder was banked and the honest answer is "go ahead and order" rather
 * than silently arming something that would next fire tomorrow morning.
 */
export const RestaurantReopenReminderResponse = z
  .object({
    set: z.boolean(),
    alreadyOpen: z.boolean().optional(),
  })
  .strict();
export type RestaurantReopenReminderResponse = z.infer<typeof RestaurantReopenReminderResponse>;
