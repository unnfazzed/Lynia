import type { RestaurantListItem, RestaurantMenuResponse } from "@lynia/shared";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { getRestaurantMenu, getRestaurants } from "../api/restaurants";
import { loadRestaurantListSnapshot, saveRestaurantListSnapshot } from "../net/restaurant-list-store";

export const RESTAURANTS_KEY = ["restaurants"] as const;
export const restaurantMenuKey = (id: string): readonly ["restaurants", string, "menu"] => ["restaurants", id, "menu"];

export interface RestaurantListFeed {
  restaurants: RestaurantListItem[] | null;
  /** Painting the last-saved snapshot because live data hasn't arrived (offline / cold start / error). */
  showingStale: boolean;
  /** Timestamp the painted snapshot was saved, when `showingStale`. */
  staleSavedAt: string | null;
  isFetching: boolean;
  isError: boolean;
  hasLiveData: boolean;
  refetch: () => void;
}

/**
 * D1 (browse) restaurant list, warm-painted the same way `useHistoryFeed` warm-paints trips: live
 * data always wins; otherwise the last successful fetch is shown with its saved-at timestamp so an
 * offline customer sees *something* instead of a bare skeleton or a dead-end error.
 */
export function useRestaurantListFeed(enabled: boolean): RestaurantListFeed {
  const q = useQuery({ queryKey: RESTAURANTS_KEY, queryFn: getRestaurants, enabled });

  const [cached, setCached] = useState<{ restaurants: RestaurantListItem[]; savedAt: string } | null>(null);
  useEffect(() => {
    if (!enabled) return;
    void loadRestaurantListSnapshot().then(setCached);
  }, [enabled]);
  useEffect(() => {
    if (q.data) void saveRestaurantListSnapshot(q.data.restaurants);
  }, [q.data]);

  const liveRestaurants = q.data?.restaurants ?? null;
  return {
    restaurants: liveRestaurants ?? cached?.restaurants ?? null,
    showingStale: liveRestaurants == null && cached != null,
    staleSavedAt: liveRestaurants == null ? (cached?.savedAt ?? null) : null,
    isFetching: q.isFetching,
    isError: q.isError,
    hasLiveData: liveRestaurants != null,
    refetch: () => void q.refetch(),
  };
}

export function useRestaurantMenu(
  id: string | undefined,
  enabled: boolean,
): { menu: RestaurantMenuResponse | undefined; isLoading: boolean; isFetching: boolean; isError: boolean; refetch: () => void } {
  const q = useQuery({
    queryKey: restaurantMenuKey(id ?? ""),
    queryFn: () => getRestaurantMenu(id as string),
    enabled: enabled && !!id,
  });
  return { menu: q.data, isLoading: q.isLoading, isFetching: q.isFetching, isError: q.isError, refetch: () => void q.refetch() };
}
