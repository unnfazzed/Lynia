import React from "react";
import { Icon } from "../core/Icon.jsx";

/**
 * Lynia app bar — the header on every pushed screen: back chevron, title (+ optional sub) and an
 * optional right slot. Root screens use BrandHeader instead.
 */
export function AppBar({ title, sub, back = true, right, onBack, transparent = false, style, ...rest }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "6px 12px 10px", background: transparent ? "transparent" : "var(--bg)", fontFamily: "var(--font-sans)", ...style }} {...rest}>
      {back ? (
        <span role={onBack ? "button" : undefined} onClick={onBack} style={{ display: "grid", placeItems: "center", width: 32, height: 32, marginLeft: -4, flexShrink: 0, cursor: onBack ? "pointer" : "default" }}>
          <Icon name="chevron-right" size={20} color="var(--ink)" style={{ transform: "rotate(180deg)" }} />
        </span>
      ) : null}
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: "var(--ink)", letterSpacing: "-0.01em", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{title}</div>
        {sub ? <div style={{ fontSize: 11.5, color: "var(--muted)" }}>{sub}</div> : null}
      </div>
      {right}
    </div>
  );
}
