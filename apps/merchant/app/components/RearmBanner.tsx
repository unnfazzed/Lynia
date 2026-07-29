"use client";

import { useKitchenConnection } from "./KitchenConnectionProvider";

/**
 * §3 "Survives a tablet reboot": "the alarm needs one tap to re-arm (browser gesture requirement)
 * and the banner says so." A merchant who's still signed in (the session cookie survived the reboot)
 * but hasn't tapped anything yet THIS page load has an unarmed AudioContext — this banner is the one
 * tap that re-arms it, shown on every authenticated screen until they take it.
 */
export function RearmBanner() {
  const { alarm } = useKitchenConnection();
  if (alarm.armed) return null;

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        padding: "14px 22px",
        background: "var(--accent-wash)",
        borderBottom: "1px solid var(--line)",
      }}
    >
      <div style={{ flex: 1 }}>
        <div style={{ fontSize: 15, fontWeight: 800, color: "var(--ink)" }}>You're signed in — the alarm needs one tap</div>
        <div style={{ fontSize: 13, color: "var(--muted)" }}>
          Browsers only allow looping audio after a tap. Tap once to turn the order alarm back on for this tablet.
        </div>
      </div>
      <button
        type="button"
        onClick={alarm.arm}
        style={{
          fontSize: 13.5,
          fontWeight: 700,
          color: "#fff",
          background: "var(--cta-fill)",
          border: "none",
          borderRadius: 999,
          padding: "10px 18px",
          cursor: "pointer",
        }}
      >
        Turn alarm on
      </button>
    </div>
  );
}
