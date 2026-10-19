/**
 * The C2 phone field under the Zimbabwe flag (Calm Mint v2, D-55; the flag is a picker since D-116): the
 * 9 national digits after +263, shown grouped "77 245 1180". Pure helpers, unit-tested.
 */

/** Digits a Zimbabwe mobile has after +263. */
export const ZW_NATIONAL_DIGITS = 9;
/** What sign-in keeps under the Zimbabwe flag: one more, so a number from abroad reads as too long (D-116). */
export const ZW_SIGNIN_DIGITS = ZW_NATIONAL_DIGITS + 1;

/** Zimbabwe mobile prefixes after +263 (Econet 77/78, NetOne 71, Telecel 73) — the C2 help line. */
const MOBILE_PREFIXES = ["71", "73", "77", "78"] as const;

/**
 * What the customer typed → the national digits, at most `max` (9; sign-in passes ZW_SIGNIN_DIGITS). A leading trunk "0" ("0772451180") and a
 * pasted country code ("+263 77…", "263 77…") are both dropped, so every way people write their own
 * number lands on the same nine digits, typed or pasted.
 */
export function zwNationalDigits(input: string, max = ZW_NATIONAL_DIGITS): string {
  let d = input.replace(/\D/g, "");
  // JQ-R4-05: a national mobile number starts 7 (or a trunk 0), never 2 — so "2637…"/"2630…" is the country
  // code whether it was pasted or typed digit by digit (it used to strip only past 9 digits, i.e. a paste).
  if (/^263[07]/.test(d) || (d.startsWith("263") && d.length > 9)) d = d.slice(3);
  if (d.startsWith("0")) d = d.slice(1);
  return d.slice(0, max);
}

/** "772451180" → "77 245 1180" (grouped as it is typed). A tenth digit stays visible (sign-in, D-116). */
export function formatZwNational(digits: string): string {
  const d = digits.slice(0, ZW_SIGNIN_DIGITS);
  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0, 2)} ${d.slice(2)}`;
  return `${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5)}`;
}

export type ZwMobileProblem = "short" | "long" | "not-mobile";

/**
 * Null when the nine digits are a Zimbabwe mobile number. "long" is a number from abroad typed under the
 * default Zimbabwe flag (D-116): a UK "07711 123456" used to be cut to nine digits that passed as +263 77..., and the
 * code went to a stranger's phone.
 */
export function zwMobileProblem(digits: string): ZwMobileProblem | null {
  if (digits.length > ZW_NATIONAL_DIGITS) return "long";
  if (digits.length < ZW_NATIONAL_DIGITS) return "short";
  if (!MOBILE_PREFIXES.some((p) => digits.startsWith(p))) return "not-mobile";
  return null;
}

/** The E.164 number the API is sent: "+263" + the nine digits. */
export function zwE164(digits: string): string {
  return `+263${digits}`;
}
