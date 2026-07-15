import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { type EarningsSummary, getEarningsSummary, getHistory, type OrderHistoryRow } from "../api/orders";
import { loadHistorySnapshot, saveHistorySnapshot } from "../net/history-store";

/**
 * The shared `["history"]` feed with on-device warm-paint, consumed by BOTH the trips list and the
 * earnings screen (earnings derives from the same rows). Owning the load AND the persist here — rather
 * than duplicating them per screen — means whichever screen the user opens first seeds and refreshes the
 * cache, and the offline/paused rendering rule is defined once instead of drifting between two copies.
 *
 * Rendering contract for callers:
 *   - `rows` present  → render the list/derived view (it's live data, or the warm-paint cache).
 *   - else `isFetching` → a genuine first load is in flight → show a skeleton.
 *   - else            → no data and NOT fetching (offline paused, or an errored fetch with no cache) →
 *                       show a retry state, NEVER an endless skeleton and never a misleading empty state.
 * `showingStale` is true while painting the cache because live data hasn't arrived, so the caller can
 * show a "last saved" note (+ a Retry when `isError`).
 */
export interface HistoryFeed {
  rows: OrderHistoryRow[] | null;
  /** True while the cache is shown because live data is absent (cold start / offline / error). */
  showingStale: boolean;
  /** A live fetch is in flight (distinguishes "loading" from React Query's offline paused state). */
  isFetching: boolean;
  isError: boolean;
  /** Live data has arrived (even if it's an empty list) — lets callers tell "empty" from "no data yet". */
  hasLiveData: boolean;
  refetch: () => void;
}

export function useHistoryFeed(): HistoryFeed {
  const q = useQuery({ queryKey: ["history"], queryFn: getHistory });

  // Warm paint: load the last-known snapshot on mount; persist every successful fetch for next time.
  const [cached, setCached] = useState<OrderHistoryRow[] | null>(null);
  useEffect(() => {
    void loadHistorySnapshot().then(setCached);
  }, []);
  useEffect(() => {
    if (q.data) void saveHistorySnapshot(q.data);
  }, [q.data]);

  return {
    // Live data always wins; otherwise paint the cache. Keyed on the ABSENCE of live data (not
    // isLoading/isError) so it also covers React Query's paused state (a query mounting offline is
    // pending+paused, isLoading false). A genuinely-empty fresh fetch (`[]`) still wins over a stale cache.
    rows: q.data ?? cached,
    showingStale: q.data == null && cached != null,
    isFetching: q.isFetching,
    isError: q.isError,
    hasLiveData: q.data != null,
    refetch: () => void q.refetch(),
  };
}

/** WD-004: the rider's true lifetime earnings total + trip count — a server-side aggregate over ALL
 *  their delivered/completed orders, not a sum over the (capped) history rows above. No offline
 *  warm-paint here: the Earnings screen falls back to deriving from `useHistoryFeed`'s rows while this
 *  hasn't loaded (or errors), which is only ever a same-or-more-accurate number, never a regression. */
export function useEarningsSummary(): { summary: EarningsSummary | undefined; isError: boolean } {
  const q = useQuery({ queryKey: ["earnings", "summary"], queryFn: getEarningsSummary });
  return { summary: q.data, isError: q.isError };
}
