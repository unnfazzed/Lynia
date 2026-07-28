import React from "react";

/**
 * Lynia order-again rail — accent-ringed round dish photos with name + green price beneath.
 * The highest-converting module in every mature food app: one tap back to a filled cart.
 * Items without a photo node get the tinted-initial circle.
 */
export function ReorderRail({ items = [], title = "Order again", size = 58, onItem, style, ...rest }) {
  return (
    <div className="lynia-reorder" style={{ fontFamily: "var(--font-sans)", ...style }} {...rest}>
      {title ? (
        <div style={{ display: "flex", alignItems: "baseline", padding: "8px var(--space-screen) 6px" }}>
          <span style={{ flex: 1, fontSize: 16, fontWeight: 700, color: "var(--ink)" }}>{title}</span>
        </div>
      ) : null}
      <div style={{ display: "flex", gap: 12, padding: "0 var(--space-screen)", overflow: "hidden" }}>
        {items.map((d, i) => (
          <div key={d.id || d.name || i} role={onItem ? "button" : undefined} onClick={onItem ? () => onItem(d, i) : undefined} style={{ width: size + 28, display: "flex", flexDirection: "column", alignItems: "center", gap: 5, flexShrink: 0, cursor: onItem ? "pointer" : "default" }}>
            <span style={{ padding: 2, borderRadius: "50%", border: "2px solid var(--accent)", display: "inline-flex" }}>
              {d.photo ?? (
                <span style={{ width: size, height: size, borderRadius: "50%", background: "var(--accent-wash)", display: "grid", placeItems: "center", fontSize: Math.round(size * 0.4), fontWeight: 800, color: "var(--accent-text)", opacity: 0.85 }}>{(d.name || "•")[0].toUpperCase()}</span>
              )}
            </span>
            <div style={{ textAlign: "center" }}>
              <div style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.25, color: "var(--ink)" }}>{d.name}</div>
              {d.price != null ? <div style={{ fontSize: 11.5, fontWeight: 700, color: "var(--accent-text)", fontVariantNumeric: "tabular-nums" }}>${d.price}</div> : null}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
