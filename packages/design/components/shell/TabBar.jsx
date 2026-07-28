import React from "react";
import { Icon } from "../core/Icon.jsx";

export const APP_TABS = [
  { id: "home", icon: "store", label: "Home" },
  { id: "orders", icon: "receipt", label: "Orders" },
  { id: "acct", icon: "user", label: "Account" },
];

/**
 * Bottom tab bar — the app root, NOT a product switcher. Services live on Home as tiles, so a new
 * vertical adds a tile, never a tab.
 */
export function TabBar({ active = "home", tabs = APP_TABS, dot, onTab, style, ...rest }) {
  return (
    <div style={{ position: "absolute", left: 0, right: 0, bottom: 0, display: "flex", background: "var(--bg)", borderTop: "1px solid var(--line)", paddingBottom: 4, zIndex: 20, fontFamily: "var(--font-sans)", ...style }} {...rest}>
      {tabs.map((t) => {
        const on = t.id === active;
        return (
          <div key={t.id} role={onTab ? "button" : undefined} onClick={onTab ? () => onTab(t.id) : undefined} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 3, padding: "8px 0 6px", position: "relative", cursor: onTab ? "pointer" : "default" }}>
            <Icon name={t.icon} size={21} color={on ? "var(--accent-text)" : "var(--muted)"} />
            <span style={{ fontSize: 11.5, fontWeight: on ? 700 : 600, color: on ? "var(--accent-text)" : "var(--muted)" }}>{t.label}</span>
            {dot === t.id ? <span style={{ position: "absolute", top: 6, right: "50%", marginRight: -14, width: 8, height: 8, borderRadius: "50%", background: "var(--accent)", border: "2px solid var(--bg)" }} /> : null}
          </div>
        );
      })}
    </div>
  );
}
