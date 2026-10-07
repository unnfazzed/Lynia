import { effectiveMerchantHours, isMerchantOpenNow, type MerchantHours, startOfNextDay } from "@lynia/shared";

/**
 * Restaurant hours are Harare wall-clock times ("08:00"–"22:00"), but the API container runs in UTC
 * (no TZ is set), and the shared hours helpers read a Date's LOCAL getters. This returns a Date whose
 * local getters (getDay/getHours/getMinutes) read Harare's wall clock whatever the server's zone is,
 * so `isMerchantOpenNow(hours, harareWallClock(now))` answers the question the merchant configured.
 * Only for hours arithmetic: never store or compare the result as an instant.
 */
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

export function harareWallClock(now: Date): Date {
  const parts: Record<string, number> = {};
  for (const p of HARARE_PARTS.formatToParts(now)) {
    if (p.type !== "literal") parts[p.type] = Number(p.value);
  }
  return new Date(parts.year!, parts.month! - 1, parts.day!, parts.hour!, parts.minute!, parts.second!);
}

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
