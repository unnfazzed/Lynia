import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback } from "react";
import { isSentOfferExpired, loadRiderSentOffers, saveRiderSentOffers, type SentOffer } from "../logic/rider-bid-draft";

/**
 * The rider's sent offers, shared by the Jobs board and the Make-an-offer screen (Rider v2 J9 / O1,
 * ledger D-54). One query-cache entry, hydrated once from SecureStore (BH-21: a process death mid-auction
 * must not wipe the record of what the rider already bid on) and written back on every change.
 * Offers whose window closed while the app was dead are dropped on hydrate.
 */
export const SENT_OFFERS_KEY = ["riderSentOffers"] as const;
/** Job ids the rider skipped this session — hidden from the board, never persisted. */
export const SKIPPED_JOBS_KEY = ["riderSkippedJobs"] as const;

export function useSentOffers(): {
  offers: SentOffer[];
  hydrated: boolean;
  setOffers: (update: (prev: SentOffer[]) => SentOffer[]) => void;
} {
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: SENT_OFFERS_KEY,
    queryFn: async () => {
      const now = Date.now();
      return (await loadRiderSentOffers()).filter((o) => !isSentOfferExpired(o, now));
    },
    staleTime: Infinity,
    gcTime: Infinity,
  });
  const setOffers = useCallback(
    (update: (prev: SentOffer[]) => SentOffer[]) => {
      const prev = qc.getQueryData<SentOffer[]>(SENT_OFFERS_KEY) ?? [];
      const next = update(prev);
      if (next === prev) return;
      qc.setQueryData(SENT_OFFERS_KEY, next);
      void saveRiderSentOffers(next);
    },
    [qc],
  );
  return { offers: q.data ?? [], hydrated: q.isSuccess, setOffers };
}

export function useSkippedJobs(): { skipped: ReadonlySet<string>; skip: (id: string) => void } {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: SKIPPED_JOBS_KEY, queryFn: () => new Set<string>(), staleTime: Infinity, gcTime: Infinity });
  const skip = useCallback(
    (id: string) => {
      const prev = qc.getQueryData<Set<string>>(SKIPPED_JOBS_KEY) ?? new Set<string>();
      qc.setQueryData(SKIPPED_JOBS_KEY, new Set([...prev, id]));
    },
    [qc],
  );
  return { skipped: q.data ?? new Set<string>(), skip };
}
