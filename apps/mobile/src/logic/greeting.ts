/**
 * The customer home's time-aware greeting (home 8c header).
 *
 * Pure and framework-free like the rest of `src/logic` — the screen passes the device clock in, so
 * the boundaries are unit-testable without freezing time globally, and the sticker cannot disagree
 * with the words (both derive from the SAME call).
 *
 * Boundaries are the handoff's, verbatim: morning < 12, afternoon < 18, evening after. The sun
 * sticker swaps to the moon at the same 18:00 line.
 */
export interface Greeting {
  /** "Good morning" | "Good afternoon" | "Good evening" — never carries the name. */
  phrase: string;
  /** True from 18:00 — the header draws the moon sticker instead of the sun. */
  evening: boolean;
}

export function greetingFor(now: Date): Greeting {
  const h = now.getHours();
  if (h < 12) return { phrase: "Good morning", evening: false };
  if (h < 18) return { phrase: "Good afternoon", evening: false };
  return { phrase: "Good evening", evening: true };
}

/**
 * The full greeting line. The mock draws "Good morning, Rudo"; a caller with no first name yet
 * (profile not loaded, or a profile that never carried one) gets the bare phrase rather than a
 * dangling comma or an invented placeholder name.
 *
 * Only the FIRST word of `firstName` is used, and it is capped — the greeting is 25px/700 on a
 * 320px-wide entry phone next to a 46px sticker and a 42px bell, so a long legal first name has to
 * degrade to something that still fits on one line rather than wrapping the header taller.
 */
const GREETING_NAME_MAX = 14;

export function greetingLine(phrase: string, firstName: string | null | undefined): string {
  const first = (firstName ?? "").trim().split(/\s+/)[0] ?? "";
  if (!first) return phrase;
  return `${phrase}, ${first.slice(0, GREETING_NAME_MAX)}`;
}
