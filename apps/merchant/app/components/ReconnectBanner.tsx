"use client";

import { useEffect, useState } from "react";
import { getReachabilityStore } from "../lib/reachability";
import { API_BASE_URL } from "../lib/config";
import { useKitchenConnection } from "./KitchenConnectionProvider";
import { Icon } from "./icons";

function formatClock(ms: number): string {
  const d = new Date(ms);
  return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

/**
 * §3 "Merchant reconnect": "Socket drop → red CONNECTION LOST bar within 3s, ... exponential backoff
 * with the attempt count shown. On reconnect: orders that arrived while dark are backfilled with a
 * banner naming the count."
 *
 * E2: `backfillCount` (from the queue screen's own poller — the count of orders visible in the first
 * post-reconnect fetch that weren't there before the outage) names the count in the banner, per the
 * gallery's `offline_order` shape. Omitted (or 0) on any screen without a live queue — the banner
 * still reads honestly as "no orders arrived while you were dark".
 */
export function ReconnectBanner({ backfillCount }: { backfillCount?: number } = {}) {
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
    // M1·b2 (r-merchant.jsx:301-316): wifi-off glyph on the red bar, and the reassurance strip
    // underneath that names what still works while the tablet is dark.
    return (
      <>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 14,
            padding: "16px 22px",
            background: "var(--danger)",
          }}
        >
          <Icon name="wifi-off" size={24} color="#fff" />
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
        <div
          style={{
            padding: "12px 22px",
            background: "var(--surface)",
            borderBottom: "1px solid var(--line)",
            fontSize: 13,
            color: "var(--muted)",
          }}
        >
          Keep cooking what&apos;s already accepted — those orders are safe. New orders will arrive as soon as the tablet
          is back online.
        </div>
      </>
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
          Back online — you were offline for {downMinutes} min.{" "}
          {backfillCount
            ? `${backfillCount} order${backfillCount === 1 ? "" : "s"} arrived while you were dark — they're in the queue now.`
            : "No orders arrived while you were dark."}
        </div>
      </div>
    );
  }

  return null;
}
