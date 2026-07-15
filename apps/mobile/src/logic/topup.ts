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
