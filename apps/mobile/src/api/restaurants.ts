import type { RestaurantListResponse, RestaurantMenuResponse, RestaurantReopenReminderResponse, RestaurantSearchResponse } from "@lynia/shared";
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

/** #673: cross-restaurant search — PLACES (restaurants) + DISHES (menu items across the corridor).
 *  The dish index that the search screen's own note said the C1 read API was missing. A blank /
 *  too-short query returns empty arrays server-side. */
export function searchRestaurants(q: string): Promise<RestaurantSearchResponse> {
  return apiFetch(`/restaurants/search?q=${encodeURIComponent(q)}`);
}

/** D1 `menu_closed`: is this customer waiting on this kitchen to open? */
export function getReopenReminder(id: string): Promise<RestaurantReopenReminderResponse> {
  return apiFetch(`/restaurants/${id}/reopen-reminder`);
}

/** Ask to be told when it opens. Idempotent. `alreadyOpen` ⇒ nothing was banked; it's open now. */
export function setReopenReminder(id: string): Promise<RestaurantReopenReminderResponse> {
  return apiFetch(`/restaurants/${id}/reopen-reminder`, { method: "POST" });
}

/** Stop waiting. Idempotent — clearing one that isn't set is a no-op, not an error. */
export function clearReopenReminder(id: string): Promise<RestaurantReopenReminderResponse> {
  return apiFetch(`/restaurants/${id}/reopen-reminder`, { method: "DELETE" });
}
