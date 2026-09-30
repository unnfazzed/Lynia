/**
 * D1 (browse) — pure, framework-free helpers over a merchant's weekly `MerchantHours` (D-29/D-30),
 * so "is this kitchen open right now" / "closing soon" / "opens at" is computed identically on every
 * screen instead of each one reimplementing HH:MM arithmetic. No overnight-spanning windows (a
 * close time is always same-day as its open time) — nothing in the merchant hours editor (E4)
 * produces one yet.
 */
import type { MerchantHours, MerchantHoursWindow } from "./contracts";

const DAY_ORDER = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;
type DayKey = (typeof DAY_ORDER)[number];

const DAY_LABEL: Record<DayKey, string> = {
  sun: "Sunday",
  mon: "Monday",
  tue: "Tuesday",
  wed: "Wednesday",
  thu: "Thursday",
  fri: "Friday",
  sat: "Saturday",
};

function dayKeyFor(date: Date): DayKey {
  return DAY_ORDER[date.getDay()] as DayKey;
}

function minutesOfDay(date: Date): number {
  return date.getHours() * 60 + date.getMinutes();
}

function parseHHMM(hhmm: string): number {
  const [h, m] = hhmm.split(":");
  return Number(h) * 60 + Number(m);
}

function windowFor(hours: MerchantHours, date: Date): MerchantHoursWindow | undefined {
  return hours[dayKeyFor(date)];
}

/**
 * Whether the merchant is open at `now`. A merchant with no hours configured at all reads as OPEN
 * (fail-open — a shop that hasn't set hours yet must not silently vanish from the list); a
 * configured week with today simply absent reads as closed today.
 */
export function isMerchantOpenNow(hours: MerchantHours | null, now: Date): boolean {
  if (!hours) return true;
  const window = windowFor(hours, now);
  if (!window) return false;
  const nowMin = minutesOfDay(now);
  return nowMin >= parseHHMM(window.open) && nowMin < parseHHMM(window.close);
}

/**
 * Minutes until close, only when currently open AND within `withinMin` (default 30) of closing —
 * backs a "closing soon" badge. Null otherwise (not open, or not imminent).
 */
export function minutesUntilClose(hours: MerchantHours | null, now: Date, withinMin = 30): number | null {
  if (!hours) return null;
  const window = windowFor(hours, now);
  if (!window) return null;
  const remaining = parseHHMM(window.close) - minutesOfDay(now);
  if (remaining <= 0 || remaining > withinMin) return null;
  return remaining;
}

/**
 * Plain-language "opens ..." copy for a closed restaurant: later today if it has a window still
 * ahead, else the next day this week that has one. Null when there is nothing honest to say (no
 * hours configured at all, or open right now).
 */
export function nextOpenDescription(hours: MerchantHours | null, now: Date): string | null {
  if (!hours || isMerchantOpenNow(hours, now)) return null;
  const today = windowFor(hours, now);
  if (today && minutesOfDay(now) < parseHHMM(today.open)) return `Opens today at ${today.open}`;
  for (let step = 1; step <= 7; step++) {
    const key = DAY_ORDER[(now.getDay() + step) % 7] as DayKey;
    const window = hours[key];
    if (window) return step === 1 ? `Opens tomorrow at ${window.open}` : `Opens ${DAY_LABEL[key]} at ${window.open}`;
  }
  return null;
}

/**
 * The hours a customer sees (merchant mobile redesign, D-48): while a merchant is closed by hand
 * (`closedUntil` in the future), today's window is dropped, so every client — including installed apps
 * that only know `isMerchantOpenNow` — reads the restaurant as closed and says when it opens next. A
 * merchant with no hours at all becomes an empty week for the same reason.
 */
export function effectiveMerchantHours(hours: MerchantHours | null, closedUntil: Date | null, now: Date): MerchantHours | null {
  if (!closedUntil || closedUntil.getTime() <= now.getTime()) return hours;
  // Stored weeks are partial in practice (a closed day is simply absent), whatever the type says.
  const copy: Partial<MerchantHours> = { ...hours };
  delete copy[dayKeyFor(now)];
  return copy as MerchantHours;
}

/** When a close by hand ends on its own: the start of the next day. */
export function startOfNextDay(now: Date): Date {
  const next = new Date(now);
  next.setHours(24, 0, 0, 0);
  return next;
}
