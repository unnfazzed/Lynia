"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { MerchantEndOfDaySummaryResponse, MerchantWeeklyStatementResponse } from "@lynia/shared";
import { Icon } from "../../components/icons";
import { Kitchen } from "../../components/Kitchen";
import { useKitchenConnection } from "../../components/KitchenConnectionProvider";
import { OwnerOnlyNotice } from "../../components/OwnerOnlyNotice";
import { RetryableError } from "../../components/RetryableError";
import { ApiError, redirectIfSessionExpired } from "../../lib/api-client";
import { loadBusiness } from "../../lib/business";
import { getTodaySummary, getWeeklyStatement } from "../../lib/orders-api";
import { money, orderLabel } from "../../lib/orders-view";

type LoadState =
  | { status: "loading" }
  | { status: "ready"; today: MerchantEndOfDaySummaryResponse; week: MerchantWeeklyStatementResponse }
  // L4: a Staff member who reached the owner's money by an old link.
  | { status: "staff" }
  | { status: "error"; message: string };

type Period = "today" | "week";

type Line = NonNullable<MerchantEndOfDaySummaryResponse["lines"]>[number];

/** T2's ledger row for one of today's orders: what happened, its figure, and how it reads. */
function todayRow(l: Line): { sub: string; amount: string; tone: "credit" | "late" | "muted" | "plain" } {
  if (l.outcome === "delivered") {
    if (l.cash === "in") return { sub: "Delivered · cash back in", amount: `+${money(l.amount)}`, tone: "credit" };
    if (l.cash === "late") return { sub: "Delivered · cash late", amount: money(l.amount), tone: "late" };
    if (l.cash === "due") return { sub: "Delivered · cash on its way back", amount: money(l.amount), tone: "plain" };
    return { sub: "Delivered", amount: `+${money(l.amount)}`, tone: "credit" };
  }
  if (l.outcome === "in_progress") return { sub: "In progress", amount: money(l.amount), tone: "plain" };
  // An order that earned nothing reads as what happened, never "$0.00" (BRIEF §9).
  if (l.outcome === "rejected") return { sub: "You couldn’t take it", amount: "—", tone: "muted" };
  if (l.outcome === "cancelled") return { sub: "Cancelled", amount: "—", tone: "muted" };
  return { sub: "Not delivered", amount: "—", tone: "muted" };
}

function hm(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function dayHm(iso: string): string {
  return `${new Date(iso).toLocaleDateString(undefined, { weekday: "short" })} ${hm(iso)}`;
}

/**
 * T2 · Money (Merchant v2, packages/design/handoff/merchant-v2, ledger D-77) over D-48's C3. The mint top
 * card: "Money", Today / This week (the chosen side filled), "SALES · 7 ORDERS" and the total. Then a gold
 * card per order whose cash is late ("$9.50 cash is late · #A098 · Tino · was due 11:40") with a Call
 * button for the rider, and the ledger: cash back in is green "+$12.00", late cash a gold sub-line, and an
 * order the merchant couldn't take reads "—", never "$0.00". Owner-only, like the tab.
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
      const [today, week] = await Promise.all([getTodaySummary(), getWeeklyStatement()]);
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
  const count = ready ? (period === "today" ? (ready.today.orders ?? ready.today.delivered) : ready.week.ordersDelivered) : 0;
  const total = ready ? (period === "today" ? (ready.today.sales ?? 0) : ready.week.foodSalesTotal) : 0;
  const lines: { id: string; title: string; sub: string; amount: string; tone: "credit" | "late" | "muted" | "plain" }[] = !ready
    ? []
    : period === "today"
      ? (ready.today.lines ?? []).map((l) => ({ id: l.orderId, title: `${orderLabel({ id: l.orderId })} · ${hm(l.at)}`, ...todayRow(l) }))
      : ready.week.lineItems.map((li) => ({
          id: li.orderId,
          title: `${orderLabel({ id: li.orderId })} · ${dayHm(li.deliveredAt)}`,
          sub: "Delivered",
          amount: `+${money(li.amount)}`,
          tone: "credit" as const,
        }));

  return (
    <Kitchen active="money">
      <div className="m-hd">
        <b className="m-tabtitle">Money</b>
        {state.status !== "staff" && (
          <div className="m-period" role="tablist" aria-label="Period">
            {(["today", "week"] as const).map((p) => (
              <button key={p} type="button" role="tab" aria-selected={period === p} onClick={() => setPeriod(p)}>
                {p === "today" ? "Today" : "This week"}
              </button>
            ))}
          </div>
        )}
        {ready && (
          <div className="m-salesbig">
            <span>
              SALES · {count} {count === 1 ? "ORDER" : "ORDERS"}
            </span>
            <b className="m-num">{money(total)}</b>
          </div>
        )}
      </div>

      <div className="m-bd" style={{ paddingTop: 16 }}>
        {state.status === "loading" && <div className="m-hint">Loading…</div>}
        {state.status === "error" && <RetryableError message={state.message} onRetry={refresh} />}
        {state.status === "staff" && <OwnerOnlyNotice>Only the owner sees the money.</OwnerOnlyNotice>}

        {ready &&
          (ready.today.overdue ?? []).map((o) => (
            <div key={o.orderId} className="m-latecash">
              <Link href={o.kind === "booking" ? `/deliveries/${o.orderId}` : `/queue/${o.orderId}`}>
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

        {ready && (
          <>
            <h2 className="m-bh">{period === "today" ? "TODAY" : "THIS WEEK"}</h2>
            <div className="m-ledger">
              {lines.length === 0 && <div className="m-hint">{period === "today" ? "No orders yet today" : "No delivered orders this week"}</div>}
              {lines.map((l) => (
                <Link key={l.id} href={`/queue/${l.id}`} data-tone={l.tone}>
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
