import type { AdminFleetBill, AdminFleetRide, AdminFleetRow, AdminFleetStatus } from "@lynia/shared";
import { fmtTime, money, OPS_TZ } from "../lib/format";
import { OBA, OBA_FRAME } from "../lib/own-bikers-copy";

/**
 * Own bikers in the console (OB-A1–A4, ledger D-117): what the page shows, worked out from the API's rows. Pure, so
 * the table, the side panel and their tests read the same thing.
 */

export type PillKind = "bad" | "good" | "mut" | "warn";

/**
 * The business and its branches, from the branches' names. One name per branch (P7-1), so the business is the words
 * every branch name starts with: "Chicken Inn Avondale" + "Chicken Inn Borrowdale" → "Chicken Inn" with "Avondale,
 * Borrowdale". A single branch, or names with nothing in common, keep their full names.
 */
export function brandOf(names: readonly string[], fallback: string): { brand: string; branches: string[] } {
  if (names.length === 0) return { brand: fallback, branches: [] };
  if (names.length === 1) return { brand: names[0]!, branches: [names[0]!] };
  const words = names.map((n) => n.trim().split(/\s+/));
  const shortest = Math.min(...words.map((w) => w.length));
  let common = 0;
  while (common < shortest - 1 && words.every((w) => w[common]!.toLowerCase() === words[0]![common]!.toLowerCase())) common++;
  if (common === 0) return { brand: names[0]!, branches: [...names] };
  return { brand: words[0]!.slice(0, common).join(" "), branches: words.map((w) => w.slice(common).join(" ")) };
}

/** The status column's pill. "Disabled" isn't in the handoff (it draws no disabled fleet); it reads like the others. */
export function statusPill(status: AdminFleetStatus): { label: string; kind: PillKind } {
  switch (status) {
    case "overdue":
      return { label: OBA.stOverdue, kind: "bad" };
    case "unpaid":
      return { label: OBA.stUnpaid, kind: "warn" };
    case "paid":
      return { label: OBA.stPaid, kind: "good" };
    case "paused":
      return { label: OBA.stPaused, kind: "mut" };
    case "disabled":
      return { label: "Disabled", kind: "mut" };
  }
}

/** The subnav: All · Overdue · Unpaid · Paid · Paused, with their counts. */
export const FILTERS = [
  { value: "all", label: OBA_FRAME.all },
  { value: "overdue", label: OBA.stOverdue },
  { value: "unpaid", label: OBA.stUnpaid },
  { value: "paid", label: OBA.stPaid },
  { value: "paused", label: OBA.stPaused },
] as const;
export type FleetFilter = (typeof FILTERS)[number]["value"];

export const asFilter = (v: unknown): FleetFilter => (FILTERS.some((f) => f.value === v) ? (v as FleetFilter) : "all");

export function filterRows(rows: readonly AdminFleetRow[], filter: FleetFilter): AdminFleetRow[] {
  return filter === "all" ? [...rows] : rows.filter((r) => r.status === filter);
}

export function filterCounts(rows: readonly AdminFleetRow[]): Record<FleetFilter, number> {
  const n = (s: AdminFleetStatus) => rows.filter((r) => r.status === s).length;
  return { all: rows.length, overdue: n("overdue"), unpaid: n("unpaid"), paid: n("paid"), paused: n("paused") };
}

/** "Days overdue": "9 days overdue" in words (never colour alone), danger past a week; "—" when not overdue. */
export function overdueCell(days: number): { text: string; loud: boolean } {
  return days > 0 ? { text: OBA.overdueN(days), loud: days > 7 } : { text: "—", loud: false };
}

/** The handoff's month names ("Sep", where some ICU builds write "Sept"). */
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
/** A Harare calendar day ("2026-09-28") as its parts. */
function dayParts(key: string): { day: number; month: string; weekday: string } {
  const d = new Date(`${key}T12:00:00Z`);
  return { day: d.getUTCDate(), month: MONTHS[d.getUTCMonth()]!, weekday: WEEKDAYS[d.getUTCDay()]! };
}
/** An instant's Harare calendar day, "2026-10-04". */
const harareKey = (iso: string): string =>
  new Intl.DateTimeFormat("en-CA", { timeZone: OPS_TZ, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));

/** "28 Sep–4 Oct", or "21–27 Sep" within a month. Bill dates are Harare calendar days ("2026-09-28"). */
export function weekLabel(start: string, end: string): string {
  const [s, e] = [dayParts(start), dayParts(end)];
  return s.month === e.month ? `${s.day}–${e.day} ${e.month}` : `${s.day} ${s.month}–${e.day} ${e.month}`;
}

/** A bill's status pill: "Due Fri 9 Oct", "2 days overdue", "Paid". */
export function billPill(bill: AdminFleetBill): { label: string; kind: PillKind } {
  if (bill.state === "paid") return { label: OBA.stPaid, kind: "good" };
  if (bill.state === "overdue") return { label: OBA.overdueN(bill.daysOverdue), kind: "bad" };
  if (!bill.dueOn) return { label: OBA.stUnpaid, kind: "warn" };
  const d = dayParts(bill.dueOn);
  return { label: OBA_FRAME.due(`${d.weekday} ${d.day} ${d.month}`), kind: "warn" };
}

/** A bill's rides: the sum of its branch lines. */
export const billRides = (bill: AdminFleetBill): number => bill.branches.reduce((n, b) => n + b.rides, 0);

/** Adjust's "Which ride" option: "#B190 · Tendai · 4 Oct 10:05". */
export function rideLabel(r: AdminFleetRide): string {
  const d = dayParts(harareKey(r.at));
  return [r.ref, r.biker, `${d.day} ${d.month} ${fmtTime(r.at)}`].filter(Boolean).join(" · ");
}

/** "$36.00". */
export const usd = (v: string | number): string => money(v);
