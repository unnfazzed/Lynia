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

/**
 * A DETERMINISTIC UUID-v4-shaped id derived from `seed` — the same seed always yields the same id,
 * across app restarts. Used for the create-order idempotency key so it can be reproduced from stable,
 * persisted inputs (a persisted nonce + the order's content): a client timeout/double-tap OR an app
 * kill-and-relaunch retry of the same order lands on the same key and the server dedupes it, while a
 * genuinely different order (different content) yields a different key. Four FNV-1a-style 32-bit
 * hashes with positional mixing → 128 bits, stamped with the v4 version/variant nibbles. Not secure
 * and not collision-proof in theory; for a per-customer dedup token the odds are negligible.
 */
export function uuidV4FromSeed(seed: string): string {
  const words = [0x811c9dc5, 0x811c9dc5, 0x811c9dc5, 0x811c9dc5];
  for (let i = 0; i < seed.length; i++) {
    const c = seed.charCodeAt(i);
    const w = i % 4;
    const nw = (w + 1) % 4;
    words[w] = Math.imul((words[w] ?? 0) ^ c, 0x01000193) >>> 0;
    // Mix into the neighbouring word so character position, not just the multiset, affects the digest.
    words[nw] = ((words[nw] ?? 0) + ((c << (i % 24)) | 0)) >>> 0;
  }
  const chars = words.map((w) => (w >>> 0).toString(16).padStart(8, "0")).join("").split("");
  chars[12] = "4"; // version 4
  chars[16] = ((parseInt(chars[16] ?? "0", 16) & 0x3) | 0x8).toString(16); // variant
  const s = chars.join("");
  return `${s.slice(0, 8)}-${s.slice(8, 12)}-${s.slice(12, 16)}-${s.slice(16, 20)}-${s.slice(20, 32)}`;
}

/**
 * Bound a promise's WAIT (not its work) to `ms`, rejecting with `new Error(label)` on expiry.
 * The one copy of a helper that had drifted into six per-file duplicates (T7,
 * docs/plans/2026-08-17-customer-journey-load-perf-fixes.md) — GPS fixes, geocoder lookups and the
 * rider board's locate all share it now. Two properties every caller relies on:
 *  - the timer is cleared on the winning path, so a resolved fix never leaves a dangling timeout;
 *  - `Promise.race` cannot cancel the underlying native work — a late result still settles the
 *    original promise, and callers discard it (sequence guards / cancelled flags), never re-use it.
 */
export function withTimeout<T>(p: Promise<T>, ms: number, label = "location-timeout"): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new Error(label)), ms);
  });
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}
