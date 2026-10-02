import type { PopularVenuesResponse, ShopCatalogueResponse, ShopListResponse, ShopSearchResponse, ShopService } from "@lynia/shared";
import { apiFetch } from "./client";

/** Customer Shops / Pharmacy list (ledger D-58), `pilotEnabled` + SHOPS_ENABLED / PHARMACY_ENABLED
 *  gated server-side. Cursor-paginated like `getRestaurants`. */
export function getShops(service: ShopService, cursor?: string): Promise<ShopListResponse> {
  const qs = cursor ? `&cursor=${encodeURIComponent(cursor)}` : "";
  return apiFetch(`/shops?service=${service}${qs}`);
}

/** One shop's catalogue (categories → items), drafts and hidden categories already removed. */
export function getShopCatalogue(id: string): Promise<ShopCatalogueResponse> {
  return apiFetch(`/shops/${id}/catalogue`);
}

/** PLACES + ITEMS inside one section. A blank / too-short query returns empty arrays server-side. */
export function searchShops(service: ShopService, q: string): Promise<ShopSearchResponse> {
  return apiFetch(`/shops/search?service=${service}&q=${encodeURIComponent(q)}`);
}

/** Ledger D-72: one section's live shops ranked by recent delivered orders (empty on a thin section). */
export function getPopularShops(service: ShopService): Promise<PopularVenuesResponse> {
  return apiFetch(`/shops/popular?service=${service}`);
}
