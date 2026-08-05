"use client";

import { useState } from "react";
import type { MerchantRejectionReasonCode } from "@lynia/shared";
import { dangerButtonStyle, ghostButtonStyle } from "./styles";

/** D-11: the reason IS the customer's copy — a manual reject only offers reasons a merchant would
 *  genuinely hand-pick. `unreachable_customer`/`shop_closed`/`no_rider` are system/other-flow reasons
 *  (release-unpaid, N-23 auto-close, D-34 dispatch-cancel respectively), not offered here. */
const REJECT_REASONS: { code: MerchantRejectionReasonCode; label: string }[] = [
  // Labels are M2·2's own wording (r-merchant.jsx:412) — the codes they map to are unchanged.
  { code: "out_of_ingredient", label: "Out of an ingredient" },
  { code: "too_busy", label: "Kitchen is too busy right now" },
  { code: "closing_soon", label: "We're closing early today" },
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
        {/* M2·2 (r-merchant.jsx:410-417): the order is named in the question, the sub-line explains
         *  why an honest reason costs nothing, and each choice is a radio row. */}
        <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 4 }}>Why can&apos;t you take {orderLabel}?</div>
        <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 16, lineHeight: 1.45 }}>
          The customer sees your reason, so pick the true one. Rejections don&apos;t affect your rating — mystery ones do.
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginBottom: 20 }}>
          {REJECT_REASONS.map((r) => {
            const on = selected === r.code;
            return (
              <button
                key={r.code}
                type="button"
                onClick={() => setSelected(r.code)}
                aria-pressed={on}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  textAlign: "left",
                  fontSize: 15,
                  fontWeight: 600,
                  padding: "13px 15px",
                  borderRadius: 12,
                  border: `2px solid ${on ? "var(--accent)" : "var(--line)"}`,
                  background: on ? "var(--accent-wash)" : "#fff",
                  color: "var(--ink)",
                  cursor: "pointer",
                }}
              >
                <span
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: "50%",
                    border: `2px solid ${on ? "var(--accent)" : "var(--line)"}`,
                    background: on ? "var(--accent)" : "#fff",
                    flexShrink: 0,
                  }}
                />
                {r.label}
              </button>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <button type="button" onClick={onCancel} style={{ ...ghostButtonStyle, flex: 1 }}>
            Keep the order
          </button>
          <button
            type="button"
            disabled={!selected || disabled}
            onClick={() => selected && onConfirm(selected)}
            style={{ ...dangerButtonStyle, flex: 1, opacity: !selected || disabled ? 0.5 : 1 }}
          >
            Reject {orderLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
