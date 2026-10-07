/** Merchant v2 T2 / T2b (follow-ups 2026-10-05, ledger D-77): the Money tab's rows, day lines and dates. */
import type { MerchantEndOfDaySummaryResponse, MerchantRejectionReasonCode, MerchantWeekSummaryResponse } from "@lynia/shared";
import { money } from "./orders-view";

type Line = NonNullable<MerchantEndOfDaySummaryResponse["lines"]>[number];
type Tone = "credit" | "late" | "muted" | "plain";

/** T2's "You couldn't take it · Too busy": the reason the merchant picked, as the ledger reads it. */
const REJECTED_REASON: Partial<Record<MerchantRejectionReasonCode, string>> = {
  out_of_ingredient: "Out of an ingredient",
  out_of_stock: "Out of stock",
  too_busy: "Too busy",
  closing_soon: "Closing soon",
};

/** T2's ledger row for one of the day's orders: what happened, its figure, and how it reads. */
export function dayRow(l: Line): { sub: string; amount: string; tone: Tone } {
  if (l.outcome === "delivered") {
    if (l.cash === "in") return { sub: "Delivered · cash back in", amount: `+${money(l.amount)}`, tone: "credit" };
    if (l.cash === "late") return { sub: "Delivered · cash late", amount: money(l.amount), tone: "late" };
    if (l.cash === "due") return { sub: ["Delivered · cash on its way", l.dueAt && `back by ${hm(l.dueAt)}`].filter(Boolean).join(" · "), amount: money(l.amount), tone: "plain" };
    return { sub: "Delivered", amount: `+${money(l.amount)}`, tone: "credit" };
  }
  if (l.outcome === "in_progress") return { sub: "In progress", amount: money(l.amount), tone: "plain" };
  // An order that earned nothing reads as what happened and "No sale", never "$0.00" (BRIEF §9, T2).
  if (l.outcome === "rejected") {
    // Nobody answered before the ring ran out (the accept sweep's `shop_closed`, or an unconfirmed kitchen).
    if (l.reason === "shop_closed" || l.reason === "kitchen_unconfirmed") return { sub: "Missed · no answer in time", amount: "No sale", tone: "muted" };
    const why = l.reason ? REJECTED_REASON[l.reason] : undefined;
    return { sub: why ? `You couldn't take it · ${why}` : "You couldn't take it", amount: "No sale", tone: "muted" };
  }
  if (l.outcome === "cancelled") return { sub: "Cancelled", amount: "No sale", tone: "muted" };
  return { sub: "Not delivered", amount: "No sale", tone: "muted" };
}

type Day = MerchantWeekSummaryResponse["days"][number];

/** T2b's day sub-line: late cash first (gold), then orders not taken, then whether the cash is all in. */
export function daySub(d: Day): { text: string; late: boolean } {
  const n = `${d.orders} ${d.orders === 1 ? "order" : "orders"}`;
  if (d.cashLate > 0) return { text: `${n} · ${money(d.cashLate)} cash late`, late: true };
  if (d.rejected > 0) return { text: `${n} · ${d.rejected} you couldn't take`, late: false };
  if (d.cashDue > 0) return { text: `${n} · cash on its way`, late: false };
  return { text: d.orders > 0 ? `${n} · all cash in` : n, late: false };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function localDay(key: string): Date {
  const [y = 0, m = 1, d = 1] = key.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** "Sat 3 Oct". */
export function dayTitle(key: string): string {
  const d = localDay(key);
  return `${WEEKDAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

const DAY_KEY = /^\d{4}-\d{2}-\d{2}$/;

/** MJ-RM7 (review 2026-10-07): `n` calendar days after a `YYYY-MM-DD` key — pure date arithmetic, so the
 *  browser's own time zone never moves a day. */
export function addDaysToKey(key: string, n: number): string {
  const [y = 0, m = 1, d = 1] = key.split("-").map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${String(t.getUTCMonth() + 1).padStart(2, "0")}-${String(t.getUTCDate()).padStart(2, "0")}`;
}

/** "28 SEP–4 OCT": Monday to Sunday of the week (T2b's header). Takes the week's Monday as a `YYYY-MM-DD`
 *  key (the server's Harare `startKey`); an older API's ISO `start` is read with local getters, as before. */
export function weekRange(start: string): string {
  const key = DAY_KEY.test(start) ? start : dayKey(new Date(start));
  const a = localDay(key);
  const b = localDay(addDaysToKey(key, 6));
  const left = a.getMonth() === b.getMonth() ? `${a.getDate()}` : `${a.getDate()} ${MONTHS[a.getMonth()]}`;
  return `${left}–${b.getDate()} ${MONTHS[b.getMonth()]}`.toUpperCase();
}

export function hm(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
