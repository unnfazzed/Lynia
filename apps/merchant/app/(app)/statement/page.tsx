"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import type { MerchantEndOfDaySummaryResponse, MerchantWeeklyStatementResponse } from "@lynia/shared";
import { Icon } from "../../components/icons";
import { Kitchen } from "../../components/Kitchen";
import { useKitchenConnection } from "../../components/KitchenConnectionProvider";
import { Segmented } from "../../components/m/Segmented";
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

const OUTCOME: Record<Line["outcome"], string> = {
  delivered: "Delivered",
  not_delivered: "Not delivered",
  rejected: "Rejected",
  cancelled: "Cancelled",
  in_progress: "In progress",
};

function hm(iso: string): string {
  const d = new Date(iso);
  return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}

function dayHm(iso: string): string {
  return `${new Date(iso).toLocaleDateString(undefined, { weekday: "short" })} ${hm(iso)}`;
}

/**
 * C3 · Money (packages/design/handoff/merchant-mobile, ledger D-48). A mint header with Today / This
 * week, "Sales · 7 orders" and the total; then a gold row per order whose cash is overdue ("$9.50
 * overdue · #A098 · Tino · due 11:40", opening that order's cash-back screen), and the Orders list
 * (#id · time / how it ended, the amount on the right). Owner-only, like the tab.
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
  const lines: { id: string; title: string; sub: string; amount: number }[] = !ready
    ? []
    : period === "today"
      ? (ready.today.lines ?? []).map((l) => ({ id: l.orderId, title: `${orderLabel({ id: l.orderId })} · ${hm(l.at)}`, sub: OUTCOME[l.outcome], amount: l.amount }))
      : ready.week.lineItems.map((li) => ({ id: li.orderId, title: `${orderLabel({ id: li.orderId })} · ${dayHm(li.deliveredAt)}`, sub: "Delivered", amount: li.amount }));

  return (
    <Kitchen active="money">
      <div className="m-hd">
        <div className="m-hdt">
          <div className="m-biz">
            <b style={{ fontSize: 24 }}>Money</b>
          </div>
        </div>
        {state.status !== "staff" && (
          <div style={{ marginTop: 12 }}>
            <Segmented
              label="Period"
              value={period}
              onChange={setPeriod}
              options={[
                { value: "today", label: "Today" },
                { value: "week", label: "This week" },
              ]}
            />
          </div>
        )}
        {ready && (
          <div style={{ marginTop: 14 }}>
            <div style={{ fontSize: 13.5, fontWeight: 600, color: "var(--muted)" }}>
              Sales · {count} {count === 1 ? "order" : "orders"}
            </div>
            <b className="m-num" style={{ fontSize: 34, fontWeight: 700, letterSpacing: "-0.01em" }}>
              {money(total)}
            </b>
          </div>
        )}
      </div>

      <div className="m-bd" style={{ paddingTop: 12 }}>
        {state.status === "loading" && <div className="m-hint">Loading…</div>}
        {state.status === "error" && <RetryableError message={state.message} onRetry={refresh} />}
        {state.status === "staff" && <OwnerOnlyNotice>Only the owner sees the money.</OwnerOnlyNotice>}

        {ready &&
          (ready.today.overdue ?? []).map((o) => (
            <Link key={o.orderId} href={o.kind === "booking" ? `/deliveries/${o.orderId}` : `/queue/${o.orderId}`} className="m-overdue">
              <Icon name="circle-alert" size={20} color="var(--highlight-ink)" />
              <div className="m-t">
                <b className="m-num">{money(o.amount)} overdue</b>
                <span className="m-num">
                  {[orderLabel({ id: o.orderId }), o.riderName, `due ${hm(o.dueAt)}`].filter(Boolean).join(" · ")}
                </span>
              </div>
              <Icon name="chevron-right" size={18} color="var(--muted)" />
            </Link>
          ))}

        {ready && (
          <>
            <div className="m-sec">Orders</div>
            <div>
              {lines.length === 0 && <div className="m-hint">{period === "today" ? "No orders yet today" : "No delivered orders this week"}</div>}
              {lines.map((l) => (
                <Link key={l.id} href={`/queue/${l.id}`} className="m-li">
                  <div className="m-t">
                    <b className="m-num">{l.title}</b>
                    <span>{l.sub}</span>
                  </div>
                  <b className="m-num" style={{ fontSize: 16, fontWeight: 700, color: l.amount === 0 ? "var(--muted)" : undefined }}>
                    {money(l.amount)}
                  </b>
                </Link>
              ))}
            </div>
          </>
        )}
      </div>
    </Kitchen>
  );
}
