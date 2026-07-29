"use client";

import { useEffect, useState } from "react";
import { getReachabilityStore } from "../lib/reachability";
import { API_BASE_URL } from "../lib/config";
import { useKitchenConnection } from "./KitchenConnectionProvider";

function formatClock(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/**
 * §3 "Merchant reconnect": "Socket drop → red CONNECTION LOST bar within 3s, ... exponential backoff
 * with the attempt count shown. On reconnect: orders that arrived while dark are backfilled with a
 * banner naming the count."
 *
 * E1 has no live queue yet, so the backfill banner's ORDER COUNT is E2's job (it needs a real
 * dark-period order source) — this renders the connection-lost bar and a content-neutral "back
 * online" banner (mirroring the gallery's `offline_order` shape) that E2 can extend with the actual
 * count once the kitchen queue exists.
 */
export function ReconnectBanner() {
  const { reachability } = useKitchenConnection();
  const [justReconnected, setJustReconnected] = useState<{ downSinceMs: number } | null>(null);

  useEffect(() => {
    // Watch the store directly so we see the transition (prev state) rather than only the settled one.
    const store = getReachabilityStore(API_BASE_URL);
    let prev = store.getState();
    return store.subscribe((next) => {
      if (!prev.reachable && next.reachable && prev.unreachableSinceMs !== null) {
        setJustReconnected({ downSinceMs: prev.unreachableSinceMs });
        setTimeout(() => setJustReconnected(null), 15_000);
      }
      prev = next;
    });
  }, []);

  if (!reachability.reachable) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          padding: "16px 22px",
          background: "var(--danger)",
        }}
      >
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 17, fontWeight: 800, color: "#fff" }}>
            Connection lost — you are not receiving orders
          </div>
          <div style={{ fontSize: 13.5, color: "rgba(255,255,255,.9)" }}>
            Since {reachability.unreachableSinceMs ? formatClock(reachability.unreachableSinceMs) : "just now"} ·
            reconnecting automatically (attempt {reachability.attempt})
          </div>
        </div>
      </div>
    );
  }

  if (justReconnected) {
    const downMinutes = Math.max(1, Math.round((Date.now() - justReconnected.downSinceMs) / 60_000));
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 14,
          padding: "14px 22px",
          background: "var(--highlight-wash)",
          borderBottom: "1px solid var(--highlight-border)",
        }}
      >
        <div style={{ fontSize: 14.5, fontWeight: 700, color: "var(--highlight-ink)" }}>
          Back online — you were offline for {downMinutes} min. Any orders that arrived while you were
          dark will appear in the queue with their accept clocks paused during the outage.
        </div>
      </div>
    );
  }

  return null;
}
