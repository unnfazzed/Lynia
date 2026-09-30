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
