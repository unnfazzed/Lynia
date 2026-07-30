"use client";

import { useState } from "react";
import type { MerchantRejectionReasonCode } from "@lynia/shared";
import { dangerGhostButtonStyle, ghostButtonStyle } from "./styles";

/** D-11: the reason IS the customer's copy — a manual reject only offers reasons a merchant would
 *  genuinely hand-pick. `unreachable_customer`/`shop_closed`/`no_rider` are system/other-flow reasons
 *  (release-unpaid, N-23 auto-close, D-34 dispatch-cancel respectively), not offered here. */
const REJECT_REASONS: { code: MerchantRejectionReasonCode; label: string }[] = [
  { code: "out_of_ingredient", label: "Out of an ingredient" },
  { code: "too_busy", label: "Too busy right now" },
  { code: "closing_soon", label: "Closing soon" },
  { code: "other", label: "Something else" },
];

export function RejectSheet({
  orderLabel,
  disabled,
  onConfirm,
  onCancel,
}: {
  orderLabel: string;
  disabled: boolean;
  onConfirm: (reason: MerchantRejectionReasonCode) => void;
  onCancel: () => void;
}) {
  const [selected, setSelected] = useState<MerchantRejectionReasonCode | null>(null);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(20,24,27,.45)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 70,
      }}
    >
      <div style={{ background: "#fff", borderRadius: 18, padding: 24, width: 380, maxWidth: "92vw" }}>
        <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 4 }}>Why can&apos;t you take this order?</div>
        <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 16 }}>
          This becomes the customer&apos;s cancellation message.
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
          {REJECT_REASONS.map((r) => (
            <button
              key={r.code}
              type="button"
              onClick={() => setSelected(r.code)}
              style={{
                textAlign: "left",
                fontSize: 14.5,
                fontWeight: 700,
                padding: "12px 14px",
                borderRadius: 12,
                border: `1px solid ${selected === r.code ? "var(--accent)" : "var(--line)"}`,
                background: selected === r.code ? "var(--accent-wash)" : "#fff",
                cursor: "pointer",
              }}
            >
              {r.label}
            </button>
          ))}
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button type="button" onClick={onCancel} style={{ ...ghostButtonStyle, flex: 1 }}>
            Keep the order
          </button>
          <button
            type="button"
            disabled={!selected || disabled}
            onClick={() => selected && onConfirm(selected)}
            style={{ ...dangerGhostButtonStyle, flex: 1, opacity: !selected || disabled ? 0.5 : 1 }}
          >
            Reject {orderLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
