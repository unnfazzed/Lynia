"use client";

import { useState } from "react";
import { PREP_CHIPS_MIN, type MerchantOrderResponse, type MerchantRejectionReasonCode } from "@lynia/shared";
import { computeAcceptPreview } from "../../lib/accept-preview";
import { formatCountdown, msUntil } from "../../lib/countdown";
import { useNow } from "../../lib/use-now";
import { RejectSheet } from "./RejectSheet";
import { disabledStyle, primaryButtonStyle } from "./styles";

function orderLabel(o: MerchantOrderResponse): string {
  return `#${o.id.slice(0, 8).toUpperCase()}`;
}

/**
 * M1·3 NEW ORDER alarm takeover (D-05: rings until Accept/Can't-take-it) + M1·b1 two-orders-at-once
 * sequencing (D-26 adjacent) + D-23 item-level accept + D-11 reject reasons. Full-viewport by design
 * — an incoming order always demands immediate attention regardless of board/list mode.
 */
export function NewOrderTakeover({
  active,
  queued,
  disabled,
  onAccept,
  onReject,
  refetch,
}: {
  active: MerchantOrderResponse;
  queued: readonly MerchantOrderResponse[];
  disabled: boolean;
  onAccept: (orderId: string, prepMinutes: (typeof PREP_CHIPS_MIN)[number], unavailableDishIds: string[]) => Promise<void>;
  onReject: (orderId: string, reason: MerchantRejectionReasonCode) => Promise<void>;
  refetch: () => Promise<void>;
}) {
  const now = useNow();
  const [prepMinutes, setPrepMinutes] = useState<(typeof PREP_CHIPS_MIN)[number]>(15);
  const [unavailable, setUnavailable] = useState<Set<string>>(new Set());
  const [showReject, setShowReject] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const preview = computeAcceptPreview(active.items, unavailable);
  const remainingMs = msUntil(active.acceptDeadlineAt, now);

  function toggleUnavailable(dishId: string) {
    setUnavailable((prev) => {
      const next = new Set(prev);
      if (next.has(dishId)) next.delete(dishId);
      else next.add(dishId);
      return next;
    });
  }

  // C-O9 (LC-C13): a rejection here (typically a 409 — the order already resolved via a lost-
  // response retry, or the ambient poll's own late arrival) previously left the stale Accept/
  // Reject buttons tappable until the next ambient queue poll (≤5s) or a visibilitychange
  // refetch quietly cleared them — self-healing, but a real, reproducible confusion window on a
  // slow reconnect. Mirrors the success path (`withRefetch` in QueueBoard), which already awaits
  // the refetch end-to-end before the caller sees it settle: refetch on error too, so a stale
  // takeover clears itself (QueueBoard re-derives `active` and unmounts this component) as soon
  // as the fresh queue snapshot lands, instead of waiting out the ambient poll.
  async function submitAccept() {
    setSubmitting(true);
    setError(null);
    try {
      await onAccept(active.id, prepMinutes, [...unavailable]);
      setSubmitting(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't accept the order — try again.");
      await refetch();
      setSubmitting(false);
    }
  }

  async function submitReject(reason: MerchantRejectionReasonCode) {
    setSubmitting(true);
    setError(null);
    try {
      await onReject(active.id, reason);
      setSubmitting(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't reject the order — try again.");
      await refetch();
      setSubmitting(false);
      setShowReject(false);
    }
  }

  const acceptLabel = preview.hasUnavailable ? `Accept ${active.items.length - unavailable.size} of ${active.items.length} · ${prepMinutes}m` : `Accept · ${prepMinutes}m`;

  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "var(--cta-fill)",
        color: "#fff",
        zIndex: 60,
        display: "flex",
        flexDirection: "column",
        overflow: "auto",
      }}
    >
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "16px 24px" }}>
        <div style={{ fontSize: 17, fontWeight: 900, letterSpacing: ".02em" }}>
          {queued.length > 0 ? `${queued.length + 1} NEW ORDERS — answer them one at a time` : "NEW ORDER — ALARM RINGING"}
        </div>
        <div style={{ flex: 1 }} />
        <div style={{ fontVariantNumeric: "tabular-nums", fontSize: 20, fontWeight: 900 }}>{formatCountdown(remainingMs)} left to accept</div>
      </div>

      {queued.length > 0 && (
        <div style={{ padding: "0 24px 8px" }}>
          <span
            style={{
              display: "inline-block",
              fontSize: 12,
              fontWeight: 800,
              background: "rgba(255,255,255,.2)",
              borderRadius: 999,
              padding: "4px 12px",
            }}
          >
            ANSWERING NOW · 1 of {queued.length + 1}
          </span>
        </div>
      )}

      <div style={{ flex: 1, display: "flex", gap: 20, padding: "8px 24px 24px", minHeight: 0 }}>
        <div style={{ flex: 1, background: "#fff", color: "var(--ink)", borderRadius: 18, padding: 22, display: "flex", flexDirection: "column", overflow: "auto" }}>
          <div style={{ fontSize: 19, fontWeight: 800, marginBottom: 2 }}>{orderLabel(active)}</div>
          <div style={{ fontSize: 13, color: "var(--muted)", marginBottom: 14 }}>
            {active.paymentMethod === "wallet" ? "WALLET — pay-on-confirm" : "CASH — collected at the door"}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10, flex: 1 }}>
            {active.items.map((item, idx) => {
              const isOut = !!item.dishId && unavailable.has(item.dishId);
              return (
                <div
                  key={`${item.dishId ?? "item"}-${idx}`}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "10px 0",
                    borderBottom: "1px solid var(--line)",
                    opacity: isOut ? 0.5 : 1,
                  }}
                >
                  <div style={{ flex: 1 }}>
                    <div style={{ fontSize: 14.5, fontWeight: 700, textDecoration: isOut ? "line-through" : "none" }}>
                      {item.quantity}x {item.name}
                    </div>
                    {item.note && <div style={{ fontSize: 12.5, color: "var(--accent-text)" }}>↳ {item.note}</div>}
                  </div>
                  <div style={{ fontSize: 14, fontVariantNumeric: "tabular-nums" }}>${(item.priceUsd * item.quantity).toFixed(2)}</div>
                  {item.dishId && (
                    <button
                      type="button"
                      onClick={() => toggleUnavailable(item.dishId!)}
                      style={{
                        fontSize: 12,
                        fontWeight: 700,
                        color: isOut ? "var(--danger-ink)" : "var(--muted)",
                        background: isOut ? "var(--danger-wash)" : "var(--surface)",
                        border: "1px solid var(--line)",
                        borderRadius: 999,
                        padding: "6px 10px",
                        cursor: "pointer",
                      }}
                    >
                      {isOut ? "Marked unavailable" : "Don't have it"}
                    </button>
                  )}
                </div>
              );
            })}
          </div>
          {active.note && (
            <div style={{ marginTop: 12, background: "var(--highlight-wash)", border: "1px solid var(--highlight-border)", borderRadius: 12, padding: "10px 14px", fontSize: 13.5 }}>
              {active.note}
            </div>
          )}
          <div style={{ marginTop: 16, paddingTop: 16, borderTop: "2px solid var(--line)" }}>
            <div style={{ fontSize: 12.5, color: "var(--muted)", fontWeight: 700 }}>
              {active.paymentMethod === "cash" ? "Food total you'll be paid in cash" : "Food total"}
            </div>
            <div style={{ fontSize: 38, fontWeight: 900, fontVariantNumeric: "tabular-nums" }}>
              ${preview.total.toFixed(2)}
              {preview.hasUnavailable && (
                <span style={{ fontSize: 14, fontWeight: 700, color: "var(--muted)", marginLeft: 10 }}>down from ${preview.fullTotal.toFixed(2)}</span>
              )}
            </div>
          </div>
        </div>

        <div style={{ width: 300, display: "flex", flexDirection: "column", gap: 14, flexShrink: 0 }}>
          {queued.length > 0 && queued[0] && (
            <div style={{ background: "rgba(255,255,255,.14)", borderRadius: 14, padding: 14 }}>
              <div style={{ fontSize: 11.5, fontWeight: 800, letterSpacing: ".04em", marginBottom: 8, opacity: 0.85 }}>NEXT IN LINE</div>
              <div style={{ fontSize: 14, fontWeight: 800 }}>{orderLabel(queued[0])}</div>
              <div style={{ fontSize: 12.5, opacity: 0.85 }}>{queued[0].items.map((i) => `${i.quantity}x ${i.name}`).join(" · ")}</div>
              <div style={{ fontSize: 12, opacity: 0.75, marginTop: 8, fontStyle: "italic" }}>
                Its own 3-minute clock starts when you finish with this one. We never show two decisions at once.
              </div>
            </div>
          )}

          <div>
            <div style={{ fontSize: 12, fontWeight: 800, opacity: 0.85, marginBottom: 8 }}>PREP TIME</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {PREP_CHIPS_MIN.map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => setPrepMinutes(m)}
                  style={{
                    fontSize: 13.5,
                    fontWeight: 800,
                    padding: "10px 14px",
                    borderRadius: 999,
                    border: prepMinutes === m ? "2px solid #fff" : "1px solid rgba(255,255,255,.5)",
                    background: prepMinutes === m ? "rgba(255,255,255,.22)" : "transparent",
                    color: "#fff",
                    cursor: "pointer",
                  }}
                >
                  {m}m
                </button>
              ))}
            </div>
          </div>

          <div style={{ flex: 1 }} />

          {error && <div style={{ fontSize: 13, background: "rgba(0,0,0,.2)", borderRadius: 10, padding: "8px 12px" }}>{error}</div>}

          <button
            type="button"
            onClick={submitAccept}
            disabled={disabled || submitting}
            style={{ ...primaryButtonStyle, background: "#fff", color: "var(--cta-fill)", fontSize: 18, padding: "22px 20px", ...disabledStyle(disabled || submitting) }}
          >
            {acceptLabel}
          </button>
          <button
            type="button"
            onClick={() => setShowReject(true)}
            disabled={disabled || submitting}
            style={{
              fontSize: 14,
              fontWeight: 700,
              color: "#fff",
              background: "transparent",
              border: "1px solid rgba(255,255,255,.6)",
              borderRadius: 14,
              padding: "14px 20px",
              cursor: "pointer",
              ...disabledStyle(disabled || submitting),
            }}
          >
            Can&apos;t take it
          </button>
          <div style={{ fontSize: 12, fontStyle: "italic", opacity: 0.8, textAlign: "center" }}>
            The alarm stops the moment you tap either button — nothing else silences it.
          </div>
        </div>
      </div>

      {showReject && (
        <RejectSheet
          orderLabel={orderLabel(active)}
          disabled={submitting}
          onCancel={() => setShowReject(false)}
          onConfirm={submitReject}
        />
      )}
    </div>
  );
}
