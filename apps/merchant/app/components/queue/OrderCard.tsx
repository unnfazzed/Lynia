"use client";

import type { MerchantOrderResponse } from "@lynia/shared";
import { formatCountdown, msUntil } from "../../lib/countdown";
import { isNoRiderHold, isRiderSecured, isSearchingForRider } from "../../lib/order-groups";
import { useNow } from "../../lib/use-now";
import { cardStyle, disabledStyle, primaryButtonStyle } from "./styles";

function orderLabel(o: MerchantOrderResponse): string {
  return `#${o.id.slice(0, 8).toUpperCase()}`;
}

export type OrderCardBucket = "waiting" | "payment" | "preparing" | "ready";

export function OrderCard({
  order,
  bucket,
  disabled,
  pickupCode,
  revealingCode,
  onMarkReady,
  onRevealPickupCode,
  onOpenHold,
}: {
  order: MerchantOrderResponse;
  bucket: OrderCardBucket;
  disabled: boolean;
  pickupCode?: string;
  revealingCode?: boolean;
  onMarkReady: (orderId: string) => void;
  onRevealPickupCode: (orderId: string) => void;
  onOpenHold: (order: MerchantOrderResponse) => void;
}) {
  const now = useNow();
  const items = order.items.map((i) => `${i.quantity}x ${i.name}`).join(" · ");

  return (
    <div style={{ ...cardStyle, display: "flex", flexDirection: "column", gap: 8 }}>
      <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between" }}>
        <div style={{ fontSize: 14.5, fontWeight: 800 }}>{orderLabel(order)}</div>
        <div style={{ fontSize: 12, fontWeight: 700, color: "var(--muted)" }}>{order.paymentMethod === "wallet" ? "WALLET" : "CASH"}</div>
      </div>
      <div style={{ fontSize: 13, color: "var(--muted)" }}>{items || "—"}</div>

      {bucket === "waiting" && (
        <div style={{ fontSize: 12.5, color: "var(--highlight-ink)", background: "var(--highlight-wash)", borderRadius: 10, padding: "8px 10px" }}>
          Waiting for the customer to approve the shorter order · {formatCountdown(msUntil(order.itemApprovalDeadlineAt, now))}
        </div>
      )}

      {bucket === "payment" && (
        <div style={{ fontSize: 12.5, color: "var(--muted)", background: "var(--surface)", borderRadius: 10, padding: "8px 10px" }}>
          Waiting for payment — no clock, doesn&apos;t hold up your board. Confirming it lands with the money-surfaces build.
        </div>
      )}

      {bucket === "preparing" && (
        <>
          <div style={{ fontSize: 12.5, color: "var(--accent-text)", fontWeight: 700 }}>
            {order.prepMinutes != null && order.prepStartedAt
              ? `${formatCountdown(Math.max(0, order.prepMinutes * 60_000 - (now - new Date(order.prepStartedAt).getTime())))} prep left`
              : "In prep"}
          </div>
          <button
            type="button"
            onClick={() => onMarkReady(order.id)}
            disabled={disabled}
            style={{ ...primaryButtonStyle, padding: "10px 16px", fontSize: 14, ...disabledStyle(disabled) }}
          >
            Mark ready
          </button>
        </>
      )}

      {bucket === "ready" && (
        <>
          {isSearchingForRider(order) && (
            <div style={{ fontSize: 12.5, color: "var(--muted)" }}>Searching for a rider…</div>
          )}
          {isNoRiderHold(order) && (
            <button
              type="button"
              onClick={() => onOpenHold(order)}
              style={{ fontSize: 12.5, fontWeight: 800, color: "var(--highlight-ink)", background: "var(--highlight-wash)", border: "1px solid var(--highlight-border)", borderRadius: 10, padding: "8px 10px", cursor: "pointer", textAlign: "left" }}
            >
              No rider yet — tap to decide
            </button>
          )}
          {isRiderSecured(order) && !isNoRiderHold(order) && (
            <>
              <div style={{ fontSize: 12.5, color: "var(--accent-text)", fontWeight: 700 }}>Rider on the way</div>
              {pickupCode ? (
                <div style={{ display: "flex", alignItems: "center", gap: 8, background: "var(--accent-wash)", borderRadius: 10, padding: "8px 10px" }}>
                  <span style={{ fontSize: 11, fontWeight: 800, color: "var(--accent-text)" }}>PICKUP CODE</span>
                  <span style={{ fontSize: 18, fontWeight: 900, fontVariantNumeric: "tabular-nums", letterSpacing: ".06em" }}>{pickupCode}</span>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => onRevealPickupCode(order.id)}
                  disabled={disabled || revealingCode}
                  style={{ fontSize: 12.5, fontWeight: 700, color: "var(--accent-text)", background: "var(--accent-wash)", border: "1px solid var(--line)", borderRadius: 10, padding: "8px 10px", cursor: "pointer", ...disabledStyle(disabled || !!revealingCode) }}
                >
                  {revealingCode ? "Loading…" : "Show pickup code"}
                </button>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
