"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { MerchantEndOfDaySummaryResponse, MerchantWeekSummaryResponse } from "@lynia/shared";
import { Icon } from "../../components/icons";
import { Kitchen } from "../../components/Kitchen";
import { useKitchenConnection } from "../../components/KitchenConnectionProvider";
import { OwnerOnlyNotice } from "../../components/OwnerOnlyNotice";
import { RetryableError } from "../../components/RetryableError";
import { ApiError, redirectIfSessionExpired } from "../../lib/api-client";
import { loadBusiness } from "../../lib/business";
import { getTodaySummary, getWeekSummary } from "../../lib/orders-api";
import { addDaysToKey, dayKey, dayRow, daySub, dayTitle, hm, weekRange } from "../../lib/money-view";
import { money, orderLabel } from "../../lib/orders-view";
import { bookingHref, orderHref } from "../../lib/routes";

type LoadState =
  | { status: "loading" }
  | { status: "ready"; today: MerchantEndOfDaySummaryResponse; week: MerchantWeekSummaryResponse }
  // L4: a Staff member who reached the owner's money by an old link.
  | { status: "staff" }
  | { status: "error"; message: string };

/** Today, this week, or (T2b) one earlier day of the week opened in the Today layout. */
type Period = "today" | "week" | { date: string; summary: MerchantEndOfDaySummaryResponse | null };

/**
 * T2 · Money (Merchant v2, packages/design/handoff/merchant-v2, ledger D-77) over D-48's C3. The mint top
 * card: "Money", Today / This week (the chosen side filled), "SALES · 7 ORDERS" and the total. Then a gold
 * card per order whose cash is late ("$9.50 cash is late · #A098 · Tino · was due 11:40") with a Call
 * button for the rider, and the ledger: cash back in is green "+$12.00", cash on its way "$8.00" with when it's
 * back, late cash a gold sub-line, and an order the merchant couldn't take (or missed) "No sale", never
 * "$0.00". This week (T2b, follow-ups 2026-10-05) is the week's bars and one row per day, newest first; a day
 * opens in the Today layout. Owner-only, like the tab.
 */
