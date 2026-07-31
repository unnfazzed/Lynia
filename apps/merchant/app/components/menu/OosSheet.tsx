"use client";

import { primaryButtonStyle, ghostButtonStyle } from "../queue/styles";

/**
 * N-14: "for the rest of today" is the only out-of-stock duration this ships (auto-resets at the
 * server's local midnight, `endOfToday()` in merchant.service.ts) — the commonest failure mode N-14
 * names is a dish left greyed out for a week, so a single always-safe button beats offering durations
 * the backend doesn't actually track. The gallery mock (RM.oos_sheet) shows two further options
 * ("Until I turn it back on", "For 1 hour") that aren't backed by any numbered decision — cut here
 * rather than built as UI that calls the same single endpoint under a false label.
 */
export function OosSheet({
  dishName,
  disabled,
  submitting,
  onConfirm,
  onCancel,
}: {
  dishName: string;
  disabled: boolean;
  submitting: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <div style={overlayStyle}>
      <div style={cardStyle}>
        <div style={{ fontSize: 20, fontWeight: 800 }}>Mark &ldquo;{dishName}&rdquo; out of stock</div>
        <div style={{ fontSize: 13.5, color: "var(--muted)", marginTop: 4, marginBottom: 16 }}>
          Customers still see it, greyed out, so they know you normally have it. It comes back automatically at the
          start of your next open day.
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          <button type="button" onClick={onCancel} disabled={submitting} style={{ ...ghostButtonStyle, flex: 1 }}>
            Cancel
          </button>
          <button
            type="button"
            disabled={disabled || submitting}
            onClick={onConfirm}
            style={{ ...primaryButtonStyle, flex: 1, opacity: disabled || submitting ? 0.5 : 1 }}
          >
            {submitting ? "Marking…" : "Mark out of stock"}
          </button>
        </div>
      </div>
    </div>
  );
}

const overlayStyle: React.CSSProperties = {
  position: "fixed",
  inset: 0,
  background: "rgba(20,24,27,.45)",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  zIndex: 70,
};

const cardStyle: React.CSSProperties = { background: "#fff", borderRadius: 18, padding: 24, width: 460, maxWidth: "92vw" };
