import type { TopupStatus } from "@lynia/shared";
import { RIDER_COPY as R, RF } from "../ui/rider/copy";
import { formatMoney } from "./money";

const TWO_DP = /^\d*(\.\d{0,2})?$/;

/** MA-L1: the amount field takes digits with at most two decimals; any other keystroke is ignored. */
export function acceptAmountInput(prev: string, next: string): string {
  const v = next.replace(",", ".");
  return TWO_DP.test(v) ? v : prev;
}

/** WD-009: pure top-up amount validation, factored out of `app/wallet/top-up.tsx` so the bounds it's
 *  called with are testable — the caller must pass the server-authoritative config bounds (not the
 *  bundled `COMMISSION` constant), and this proves the message reflects whatever bounds it's given. */
export function validateTopupAmount(amountRaw: string, minTopUp: number, maxTopUp: number): string | null {
  if (amountRaw.trim() === "") return null;
  const n = Number(amountRaw);
  // MA-L1: cents only — "5.555" is not an amount the server takes.
  if (!Number.isFinite(n) || n < minTopUp || !TWO_DP.test(amountRaw.trim())) return `Enter at least ${formatMoney(minTopUp)}`;
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

/**
 * MA-H2: the server's online-gate rule for the commission floor (`online-gate.ts`
 * `onlineRefusalReason`): the floor binds only once commission is on (rate above 0%) AND the rider's
 * commission-free first jobs are used up (D-70). An older server that doesn't report the free jobs
 * keeps the floor (as the server's own undefined branch does).
 */
export function floorApplies(ratePct: number, freeJobsLeft: number | null | undefined): boolean {
  return ratePct > 0 && !(freeJobsLeft != null && freeJobsLeft > 0);
}

/** MA-M1: the low-balance wall's "Top up at least" — what lifts the balance to `need` (the floor, or the
 *  refused job's commission), but never under the minimum top-up the server accepts (the wall must not
 *  ask for an amount the top-up screen refuses). */
export function topUpAtLeast(need: number, balance: number, minTopUp: number): number {
  return Math.max(minTopUp, need - balance, 0.01);
}

/** The commission a `commission_low_balance` refusal names (`common/commission-cover.ts` puts it on the
 *  403 body), or null when the body doesn't carry one. */
export function refusedJobCommission(body: unknown): number | null {
  const c = body != null && typeof body === "object" ? (body as { commission?: unknown }).commission : undefined;
  const n = typeof c === "string" ? Number(c) : c;
  return typeof n === "number" && Number.isFinite(n) && n >= 0 ? n : null;
}

/**
 * The top-up wall (Rider v2 G14) under the per-job rule (owner 2026-10-12, PR #1154): there is no
 * balance floor; the server refuses a job whose commission is more than the balance. The drawn floor
 * sentence is only true while the server serves a floor above $0 and the refusal isn't about one job;
 * otherwise the wall says the balance doesn't cover the job's commission (ledger D-102). "Top up at
 * least" lifts the balance over whichever bar applies.
 */
export function topUpGate(input: { floor: number; balance: number; minTopUp: number; commission: number | null }): {
  body: string;
  atLeast: number;
} {
  const { floor, balance, minTopUp, commission } = input;
  const body = commission == null && floor > 0 ? RF.gTopB(floor) : R.gTopJobB;
  return { body, atLeast: topUpAtLeast(Math.max(floor, commission ?? 0), balance, minTopUp) };
}