export default function MoneyPage() {
  const { signOut } = useKitchenConnection();
  const [state, setState] = useState<LoadState>({ status: "loading" });
  const [period, setPeriod] = useState<Period>("today");

  const refresh = useCallback(() => {
    let cancelled = false;
    setState({ status: "loading" });
    const load = async (): Promise<LoadState> => {
      if ((await loadBusiness())?.myRole === "staff") return { status: "staff" };
      const [today, week] = await Promise.all([getTodaySummary(), getWeekSummary()]);
      return { status: "ready", today, week };
    };
    load()
      .then((next) => {
        if (!cancelled) setState(next);
      })
      .catch((err: unknown) => {
        if (cancelled || redirectIfSessionExpired(err, signOut)) return;
        setState({ status: "error", message: err instanceof ApiError ? err.message : "Couldn't load your money." });
      });
    return () => {
      cancelled = true;
    };
  }, [signOut]);

  useEffect(() => refresh(), [refresh]);

  const ready = state.status === "ready" ? state : null;
  // MJ-RM7 (review): the merchant's day is the server's Harare date; the browser's own day only with an older API.
  const todayKey = ready?.today.dateKey ?? dayKey(new Date());
  const openDay = (date: string) => {
    if (date === todayKey) return setPeriod("today");
    setPeriod({ date, summary: null });
    getTodaySummary(date)
      .then((summary) => setPeriod((p) => (typeof p === "object" && p.date === date ? { date, summary } : p)))
      .catch((err: unknown) => {
        if (redirectIfSessionExpired(err, signOut)) return;
        setPeriod("week");
      });
  };

  // The day on screen in the Today layout: today, or the week's day that was tapped.
  const day = !ready ? null : period === "today" ? ready.today : period === "week" ? null : period.summary;
  const count = ready ? (period === "week" ? ready.week.orders : (day?.orders ?? day?.delivered ?? 0)) : 0;
  const total = ready ? (period === "week" ? ready.week.sales : (day?.sales ?? 0)) : 0;
  const lines = (day?.lines ?? []).map((l) => ({ id: l.orderId, title: `${orderLabel({ id: l.orderId })} · ${hm(l.at)}`, ...dayRow(l) }));
  const tab = period === "today" ? "today" : "week";
  const maxSales = ready ? Math.max(0, ...ready.week.days.map((d) => d.sales)) : 0;
  // MJ-RM7 (review): the week's Monday as a Harare date key — bars and range come from keys, never from
  // `week.start` (Harare midnight, the day before in a UTC browser) read with local getters.
  const weekStartKey = ready ? (ready.week.startKey ?? dayKey(new Date(ready.week.start))) : null;

  return (
    <Kitchen active="money">
      <div className="m-hd">
        <b className="m-tabtitle">Money</b>
        {state.status !== "staff" && (
          <div className="m-period" role="tablist" aria-label="Period">
            {(["today", "week"] as const).map((p) => (
              <button key={p} type="button" role="tab" aria-selected={tab === p} onClick={() => setPeriod(p)}>
                {p === "today" ? "Today" : "This week"}
              </button>
            ))}
          </div>
        )}
        {ready && (period !== "today" && period !== "week" ? period.summary : true) && (
          <div className="m-salesbig">
            <span>
              SALES · {count} {count === 1 ? "ORDER" : "ORDERS"}
              {period === "week" && weekStartKey && ` · ${weekRange(weekStartKey)}`}
            </span>
            <b className="m-num">{money(total)}</b>
          </div>
        )}
      </div>

      <div className="m-bd" style={{ paddingTop: 16 }}>
        {(state.status === "loading" || (typeof period === "object" && !period.summary)) && <div className="m-hint">Loading…</div>}
        {state.status === "error" && <RetryableError message={state.message} onRetry={refresh} />}
        {state.status === "staff" && <OwnerOnlyNotice>Only the owner sees the money.</OwnerOnlyNotice>}

        {ready &&
          period === "today" &&
          (ready.today.overdue ?? []).map((o) => (
            <div key={o.orderId} className="m-latecash">
              <Link href={o.kind === "booking" ? bookingHref(o.orderId) : orderHref(o.orderId)}>
                <Icon name="banknote" size={20} color="var(--highlight-ink)" />
                <div>
                  <b className="m-num">{money(o.amount)} cash is late</b>
                  <span className="m-num">{[orderLabel({ id: o.orderId }), o.riderName, `was due ${hm(o.dueAt)}`].filter(Boolean).join(" · ")}</span>
                </div>
              </Link>
              {o.riderPhone && (
                <a href={`tel:${o.riderPhone}`} className="m-callpill" aria-label={`Call ${o.riderName ?? "the rider"}`}>
                  <Icon name="phone" size={16} />
                  Call
                </a>
              )}
            </div>
          ))}

        {ready && period === "week" && weekStartKey && (
          <>
            <div className="m-weekbars" aria-hidden>
              {Array.from({ length: 7 }, (_, i) => {
                const key = addDaysToKey(weekStartKey, i);
                const row = ready.week.days.find((x) => x.date === key);
                const h = row && maxSales > 0 ? Math.round((row.sales / maxSales) * 56) : 0;
                return (
                  <div key={i} data-today={key === todayKey || undefined}>
                    <span style={{ height: h }} />
                    <i>{"MTWTFSS"[i]}</i>
                  </div>
                );
              })}
            </div>
            <div className="m-weekdays">
              {[...ready.week.days].reverse().map((d) => {
                const sub = daySub(d);
                return (
                  <button key={d.date} type="button" className="m-dayrow" onClick={() => openDay(d.date)}>
                    <div>
                      <b>
                        {dayTitle(d.date)}
                        {d.date === todayKey && " · today"}
                      </b>
                      <span className="m-num" data-late={sub.late || undefined}>
                        {sub.text}
                      </span>
                    </div>
                    <b className="m-num">{money(d.sales)}</b>
                    <Icon name="chevron-right" size={20} color="var(--muted)" />
                  </button>
                );
              })}
            </div>
          </>
        )}

        {ready && day && (
          <>
            <h2 className="m-bh">{typeof period === "object" ? dayTitle(period.date).toUpperCase() : "TODAY"}</h2>
            <div className="m-ledger">
              {lines.length === 0 && <div className="m-hint">{period === "today" ? "No orders yet today" : "No orders that day"}</div>}
              {lines.map((l) => (
                <Link key={l.id} href={orderHref(l.id)} className="m-lrow" data-tone={l.tone}>
                  <div>
                    <b className="m-num">{l.title}</b>
                    <span>{l.sub}</span>
                  </div>
                  <b className="m-num">{l.amount}</b>
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
    </Kitchen>
  );
}
