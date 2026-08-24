import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import type { CommissionConfig, Wallet, WalletEntry } from "@lynia/shared";
import { getWallet, getWalletConfig, getWalletLedger } from "../api/wallet";

/**
 * Wallet data hooks. The config carries the commission rate + policy, so it's cheap to read app-wide
 * and cached a little longer than the balance. Balance + ledger revalidate on reconnect via the shared
 * query client defaults; the wallet SCREEN additionally refetches on focus and exposes pull-to-refresh
 * (the global client sets refetchOnWindowFocus:false), so a support-credit shows up as soon as the
 * rider returns to the screen.
 */

export const walletConfigKey = ["wallet", "config"] as const;
export const walletKey = ["wallet", "balance"] as const;
export const walletLedgerKey = ["wallet", "ledger"] as const;

/** The commission rate + policy. Longer staleTime — it changes only at the flip. */
export function useWalletConfig(): { config: CommissionConfig | undefined; isLoading: boolean } {
  const q = useQuery({ queryKey: walletConfigKey, queryFn: getWalletConfig, staleTime: 5 * 60_000 });
  return { config: q.data, isLoading: q.isLoading };
}

/** The prepaid balance. */
export function useWallet(): {
  wallet: Wallet | undefined;
  isLoading: boolean;
  isFetching: boolean;
  isError: boolean;
  refetch: () => void;
} {
  const q = useQuery({ queryKey: walletKey, queryFn: getWallet });
  return { wallet: q.data, isLoading: q.isLoading, isFetching: q.isFetching, isError: q.isError, refetch: () => void q.refetch() };
}

/**
 * The ledger receipts (reverse-chronological), paged in 25-entry pages by the server
 * (`WalletService.getLedger`, `LEDGER_PAGE_SIZE`). `entries` accumulates every page fetched so far —
 * `loadMore()` (LC-B-SIB-2 fix) is the only way past the first page; before this, `nextCursor` was
 * returned by the API but never read anywhere in the mobile app, so a rider with more than 25
 * lifetime wallet events silently lost visibility into older deductions with no on-screen signal
 * anything was missing (the admin-side sibling of this same shape was already fixed as LC-D07).
 */
export function useWalletLedger(): {
  entries: WalletEntry[];
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
  hasMore: boolean;
  isLoadingMore: boolean;
  loadMore: () => void;
} {
  const q = useInfiniteQuery({
    queryKey: walletLedgerKey,
    queryFn: ({ pageParam }: { pageParam: string | undefined }) => getWalletLedger(pageParam),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
  });
  return {
    entries: q.data?.pages.flatMap((p) => p.entries) ?? [],
    isLoading: q.isLoading,
    isError: q.isError,
    refetch: () => void q.refetch(),
    hasMore: q.hasNextPage,
    isLoadingMore: q.isFetchingNextPage,
    loadMore: () => void q.fetchNextPage(),
  };
}
