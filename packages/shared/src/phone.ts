/** Default country calling code for bare/local numbers — Zimbabwe (+263), the launch market. */
export const DEFAULT_COUNTRY_CODE = "263";

/**
 * Canonicalize a phone number to E.164 (`+<country><national>`, digits only) so the same subscriber
 * always maps to ONE identity, however they typed it. The auth layer keys accounts, OTP records, and
 * rate limits on this value, so `"+263 77 123 4567"`, `"0771234567"`, `"263771234567"`, and
 * `"+263771234567"` must all collapse to `"+263771234567"` — otherwise one person becomes several
 * accounts with separate history and OTP state.
 *
 * Rules (applied to the digits after stripping spaces/dashes/parens/dots/letters):
 *  - leading `+`            → trust it; the digits are already country+national.
 *  - leading `00`           → international access prefix, equivalent to `+`; drop it.
 *  - leading `0`            → national form with a trunk `0`; swap it for `countryCode`.
 *  - already starts with the country code → keep.
 *  - otherwise (bare national, no trunk 0) → assume `countryCode` (a launch-market ZW assumption; a
 *    foreign number typed without `+` is genuinely ambiguous and out of scope for a ZW-only app).
 *
 * Idempotent on input that is already E.164. Returns `null` when the result isn't a plausible E.164
 * number (`+` then 8–15 digits), so the caller rejects it instead of minting a junk identity.
 */
export function normalizePhone(raw: string, countryCode: string = DEFAULT_COUNTRY_CODE): string | null {
  if (typeof raw !== "string") return null;
  const hadPlus = raw.trim().startsWith("+");
  let digits = raw.replace(/\D/g, ""); // drop +, whitespace, dashes, parens, dots, stray letters
  if (!digits) return null;

  if (hadPlus) {
    // Already international — the digits are the country + national number as given.
  } else if (digits.startsWith("00")) {
    digits = digits.slice(2);
  } else if (digits.startsWith("0")) {
    digits = countryCode + digits.slice(1);
  } else if (digits.startsWith(countryCode)) {
    // Country code present without the leading '+'.
  } else {
    digits = countryCode + digits;
  }

  const e164 = `+${digits}`;
  return /^\+\d{8,15}$/.test(e164) ? e164 : null;
}
