import type { RestaurantListItem, RestaurantMenuResponse, RestaurantReopenReminderResponse } from "@lynia/shared";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { clearReopenReminder, getReopenReminder, getRestaurantMenu, getRestaurants, setReopenReminder } from "../api/restaurants";
import { loadRestaurantListSnapshot, saveRestaurantListSnapshot } from "../net/restaurant-list-store";

export const RESTAURANTS_KEY = ["restaurants"] as const;
export const restaurantMenuKey = (id: string): readonly ["restaurants", string, "menu"] => ["restaurants", id, "menu"];
export const reopenReminderKey = (id: string): readonly ["restaurants", string, "reopenReminder"] => ["restaurants", id, "reopenReminder"];

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
  /** B-O10: more pages exist server-side beyond what `restaurants` currently holds. */
  hasMore: boolean;
  isLoadingMore: boolean;
  loadMore: () => void;
}

/**
 * D1 (browse) restaurant list, warm-painted the same way `useHistoryFeed` warm-paints trips: live
 * data always wins; otherwise the last successful fetch is shown with its saved-at timestamp so an
 * offline customer sees *something* instead of a bare skeleton or a dead-end error.
 *
 * B-O10: cursor-paginated (`useInfiniteQuery`, mirroring `useWalletLedger`) instead of one
 * unbounded fetch — `GET /restaurants` was the one list endpoint with no server-side cap, unlike
 * history/board/notifications. `restaurants` accumulates every page fetched so far, same shape
 * callers already consumed; `loadMore`/`hasMore`/`isLoadingMore` are additive.
 */
export function useRestaurantListFeed(enabled: boolean): RestaurantListFeed {
  const q = useInfiniteQuery({
    queryKey: RESTAURANTS_KEY,
    queryFn: ({ pageParam }: { pageParam: string | undefined }) => getRestaurants(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    enabled,
  });

  const [cached, setCached] = useState<{ restaurants: RestaurantListItem[]; savedAt: string } | null>(null);
  useEffect(() => {
    if (!enabled) return;
    void loadRestaurantListSnapshot().then(setCached);
  }, [enabled]);
  const liveRestaurants = q.data?.pages.flatMap((p) => p.restaurants) ?? null;
  useEffect(() => {
    if (liveRestaurants) void saveRestaurantListSnapshot(liveRestaurants);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- flatMap above builds a fresh array every render; compare on q.data itself
  }, [q.data]);

  return {
    restaurants: liveRestaurants ?? cached?.restaurants ?? null,
    showingStale: liveRestaurants == null && cached != null,
    staleSavedAt: liveRestaurants == null ? (cached?.savedAt ?? null) : null,
    isFetching: q.isFetching,
    isError: q.isError,
    hasLiveData: liveRestaurants != null,
    refetch: () => void q.refetch(),
    hasMore: q.hasNextPage,
    isLoadingMore: q.isFetchingNextPage,
    loadMore: () => void q.fetchNextPage(),
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

export interface ReopenReminder {
  /** Whether this customer is currently waiting on this kitchen to open. */
  isSet: boolean;
  /** A write is in flight — the control should read as busy, not as toggled. */
  isPending: boolean;
  isLoading: boolean;
  /** Toggle: arms the reminder when off, cancels it when on. */
  toggle: () => void;
}

/**
 * D1 `menu_closed` — "Remind me when they open". Server state is the source of truth: the reminder
 * outlives this screen, this session and a reinstall, so there's no local flag to drift.
 *
 * `onDone` reports the settled server response so the caller can speak for itself — in particular the
 * `alreadyOpen` case, where the kitchen opened between the screen rendering and the tap, so nothing
 * was banked and telling the customer "we'll remind you" would be a small lie.
 */
export function useReopenReminder(restaurantId: string, onDone?: (res: RestaurantReopenReminderResponse) => void, onError?: () => void): ReopenReminder {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: reopenReminderKey(restaurantId),
    queryFn: () => getReopenReminder(restaurantId),
    // Only this customer's own action changes the answer, so don't re-ask on every remount of a
    // screen they're bouncing in and out of.
    staleTime: 5 * 60 * 1000,
  });
  const isSet = q.data?.set === true;

  const m = useMutation({
    mutationFn: () => (isSet ? clearReopenReminder(restaurantId) : setReopenReminder(restaurantId)),
    onSuccess: (res) => {
      qc.setQueryData(reopenReminderKey(restaurantId), res);
      onDone?.(res);
    },
    onError: () => onError?.(),
  });

  return { isSet, isPending: m.isPending, isLoading: q.isLoading, toggle: () => m.mutate() };
}
