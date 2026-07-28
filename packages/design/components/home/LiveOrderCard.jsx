import React from "react";
import { Icon } from "../core/Icon.jsx";
import { Card } from "../core/Card.jsx";

/**
 * Lynia live-order card — the always-on-top home card while an order runs. Green-bordered card,
 * mint icon tile, one bold status line ("Sadza Republic · 6 min away"), a muted money/meta line,
 * and a 7-segment progress strip mirroring the tracker steps. Tapping opens the tracking screen.
 */
export function LiveOrderCard({ title, meta, step = 0, steps = 7, icon = "bike", onClick, style, ...rest }) {
  return (
    <Card accent onClick={onClick} style={{ padding: 12, cursor: onClick ? "pointer" : "default", ...style }} {...rest}>
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <span style={{ width: 42, height: 42, borderRadius: "50%", background: "var(--accent-wash)", display: "grid", placeItems: "center", flexShrink: 0 }}>
          <Icon name={icon} size={20} color="var(--accent-text)" />
        </span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 14, fontWeight: 700, color: "var(--ink)" }}>{title}</div>
          {meta ? <div style={{ fontSize: 12.5, color: "var(--muted)", fontVariantNumeric: "tabular-nums" }}>{meta}</div> : null}
          <div style={{ display: "flex", gap: 4, marginTop: 6 }} aria-label={`Step ${step + 1} of ${steps}`}>
            {Array.from({ length: steps }, (_, i) => (
              <span key={i} style={{ flex: 1, height: 3, borderRadius: 2, background: i <= step ? "var(--accent)" : "var(--line)" }} />
            ))}
          </div>
        </div>
        <Icon name="chevron-right" size={18} color="var(--muted)" style={{ flexShrink: 0 }} />
      </div>
    </Card>
  );
}
