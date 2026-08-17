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
 * The full greeting, as TWO LINES — the phrase on top, the name beneath it (owner instruction
 * 2026-08-17). The mock's string is unchanged ("Good morning, Rudo"); what is fixed here is where it
 * breaks. The reference wraps it only incidentally, when the phrase happens to be wide enough for
 * the ~216px greeting column, so "Good evening, Rudo" would sit on one line and "Good morning, Rudo"
 * on two — the header would change height with the time of day. An explicit newline makes the two
 * lines deliberate and stable.
 *
 * The newline is inside ONE string, not two elements: the rendered-conformance normalizer collapses
 * whitespace, so the screen still presents the mock's single text node with its copy verbatim.
 *
 * A caller with no first name yet (profile not loaded, or one that never carried a name) gets the
 * bare phrase on one line, rather than a dangling comma or an invented placeholder.
 *
 * Only the FIRST word of `firstName` is used, and it is capped: the greeting is 25px/700 on a
 * 320px-wide entry phone beside the sticker and the bell, so a long legal first name degrades to
 * something that still fits its line instead of adding a third.
 */
const GREETING_NAME_MAX = 14;

export function greetingLine(phrase: string, firstName: string | null | undefined): string {
  const first = (firstName ?? "").trim().split(/\s+/)[0] ?? "";
  if (!first) return phrase;
  return `${phrase},\n${first.slice(0, GREETING_NAME_MAX)}`;
}
