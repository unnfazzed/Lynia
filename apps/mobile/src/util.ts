/**
 * Locale-safe numeric parse. Android decimal-pad emits a comma in many locales (e.g. "-17,82"),
 * which Number() turns into NaN — silently corrupting coordinates/fares. Returns null for
 * empty/invalid so callers can gate instead of POSTing garbage.
 */
export function parseNum(raw: string): number | null {
  const cleaned = raw.replace(/\s/g, "").replace(/,/g, ".");
  if (cleaned === "") return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

/**
 * A client-generated nonce for a create-order idempotency key (BUG-HUNT). Not cryptographically
 * secure — it doesn't need to be, it's a dedup token scoped to one customer's retries, not a
 * security credential — but it must be RFC4122-v4-shaped, since the server contract validates it
 * with zod's `.uuid()`. Hermes/React Native has no built-in `crypto.randomUUID()` and this app
 * doesn't otherwise depend on a native crypto polyfill, so this is plain Math.random().
 */
export function randomUuidV4(): string {
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === "x" ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}
