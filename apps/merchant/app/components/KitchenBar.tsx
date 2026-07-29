"use client";

import { useKitchenConnection } from "./KitchenConnectionProvider";

/**
 * Top bar shown on every authenticated screen (mirrors the gallery's `KitchenBar`,
 * packages/design/explorations/restaurants/r-parts.jsx). Alarm state is shown here "at all times —
 * muting is deliberate and visible, never silent" (§3). The wake-lock flashing fallback (§3: "If the
 * wake lock is refused, the queue falls back to a full-brightness flashing header") is applied here
 * as the one header every authenticated screen shares.
 */
export function KitchenBar() {
  const { reachability, alarm, wakeLock } = useKitchenConnection();
  const showFlashFallback = alarm.armed && wakeLock.supported && !wakeLock.active;

  return (
    <div
      className={showFlashFallback ? "kitchen-bar-flashing" : undefined}
      style={{
        display: "flex",
        alignItems: "center",
        gap: 14,
        height: 56,
        padding: "0 20px",
        borderBottom: "1px solid var(--line)",
        flexShrink: 0,
      }}
    >
      <span style={{ fontSize: 15, fontWeight: 800, letterSpacing: "-.01em" }}>LyniaGo — Merchant</span>
      <span style={{ flex: 1 }} />
      {reachability.reachable ? (
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontSize: 12.5,
            fontWeight: 700,
            color: "var(--accent-text)",
            background: "var(--accent-wash)",
            borderRadius: 999,
            padding: "5px 12px",
          }}
        >
          <span style={{ width: 7, height: 7, borderRadius: "50%", background: "var(--accent)" }} />
          Connected
        </span>
      ) : (
        <span
          style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontSize: 12.5,
            fontWeight: 700,
            color: "#fff",
            background: "var(--danger)",
            borderRadius: 999,
            padding: "5px 12px",
          }}
        >
          Offline (attempt {reachability.attempt})
        </span>
      )}
      <button
        type="button"
        onClick={alarm.toggleMuted}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 7,
          fontSize: 12.5,
          fontWeight: 700,
          color: alarm.muted ? "var(--danger-ink)" : "var(--accent-text)",
          border: "1px solid var(--line)",
          background: "var(--bg)",
          borderRadius: 999,
          padding: "5px 12px",
          cursor: "pointer",
        }}
        aria-pressed={alarm.muted}
      >
        {alarm.muted ? "Alarm muted" : "Alarm on"}
      </button>
    </div>
  );
}
