import React from "react";
import { Icon } from "../core/Icon.jsx";

/** The default superapp launcher services. Adding a vertical is one more tile, never a nav change. */
export const SERVICES = [
  { id: "express", icon: "package", label: "Send", sub: "Parcel", bg: "var(--accent)" },
  { id: "food", icon: "utensils", label: "Food", sub: "Restaurants", bg: "var(--accent)" },
  { id: "pharm", icon: "plus", label: "Pharmacy", sub: "Soon", bg: "var(--line)", soon: true },
];

/**
 * Lynia service tiles — the launcher grid on the root home. 62px round-square icon tiles, label +
 * sub beneath, equal columns. Soon-tiles render grey and non-interactive.
 */
export function ServiceTiles({ services = SERVICES, columns, onService, dim = false, style, ...rest }) {
  const cols = columns || Math.min(services.length, 4);
  return (
    <div style={{ display: "grid", gridTemplateColumns: `repeat(${cols}, 1fr)`, gap: 8, opacity: dim ? 0.5 : 1, fontFamily: "var(--font-sans)", ...style }} {...rest}>
      {services.map((s) => {
        const live = !s.soon && !!onService;
        return (
          <div key={s.id} role={live ? "button" : undefined} onClick={live ? () => onService(s.id) : undefined} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 7, padding: "4px 0", position: "relative", cursor: live ? "pointer" : "default", background: "none", border: "none" }}>
            <span style={{ width: 62, height: 62, borderRadius: 20, background: s.bg || "var(--accent)", display: "grid", placeItems: "center", boxShadow: s.soon ? "none" : "0 4px 12px rgba(0,129,47,.22)" }}>
              <Icon name={s.icon} size={27} color={s.soon ? "var(--muted)" : "#fff"} />
            </span>
            <span style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: s.soon ? "var(--muted)" : "var(--ink)" }}>{s.label}</span>
              <span style={{ fontSize: 12, color: "var(--muted)" }}>{s.sub}</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}
