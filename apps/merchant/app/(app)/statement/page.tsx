"use client";

import { useCallback, useEffect, useState } from "react";
import type { MerchantEndOfDaySummaryResponse, MerchantWeeklyStatementResponse } from "@lynia/shared";
import { Kitchen } from "../../components/Kitchen";
import { useKitchenConnection } from "../../components/KitchenConnectionProvider";
import { RetryableError } from "../../components/RetryableError";
import { cardStyle } from "../../components/queue/styles";
import { ApiError, redirectIfSessionExpired } from "../../lib/api-client";
import { formatMoney } from "../../lib/money-input";
import { getTodaySummary, getWeeklyStatement } from "../../lib/orders-api";

type LoadState =
  | { status: "loading" }
  | { status: "ready"; today: MerchantEndOfDaySummaryResponse; statement: MerchantWeeklyStatementResponse }
  | { status: "error"; message: string };

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div style={{ ...cardStyle, flex: 1 }}>
      <div style={{ fontSize: 12.5, fontWeight: 700, color: "var(--muted)" }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 800, marginTop: 4, fontVariantNumeric: "tabular-nums" }}>{value}</div>
      {sub && <div style={{ fontSize: 11.5, color: "var(--muted)", marginTop: 2 }}>{sub}</div>}
    </div>
  );
}

/**
 * M4·5 weekly statement + M4·6 end-of-day summary (E3, N-13). Read-only — the automatic exits
 * (N-23 end-of-day close, per-order confirms) already happened elsewhere; this page just reports.
 */
export default function StatementPage() {
  const { signOut } = useKitchenConnection();
  const [state, setState] = useState<LoadState>({ status: "loading" });

  const refresh = useCallback(() => {
    let cancelled = false;
    setState({ status: "loading" });
    Promise.all([getTodaySummary(), getWeeklyStatement()])
      .then(([today, statement]) => {
        if (!cancelled) setState({ status: "ready", today, statement });
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        if (redirectIfSessionExpired(err, signOut)) return;
        setState({ status: "error", message: err instanceof ApiError ? err.message : "Couldn't load your statement." });
      });
    return () => {
      cancelled = true;
    };
  }, [signOut]);

  useEffect(() => refresh(), [refresh]);

  return (
    <Kitchen active="money">
      <div style={{ padding: 20, display: "flex", flexDirection: "column", gap: 24, overflow: "auto", height: "100%" }}>
        {state.status === "loading" && <div style={{ color: "var(--muted)", fontSize: 14 }}>Loading your statement…</div>}

        {state.status === "error" && <RetryableError message={state.message} onRetry={refresh} />}

        {state.status === "ready" && (
          <>
            <section>
              <div style={{ fontSize: 19, fontWeight: 800, marginBottom: 12 }}>Today&apos;s summary</div>
              <div style={{ display: "flex", gap: 14, flexWrap: "wrap" }}>
                <Stat label="Delivered" value={String(state.today.delivered)} />
                <Stat label="Cash returned to you" value={`$${formatMoney(state.today.cashTaken)}`} sub="confirmed on your count screen" />
                <Stat label="Mobile money" value={`$${formatMoney(state.today.walletTaken)}`} />
                <Stat label="Rejected" value={String(state.today.rejected)} />
                <Stat label="Average prep" value={state.today.averagePrepMinutes != null ? `${Math.round(state.today.averagePrepMinutes)} min` : "—"} />
              </div>
            </section>

            <section>
              <div style={{ fontSize: 19, fontWeight: 800, marginBottom: 12 }}>Weekly statement</div>
              <div style={{ display: "flex", gap: 14, marginBottom: 16, flexWrap: "wrap" }}>
                <Stat label="Orders delivered" value={String(state.statement.ordersDelivered)} />
                <Stat label="Food sales" value={`$${formatMoney(state.statement.foodSalesTotal)}`} sub="paid to you directly" />
                <Stat
                  label="Commission charged"
                  value={`$${formatMoney(state.statement.commissionCharged)}`}
                  sub={`${state.statement.commissionRatePct}% at launch`}
                />
                <Stat
                  label={`Would have been (${state.statement.illustrativeRatePct}%)`}
                  value={`$${formatMoney(state.statement.illustrativeCommission)}`}
                  sub="shown for transparency"
                />
              </div>

              {state.statement.cookedFoodLossTotal > 0 && (
                <div style={{ display: "flex", gap: 10, padding: "12px 16px", background: "var(--highlight-wash)", borderRadius: 12, marginBottom: 16 }}>
                  <div style={{ fontSize: 13, color: "var(--highlight-ink)", lineHeight: 1.5 }}>
                    <b>${formatMoney(state.statement.cookedFoodLossTotal)}</b> of cooked food this week couldn&apos;t find a rider (D-34) —
                    LyniaGo covers that loss, not you.
                  </div>
                </div>
              )}

              <div style={{ ...cardStyle, padding: "4px 18px" }}>
                {state.statement.lineItems.length === 0 && (
                  <div style={{ padding: "16px 0", fontSize: 13.5, color: "var(--muted)" }}>No delivered orders in the last 7 days yet.</div>
                )}
                {state.statement.lineItems.map((li) => (
                  <div
                    key={li.orderId}
                    style={{ display: "flex", alignItems: "center", gap: 16, padding: "12px 0", borderBottom: "1px solid var(--line)", fontSize: 14, fontVariantNumeric: "tabular-nums" }}
                  >
                    <span style={{ fontWeight: 700, minWidth: 90 }}>#{li.orderId.slice(0, 8).toUpperCase()}</span>
                    <span style={{ color: "var(--muted)", minWidth: 140 }}>{new Date(li.deliveredAt).toLocaleString()}</span>
                    <span style={{ flex: 1, fontSize: 12, fontWeight: 700, color: "var(--muted)" }}>{li.paymentMethod === "wallet" ? "WALLET" : "CASH"}</span>
                    <span style={{ fontWeight: 700 }}>${formatMoney(li.amount)}</span>
                    <span style={{ color: "var(--muted)", minWidth: 70, textAlign: "right" }}>−${formatMoney(li.commission)}</span>
                  </div>
                ))}
              </div>
              <div style={{ display: "flex", gap: 10, marginTop: 14, padding: "12px 16px", background: "var(--surface)", borderRadius: 12 }}>
                <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.5 }}>
                  Commission is {state.statement.commissionRatePct}% while we grow the corridor. When a rate starts, you&apos;ll
                  see it here for a full week before the first charge — never as a surprise deduction.
                </div>
              </div>
            </section>
          </>
        )}
      </div>
    </Kitchen>
  );
}
