import { useInfiniteQuery } from "@tanstack/react-query";
import { ApiError } from "../api/client";
import { type CustomerOrderRow, type CustomerOrdersPage, getCustomerOrders, getHistory } from "../api/orders";
import { HISTORY_KEY } from "./use-history-feed";

/**
 * The customer Orders tab feed (Orders v2, ledger D-63): GET /orders/mine/history — the customer's own
 * orders in every outcome, 50 a page. Keyed under `["history", …]` so every writer that already
 * invalidates `HISTORY_KEY` (a cancel, a delivery, a rating, a foreground resume) refreshes it too, and
 * so the persisted query cache (`"history"` is on src/query/persist.ts's allowlist) warm-paints it on a
 * cold start and offline.
 */
export const CUSTOMER_ORDERS_KEY = [...HISTORY_KEY, "customer"] as const;

/** An API older than this endpoint answers 404: read the legacy feed's customer rows as one page. */
async function firstPageCompat(): Promise<CustomerOrdersPage> {
  try {
    return await getCustomerOrders(null);
  } catch (e) {
    if (!(e instanceof ApiError) || e.status !== 404) throw e;
    const rows = await getHistory();
    return { rows: (Array.isArray(rows) ? rows : []) as CustomerOrderRow[], nextCursor: null };
  }
}

export interface CustomerOrdersFeed {
  /** Every loaded row (live or the warm-painted cache), newest first; null before anything is known. */
  rows: CustomerOrderRow[] | null;
  /** A live fetch is in flight (tells a first load from the offline-paused state). */
  isFetching: boolean;
  /** When the rows on screen were fetched (ISO), for "as of 09:24"; null before any fetch. */
  savedAt: string | null;
  refetch: () => void;
  hasMore: boolean;
  isLoadingMore: boolean;
  /** The last older-page fetch failed (O14); "Try again" calls `loadMore` again. */
  loadMoreFailed: boolean;
  loadMore: () => Promise<boolean>;
}

export function useCustomerOrders(): CustomerOrdersFeed {
  const q = useInfiniteQuery({
    queryKey: CUSTOMER_ORDERS_KEY,
    queryFn: ({ pageParam }: { pageParam: string | null }) => (pageParam ? getCustomerOrders(pageParam) : firstPageCompat()),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last?.nextCursor ?? undefined,
  });
  // Array.isArray, not a bare `p.rows`: a malformed 200 page reads as empty (CF-04's lesson).
  const rows = q.data ? q.data.pages.flatMap((p) => (Array.isArray(p?.rows) ? p.rows : [])) : null;
  return {
    rows,
    isFetching: q.isFetching && !q.isFetchingNextPage,
    savedAt: q.dataUpdatedAt > 0 ? new Date(q.dataUpdatedAt).toISOString() : null,
    refetch: () => void q.refetch(),
    hasMore: q.hasNextPage,
    isLoadingMore: q.isFetchingNextPage,
    loadMoreFailed: q.isFetchNextPageError,
    loadMore: async () => {
      const r = await q.fetchNextPage();
      return !r.isFetchNextPageError;
    },
  };
}
