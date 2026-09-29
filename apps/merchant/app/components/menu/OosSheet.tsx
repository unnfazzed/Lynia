"use client";

import { useState } from "react";
import type { DishOutOfStockFor } from "@lynia/shared";
import { primaryButtonStyle, ghostButtonStyle } from "../queue/styles";

/** `RM.oos_sheet`'s three choices, in the mock's order and words. */
const OPTIONS: { value: DishOutOfStockFor; label: string }[] = [
  { value: "until_back", label: "Until I turn it back on" },
  { value: "rest_of_today", label: "For the rest of today" },
  { value: "one_hour", label: "For 1 hour" },
];

/**
 * M4·3 `oos_sheet` (r-merchant.jsx:1152-1175): "Two taps, with an automatic reset so it can't be
 * forgotten." Until I turn it back on · For the rest of today (chosen to start with, as drawn: N-14's
 * always-safe reset) · For 1 hour. Staff may use it (the permission table).
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
  onConfirm: (forHowLong: DishOutOfStockFor) => void;
  onCancel: () => void;
}) {
  const [choice, setChoice] = useState<DishOutOfStockFor>("rest_of_today");
  return (
    <div className="kitchen-sheet-overlay">
      <div className="kitchen-sheet" style={{ maxWidth: 500 }}>
        <div style={{ fontSize: 20, fontWeight: 800 }}>Mark &ldquo;{dishName}&rdquo; out of stock</div>
        <div style={{ fontSize: 13.5, color: "var(--muted)", marginTop: 4, marginBottom: 16 }}>
          Customers still see it, greyed out, so they know you normally have it.
        </div>
        <div role="radiogroup" aria-label="For how long">
          {OPTIONS.map((o) => {
            const on = choice === o.value;
            return (
              <button
                key={o.value}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => setChoice(o.value)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  width: "100%",
                  minHeight: "var(--target-min)",
                  padding: "13px 15px",
                  marginBottom: 8,
                  border: `2px solid ${on ? "var(--accent)" : "var(--line)"}`,
                  background: on ? "var(--accent-wash)" : "var(--bg)",
                  borderRadius: 12,
                  color: "var(--ink)",
                  fontFamily: "inherit",
                  textAlign: "left",
                  cursor: "pointer",
                }}
              >
                <span
                  aria-hidden="true"
                  style={{
                    width: 20,
                    height: 20,
                    borderRadius: "50%",
                    border: `2px solid ${on ? "var(--accent)" : "var(--line)"}`,
                    background: on ? "var(--accent)" : "var(--bg)",
                    flexShrink: 0,
                  }}
                />
                <span style={{ fontSize: 15, fontWeight: 600 }}>{o.label}</span>
              </button>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 12, marginTop: 12 }}>
          <button type="button" onClick={onCancel} disabled={submitting} style={{ ...ghostButtonStyle, flex: 1 }}>
            Cancel
          </button>
          <button
            type="button"
            disabled={disabled || submitting}
            onClick={() => onConfirm(choice)}
            style={{ ...primaryButtonStyle, flex: 1, opacity: disabled || submitting ? 0.5 : 1 }}
          >
            {submitting ? "Marking…" : "Mark out of stock"}
          </button>
        </div>
      </div>
    </div>
  );
}
