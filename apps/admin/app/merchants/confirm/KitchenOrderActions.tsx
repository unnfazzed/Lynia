"use client";

import { useRef, useState, useTransition } from "react";
import { fromCents, toCents } from "@lynia/shared";
import type { KitchenConfirmationLine } from "../../lib/adminTypes";
import { REASONS } from "../../lib/reasons";
import { ConfirmModal } from "../../components/ConfirmModal";
import {
  cancelKitchenOrder,
  confirmKitchenOrder,
  editKitchenOrderItems,
  logKitchenNoAnswer,
  type KitchenActionResult,
} from "./actions";

/** Most of one line the API accepts (EditMerchantOrderItemsRequest: quantity 0–99). */
const MAX_QTY = 99;

const money = (usd: number) => `$${usd.toFixed(2)}`;

/**
 * The ops call list's per-order actions (auto-accept, docs/plans/2026-09-30-restaurant-auto-accept.md):
 * Confirmed · No answer · Change items (inline editor) · Can't make it (the reason-coded cancel).
 * Each endpoint writes its own audit row; the list refetches after every action (the server action
 * revalidates it). A failed write shows the API's own message inline, like AcknowledgeButton.
 */
export function KitchenOrderActions({
  orderId,
  restaurantName,
  items,
  connected,
}: {
  orderId: string;
  restaurantName: string;
  items: KitchenConfirmationLine[];
  connected: boolean;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState(false);
  const [qty, setQty] = useState<Record<string, number>>({});
  // Same guard as AcknowledgeButton (CF-02-SIB-4): `pending` only reflects the first of two same-tick
  // clicks, so a synchronous ref stops a double-tap writing two audit rows.
  const inFlightRef = useRef(false);

  function run(action: () => Promise<KitchenActionResult>, after?: () => void) {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setError(null);
    startTransition(async () => {
      try {
        const res = await action();
        if (res.ok) after?.();
        else setError(res.message);
      } catch (e) {
        setError(e instanceof Error ? e.message : "That didn't go through — try again.");
      } finally {
        inFlightRef.current = false;
      }
    });
  }

  function openEditor() {
    setQty(Object.fromEntries(items.map((it) => [it.itemId, it.removed ? 0 : it.quantity])));
    setError(null);
    setEditing(true);
  }

  const step = (itemId: string, by: number) =>
    setQty((q) => ({ ...q, [itemId]: Math.min(MAX_QTY, Math.max(0, (q[itemId] ?? 0) + by)) }));

  const anyLeft = items.some((it) => (qty[it.itemId] ?? 0) > 0);
  const busy = pending || !connected;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--space-sm)" }}>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--space-sm)" }}>
        <button type="button" className="btn solid" disabled={busy} onClick={() => run(() => confirmKitchenOrder(orderId))}>
          Confirmed
        </button>
        <button type="button" className="btn ghost" disabled={busy} onClick={() => run(() => logKitchenNoAnswer(orderId))}>
          No answer
        </button>
        <button type="button" className="btn ghost" disabled={busy || editing} onClick={openEditor}>
          Change items
        </button>
        <ConfirmModal
          action="order.cancel"
          auditInEndpoint // the cancel endpoint writes the audit row in-tx (A-01) — don't double-record
          target={orderId}
          path="/merchants/confirm"
          triggerLabel="Can't make it"
          triggerVariant="danger"
          danger
          disabled={busy}
          title={`Cancel this order from ${restaurantName}?`}
          consequence="The order is cancelled and the customer is told straight away. No rider is sent."
          reasons={REASONS.kitchenCancel}
          notePlaceholder="What did the restaurant say? (optional)"
          confirmLabel="Cancel order"
          onConfirm={async (r) => {
            const res = await cancelKitchenOrder(orderId, r.reasonCode, r.note);
            if (!res.ok) throw new Error(res.message);
          }}
        />
      </div>

      {editing ? (
        <div
          role="group"
          aria-label="Change items"
          style={{
            border: "1px solid var(--line)",
            borderRadius: "var(--radius-card)",
            padding: "var(--space-md)",
            display: "flex",
            flexDirection: "column",
            gap: "var(--space-sm)",
          }}
        >
          {items.map((it) => {
            const q = qty[it.itemId] ?? 0;
            return (
              <div key={it.itemId} style={{ display: "flex", alignItems: "center", gap: "var(--space-sm)", fontSize: 13 }}>
                <button
                  type="button"
                  className="btn ghost"
                  aria-label={`One less ${it.name}`}
                  disabled={pending || q === 0}
                  onClick={() => step(it.itemId, -1)}
                >
                  −
                </button>
                <span className="num" aria-label={`${it.name} quantity`} style={{ minWidth: 20, textAlign: "center", fontWeight: 600 }}>
                  {q}
                </span>
                <button
                  type="button"
                  className="btn ghost"
                  aria-label={`One more ${it.name}`}
                  disabled={pending || q >= MAX_QTY}
                  onClick={() => step(it.itemId, 1)}
                >
                  +
                </button>
                <span style={q === 0 ? { textDecoration: "line-through", color: "var(--muted)" } : undefined}>
                  {it.name} · {money(fromCents(toCents(it.priceUsd) * q))}
                </span>
                {q === 0 ? <span className="mut" style={{ fontSize: 12 }}>removed</span> : null}
              </div>
            );
          })}
          {!anyLeft ? (
            <span className="mut" style={{ fontSize: 12 }}>
              Keep at least one item. To drop the whole order, use Can&apos;t make it.
            </span>
          ) : null}
          <div style={{ display: "flex", gap: "var(--space-sm)" }}>
            <button
              type="button"
              className="btn solid"
              disabled={busy || !anyLeft}
              onClick={() =>
                run(
                  () => editKitchenOrderItems(orderId, items.map((it) => ({ itemId: it.itemId, quantity: qty[it.itemId] ?? 0 }))),
                  () => setEditing(false),
                )
              }
            >
              Save changes
            </button>
            <button type="button" className="btn quiet" disabled={pending} onClick={() => setEditing(false)}>
              Keep as is
            </button>
          </div>
        </div>
      ) : null}

      {error ? (
        <span role="alert" style={{ fontSize: 12, color: "var(--danger)" }}>
          {error}
        </span>
      ) : null}
    </div>
  );
}
