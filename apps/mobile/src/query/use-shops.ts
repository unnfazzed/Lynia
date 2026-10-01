import type { ShopCatalogueResponse, ShopListItem, ShopSearchResponse, ShopService } from "@lynia/shared";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { getShopCatalogue, getShops, searchShops } from "../api/shops";
import type { RestaurantListFeed } from "./use-restaurants";

export const shopsKey = (service: ShopService): readonly ["shops", ShopService] => ["shops", service];
export const shopCatalogueKey = (id: string): readonly ["shops", "catalogue", string] => ["shops", "catalogue", id];

export type ShopListFeed = Omit<RestaurantListFeed, "restaurants"> & { shops: ShopListItem[] | null };

/**
 * The Shops / Pharmacy list (ledger D-58) — `useRestaurantListFeed`'s twin, warm-painted through the
 * persisted query cache (`"shops"` is on `src/query/persist.ts`'s allowlist) so the offline banner
 * (B10a) has a saved list to show and a cold start paints last-known cards.
 */
export function useShopListFeed(service: ShopService, enabled: boolean): ShopListFeed {
  const q = useInfiniteQuery({
    queryKey: shopsKey(service),
    queryFn: ({ pageParam }: { pageParam: string | undefined }) => getShops(service, pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    enabled,
  });
  // Array.isArray, not a bare `p.shops`: a malformed 200 page must read as empty, not as a list of
  // `undefined` rows that crash every consumer (CF-04's lesson).
  const shops = q.data?.pages.flatMap((p) => (Array.isArray(p?.shops) ? p.shops : [])) ?? null;
  const showingStale = shops != null && (!q.isFetchedAfterMount || q.isError);
  return {
    shops,
    showingStale,
    staleSavedAt: showingStale && q.dataUpdatedAt > 0 ? new Date(q.dataUpdatedAt).toISOString() : null,
    isFetching: q.isFetching,
    isError: q.isError,
    hasLiveData: shops != null && q.isFetchedAfterMount && !q.isError,
    refetch: () => void q.refetch(),
    hasMore: q.hasNextPage,
    isLoadingMore: q.isFetchingNextPage,
    loadMore: () => void q.fetchNextPage(),
  };
}

export function useShopCatalogue(
  id: string | undefined,
  enabled: boolean,
): { catalogue: ShopCatalogueResponse | undefined; isLoading: boolean; isFetching: boolean; isError: boolean; refetch: () => void } {
  const q = useQuery({ queryKey: shopCatalogueKey(id ?? ""), queryFn: () => getShopCatalogue(id as string), enabled: enabled && !!id });
  return { catalogue: q.data, isLoading: q.isLoading, isFetching: q.isFetching, isError: q.isError, refetch: () => void q.refetch() };
}

/** Server search inside one section; idle below two characters (the server answers empty there too). */
export function useShopSearch(service: ShopService, query: string, enabled: boolean): { data: ShopSearchResponse | undefined; isFetching: boolean; isError: boolean } {
  const q = query.trim();
  const r = useQuery({ queryKey: ["shopSearch", service, q], queryFn: () => searchShops(service, q), enabled: enabled && q.length >= 2 });
  return { data: r.data, isFetching: r.isFetching, isError: r.isError };
}
