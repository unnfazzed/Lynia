import type { MerchantHours, MerchantHoursWindow } from "@lynia/shared";

export const DAY_KEYS = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
export type DayKey = (typeof DAY_KEYS)[number];

/** `MerchantHours` (packages/shared/src/contracts.ts) infers as a Zod `record()` over an enum key,
 *  which TS types as a REQUIRED `Record<DayKey, Window>` even though the schema — and every server
 *  read of it — treats a missing day as "closed that day" (the doc comment on the shared type says so
 *  explicitly). This alias is what the client actually holds: a partial map, cast back to the shared
 *  type only at the API-call boundary. */
export type PartialMerchantHours = Partial<MerchantHours>;

export const DAY_LABELS: Record<DayKey, string> = {
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
  sun: "Sunday",
};

/** JS `Date#getDay()` is 0=Sunday..6=Saturday; MerchantHours keys mon..sun — this is the one place
 *  that translation happens. */
export function dayKeyFor(date: Date): DayKey {
  const jsDay = date.getDay();
  return DAY_KEYS[(jsDay + 6) % 7] as DayKey;
}

export function formatWindow(window: MerchantHoursWindow | undefined): string {
  if (!window) return "Closed";
  return `${window.open} – ${window.close}`;
}

/** A window is well-formed once both ends are present and open < close (HH:MM strings compare
 *  lexicographically the same as numerically since they're always zero-padded 24h). An absent day is
 *  valid too (closed that day) — only a half-set or backwards pair is rejected client-side, the same
 *  constraint the server enforces on categories' own availableFrom/To pair. */
export function isValidWindow(window: MerchantHoursWindow): boolean {
  return window.open < window.close;
}

export interface RightNowStatus {
  open: boolean;
  label: string;
}

/** M4·4's "RIGHT NOW" panel: what a merchant glancing at the hours page actually wants to know. */
export function rightNowStatus(hours: PartialMerchantHours | MerchantHours | null, now: Date): RightNowStatus {
  const today = hours?.[dayKeyFor(now)];
  if (!today) return { open: false, label: "Closed today" };
  const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  if (hhmm >= today.open && hhmm < today.close) return { open: true, label: `Open until ${today.close}` };
  if (hhmm < today.open) return { open: false, label: `Opens at ${today.open}` };
  return { open: false, label: "Closed for today" };
}

/** C5's "Same every day" editor: one window for every open day. */
export interface SameEveryDay {
  window: MerchantHoursWindow;
  days: DayKey[];
}

/** The form's starting window: for hours that were never saved, and for a day switched on. */
export const DEFAULT_WINDOW: MerchantHoursWindow = { open: "08:00", close: "22:00" };

/** C5 opens on "Same every day" when every open day shares one window (or none is set), else "Per day".
 *  MJ-RH3 / MJ-RM9 (C13): only hours that were never saved (null) start from 08:00–22:00 every day; a
 *  saved week with no open day shows every day off, as the server reads it (closed every day). */
export function asSameEveryDay(hours: PartialMerchantHours | null): SameEveryDay | null {
  if (hours === null) return { window: { ...DEFAULT_WINDOW }, days: [...DAY_KEYS] };
  const open = DAY_KEYS.filter((d) => hours[d]);
  if (open.length === 0) return { window: { ...DEFAULT_WINDOW }, days: [] };
  const first = hours![open[0]!]!;
  const same = open.every((d) => hours![d]!.open === first.open && hours![d]!.close === first.close);
  return same ? { window: { ...first }, days: open } : null;
}

/** MJ-RM9: a week with no open day. The server stores it as closed every day, for good — the Closed
 *  switch is the way to close for a while, so the hours form refuses it. */
export function noOpenDay(hours: PartialMerchantHours): boolean {
  return DAY_KEYS.every((d) => !hours[d]);
}

/** MJ-RL13: a day whose closing time is before its opening time — "18:00 to 02:00". The hours are one
 *  window a day that ends by midnight, so the form says so rather than a bare "must be before". Equal
 *  times are a plain mistake, not a night shift: they keep the "must be before" line. */
export function crossesMidnight(window: MerchantHoursWindow): boolean {
  return window.close < window.open;
}

export function fromSameEveryDay({ window, days }: SameEveryDay): PartialMerchantHours {
  return Object.fromEntries(days.map((d) => [d, { ...window }])) as PartialMerchantHours;
}

/** DESIGN-DEVIATIONS D-91 (owner decision D6: copy only, through the screen's own lines). C5 draws none of
 *  these states. */
export const HOURS_COPY = {
  /** MJ-RH3: hours never saved — the server reads that as open around the clock. */
  notSet: "Not set yet, so customers can order at any time. Check these hours and tap Save hours.",
  /** MJ-RM9: a week with no open day is stored as closed for good. */
  noOpenDay: "Turn on at least one day. To close for a while, switch to Closed on Orders.",
  /** MJ-RL13: one window a day, ending by midnight. */
  pastMidnight: "Hours can't run past midnight. Close at 23:59 at the latest.",
  /** The drawn-era line for a mistyped time (unchanged). */
  badTime: "Times are 24-hour, like 08:00, and the opening time must be before the closing time.",
} as const;

/** "M T W T F S S" — the days-open chips. */
export const DAY_INITIALS: Record<DayKey, string> = { mon: "M", tue: "T", wed: "W", thu: "T", fri: "F", sat: "S", sun: "S" };
