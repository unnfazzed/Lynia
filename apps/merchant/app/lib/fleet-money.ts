"use client";

import { useCallback, useEffect, useState } from "react";
import type { FleetBill, FleetBillsResponse, FleetRidesResponse } from "@lynia/shared";
import { ApiError } from "./api-client";
import { getFleetBills, getFleetRides } from "./fleet-api";
import { addDaysToKey, hm, localDay } from "./money-view";
import { money } from "./orders-view";
import { OBM } from "./own-bikers-copy";

/**
 * OB-M14 · Money · This week, FLEET RIDES (Own bikers v1, ledger D-117): the owner's bill cards, then this branch's
 * fleet rides with the other branches' totals. Money is owner-only, so the bill card always shows here.
 */

export type FleetMoney = { rides: FleetRidesResponse; bills: FleetBillsResponse };

/** `undefined` while reading; `null` = no Own bikers here (the section isn't drawn); `fail` = couldn't load and
 *  nothing cached; `ready` with `cachedAt` = offline, showing the last good read ("as of 12:40"). */
export type FleetMoneyRead = undefined | null | { status: "fail" } | { status: "ready"; data: FleetMoney; cachedAt?: string };

const CACHE_KEY = "lynia.merchant.fleetMoney";

type Cached = { merchantId: string; at: string; data: FleetMoney };

function readCache(merchantId: string): Cached | null {
  try {
    const raw = window.localStorage.getItem(CACHE_KEY);
    const c = raw ? (JSON.parse(raw) as Cached) : null;
    return c && c.merchantId === merchantId && c.data?.rides && c.data?.bills ? c : null;
  } catch {
    return null;
  }
}

function writeCache(c: Cached | null): void {
  try {
    if (c) window.localStorage.setItem(CACHE_KEY, JSON.stringify(c));
    else window.localStorage.removeItem(CACHE_KEY);
  } catch {
    // Private mode or storage off: offline just shows "Couldn't load fleet rides".
  }
}

/** Loads the branch's fleet rides and the owner's bills together. A business without Own bikers (409 `fleet_off`, or
 *  503 while the merchant vertical is off) reads as `null`; offline falls back to the last good read for this branch. */
