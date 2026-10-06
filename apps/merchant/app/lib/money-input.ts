/** The dish/item price ceiling: `MerchantDishRequest.priceUsd` is `.max(1000)` in the shared contracts.
 *  E2E 2026-10-05 P-1: the dish editor used the 100000 money ceiling, so $1,500 passed here and came
 *  back as a raw validation error. */
export const DISH_PRICE_MAX_USD = 1000;

/** Pure amount-parsing for typed money (the dish editor's price, a booking line's price). Mirrors the
 *  server's constraint (positive, 2dp, ≤ `max` — 100000 by default, the shared money ceiling; pass
 *  `DISH_PRICE_MAX_USD` for a dish price) so a Save/Add button can refuse an obviously-invalid typed
 *  amount. The server still re-validates and is the actual authority. */
export function parseAmountInput(raw: string, max = 100_000): number | null {
  const trimmed = raw.trim();
  if (!trimmed || !/^\d+(\.\d{1,2})?$/.test(trimmed)) return null;
  const value = Number(trimmed);
  if (!Number.isFinite(value) || value <= 0 || value > max) return null;
  return Math.round(value * 100) / 100;
}

export function formatMoney(amount: number): string {
  return amount.toFixed(2);
}
