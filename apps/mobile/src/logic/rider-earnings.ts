import type { OrderHistoryRow } from "../api/orders";

/**
 * Rider v2 earnings, derived on the phone from the rider's own history rows (ledger D-54). A job pays
 * its agreed fare in cash at the door, so a DELIVERED (or delivered-then-rated `completed`) row is a
 * fare earned; an undelivered or cancelled one is not.
 *
 * TODO(backend): `/orders/history` is capped at the newest 50 rows, which covers "today" and "this
 * week" for any realistic shift; a dedicated `/riders/earnings?from=` aggregate would remove the cap.
 */
export type ServiceFilter = "all" | "parcel" | "food";

export function isRiderRow(r: OrderHistoryRow): boolean {
  return r.role === "rider";
}

export function paidFare(r: OrderHistoryRow): number | null {
  if (r.status !== "delivered" && r.status !== "completed") return null;
  // MA-H1: on a merchant job the agreed fare is the customer's whole bill; the rider earns `riderFare`.
  const n = Number((r.orderType === "merchant" ? r.riderFare : null) ?? r.agreedFare ?? r.proposedFare);
  return Number.isFinite(n) ? n : null;
}

export function matchesService(r: OrderHistoryRow, f: ServiceFilter): boolean {
  return f === "all" || (f === "food" ? r.orderType === "merchant" : r.orderType !== "merchant");
}

/** Local midnight of `d`. */
export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Local Monday 00:00 of the week containing `d` (the week strip reads M T W T F S S). */
export function startOfWeek(d: Date): Date {
  const day = startOfDay(d);
  const back = (day.getDay() + 6) % 7;
  return new Date(day.getFullYear(), day.getMonth(), day.getDate() - back);
}

export interface EarningsSummary {
  total: number;
  jobs: number;
  parcels: number;
  food: number;
  /** Seven Monday-first daily totals; only filled for the week view. */
  byDay: number[];
}

export function summarise(rows: readonly OrderHistoryRow[], range: "today" | "week", now: Date): EarningsSummary {
  const from = range === "today" ? startOfDay(now) : startOfWeek(now);
  const out: EarningsSummary = { total: 0, jobs: 0, parcels: 0, food: 0, byDay: [0, 0, 0, 0, 0, 0, 0] };
  for (const r of rows) {
    if (!isRiderRow(r)) continue;
    const fare = paidFare(r);
    if (fare == null) continue;
    const at = new Date(r.createdAt);
    if (Number.isNaN(at.getTime()) || at < from || at > now) continue;
    out.total += fare;
    out.jobs += 1;
    if (r.orderType === "merchant") out.food += 1;
    else out.parcels += 1;
    out.byDay[(at.getDay() + 6) % 7]! += fare;
  }
  out.total = Math.round(out.total * 100) / 100;
  return out;
}

/** "TODAY" / "YESTERDAY" / "28 SEP" — the uppercase day-group label. */
export function dayLabel(at: Date, now: Date, today: string, yesterday: string): string {
  const d = startOfDay(at).getTime();
  const t = startOfDay(now).getTime();
  if (d === t) return today;
  if (d === t - 86_400_000) return yesterday;
  return at.toLocaleDateString("en-GB", { day: "numeric", month: "short" }).toUpperCase();
}

/** Group already-sorted (newest first) items by local day, keeping order. */
export function groupByDay<T>(items: readonly T[], at: (t: T) => Date, now: Date, today: string, yesterday: string): { label: string; items: T[] }[] {
  const groups: { label: string; items: T[] }[] = [];
  for (const it of items) {
    const label = dayLabel(at(it), now, today, yesterday);
    const last = groups[groups.length - 1];
    if (last && last.label === label) last.items.push(it);
    else groups.push({ label, items: [it] });
  }
  return groups;
}
