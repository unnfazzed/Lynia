import type { RestaurantListResponse, RestaurantMenuResponse } from "@lynia/shared";
import { apiFetch } from "./client";

/** D1 (browse): corridor-wide restaurant list, `pilotEnabled` + `RESTAURANTS_ENABLED`-gated
 *  server-side. B-O10: cursor-paginated (`cursor` is the previous page's `nextCursor`), matching
 *  `getWalletLedger`'s shape. */
export function getRestaurants(cursor?: string): Promise<RestaurantListResponse> {
  const qs = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
  return apiFetch(`/restaurants${qs}`);
}

/** A single restaurant's menu (categories → dishes), draft/hidden already filtered server-side. */
export function getRestaurantMenu(id: string): Promise<RestaurantMenuResponse> {
  return apiFetch(`/restaurants/${id}/menu`);
}
