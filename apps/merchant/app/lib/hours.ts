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
