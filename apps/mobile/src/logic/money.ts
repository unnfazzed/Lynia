/**
 * Format a money value — a server Decimal serialised as a string ("2.5", "3"), or a number — as a
 * padded currency string like "$2.50". Centralised so every fare/earnings row renders two decimals
 * consistently: without it a round or single-decimal fare shows as "$3"/"$2.5" right next to sibling
 * values formatted with .toFixed(2) as "$3.00"/"$2.50" — ragged prices in a cash-payments app.
 */
export function formatMoney(value: string | number | null | undefined): string {
  const n = Number(value ?? 0);
  return `$${(Number.isFinite(n) ? n : 0).toFixed(2)}`;
}
