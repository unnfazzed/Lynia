"use client";

import { useState } from "react";
import { formatMoney, parseAmountInput } from "../../lib/money-input";
import { dangerGhostButtonStyle, ghostButtonStyle, primaryButtonStyle } from "./styles";

/** M3·2/M3·b1 — R-11/D-06: the merchant matches the customer's rail reference against their OWN
 *  statement before cooking. `expectedAmount` is only ever a reminder of the order's own total, never
 *  a payment screen to trust — the server is what actually checks the amount and 409s naming the gap
 *  in dollars on a mismatch (surfaced verbatim via `error`). */
export function PaymentConfirmSheet({
  orderLabel,
  expectedAmount,
  disabled,
  submitting,
  error,
  onConfirm,
  onCancel,
}: {
  orderLabel: string;
  expectedAmount: number;
  disabled: boolean;
  submitting: boolean;
  error: string | null;
  onConfirm: (body: { reference: string; amount: number }) => void;
  onCancel: () => void;
}) {
  const [reference, setReference] = useState("");
  const [amountText, setAmountText] = useState(formatMoney(expectedAmount));

  const amount = parseAmountInput(amountText);
  const canConfirm = reference.trim().length > 0 && amount != null && !disabled && !submitting;

  return (
    <div style={overlayStyle}>
      <div style={cardStyle}>
        <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 4 }}>Confirm the payment landed</div>
        <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 16 }}>
          Expected ${formatMoney(expectedAmount)} for {orderLabel}
        </div>

        <label style={labelStyle}>
          Transaction reference
          <input
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="EC-…"
            style={inputStyle}
            disabled={disabled || submitting}
          />
        </label>
        <label style={labelStyle}>
          Amount you received
          <input
            value={amountText}
            onChange={(e) => setAmountText(e.target.value)}
            inputMode="decimal"
            style={inputStyle}
            disabled={disabled || submitting}
          />
        </label>

        <div style={{ display: "flex", gap: 10, padding: "12px 14px", background: "var(--danger-wash)", borderRadius: 12, marginTop: 4, marginBottom: 16 }}>
          <div style={{ fontSize: 13, color: "var(--danger-ink)", lineHeight: 1.45 }}>
            <b>Check your own statement.</b> Never accept a payment screen shown on someone else&apos;s phone — if it
            isn&apos;t in your statement, the money isn&apos;t yours.
          </div>
        </div>

        {error && <div style={{ fontSize: 13, color: "var(--danger-ink)", marginBottom: 12, fontWeight: 700 }}>{error}</div>}

        <div style={{ display: "flex", gap: 10 }}>
          <button type="button" onClick={onCancel} disabled={submitting} style={{ ...ghostButtonStyle, flex: 1 }}>
            Cancel
          </button>
          <button
            type="button"
            disabled={!canConfirm}
            onClick={() => amount != null && onConfirm({ reference: reference.trim(), amount })}
            style={{ ...primaryButtonStyle, flex: 1, opacity: canConfirm ? 1 : 0.5 }}
          >
            {submitting ? "Confirming…" : `Confirm $${amountText || "0.00"} · start cooking`}
          </button>
        </div>
      </div>
    </div>
  );
}

