"use client";

import { useEffect, useState } from "react";
import type { MerchantOrderResponse } from "@lynia/shared";
import { revealPickupCode } from "../../lib/orders-api";
import { primaryButtonStyle } from "./styles";

/**
 * D-04: "rider secured" is a first-class state for all three actors — the merchant's own
 * confidence/hand-off-imminent signal, shown once per order. Prep already finished before dispatch
 * in this locked architecture (see plan §5 Lane E's own D-04/D-33 reconciliation note), so this is
 * celebratory rather than a "start cooking" cook-gate.
 */
export function RiderSecuredTakeover({ order, onDismiss }: { order: MerchantOrderResponse; onDismiss: () => void }) {
  const [pickupCode, setPickupCode] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    revealPickupCode(order.id)
      .then((res) => {
        if (!cancelled) setPickupCode(res.pickupCode);
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(err instanceof Error ? err.message : "Couldn't load the pickup code.");
      });
    return () => {
      cancelled = true;
    };
  }, [order.id]);

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "var(--cta-fill)",
        color: "#fff",
        zIndex: 55,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 22,
        padding: 24,
        textAlign: "center",
      }}
    >
      <div style={{ fontSize: 22, fontWeight: 900, letterSpacing: ".02em" }}>RIDER SECURED</div>
      <div style={{ fontSize: 15, maxWidth: 420, opacity: 0.92 }}>
        A rider has been assigned to Order #{order.id.slice(0, 8).toUpperCase()} and is on the way to collect it.
      </div>
      <div style={{ background: "#fff", color: "var(--ink)", borderRadius: 18, padding: "20px 28px", minWidth: "min(220px, 100%)" }}>
        <div style={{ fontSize: 12, fontWeight: 800, color: "var(--muted)", marginBottom: 6 }}>PICKUP CODE</div>
        <div style={{ fontSize: 34, fontWeight: 900, fontVariantNumeric: "tabular-nums", letterSpacing: ".08em" }}>
          {pickupCode ?? (error ? "----" : "····")}
        </div>
        <div style={{ fontSize: 12, color: "var(--muted)", marginTop: 6 }}>Ask the rider to read this before you release the food.</div>
      </div>
      {error && <div style={{ fontSize: 13 }}>{error}</div>}
      <button type="button" onClick={onDismiss} style={{ ...primaryButtonStyle, background: "#fff", color: "var(--cta-fill)" }}>
        Got it
      </button>
    </div>
  );
}
