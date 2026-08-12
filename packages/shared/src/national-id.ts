/**
 * Canonicalize a Zimbabwean national ID for storage and DISPLAY so the same document always maps to
 * ONE value however the customer punctuated it. A ZW ID reads like `"63-123456-A-42"` on the card, but
 * people type it with dashes, spaces, dots or none at all — `"63 123456 A 42"`, `"63123456A42"`,
 * `"63-123456A42"` must all collapse to a single canonical form.
 *
 * The rule mirrors the API's duplicate-detection normaliser (`PiiCryptoService.normalize`): strip every
 * character that isn't a letter or digit, then upper-case the letters. Because the server hashes on that
 * same canonical form, sending the stripped value keeps client display, stored plaintext, and the
 * duplicate-ID hash all in agreement — an ID typed `"18-129766-R-27"` and one typed `"18129766R27"` are
 * the same identity end to end.
 *
 * Idempotent on already-canonical input. Returns "" for empty/non-string input.
 */
export function normalizeNationalId(raw: string): string {
  if (typeof raw !== "string") return "";
  return raw.replace(/[^a-z0-9]/gi, "").toUpperCase();
}
