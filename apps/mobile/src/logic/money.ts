/**
 * Format a money value — a server Decimal serialised as a string ("2.5", "3"), or a number — as a
 * padded currency string like "$2.50". Centralised so every fare/earnings row renders two decimals
 * consistently: without it a round or single-decimal fare shows as "$3"/"$2.5" right next to sibling
 * values formatted with .toFixed(2) as "$3.00"/"$2.50" — ragged prices in a cash-payments app.
 *
 * WD-008: a negative value (e.g. a wallet balance owed) renders sign-first as "-$5.00", not
 * `Number.toFixed`'s "$-5.00" (the sign would otherwise land after the currency symbol).
 */
export function formatMoney(value: string | number | null | undefined): string {
  const n = Number(value ?? 0);
  const safe = Number.isFinite(n) ? n : 0;
  const abs = Math.abs(safe).toFixed(2);
  // A negative value that rounds to zero (e.g. -0.004) renders as a plain "$0.00" — no stray "-$0.00".
  const sign = safe < 0 && abs !== "0.00" ? "-" : "";
  return `${sign}$${abs}`;
}

/**
 * A delivery price range for a tight row, in whole dollars (D-133): "$5–7", never "$5.50–6.50". The low end rounds
 * DOWN and the high end rounds UP, so the range still holds every price the customer can be asked to pay (the high
 * end is the default "Pay no more than", D-128) and the store's four-cell strip fits at 320px. Equal ends, or no low
 * end, read as one exact price: "$1.50".
 */
export function formatMoneyRange(low: number | null | undefined, high: number): string {
  if (low == null || low === high) return formatMoney(high);
  // Cent-level float noise (5.000000001) must not push a whole dollar up a step.
  const lo = Math.floor(Math.round(low * 100) / 100);
  const hi = Math.ceil(Math.round(high * 100) / 100);
  return lo === hi ? `$${lo}` : `$${lo}–${hi}`;
}
