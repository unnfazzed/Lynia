import React from "react";
import { Icon } from "../core/Icon.jsx";

/**
 * Lynia connectivity banner — the global offline/reconnecting affordance the ship review asked for
 * (pre-auth loading discipline). Sits at the very top of the screen, full-width, above everything.
 * Offline is a calm ink bar (a state, not an alarm — never danger-red); reconnecting is a muted
 * surface strip. Renders nothing when state is "online", so it can stay mounted permanently.
 */
export function OfflineBanner({ state = "online", style, ...rest }) {
  if (state !== "offline" && state !== "reconnecting") return null;
  const offline = state === "offline";
  return (
    <div
      role="status"
      aria-live="polite"
      className="lynia-offline-banner"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        padding: "8px 12px",
        background: offline ? "var(--ink)" : "var(--surface)",
        color: offline ? "var(--on-accent)" : "var(--muted)",
        borderBottom: offline ? "none" : "1px solid var(--line)",
        fontFamily: "var(--font-sans)",
        fontSize: "var(--text-caption)",
        fontWeight: "var(--weight-semibold)",
        ...style,
      }}
      {...rest}
    >
      <Icon name={offline ? "wifi-off" : "clock"} size={14} />
      {offline
        ? "You're offline — some things may be out of date."
        : "Reconnecting… your data may be a moment behind."}
    </div>
  );
}
