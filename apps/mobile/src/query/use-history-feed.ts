import { type QueryClient, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { type EarningsSummary, getEarningsSummary, getHistory, type OrderHistoryRow } from "../api/orders";
import { loadHistorySnapshot, saveHistorySnapshot } from "../net/history-store";
import { walletKey, walletLedgerKey } from "./use-wallet";

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

/** The shared query keys, exported so every writer that lands a new/changed trip (a completion,
 *  cancel, undeliver — from a mutation's onSuccess, a WS self-heal, or a foreground resume) invalidates
 *  the SAME keys `useHistoryFeed`/`useEarningsSummary` read, instead of each call site re-typing the
 *  literal and risking one going stale relative to the others (WD-022). */
export const HISTORY_KEY = ["history"] as const;
export const EARNINGS_SUMMARY_KEY = ["earnings", "summary"] as const;

/**
 * WD-022: the single funnel for "a rider-side order transition just landed" (delivered/cancelled/
 * undelivered) — invalidates the active-job query PLUS Trip History and the earnings aggregate, so a
 * completion self-healed via a WS reconnect or a foreground resume can't drift from the mutation's own
 * onSuccess by only remembering `["activeJob"]`. Every rider-side call site (job.tsx's `refresh`, the
 * rider job socket's reconnect self-heal) should go through this rather than re-typing the query-key list.
 *
 * WD-025: a `delivered` transition also debits the wallet balance server-side in the same transaction
 * (`WalletService.chargeCommission`), so the wallet balance/ledger keys are invalidated here too — the
 * Earnings tab's commission-balance row reads `walletKey` directly and would otherwise keep painting the
 * pre-debit balance for the rest of its 30s staleTime after a delivery/adjudication.
 */
export function invalidateRiderJobQueries(qc: QueryClient): void {
  void qc.invalidateQueries({ queryKey: ["activeJob"] });
  void qc.invalidateQueries({ queryKey: HISTORY_KEY });
  void qc.invalidateQueries({ queryKey: EARNINGS_SUMMARY_KEY });
  void qc.invalidateQueries({ queryKey: walletKey });
  void qc.invalidateQueries({ queryKey: walletLedgerKey });
}

/** Customer-side counterpart — no earnings aggregate on that side, so Trip History only. */
export function invalidateCustomerOrderHistory(qc: QueryClient): void {
  void qc.invalidateQueries({ queryKey: HISTORY_KEY });
}

export function useHistoryFeed(): HistoryFeed {
  const q = useQuery({ queryKey: HISTORY_KEY, queryFn: getHistory });

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
  const q = useQuery({ queryKey: EARNINGS_SUMMARY_KEY, queryFn: getEarningsSummary });
  return { summary: q.data, isError: q.isError };
}
