import type { TopupStatus } from "@lynia/shared";
import { formatMoney } from "./money";

/** WD-009: pure top-up amount validation, factored out of `app/wallet/top-up.tsx` so the bounds it's
 *  called with are testable — the caller must pass the server-authoritative config bounds (not the
 *  bundled `COMMISSION` constant), and this proves the message reflects whatever bounds it's given. */
export function validateTopupAmount(amountRaw: string, minTopUp: number, maxTopUp: number): string | null {
  if (amountRaw.trim() === "") return null;
  const n = Number(amountRaw);
  if (!Number.isFinite(n) || n < minTopUp) return `Enter at least ${formatMoney(minTopUp)}`;
  if (n > maxTopUp) return `The most you can top up at once is ${formatMoney(maxTopUp)}`;
  return null;
}

/**
 * UX-2026-07-16: what the wallet screen should do with a durable `PendingTopup` marker (session.ts) it
 * finds on mount — the recovery path for an app kill during top-up.tsx's "wait" step (see the marker's
 * own doc comment). Pure decision over the server's own `getTopup` status, so the mount-time effect is a
 * thin dispatch and this branch is unit-testable without mounting a screen.
 */
export type PendingTopupOutcome = "succeeded" | "pending" | "terminal";
export function reconcilePendingTopup(status: TopupStatus): PendingTopupOutcome {
  if (status === "succeeded") return "succeeded";
  if (status === "pending") return "pending";
  return "terminal"; // declined | expired — no money moved, safe to clear
}