export function useFleetMoney(merchantId: string | null, enabled: boolean): { read: FleetMoneyRead; reload: () => void } {
  const [read, setRead] = useState<FleetMoneyRead>(undefined);
  const load = useCallback(() => {
    if (!merchantId) return;
    let cancelled = false;
    setRead(undefined);
    Promise.all([getFleetRides(), getFleetBills()]).then(
      ([rides, bills]) => {
        if (cancelled) return;
        const data = { rides, bills };
        writeCache({ merchantId, at: new Date().toISOString(), data });
        setRead({ status: "ready", data });
      },
      (err: unknown) => {
        if (cancelled) return;
        const status = err instanceof ApiError ? err.status : -1;
        if (status === 409 || status === 503 || status === 404) {
          writeCache(null);
          return setRead(null);
        }
        const cached = status === 0 ? readCache(merchantId) : null;
        setRead(cached ? { status: "ready", data: cached.data, cachedAt: cached.at } : { status: "fail" });
      },
    );
    return () => {
      cancelled = true;
    };
  }, [merchantId]);
  useEffect(() => (enabled ? load() : undefined), [enabled, load]);
  return { read, reload: load };
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** "21–27 Sep", "28 Sep–4 Oct": a bill's week, from Harare date keys. */
export function billWeek(start: string, end: string): string {
  const a = localDay(start);
  const b = localDay(end);
  const left = a.getMonth() === b.getMonth() ? `${a.getDate()}` : `${a.getDate()} ${MONTHS[a.getMonth()]}`;
  return `${left}–${b.getDate()} ${MONTHS[b.getMonth()]}`;
}

/** "Fri" when it falls in the coming week, else "Fri 2 Oct". */
export function dueLabel(due: string, today: string): string {
  const d = localDay(due);
  const ahead = Math.round((d.getTime() - localDay(today).getTime()) / 86_400_000);
  return ahead >= 0 && ahead < 7 ? DAYS[d.getDay()]! : `${DAYS[d.getDay()]} ${d.getDate()} ${MONTHS[d.getMonth()]}`;
}

export type BillCard = { key: string; state: FleetBill["state"]; text: string; daysOverdue: number };

/**
 * The bill cards, oldest first: every closed bill still owed (overdue in danger), then this week's running bill (due
 * the Friday after the week ends). When nothing closed is owed, last week's paid bill shows with the mint pill.
 */
export function billCards(bills: FleetBillsResponse, weekStart: string, today: string): BillCard[] {
  const owed = bills.bills.filter((b) => b.state !== "paid").reverse();
  const cards: BillCard[] = owed.map((b) => ({
    key: b.id,
    state: b.state,
    text: OBM.bill(billWeek(b.periodStart, b.periodEnd), money(Number(b.total)), b.dueOn ? dueLabel(b.dueOn, today) : "—"),
    daysOverdue: b.daysOverdue,
  }));
  const last = bills.bills[0];
  if (cards.length === 0 && last?.state === "paid" && last.periodEnd === addDaysToKey(weekStart, -1)) {
    cards.push({
      key: last.id,
      state: "paid",
      text: OBM.bill(billWeek(last.periodStart, last.periodEnd), money(Number(last.total)), last.dueOn ? dueLabel(last.dueOn, today) : "—"),
      daysOverdue: 0,
    });
  }
  if (bills.thisWeek.rides > 0 || Number(bills.thisWeek.total) !== 0) {
    const weekEnd = addDaysToKey(weekStart, 6);
    cards.push({
      key: `week-${weekStart}`,
      state: "unpaid",
      text: OBM.bill(billWeek(weekStart, weekEnd), money(Number(bills.thisWeek.total)), dueLabel(addDaysToKey(weekEnd, 5), today)),
      daysOverdue: 0,
    });
  }
  return cards;
}

export type RideRow = { key: string; text: string; amount: string; muted: boolean; credit: boolean };

const signed = (fee: number) => (fee < 0 ? `−${money(-fee)}` : money(fee));

/** "#B204 · Tendai · 12:40 $1.50"; a correction "Credit · #B190 · wrong fee −$1.50". A ride credited back to nothing
 *  that week is muted with its credit (it isn't counted in the branch line). */
export function rideRows(rides: FleetRidesResponse): RideRow[] {
  const net = new Map<string, number>();
  for (const l of rides.lines) if (l.orderId) net.set(l.orderId, (net.get(l.orderId) ?? 0) + Math.round(Number(l.fee) * 100));
  return rides.lines.map((l, i) => {
    const fee = Number(l.fee);
    const credited = l.orderId != null && (net.get(l.orderId) ?? 0) <= 0;
    if (l.kind === "adjustment") {
      return {
        key: `adj-${i}`,
        text: [fee < 0 ? OBM.credit : null, l.ref, l.reason].filter(Boolean).join(" · "),
        amount: signed(fee),
        muted: credited || fee < 0,
        credit: fee < 0,
      };
    }
    return { key: `ride-${i}`, text: [l.ref, l.biker, hm(l.at)].filter(Boolean).join(" · "), amount: signed(fee), muted: credited, credit: false };
  });
}

/** The branch lines: this branch first (from its own ride list), then the owner's other branches this week. */
export function branchLines(data: FleetMoney, merchantId: string, name: string): Array<{ key: string; text: string; mine: boolean }> {
  const others = (data.bills.thisWeek.branches ?? []).filter((b) => b.merchantId !== merchantId);
  const mine = data.bills.thisWeek.branches?.find((b) => b.merchantId === merchantId)?.name ?? name;
  return [
    { key: merchantId, text: OBM.branchLine(mine, data.rides.rides, money(Number(data.rides.total))), mine: true },
    ...others.map((b) => ({ key: b.merchantId, text: OBM.branchLine(b.name, b.rides, money(Number(b.total))), mine: false })),
  ];
}

/** No fleet rides or corrections at any branch this week: "No fleet rides this week" in place of the branch lines. */
export function noFleetRides(data: FleetMoney): boolean {
  return data.rides.lines.length === 0 && (data.bills.thisWeek.branches ?? []).length === 0;
}

/** "Offline · showing this week as of 12:40". */
export const cachedLine = (at: string) => OBM.cachedWeek(hm(at));
