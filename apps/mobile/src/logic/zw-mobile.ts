/**
 * The C2 phone field (Calm Mint v2, D-55): a fixed "+263" prefix segment and the 9 national digits
 * after it, shown grouped "77 245 1180". Pure helpers, unit-tested.
 */

/** Zimbabwe mobile prefixes after +263 (Econet 77/78, NetOne 71, Telecel 73) — the C2 help line. */
const MOBILE_PREFIXES = ["71", "73", "77", "78"] as const;

/**
 * What the customer typed → the national digits, at most 9. A leading trunk "0" ("0772451180") and a
 * pasted country code ("+263 77…", "263 77…") are both dropped, so every way people write their own
 * number lands on the same nine digits.
 */
export function zwNationalDigits(input: string): string {
  let d = input.replace(/\D/g, "");
  if (d.startsWith("263") && d.length > 9) d = d.slice(3);
  if (d.startsWith("0")) d = d.slice(1);
  return d.slice(0, 9);
}

/** "772451180" → "77 245 1180" (grouped as it is typed). */
export function formatZwNational(digits: string): string {
  const d = digits.slice(0, 9);
  if (d.length <= 2) return d;
  if (d.length <= 5) return `${d.slice(0, 2)} ${d.slice(2)}`;
  return `${d.slice(0, 2)} ${d.slice(2, 5)} ${d.slice(5)}`;
}

export type ZwMobileProblem = "short" | "not-mobile";

/** Null when the nine digits are a Zimbabwe mobile number. */
export function zwMobileProblem(digits: string): ZwMobileProblem | null {
  if (digits.length < 9) return "short";
  if (!MOBILE_PREFIXES.some((p) => digits.startsWith(p))) return "not-mobile";
  return null;
}

/** The E.164 number the API is sent: "+263" + the nine digits. */
export function zwE164(digits: string): string {
  return `+263${digits}`;
}
