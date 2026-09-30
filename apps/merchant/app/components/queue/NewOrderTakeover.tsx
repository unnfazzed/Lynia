"use client";

import { useEffect, useRef, useState } from "react";
import { PREP_CHIPS_MIN, type MerchantOrderResponse, type MerchantRejectionReasonCode } from "@lynia/shared";
import { computeAcceptPreview } from "../../lib/accept-preview";
import { formatCountdown, msUntil } from "../../lib/countdown";
import { money, orderLabel } from "../../lib/orders-view";
import { useNow } from "../../lib/use-now";
import { Icon } from "../icons";
import { ConfirmSheet } from "../m/ConfirmSheet";
import { useToast } from "../m/Toast";

/**
 * B2 · New order ringing (packages/design/handoff/merchant-mobile, ledger D-48): a full-screen green
 * takeover. The header carries the order number and the accept countdown; the white sheet holds the
 * lines (the customer's note under its line), the total, "Edit items" (tap a line to strike it — the
 * customer approves the shorter order, D-23), the ready-in chips, "Accept · ready in 15 min" and
 * "Can't take it" behind the confirm sheet. The alarm rings until one of them is answered: there is
 * no back out of it (README "Ringing").
 */
export function NewOrderTakeover({
  active,
  disabled,
  onAccept,
  onReject,
  refetch,
}: {
  active: MerchantOrderResponse;
  queued?: readonly MerchantOrderResponse[];
  disabled: boolean;
  onAccept: (orderId: string, prepMinutes: (typeof PREP_CHIPS_MIN)[number], unavailableDishIds: string[]) => Promise<void>;
  onReject: (orderId: string, reason: MerchantRejectionReasonCode) => Promise<void>;
  refetch: () => Promise<void>;
}) {
  const now = useNow();
  const toast = useToast();
  const [prepMinutes, setPrepMinutes] = useState<(typeof PREP_CHIPS_MIN)[number]>(15);
  const [unavailable, setUnavailable] = useState<Set<string>>(new Set());
  const [editing, setEditing] = useState(false);
  const [confirmDecline, setConfirmDecline] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Synchronous double-submit guard: two taps in one tick both read `submitting` as false. Order
  // assignment is a sensitive lane, so a fast double-tap must never double-accept or double-reject.
  const submittingRef = useRef(false);

  const preview = computeAcceptPreview(active.items, unavailable);
  const remainingMs = msUntil(active.acceptDeadlineAt, now);

  // Back is blocked here: the alarm must be answered (README "Ringing").
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") toast("Accept or decline to stop the alarm");
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [toast]);

  function toggleLine(dishId: string | null) {
    if (!editing || !dishId) return;
    const removing = !unavailable.has(dishId);
    setUnavailable((prev) => {
      const next = new Set(prev);
      if (next.has(dishId)) next.delete(dishId);
      else next.add(dishId);
      return next;
    });
    toast(removing ? "Removed · the customer approves" : "Item back on the order");
  }

  // A refusal here (usually a 409: the order already resolved) refetches, so a stale takeover clears
  // itself as soon as the fresh queue lands instead of waiting for the next poll.
  async function run(action: () => Promise<void>, done: string, failed: string) {
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSubmitting(true);
    setError(null);
    try {
      await action();
      toast(done);
    } catch (err) {
      setError(err instanceof Error ? err.message : failed);
      setConfirmDecline(false);
      await refetch().catch(() => {});
    } finally {
      setSubmitting(false);
      submittingRef.current = false;
    }
  }

  const accept = () =>
    run(() => onAccept(active.id, prepMinutes, [...unavailable]), `Accepted · customer told ${prepMinutes} min`, "Couldn't accept the order. Try again.");
  const decline = () => run(() => onReject(active.id, "other"), "Declined · the customer was told", "Couldn't decline the order. Try again.");

  const busy = disabled || submitting;
  const keep = active.items.length - [...unavailable].filter((id) => active.items.some((i) => i.dishId === id)).length;
  const acceptLabel = preview.hasUnavailable
    ? `Accept ${keep} of ${active.items.length} · ready in ${prepMinutes} min`
    : `Accept · ready in ${prepMinutes} min`;

  return (
    <div className="m-overlay" style={{ zIndex: 60 }}>
      <div className="m-overlay-frame" style={{ background: "var(--cta-fill)", display: "flex", flexDirection: "column" }} role="alertdialog" aria-label={`New order ${orderLabel(active)}`}>
        <div style={{ padding: "calc(10px + env(safe-area-inset-top)) 16px 14px", color: "var(--on-accent)", display: "flex", alignItems: "center", gap: 12 }}>
          <Icon name="volume-2" size={24} />
          <div style={{ flex: 1 }}>
            <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".06em", opacity: 0.85 }}>NEW ORDER</div>
            <div style={{ fontSize: 20, fontWeight: 700 }}>{orderLabel(active)}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            <div className="m-num" style={{ fontSize: 28, fontWeight: 700, lineHeight: 1 }}>
              {formatCountdown(remainingMs)}
            </div>
            <div style={{ fontSize: 11.5, opacity: 0.85 }}>to accept</div>
          </div>
        </div>

        <div
          style={{
            flex: 1,
            minHeight: 0,
            overflowY: "auto",
            background: "var(--bg)",
            borderRadius: "20px 20px 0 0",
            padding: "16px 16px calc(16px + env(safe-area-inset-bottom))",
            display: "flex",
            flexDirection: "column",
            gap: 10,
          }}
        >
          {active.items.map((item, idx) => {
            const out = !!item.dishId && unavailable.has(item.dishId);
            return (
              <div key={`${item.dishId ?? "item"}-${idx}`}>
                <button
                  type="button"
                  className="m-li"
                  style={{ minHeight: 48, opacity: out ? 0.4 : 1, textDecoration: out ? "line-through" : undefined, cursor: editing ? "pointer" : "default" }}
                  aria-pressed={editing ? out : undefined}
                  onClick={() => toggleLine(item.dishId)}
                >
                  <b style={{ fontSize: 15, width: 26 }}>{item.quantity}×</b>
                  <div className="m-t">
                    <b>{item.name}</b>
                  </div>
                  <span className="m-num" style={{ fontSize: 14 }}>
                    {money(item.priceUsd * item.quantity)}
                  </span>
                </button>
                {item.note && (
                  <div style={{ fontSize: 13, color: "var(--highlight-ink)", background: "var(--highlight-wash)", borderRadius: 10, padding: "8px 10px", margin: "8px 0 0 38px" }}>
                    “{item.note}”
                  </div>
                )}
              </div>
            );
          })}
          {active.note && (
            <div style={{ fontSize: 13, color: "var(--highlight-ink)", background: "var(--highlight-wash)", borderRadius: 10, padding: "8px 10px" }}>“{active.note}”</div>
          )}

          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
            <span style={{ fontSize: 13, color: "var(--muted)" }}>Order total</span>
            <b className="m-num" style={{ fontSize: 24 }}>
              {money(preview.total)}
            </b>
          </div>
          <button
            type="button"
            className="m-lnk"
            style={{ minHeight: 28, justifyContent: "flex-start", fontSize: 13 }}
            onClick={() => {
              setEditing((e) => !e);
              if (!editing) toast("Tap an item to remove it");
            }}
          >
            {editing ? "Done editing" : "Edit items"}
          </button>

          <div style={{ flex: 1 }} />

          {error && (
            <div className="m-alert" role="alert">
              {error}
            </div>
          )}
          <div style={{ fontSize: 12, fontWeight: 700, letterSpacing: ".05em", color: "var(--muted)" }}>READY IN (MIN)</div>
          <div className="m-chips" style={{ gap: 6 }} role="radiogroup" aria-label="Ready in">
            {PREP_CHIPS_MIN.map((m) => (
              <button
                key={m}
                type="button"
                role="radio"
                aria-checked={prepMinutes === m}
                className={`m-chip${prepMinutes === m ? " m-on" : ""}`}
                style={{ flex: 1, justifyContent: "center", padding: 0 }}
                onClick={() => setPrepMinutes(m)}
              >
                {m}
              </button>
            ))}
          </div>
          <button type="button" className="m-btn" disabled={busy} onClick={() => void accept()}>
            {acceptLabel}
          </button>
          <button type="button" className="m-lnk m-red" style={{ minHeight: 36 }} disabled={busy} onClick={() => setConfirmDecline(true)}>
            Can’t take it
          </button>
        </div>
      </div>

      {confirmDecline && (
        <ConfirmSheet
          title="Decline this order?"
          body="The customer is told straight away."
          confirmLabel="Decline order"
          busy={submitting}
          onConfirm={() => void decline()}
          onCancel={() => setConfirmDecline(false)}
        />
      )}
    </div>
  );
}
