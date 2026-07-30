/** Pure amount-parsing for the money-confirm sheets (E3, D-06 "confirming money means acknowledging
 *  a number"). Mirrors the server's own constraint (positive, ≤100000, 2dp) so a sheet's Confirm
 *  button can disable on an obviously-invalid typed amount — the server still re-validates and is the
 *  actual authority (a mismatch 409s naming the gap in dollars; this never second-guesses that). */
export function parseAmountInput(raw: string): number | null {
  const trimmed = raw.trim();
  if (!trimmed || !/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value <= 0 || value > 100_000) return null;
  return Math.round(value * 100) / 100;
}

export function formatMoney(amount: number): string {
  return amount.toFixed(2);
}
