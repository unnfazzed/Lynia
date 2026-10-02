import type { ShopService } from "@lynia/shared";
import { useQuery } from "@tanstack/react-query";
import { useMemo } from "react";
import { getPopularRestaurants } from "../api/restaurants";
import { getPopularShops } from "../api/shops";
import { NO_POPULARITY, type PopularityIndex, popularityIndex } from "../logic/popularity";

export type PopularityList = "restaurants" | ShopService;

export const popularityKey = (list: PopularityList): readonly ["popularity", PopularityList] => ["popularity", list];

/**
 * Ledger D-72: one list's "Popular" ranking (`GET /restaurants/popular`, `GET /shops/popular`). It moves by
 * the day, so it is read at most every ten minutes, and never retried hard: until it answers — or when
 * it fails, or the server is too old to have it — the index is empty and every list keeps its
 * nearest-open order. Never a spinner, never an error state: the ranking is an ordering hint, not content.
 */
export function usePopularity(list: PopularityList, enabled: boolean): PopularityIndex {
  const q = useQuery({
    queryKey: popularityKey(list),
    queryFn: () => (list === "restaurants" ? getPopularRestaurants() : getPopularShops(list)),
    enabled,
    staleTime: 10 * 60_000,
    retry: 1,
  });
  const data = enabled ? q.data : undefined;
  return useMemo(() => (data === undefined ? NO_POPULARITY : popularityIndex(data)), [data]);
}
