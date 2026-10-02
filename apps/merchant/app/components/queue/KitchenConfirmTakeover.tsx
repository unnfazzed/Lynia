"use client";

import { useEffect, useRef, useState } from "react";
import { RESTAURANTS_AUTO_ACCEPT, type MerchantOrderResponse } from "@lynia/shared";
import { ApiError } from "../../lib/api-client";
import { formatCountdown } from "../../lib/countdown";
import { money, orderLabel } from "../../lib/orders-view";
import { useNow } from "../../lib/use-now";
import { ORDER_FLOW as OF } from "../../lib/vocabulary";
import { Icon } from "../icons";
import { ConfirmSheet } from "../m/ConfirmSheet";
import { useToast } from "../m/Toast";
import { ChangeItemsSheet, editableLines, OrderLines } from "./order-parts";

/**
 * M1a · Ringing, auto-accepted (packages/design/handoff/order-flow-v2, of-screens-mrg.js `M1a`, ledger
 * D-59): an order LyniaGo accepted for the restaurant rings full screen like a new one until the kitchen
 * says it is making it. A white strip on the green takeover carries "NEW ORDER", the number and the
 * time left before the order cancels itself (`RESTAURANTS_AUTO_ACCEPT.autoCancelAfterMs` from placement,
 * shown only when the order says when it was placed); the sheet holds "LyniaGo accepted this for you",
 * the priced lines, the total, "Change items" and "Ready in 20 min", then "Got it, we're making it" and
 * "Can't take it" behind the confirm sheet. The handoff's "· Rudo" after the number is the customer's
 * name, which a merchant order doesn't carry, so it is left out.
 */
export function KitchenConfirmTakeover({
  active,
  disabled,
  onConfirm,
  onCancel,
  onEditItems,
  refetch,
}: {
  active: MerchantOrderResponse;
  disabled: boolean;
  onConfirm: (orderId: string) => Promise<void>;
  onCancel: (orderId: string) => Promise<void>;
  onEditItems: (orderId: string, lines: { itemId: string; quantity: number }[]) => Promise<void>;
  refetch: () => Promise<void>;
}) {
  const now = useNow();
  const toast = useToast();
  const [sheet, setSheet] = useState<null | "cancel" | "items">(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Same synchronous double-submit guard as the accept takeover: two taps in one tick both read
  // `submitting` as false.
  const submittingRef = useRef(false);

  // Back is blocked here: the alarm must be answered.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && sheet === null) toast("Confirm or decline to stop the alarm");
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [toast, sheet]);

  async function run(action: () => Promise<void>, done: string, failed: string) {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setError(null);
    try {
      await action();
      setSheet(null);
      toast(done);
    } catch (err) {
      setError(err instanceof ApiError || err instanceof Error ? err.message : failed);
      await refetch().catch(() => {});
    } finally {
      setSubmitting(false);
      submittingRef.current = false;
    }
  }

  const busy = disabled || submitting;
  const cancelAt = active.createdAt ? new Date(active.createdAt).getTime() + RESTAURANTS_AUTO_ACCEPT.autoCancelAfterMs : null;
  const total = active.merchantGoodsTotal ?? active.items.reduce((s, i) => s + i.priceUsd * i.quantity, 0);

  return (
    <div className="m-overlay" style={{ zIndex: 60 }}>
      <div className="m-overlay-frame" style={{ background: "var(--cta-fill)", display: "flex", flexDirection: "column" }} role="alertdialog" aria-label={`New order ${orderLabel(active)}`}>
        <div
          style={{
            margin: "calc(6px + env(safe-area-inset-top)) 12px 14px",
            background: "var(--bg)",
            borderRadius: 16,
            padding: "10px 14px",
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <Icon name="volume-2" size={22} color="var(--accent-text)" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <div className="m-cap" style={{ color: "var(--accent-text)" }}>
              {OF.newOrder}
            </div>
            <b style={{ fontSize: 17 }}>{orderLabel(active)}</b>
          </div>
          {cancelAt != null && (
            <b className="m-num" style={{ fontSize: 28 }} aria-label="Time left to confirm">
              {formatCountdown(cancelAt - now)}
            </b>
          )}
        </div>

        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
            background: "var(--bg)",
            borderRadius: "20px 20px 0 0",
            padding: "14px 16px calc(16px + env(safe-area-inset-bottom))",
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          <div style={{ display: "flex", gap: 10, alignItems: "flex-start", background: "var(--accent-wash)", borderRadius: 12, padding: "10px 12px", fontSize: 13, lineHeight: 1.45 }}>
            <Icon name="circle-check" size={18} color="var(--accent-text)" style={{ marginTop: 1, flexShrink: 0 }} />
            <span style={{ flex: 1 }}>
              <b style={{ fontSize: 14 }}>{OF.auto}</b>
              <br />
              {OF.autoSub}
            </span>
          </div>
          <OrderLines order={active} />
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", borderTop: "1px solid var(--line)", paddingTop: 10 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>{OF.total}</span>
            <b className="m-num" style={{ fontSize: 20 }}>
              {money(total)}
            </b>
          </div>
          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            {editableLines(active).length > 0 ? (
              <button type="button" className="m-sec" style={{ paddingLeft: 0, background: "none" }} disabled={busy} onClick={() => setSheet("items")}>
                <Icon name="pencil" size={15} />
                {OF.changeItems}
              </button>
            ) : (
              <span />
            )}
            {active.prepMinutes != null && <span className="m-hint">{OF.readyIn(active.prepMinutes)}</span>}
          </div>

          <div style={{ flex: 1 }} />

          {error && (
            <div className="m-alert" role="alert">
              {error}
            </div>
          )}
          <button
            type="button"
            className="m-btn"
            disabled={busy}
            onClick={() => void run(() => onConfirm(active.id), "Confirmed · we’ll send a rider when it’s nearly ready", "Couldn't confirm the order. Try again.")}
          >
            {OF.confirm}
          </button>
          <button type="button" className="m-lnk m-red" style={{ minHeight: "var(--target-min)", fontSize: 14 }} disabled={busy} onClick={() => setSheet("cancel")}>
            {OF.decline}
          </button>
        </div>
      </div>

      {sheet === "cancel" && (
        <ConfirmSheet
          title="Cancel this order?"
          body="The customer is told why. Nothing was paid, so there’s nothing to refund."
          confirmLabel="Cancel order"
          busy={submitting}
          error={error}
          onConfirm={() => void run(() => onCancel(active.id), "Order cancelled · customer told", "Couldn't cancel the order. Try again.")}
          onCancel={() => setSheet(null)}
        />
      )}
      {sheet === "items" && (
        <ChangeItemsSheet
          order={active}
          busy={submitting}
          error={error}
          onSave={(lines) => void run(() => onEditItems(active.id, lines), "Items changed · customer told the new total", "Couldn't change the items. Try again.")}
          onCancel={() => setSheet(null)}
        />
      )}
    </div>
  );
}
