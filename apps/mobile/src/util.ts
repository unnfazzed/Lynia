/**
 * Locale-safe numeric parse. Android decimal-pad emits a comma in many locales (e.g. "-17,82"),
 * which Number() turns into NaN — silently corrupting coordinates/fares. Returns null for
 * empty/invalid so callers can gate instead of POSTing garbage.
 */
export function parseNum(raw: string): number | null {
  const cleaned = raw.replace(/\s/g, "").replace(",", ".");
  if (cleaned === "") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}
