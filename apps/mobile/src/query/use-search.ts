import type { RestaurantListItem, RestaurantSearchDish, SearchPopularResponse, ShopListItem, ShopService } from "@lynia/shared";
import { useQuery } from "@tanstack/react-query";
import { getSearchPopular, searchRestaurants } from "../api/restaurants";
import { searchShops } from "../api/shops";

/** A dish or item hit, with the storefront it opens. */
export interface SearchItemHit extends RestaurantSearchDish {
  path: string;
}

export interface BrowseSearchResults {
  restaurants: RestaurantListItem[];
  shops: ShopListItem[];
  pharmacies: ShopListItem[];
  items: SearchItemHit[];
}

export type SearchScope = "all" | "food";

const EMPTY_SHOPS = { shops: [] as ShopListItem[], items: [] as RestaurantSearchDish[] };

/**
 * Browse v2 X2–X4 (D-57) — one debounced query. `food` is the restaurant search (`GET /restaurants/search`);
 * `all` (Home) adds each switched-on section's `GET /shops/search` in parallel. A section that fails
 * (switched off between the flag fetch and the search, a 503) answers empty rather than failing the rest;
 * only when every call fails is the search an error (offline).
 */
export function useBrowseSearch(
  q: string,
  scope: SearchScope,
  sections: { shopsEnabled: boolean; pharmacyEnabled: boolean },
  enabled: boolean,
): { data: BrowseSearchResults | undefined } {
  const withShops = scope === "all" && sections.shopsEnabled;
  const withPharmacy = scope === "all" && sections.pharmacyEnabled;
  const r = useQuery({
    queryKey: ["search", scope, withShops, withPharmacy, q],
    enabled,
    staleTime: 30_000,
    queryFn: async (): Promise<BrowseSearchResults> => {
      const section = (service: ShopService, on: boolean) => (on ? searchShops(service, q) : Promise.resolve(EMPTY_SHOPS));
      const [food, shops, pharmacy] = await Promise.allSettled([searchRestaurants(q), section("shops", withShops), section("pharmacy", withPharmacy)]);
      if (food.status === "rejected" && shops.status === "rejected" && pharmacy.status === "rejected") throw food.reason;
      const f = food.status === "fulfilled" ? food.value : { restaurants: [], dishes: [] };
      const s = shops.status === "fulfilled" ? shops.value : EMPTY_SHOPS;
      const p = pharmacy.status === "fulfilled" ? pharmacy.value : EMPTY_SHOPS;
      return {
        restaurants: f.restaurants,
        shops: s.shops,
        pharmacies: p.shops,
        items: [
          ...f.dishes.map((d) => ({ ...d, path: `/food/${d.merchantId}` })),
          ...s.items.map((d) => ({ ...d, path: `/shops/${d.merchantId}` })),
          ...p.items.map((d) => ({ ...d, path: `/pharmacy/${d.merchantId}` })),
        ],
      };
    },
  });
  return { data: r.data };
}

/** Browse v2 X1 (D-57): the "Popular near you" chips. */
export function useSearchPopular(enabled: boolean): { data: SearchPopularResponse | undefined } {
  const r = useQuery({ queryKey: ["search", "popular"], queryFn: getSearchPopular, enabled, staleTime: 5 * 60_000 });
  return { data: r.data };
}
