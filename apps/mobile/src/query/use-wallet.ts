import { useQuery } from "@tanstack/react-query";
import type { CommissionConfig, Wallet, WalletLedgerPage } from "@lynia/shared";
import { getWallet, getWalletConfig, getWalletLedger } from "../api/wallet";

/**
 * Wallet data hooks. The config drives feature visibility (the Earnings row + the Wallet route), so it's
 * cheap to read app-wide and cached a little longer than the balance. Balance + ledger revalidate on
 * focus/reconnect via the shared query client defaults.
 */

export const walletConfigKey = ["wallet", "config"] as const;
export const walletKey = ["wallet", "balance"] as const;
export const walletLedgerKey = ["wallet", "ledger"] as const;

/** The commission feature flag + policy. Longer staleTime — it changes only at the flip. */
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

/** The first page of ledger receipts (reverse-chronological). */
export function useWalletLedger(): {
  page: WalletLedgerPage | undefined;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
} {
  const q = useQuery({ queryKey: walletLedgerKey, queryFn: () => getWalletLedger() });
  return { page: q.data, isLoading: q.isLoading, isError: q.isError, refetch: () => void q.refetch() };
}
