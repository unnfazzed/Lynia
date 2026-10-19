import { effectiveMerchantHours, harareWallClock, isMerchantOpenNow, type MerchantHours, startOfNextDay } from "@lynia/shared";

/** Harare's wall clock for hours arithmetic: one definition, shared with the apps (D-116). */
export { harareWallClock };

/**
 * MJ-RM13 (2026-10-07): when a close by hand (D-48 "closed for today") ends, as an instant: Harare's
 * next midnight. `startOfNextDay(new Date())` on the UTC server gave UTC's next midnight (02:00 Harare),
 * so a kitchen closed by hand between 00:00 and 02:00 Harare was open again at 02:00 the same day.
 */
export function harareStartOfNextDay(now: Date): Date {
  const wall = harareWallClock(now);
  const midnight = startOfNextDay(wall);
  return new Date(now.getTime() - (now.getTime() % 1000) + (midnight.getTime() - wall.getTime()));
}

/**
 * The weekly hours a customer is served for a venue (D-48): today's window dropped while it is closed by
 * hand. Same as `effectiveMerchantHours`, except "today" is Harare's day: the shared helper reads the
 * day off the Date's local getters, which on the UTC server is still yesterday from 00:00 to 02:00
 * Harare (MJ-RM13 sibling). The close itself is compared as an instant.
 */
export function harareEffectiveHours(hours: MerchantHours | null, closedUntil: Date | null, now: Date): MerchantHours | null {
  if (!closedUntil || closedUntil.getTime() <= now.getTime()) return hours;
  // Stored weeks are partial in practice (a closed day is simply absent), whatever the type says.
  const copy: Partial<MerchantHours> = { ...hours };
  delete copy[HARARE_DAYS[harareWallClock(now).getDay()]!];
  return copy as MerchantHours;
}

const HARARE_DAYS = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"] as const;

/**
 * Whether a venue takes ASAP orders right now — placeOrder's own rule (D-48 + auto-accept safeguard 3):
 * not closed by hand, and inside its weekly hours on Harare's wall clock. No hours at all reads as open.
 */
export function isVenueOpenNow(hours: MerchantHours | null, closedUntil: Date | null, now: Date): boolean {
  if (closedUntil && closedUntil.getTime() > now.getTime()) return false;
  return isMerchantOpenNow(effectiveMerchantHours(hours, closedUntil, now), harareWallClock(now));
}

// ── Harare calendar days as instants (MJ-RM7) ────────────────────────────────────────────────────────
// The Money tab and the KPI strip count by the merchant's day, not the server's: the container runs in
// UTC, so `setHours(0…)` put Harare's 00:00–02:00 on the previous day (and Monday's first two hours in
// last week). These helpers turn a Harare calendar day into the instants it starts and ends at.

const HARARE_PARTS = new Intl.DateTimeFormat("en-GB", {
  timeZone: "Africa/Harare",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  hourCycle: "h23",
});

function harareFields(at: Date): { year: number; month: number; day: number; hour: number; minute: number; second: number } {
  const parts: Record<string, number> = {};
  for (const p of HARARE_PARTS.formatToParts(at)) {
    if (p.type !== "literal") parts[p.type] = Number(p.value);
  }
  return { year: parts.year!, month: parts.month!, day: parts.day!, hour: parts.hour!, minute: parts.minute!, second: parts.second! };
}

const dayKeyOf = (year: number, month: number, day: number): string =>
  `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

/** `YYYY-MM-DD` of the Harare calendar day an instant falls on. */
export function harareDayKey(at: Date): string {
  const f = harareFields(at);
  return dayKeyOf(f.year, f.month, f.day);
}

/** The instant Harare's wall clock reads 00:00 on `y-m-d`. Harare has no DST; the offset is still read
 *  from the zone database rather than assumed, and re-checked once. */
function harareMidnight(year: number, month: number, day: number): Date {
  const wallAsUtc = Date.UTC(year, month - 1, day);
  let instant = wallAsUtc;
  for (let i = 0; i < 2; i++) {
    const f = harareFields(new Date(instant));
    const offset = Date.UTC(f.year, f.month - 1, f.day, f.hour, f.minute, f.second) - instant;
    instant = wallAsUtc - offset;
  }
  return new Date(instant);
}

/** A `YYYY-MM-DD` Harare day's first and last instants (end = the next day's 00:00 less 1 ms). Null for
 *  anything that isn't a real calendar date. */
export function harareDayBounds(key: string): { start: Date; end: Date } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(key);
  if (!m) return null;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  const probe = new Date(Date.UTC(y, mo - 1, d));
  if (probe.getUTCFullYear() !== y || probe.getUTCMonth() !== mo - 1 || probe.getUTCDate() !== d) return null;
  const next = new Date(Date.UTC(y, mo - 1, d + 1));
  const start = harareMidnight(y, mo, d);
  const end = new Date(harareMidnight(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate()).getTime() - 1);
  return { start, end };
}

/** The `YYYY-MM-DD` key `n` calendar days after (or before, when negative) a day key. */
export function addDaysToKey(key: string, n: number): string {
  const [y, mo, d] = key.split("-").map(Number) as [number, number, number];
  const t = new Date(Date.UTC(y, mo - 1, d + n));
  return dayKeyOf(t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate());
}

/** Days since Monday (0 = Monday … 6 = Sunday) of a day key. */
export function daysSinceMonday(key: string): number {
  const [y, mo, d] = key.split("-").map(Number) as [number, number, number];
  return (new Date(Date.UTC(y, mo - 1, d)).getUTCDay() + 6) % 7;
}

/** The Monday (`YYYY-MM-DD`, Harare) of the week `at` falls in: weeks run Monday to Sunday (Own bikers bills, E7). */
export function harareWeekKey(at: Date): string {
  const today = harareDayKey(at);
  return addDaysToKey(today, -daysSinceMonday(today));
}

/** Monday 00:00 in Harare of the week `at` falls in. */
export function harareWeekStart(at: Date): Date {
  return harareDayBounds(harareWeekKey(at))!.start;
}