/** D-12: refund-then-reject an already-confirmed WALLET order, reference + the exact amount first. */
export function RefundSheet({
  orderLabel,
  expectedAmount,
  disabled,
  submitting,
  error,
  onConfirm,
  onCancel,
}: {
  orderLabel: string;
  expectedAmount: number;
  disabled: boolean;
  submitting: boolean;
  error: string | null;
  onConfirm: (body: { reference: string; amount: number }) => void;
  onCancel: () => void;
}) {
  const [reference, setReference] = useState("");
  const [amountText, setAmountText] = useState(formatMoney(expectedAmount));

  const amount = parseAmountInput(amountText);
  const canConfirm = reference.trim().length > 0 && amount != null && !disabled && !submitting;

  return (
    <div style={overlayStyle}>
      <div style={cardStyle}>
        <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 4 }}>Refund before you reject</div>
        <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 16 }}>
          {orderLabel} already paid ${formatMoney(expectedAmount)} — LyniaGo never held the money, so you send it back.
        </div>

        <label style={labelStyle}>
          Your refund reference
          <input
            value={reference}
            onChange={(e) => setReference(e.target.value)}
            placeholder="EC-…"
            style={inputStyle}
            disabled={disabled || submitting}
          />
        </label>
        <label style={labelStyle}>
          Amount refunded
          <input
            value={amountText}
            onChange={(e) => setAmountText(e.target.value)}
            inputMode="decimal"
            style={inputStyle}
            disabled={disabled || submitting}
          />
        </label>

        {error && <div style={{ fontSize: 13, color: "var(--danger-ink)", marginBottom: 12, fontWeight: 700 }}>{error}</div>}

        <div style={{ display: "flex", gap: 10 }}>
          <button type="button" onClick={onCancel} disabled={submitting} style={{ ...ghostButtonStyle, flex: 1 }}>
            Keep the order
          </button>
          <button
            type="button"
            disabled={!canConfirm}
            onClick={() => amount != null && onConfirm({ reference: reference.trim(), amount })}
            style={{ ...dangerGhostButtonStyle, flex: 1, opacity: canConfirm ? 1 : 0.5 }}
          >
            {submitting ? "Refunding…" : "I've refunded — reject the order"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** R-06/N-21/D-06: same count-and-acknowledge grammar as the pickup confirm — the merchant types the
 *  amount the rider hands back, a mismatch blocks and names the gap (server-side, surfaced verbatim). */
export function ReturnCashSheet({
  orderLabel,
  expectedAmount,
  disabled,
  submitting,
  error,
  onConfirm,
  onCancel,
}: {
  orderLabel: string;
  expectedAmount: number;
  disabled: boolean;
  submitting: boolean;
  error: string | null;
  onConfirm: (amount: number) => void;
  onCancel: () => void;
}) {
  const [amountText, setAmountText] = useState(formatMoney(expectedAmount));
  const [acknowledged, setAcknowledged] = useState(false);

  const amount = parseAmountInput(amountText);
  const canConfirm = acknowledged && amount != null && !disabled && !submitting;

  return (
    <div style={overlayStyle}>
      <div style={cardStyle}>
        <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 4 }}>Count the returned cash</div>
        <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 16 }}>{orderLabel} · owed ${formatMoney(expectedAmount)}</div>

        <label style={labelStyle}>
          Amount received
          <input
            value={amountText}
            onChange={(e) => setAmountText(e.target.value)}
            inputMode="decimal"
            style={inputStyle}
            disabled={disabled || submitting}
          />
        </label>

        <button
          type="button"
          onClick={() => setAcknowledged((v) => !v)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 10,
            padding: "12px 14px",
            border: `2px solid ${acknowledged ? "var(--accent)" : "var(--line)"}`,
            background: acknowledged ? "var(--accent-wash)" : "#fff",
            borderRadius: 12,
            cursor: "pointer",
            textAlign: "left",
            marginBottom: 16,
            width: "100%",
          }}
        >
          <span style={{ fontSize: 14.5, fontWeight: 700 }}>I counted ${amountText || "0.00"} in my hand</span>
        </button>

        {error && <div style={{ fontSize: 13, color: "var(--danger-ink)", marginBottom: 12, fontWeight: 700 }}>{error}</div>}

        <div style={{ display: "flex", gap: 10 }}>
          <button type="button" onClick={onCancel} disabled={submitting} style={{ ...ghostButtonStyle, flex: 1 }}>
            Not yet
          </button>
          <button
            type="button"
            disabled={!canConfirm}
            onClick={() => amount != null && onConfirm(amount)}
            style={{ ...primaryButtonStyle, flex: 1, opacity: canConfirm ? 1 : 0.5 }}
          >
            {submitting ? "Confirming…" : `Confirm $${amountText || "0.00"} returned`}
          </button>
        </div>
      </div>
    </div>
  );
}

/** R-07: the merchant's last-resort "the rider never brought the cash back" declaration — plain-words
 *  risk statement, since this both writes off the debt as a loss AND suspends + names the rider. */
export function NonReturnSheet({
  orderLabel,
  expectedAmount,
  disabled,
  submitting,
  error,
  onConfirm,
  onCancel,
}: {
  orderLabel: string;
  expectedAmount: number;
  disabled: boolean;
  submitting: boolean;
  error: string | null;
  onConfirm: (note?: string) => void;
  onCancel: () => void;
}) {
  const [note, setNote] = useState("");

  return (
    <div style={overlayStyle}>
      <div style={cardStyle}>
        <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 4 }}>Report the cash as not returned</div>
        <div style={{ fontSize: 13, color: "var(--muted)", lineHeight: 1.5, marginBottom: 16 }}>
          {orderLabel} · ${formatMoney(expectedAmount)} owed. This loss is yours by your own cash-rule choice (R-07) —
          the rider is suspended and named to LyniaGo immediately. Only use this once you&apos;re sure the cash isn&apos;t coming back.
        </div>

        <label style={labelStyle}>
          Note (optional)
          <input value={note} onChange={(e) => setNote(e.target.value)} style={inputStyle} disabled={disabled || submitting} />
        </label>

        {error && <div style={{ fontSize: 13, color: "var(--danger-ink)", marginBottom: 12, fontWeight: 700 }}>{error}</div>}

        <div style={{ display: "flex", gap: 10 }}>
          <button type="button" onClick={onCancel} disabled={submitting} style={{ ...ghostButtonStyle, flex: 1 }}>
            Keep waiting
          </button>
          <button
            type="button"
            disabled={disabled || submitting}
            onClick={() => onConfirm(note.trim() || undefined)}
            style={{ ...dangerGhostButtonStyle, flex: 1, opacity: disabled || submitting ? 0.5 : 1 }}
          >
            {submitting ? "Reporting…" : "Report non-return · suspend rider"}
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

const cardStyle: React.CSSProperties = { background: "#fff", borderRadius: 18, padding: 24, width: 420, maxWidth: "92vw" };

const labelStyle: React.CSSProperties = {
  display: "flex",
  flexDirection: "column",
  gap: 6,
  fontSize: 12.5,
  fontWeight: 700,
  color: "var(--muted)",
  marginBottom: 14,
};

const inputStyle: React.CSSProperties = {
  fontSize: 16,
  fontWeight: 700,
  padding: "12px 14px",
  borderRadius: 10,
  border: "1px solid var(--line)",
  color: "var(--ink)",
  fontVariantNumeric: "tabular-nums",
};
