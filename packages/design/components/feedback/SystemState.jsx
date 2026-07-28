import React from "react";
import { Icon } from "../core/Icon.jsx";
import { Button } from "../core/Button.jsx";

/**
 * Full-screen blocking state — permissions, offline, suspended, force-update, hard errors. One
 * language for every journey: centred mark (brand `mark` slot or icon disc), title, one sentence,
 * then primary / secondary actions. In-context empties (an empty list inside a working screen) use
 * EmptyState instead.
 */
export function SystemState({ tone = "white", icon, mark, title, message, primary, secondary, onPrimary, onSecondary, style, ...rest }) {
  const green = tone === "green";
  return (
    <div style={{ padding: "var(--space-screen)", minHeight: "100%", boxSizing: "border-box", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", textAlign: "center", gap: 4, background: green ? "var(--accent)" : "var(--bg)", fontFamily: "var(--font-sans)", ...style }} {...rest}>
      {mark ? <div style={{ marginBottom: 12 }}>{mark}</div> : (
        <div style={{ width: 84, height: 84, borderRadius: "50%", background: green ? "rgba(255,255,255,.16)" : "var(--surface)", display: "grid", placeItems: "center", marginBottom: 14 }}>
          <Icon name={icon || "circle-alert"} size={36} color={green ? "#fff" : "var(--accent-text)"} />
        </div>
      )}
      <div style={{ fontSize: 19, fontWeight: 700, color: green ? "#fff" : "var(--ink)" }}>{title}</div>
      <div style={{ fontSize: 13, lineHeight: 1.55, color: green ? "rgba(255,255,255,.9)" : "var(--muted)", maxWidth: 230 }}>{message}</div>
      <div style={{ alignSelf: "stretch", marginTop: 18 }}>
        {primary ? (green
          ? <button onClick={onPrimary} style={{ width: "100%", minHeight: 52, borderRadius: 999, border: "none", background: "#fff", color: "var(--accent-700)", fontFamily: "var(--font-sans)", fontSize: 16, fontWeight: 700, cursor: onPrimary ? "pointer" : "default" }}>{primary}</button>
          : <Button label={primary} onClick={onPrimary} />) : null}
        {secondary ? <Button label={secondary} variant="ghost" onClick={onSecondary} /> : null}
      </div>
    </div>
  );
}
