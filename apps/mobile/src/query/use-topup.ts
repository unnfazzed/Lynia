import type { Topup, TopupRail, TopupStatus } from "@lynia/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import { createTopup, getTopup } from "../api/wallet";
import { clearPendingTopup, savePendingTopup } from "../auth/session";
import { walletKey, walletLedgerKey } from "./use-wallet";

/**
 * The rider top-up lifecycle: open an intent, watch it to a terminal state, keep the wallet and the
 * durable recovery marker in step. The whole data story lives here so `src/ui/rider/TopUpFlow.tsx`
 * stays a view over props and hook state — the `mobile-ui-no-api` boundary (`.dependency-cruiser.cjs`)
 * says the design-system layer never fetches, and this is the seam that keeps it true.
 *
 * ── WHAT MAKES THIS SAFE WHILE THE RAIL IS MISSING ──────────────────────────────────────────────
 * `WalletService.creditFromTopup` — the only path that can confirm an intent and move a balance — has
 * no caller, because no payment-rail client exists. So nothing pushes a prompt to the rider's phone
 * and nothing confirms: every real attempt runs its 90-second window down and comes back `expired`.
 *
 * That is survivable ONLY because the outcome here is read, never invented. `status` is whatever the
 * server reports; the view renders a success on `succeeded` alone. When a rail lands and calls
 * `creditFromTopup`, this starts working with no change to either file.
 */
export interface TopUpStart {
  amount: number;
  rail: Exclude<TopupRail, "manual">;
  phone: string;
  /** Per-attempt, stable across a retry of the SAME attempt (BH-09): the server dedupes on
   *  (riderId, idempotencyKey), so a timeout+retry returns the original intent rather than opening a
   *  second one against the same money. */
  idempotencyKey: string;
}

export interface TopUpController {
  /** The server's own view of the live intent, or undefined before one exists. */
  topup: Topup | undefined;
  /** Terminal or not, this is the server's answer — never the client's guess. */
  status: TopupStatus | undefined;
  /** True once an intent has been opened, whatever its status. */
  hasIntent: boolean;
  isStarting: boolean;
  start: (input: TopUpStart, options?: { onSettled?: () => void }) => void;
  /** Drop the current intent from view so the rider can begin a fresh attempt. Does not cancel the
   *  server-side intent — it stays open until it confirms or its window closes, which is exactly what
   *  the durable marker exists to reconcile. */
  reset: () => void;
}

/** Poll cadence while an intent is pending. The window is 90s, so this is ~36 reads worst case on a
 *  cheap endpoint — responsive enough that a confirmation feels immediate without hammering. */
const POLL_MS = 2_500;

export function useTopUp(options?: { onStartError?: () => void }): TopUpController {
  const qc = useQueryClient();
  const [topupId, setTopupId] = useState<string | null>(null);
  const onStartError = options?.onStartError;

  const create = useMutation({
    mutationFn: (input: TopUpStart) => createTopup(input),
    onError: () => onStartError?.(),
    onSuccess: (topup) => {
      setTopupId(topup.id);
      // Durable marker BEFORE the rider can leave for their mobile-money app: if the OS reclaims the
      // process mid-approval, the Money tab reconciles this on next open (`reconcilePendingTopup`)
      // rather than leaving a paid-but-unseen credit. It records that an intent EXISTS, never that
      // money moved.
      void savePendingTopup({ topupId: topup.id });
    },
  });

  const poll = useQuery({
    queryKey: ["wallet", "topup", topupId],
    queryFn: () => getTopup(topupId as string),
    enabled: topupId != null,
    refetchInterval: (q) => (q.state.data?.status === "pending" ? POLL_MS : false),
  });
  const status = poll.data?.status;

  // Terminal handling. `succeeded` is the ONLY branch that touches the balance — and it does so by
  // invalidating, never by writing a number the client guessed.
  useEffect(() => {
    if (status == null || status === "pending") return;
    if (status === "succeeded") {
      void qc.invalidateQueries({ queryKey: walletKey });
      void qc.invalidateQueries({ queryKey: walletLedgerKey });
    }
    void clearPendingTopup();
  }, [status, qc]);

  const reset = useCallback(() => {
    setTopupId(null);
    create.reset();
  }, [create]);

  return {
    topup: poll.data,
    status,
    hasIntent: topupId != null,
    isStarting: create.isPending,
    start: create.mutate,
    reset,
  };
}
