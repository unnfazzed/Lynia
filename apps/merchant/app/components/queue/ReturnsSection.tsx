"use client";

import { useState } from "react";
import type { MerchantOrderResponse } from "@lynia/shared";
import { formatMoney } from "../../lib/money-input";
import { NonReturnSheet, ReturnCashSheet } from "./PaymentConfirmSheet";
import { cardStyle, dangerGhostButtonStyle, disabledStyle, primaryButtonStyle } from "./styles";

function orderLabel(o: MerchantOrderResponse): string {
  return `#${o.id.slice(0, 8).toUpperCase()}`;
}

/**
 * E3/R-01 — a collect-and-return debt is open: the food already left unpaid and a rider owes the
 * cash back (M3·4, N-21). Rendered as its own non-blocking strip — mirrors M2·7's "never blocks the
 * board" rule, applied to the return leg instead of the payment lane. Not shown during a full-
 * viewport takeover (D-05/D-04/D-34 outrank it, same as every other ordinary card).
 */
export function ReturnsSection({
  orders,
  disabled,
  onConfirmReturnedCash,
  onConfirmGoodsReturned,
  onReportNonReturn,
}: {
  orders: readonly MerchantOrderResponse[];
  disabled: boolean;
  onConfirmReturnedCash: (orderId: string, amount: number) => Promise<void>;
  onConfirmGoodsReturned: (orderId: string) => Promise<void>;
  onReportNonReturn: (orderId: string, note?: string) => Promise<void>;
}) {
  const [openSheet, setOpenSheet] = useState<{ orderId: string; kind: "cash" | "non-return" } | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // LC-D03: "Confirm the food is back" has no sheet, so it needs its own per-order busy+error
  // state rather than firing as a bare `void` promise that swallows a network failure silently.
  const [goodsBackBusyId, setGoodsBackBusyId] = useState<string | null>(null);
  const [goodsBackErrors, setGoodsBackErrors] = useState<Record<string, string>>({});

  if (orders.length === 0) return null;
  const active = openSheet ? orders.find((o) => o.id === openSheet.orderId) : null;

  function close() {
    setOpenSheet(null);
    setError(null);
  }

  async function handleGoodsBack(orderId: string) {
    setGoodsBackBusyId(orderId);
    setGoodsBackErrors((prev) => {
      const rest = { ...prev };
      delete rest[orderId];
      return rest;
    });
    try {
      await onConfirmGoodsReturned(orderId);
    } catch (err) {
      setGoodsBackErrors((prev) => ({ ...prev, [orderId]: err instanceof Error ? err.message : "Something went wrong — try again." }));
    } finally {
      setGoodsBackBusyId(null);
    }
  }

  return (
    <div style={{ marginBottom: 18 }}>
      <div style={{ fontSize: 13, fontWeight: 800, color: "var(--muted)", marginBottom: 8 }}>
        CASH RETURNS · {orders.length}
      </div>
      <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
        {orders.map((o) => {
          const amount = Number(o.debtAmount ?? 0);
          const goodsBack = o.status === "undelivered";
          return (
            <div key={o.id} style={{ ...cardStyle, minWidth: 260, display: "flex", flexDirection: "column", gap: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                <div style={{ fontSize: 14.5, fontWeight: 800 }}>{orderLabel(o)}</div>
                <div style={{ fontSize: 16, fontWeight: 900, fontVariantNumeric: "tabular-nums" }}>${formatMoney(amount)}</div>
              </div>
              <div style={{ fontSize: 12.5, color: "var(--muted)" }}>
                {goodsBack ? "The food is back with you — confirm it." : "A rider is riding your food money back."}
              </div>
              <button
                type="button"
                onClick={() => (goodsBack ? void handleGoodsBack(o.id) : setOpenSheet({ orderId: o.id, kind: "cash" }))}
                disabled={disabled || goodsBackBusyId === o.id}
                style={{ ...primaryButtonStyle, padding: "10px 16px", fontSize: 13.5, ...disabledStyle(disabled || goodsBackBusyId === o.id) }}
              >
                {goodsBack ? (goodsBackBusyId === o.id ? "Confirming…" : "Confirm the food is back") : "Count the returned cash"}
              </button>
              {goodsBackErrors[o.id] && (
                <div style={{ fontSize: 12, color: "var(--danger-ink)", fontWeight: 700 }}>{goodsBackErrors[o.id]}</div>
              )}
              <button
                type="button"
                onClick={() => setOpenSheet({ orderId: o.id, kind: "non-return" })}
                disabled={disabled}
                style={{ ...dangerGhostButtonStyle, padding: "8px 14px", fontSize: 12.5, ...disabledStyle(disabled) }}
              >
                Rider hasn&apos;t come back
              </button>
            </div>
          );
        })}
      </div>

      {active && openSheet?.kind === "cash" && (
        <ReturnCashSheet
          orderLabel={orderLabel(active)}
          expectedAmount={Number(active.debtAmount ?? 0)}
          disabled={disabled}
          submitting={submitting}
          error={error}
          onCancel={close}
          onConfirm={(amount) => {
            setSubmitting(true);
            setError(null);
            onConfirmReturnedCash(active.id, amount)
              .then(close)
              .catch((err: unknown) => setError(err instanceof Error ? err.message : "Something went wrong"))
              .finally(() => setSubmitting(false));
          }}
        />
      )}

      {active && openSheet?.kind === "non-return" && (
        <NonReturnSheet
          orderLabel={orderLabel(active)}
          expectedAmount={Number(active.debtAmount ?? 0)}
          disabled={disabled}
          submitting={submitting}
          error={error}
          onCancel={close}
          onConfirm={(note) => {
            setSubmitting(true);
            setError(null);
            onReportNonReturn(active.id, note)
              .then(close)
              .catch((err: unknown) => setError(err instanceof Error ? err.message : "Something went wrong"))
              .finally(() => setSubmitting(false));
          }}
        />
      )}
    </div>
  );
}
