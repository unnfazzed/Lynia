"use client";

import { useState } from "react";
import { formatMoney, parseAmountInput } from "../../lib/money-input";
import { Icon } from "../icons";
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
    <div className="kitchen-sheet-overlay">
      <div className="kitchen-sheet" style={{ maxWidth: 420 }}>
        {/* M3·2 (r-merchant.jsx:650-656): the sub-line names the claim being checked, and the number
         *  the merchant is looking for is set large above the fields — the kit's money-confirm grammar. */}
        <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 4 }}>Confirm the payment landed</div>
        <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 14, lineHeight: 1.45 }}>
          {orderLabel} · says they&apos;ve paid · confirm before you cook
        </div>

        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--muted)", letterSpacing: ".04em" }}>EXPECTED</div>
        <div style={{ fontSize: 38, fontWeight: 800, letterSpacing: "-.02em", lineHeight: 1.1, marginBottom: 14, fontVariantNumeric: "tabular-nums" }}>
          ${formatMoney(expectedAmount)}
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

        {/* r-merchant.jsx:663-668, minus the rail name (this app's merchants take EcoCash, InnBucks
         *  or O'mari, so "your own statement" is the honest generalisation of "your own EcoCash"). */}
        <div style={{ display: "flex", gap: 10, padding: "12px 14px", background: "var(--danger-wash)", borderRadius: 12, marginTop: 4, marginBottom: 16 }}>
          <Icon name="triangle-alert" size={20} color="var(--danger-ink)" style={{ marginTop: 1 }} />
          <div style={{ fontSize: 13, color: "var(--danger-ink)", lineHeight: 1.45 }}>
            <b>Check your own statement.</b> Never accept a payment screen shown to you on someone else&apos;s phone —
            those are easy to fake. If it isn&apos;t in your statement, the money isn&apos;t yours.
          </div>
        </div>

        {error && <div style={{ fontSize: 13, color: "var(--danger-ink)", marginBottom: 12, fontWeight: 700 }}>{error}</div>}

        {/* The kit's merchant money screens stack their actions full-width, affirmative first
         *  (r-merchant.jsx:669, 589-590) — which is also what keeps this sentence-length CTA on one
         *  or two lines instead of three in a half-width button. */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <button
            type="button"
            disabled={!canConfirm}
            onClick={() => amount != null && onConfirm({ reference: reference.trim(), amount })}
            style={{ ...primaryButtonStyle, opacity: canConfirm ? 1 : 0.5 }}
          >
            {submitting ? "Confirming…" : `Confirm $${amountText || "0.00"} received · start cooking`}
          </button>
          <button type="button" onClick={onCancel} disabled={submitting} style={ghostButtonStyle}>
            Cancel
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
    <div className="kitchen-sheet-overlay">
      <div className="kitchen-sheet" style={{ maxWidth: 420 }}>
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
    <div className="kitchen-sheet-overlay">
      <div className="kitchen-sheet" style={{ maxWidth: 420 }}>
        {/* M3·4 (r-merchant.jsx:781-790): label, the number set large, then count-and-acknowledge. */}
        <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 4 }}>Count the returned cash</div>
        <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 14 }}>{orderLabel} · owed ${formatMoney(expectedAmount)}</div>

        <div style={{ fontSize: 13, fontWeight: 700, color: "var(--muted)", letterSpacing: ".04em" }}>COUNT WHAT THE RIDER HANDS YOU</div>
        <div style={{ fontSize: 38, fontWeight: 800, letterSpacing: "-.02em", lineHeight: 1.1, marginBottom: 14, fontVariantNumeric: "tabular-nums" }}>
          ${formatMoney(expectedAmount)}
        </div>

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
          aria-pressed={acknowledged}
        >
          {/* The kit draws the acknowledgement as a real ticked box (r-merchant.jsx:787). */}
          <span
            style={{
              width: 26,
              height: 26,
              borderRadius: 7,
              border: `2px solid ${acknowledged ? "var(--accent)" : "var(--line)"}`,
              background: acknowledged ? "var(--accent)" : "#fff",
              display: "grid",
              placeItems: "center",
              flexShrink: 0,
            }}
          >
            {acknowledged && <Icon name="check" size={16} color="#fff" />}
          </span>
          <span style={{ fontSize: 15, fontWeight: 700 }}>I counted ${amountText || "0.00"} in my hand</span>
        </button>

        {error && <div style={{ fontSize: 13, color: "var(--danger-ink)", marginBottom: 12, fontWeight: 700 }}>{error}</div>}

        {/* Same stacked-actions shape as the payment confirm above (r-merchant.jsx:790). */}
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <button
            type="button"
            disabled={!canConfirm}
            onClick={() => amount != null && onConfirm(amount)}
            style={{ ...primaryButtonStyle, opacity: canConfirm ? 1 : 0.5 }}
          >
            {submitting ? "Confirming…" : `Confirm $${amountText || "0.00"} returned · close ${orderLabel}`}
          </button>
          <button type="button" onClick={onCancel} disabled={submitting} style={ghostButtonStyle}>
            Not yet
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
    <div className="kitchen-sheet-overlay">
      <div className="kitchen-sheet" style={{ maxWidth: 420 }}>
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
