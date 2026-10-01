import type { WalletEntry } from "@lynia/shared";
import type { OrderHistoryRow } from "../api/orders";
import { isRiderRow, paidFare, type ServiceFilter } from "./rider-earnings";

/**
 * The Money tab's one history list (Rider v2 M1, ledger D-54): the fares the rider was paid (green
 * credits, from their own delivered jobs) merged with the commission wallet's entries (commission
 * debits, top-ups, grace and adjustments), newest first. The filter narrows to one service: a fare
 * belongs to its job's service; a commission debit is parcel-sourced today (see wallet-ledger.ts);
 * wallet-level entries (top-up, grace, adjustment) only show under "All".
 */
export interface MoneyItem {
  id: string;
  at: Date;
  kind: "fare" | WalletEntry["type"];
  service: "parcel" | "food" | null;
  amount: number;
  /** For a fare: the job's route; for a wallet entry: the server's title. */
  title: string;
  /** For a commission row, the rate it was charged at. */
  ratePct?: number;
}

export function buildMoneyFeed(history: readonly OrderHistoryRow[], ledger: readonly WalletEntry[]): MoneyItem[] {
  const out: MoneyItem[] = [];
  for (const r of history) {
    if (!isRiderRow(r)) continue;
    const fare = paidFare(r);
    if (fare == null) continue;
    const at = new Date(r.createdAt);
    if (Number.isNaN(at.getTime())) continue;
    const food = r.orderType === "merchant";
    const from = food ? r.merchantName || r.pickup.landmark : r.pickup.landmark;
    out.push({ id: `fare:${r.id}`, at, kind: "fare", service: food ? "food" : "parcel", amount: fare, title: `${from} → ${r.dropoff.landmark}` });
  }
  for (const e of ledger) {
    const at = new Date(e.createdAt);
    if (Number.isNaN(at.getTime())) continue;
    out.push({ id: `w:${e.id}`, at, kind: e.type, service: e.type === "commission" ? "parcel" : null, amount: e.amount, title: e.title, ratePct: e.ratePct });
  }
  return out.sort((a, b) => b.at.getTime() - a.at.getTime());
}

export function filterMoneyFeed(items: readonly MoneyItem[], f: ServiceFilter): MoneyItem[] {
  return f === "all" ? [...items] : items.filter((i) => i.service === f);
}

/**
 * Wallet entries older than the oldest fare we hold would interleave wrongly once the 50-row history
 * cap is hit; the feed only shows fares inside the window the history actually covers. Fares are cut
 * at that boundary, wallet entries never are (they page in as the rider scrolls).
 */
export function oldestHistoryAt(history: readonly OrderHistoryRow[]): Date | null {
  let min: number | null = null;
  for (const r of history) {
    const t = Date.parse(r.createdAt);
    if (Number.isFinite(t) && (min == null || t < min)) min = t;
  }
  return min == null ? null : new Date(min);
}
