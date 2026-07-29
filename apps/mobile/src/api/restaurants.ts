import type { RestaurantListResponse, RestaurantMenuResponse } from "@lynia/shared";
import { apiFetch } from "./client";

/** D1 (browse): corridor-wide restaurant list, `pilotEnabled` + `RESTAURANTS_ENABLED`-gated server-side. */
export function getRestaurants(): Promise<RestaurantListResponse> {
  return apiFetch("/restaurants");
}

/** A single restaurant's menu (categories → dishes), draft/hidden already filtered server-side. */
export function getRestaurantMenu(id: string): Promise<RestaurantMenuResponse> {
  return apiFetch(`/restaurants/${id}/menu`);
}
