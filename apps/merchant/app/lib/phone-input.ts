/**
 * The sign-in phone field (merchant-mobile A1): "+263" is fixed and the merchant types the rest, the
 * way it's written locally ("77 123 4567"). Pure, so every shape a number arrives in is unit-tested:
 * typed with the leading 0, pasted with +263 or 263, or with spaces and dashes.
 */

/** Zimbabwe mobile numbers are 9 digits after the country code. */
export const LOCAL_DIGITS = 9;

/** How long "Resend" waits after a code goes out. */
export const RESEND_AFTER_S = 60;

/** Whatever was typed or pasted → the up-to-9 digits after +263. */
export function localDigits(raw: string): string {
  let d = raw.replace(/\D/g, "");
  if (d.startsWith("263")) d = d.slice(3);
  else if (d.startsWith("0")) d = d.slice(1);
  return d.slice(0, LOCAL_DIGITS);
}

/** "771234567" → "77 123 4567" (partial input formats as far as it goes). */
export function formatLocalDigits(digits: string): string {
  const d = digits.slice(0, LOCAL_DIGITS);
  return [d.slice(0, 2), d.slice(2, 5), d.slice(5)].filter(Boolean).join(" ");
}

/** "771234567" → "+263771234567". */
export function toE164(digits: string): string {
  return `+263${digits}`;
}
