"use client";

import { useRef, useState } from "react";
import type { MerchantOrderResponse } from "@lynia/shared";
import { RESTAURANTS_DISPATCH } from "@lynia/shared";
import { formatCountdown, msSince } from "../../lib/countdown";
import { useNow } from "../../lib/use-now";
import { dangerGhostButtonStyle, disabledStyle, ghostButtonStyle, primaryButtonStyle } from "./styles";

const NO_RIDER_CAP_MS = RESTAURANTS_DISPATCH.maxAttempts * RESTAURANTS_DISPATCH.offerWindowMs;

/**
 * D-34: the reconciler exhausted the NO_RIDER cap and is holding for an explicit merchant decision.
 * Full-viewport amber takeover, three choices — "stop and hold" is the passive default (dismiss,
 * nothing to call; re-openable from the Ready column card).
 */
export function NoRiderHoldTakeover({
  order,
  disabled,
  onResume,
  onCancel,
  onHold,
}: {
  order: MerchantOrderResponse;
  disabled: boolean;
  onResume: (orderId: string) => Promise<void>;
  onCancel: (orderId: string) => Promise<void>;
  onHold: () => void;
}) {
  const now = useNow();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Synchronous double-submit guard (CF-01 class) — see OrderCard.tsx's useAsyncAction for why
  // `submitting` (React state) alone can't stop two same-tick clicks both calling `action()`.
  const runningRef = useRef(false);

  const searchingMs = msSince(order.readyAt, now);

  async function run(action: (orderId: string) => Promise<void>) {
    if (runningRef.current) return;
    runningRef.current = true;
    setSubmitting(true);
    setError(null);
    try {
      await action(order.id);
      setSubmitting(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong — try again.");
      setSubmitting(false);
    } finally {
      runningRef.current = false;
    }
  }

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "var(--highlight-wash)",
        color: "var(--ink)",
        zIndex: 55,
        display: "flex",
        flexDirection: "column",
        overflow: "auto",
      }}
    >
      <div style={{ background: "var(--highlight)", color: "#3a2f00", padding: "16px 24px", fontWeight: 900, fontSize: 17 }}>
        NO RIDER FOUND YET — Order #{order.id.slice(0, 8).toUpperCase()}
      </div>
      <div style={{ flex: 1, display: "flex", gap: 24, padding: 24, flexWrap: "wrap" }}>
        <div style={{ flex: 1, minWidth: "min(280px, 100%)" }}>
          <div style={{ fontSize: 15, marginBottom: 10 }}>
            We searched for {formatCountdown(searchingMs)} of the {formatCountdown(NO_RIDER_CAP_MS)} we allow before giving up — nobody
            picked it up yet. The food is ready; nothing is charged either way.
          </div>
          <div style={{ fontSize: 13, color: "var(--highlight-ink)", fontStyle: "italic" }}>
            Cancelling here doesn&apos;t count against your acceptance rate — it&apos;s on us.
          </div>
        </div>
        <div className="kitchen-aside" style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontSize: 12, fontWeight: 800, color: "var(--highlight-ink)", marginBottom: 4 }}>WHAT DO YOU WANT TO DO?</div>
          {error && <div style={{ fontSize: 13, background: "var(--danger-wash)", color: "var(--danger-ink)", borderRadius: 10, padding: "8px 12px" }}>{error}</div>}
          <button
            type="button"
            onClick={() => run(onResume)}
            disabled={disabled || submitting}
            style={{ ...primaryButtonStyle, ...disabledStyle(disabled || submitting) }}
          >
            Keep searching — wait for a rider
          </button>
          <button type="button" onClick={onHold} disabled={submitting} style={ghostButtonStyle}>
            Hold — I&apos;ll decide later
          </button>
          <button
            type="button"
            onClick={() => run(onCancel)}
            disabled={disabled || submitting}
            style={{ ...dangerGhostButtonStyle, ...disabledStyle(disabled || submitting) }}
          >
            Cancel the order
          </button>
        </div>
      </div>
    </div>
  );
}
