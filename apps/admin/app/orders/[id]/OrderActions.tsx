"use client";

import { tokens } from "@lynia/shared";
import { REASONS } from "../../lib/reasons";
import { ConfirmModal } from "../../components/ConfirmModal";
import { cancelOrder, adjustFare, adjudicateDelivered } from "../actions";

/**
 * Admin order mutations (item 1) as reason-coded <ConfirmModal>s over the audit seam. On confirm each
 * writes the real change via a server action → `POST /admin/orders/:id/{cancel|fare}`. Fare-adjust adds
 * a required numeric "new fare" input; the reason radio drives the audit reasonCode either way. Inert
 * off the connected path.
 */

export function FareAdjust({
  id,
  agreedOrProposed,
  connected,
}: {
  id: string;
  agreedOrProposed: string;
  connected: boolean;
}) {
  return (
    <ConfirmModal
      action="order.adjust_fare"
      auditInEndpoint // endpoint writes the audit row in-tx (A-01) — don't double-record
      target={id}
      path={`/orders/${id}`}
      triggerLabel="Adjust fare / refund"
      triggerVariant="ghost"
      disabled={!connected}
      title="Adjust fare / record refund"
      consequence={
        <span>
          Order <b>{id}</b> · current fare <b>${agreedOrProposed}</b>. A cash refund is only <b>recorded</b> here —
          automatic netting off the rider&apos;s settlement arrives with the commission/billing infra (not yet live),
          which will then consume this record.
        </span>
      }
      reasons={REASONS.orderAdjustFare}
      amount={{ label: "New fare", prefix: "$", placeholder: agreedOrProposed, required: true }}
      confirmLabel="Record adjustment"
      onConfirm={(r) => adjustFare(id, r.amount, r.reasonCode, r.note)}
    />
  );
}

/**
 * KB-POD-DISPUTE Phase B: overturn a rider-raised `undelivered` outcome to `delivered` when the
 * proof-of-drop evidence (shown above this control) supports it. Force-completes the order, credits the
 * rider a clean trip, and charges commission. Rendered only on an `undelivered` order with a rider.
 */
export function AdjudicateDelivered({
  id,
  connected,
  hasEvidence,
}: {
  id: string;
  connected: boolean;
  /** Whether the order carries rider-attached proof-of-drop (the evidence "the proof above" refers to).
   *  False on the majority of undelivered orders — capture is optional — so warn the operator plainly. */
  hasEvidence: boolean;
}) {
  return (
    <ConfirmModal
      action="order.adjudicate_delivered"
      auditInEndpoint // endpoint writes the audit row in-tx — don't double-record
      target={id}
      path={`/orders/${id}`}
      triggerLabel="Mark delivered (code bypass)…"
      triggerVariant="ghost"
      disabled={!connected}
      title="Adjudicate this delivery as complete?"
      consequence={
        <span>
          {!hasEvidence ? (
            <b style={{ color: tokens.color.danger }}>
              ⚠️ No proof-of-drop evidence was submitted for this order — you&apos;re overriding based on the reason and
              note alone.{" "}
            </b>
          ) : null}
          Overturns the <b>undelivered</b> outcome on order <b>{id}</b> to <b>delivered</b>
          {hasEvidence ? " — only when the proof above confirms the drop and the recipient withheld the code" : ""}. The
          rider is credited a completed trip and commission; the customer is notified and can contest within 48 hours.
          Recorded in the audit log.
        </span>
      }
      reasons={REASONS.orderAdjudicateDelivered}
      confirmLabel="Mark delivered"
      onConfirm={(r) => adjudicateDelivered(id, r.reasonCode, r.note)}
    />
  );
}

export function CancelOrder({ id, connected }: { id: string; connected: boolean }) {
  return (
    <ConfirmModal
      action="order.cancel"
      auditInEndpoint // endpoint writes the audit row in-tx (A-01) — don't double-record
      target={id}
      path={`/orders/${id}`}
      triggerLabel="Cancel order…"
      triggerVariant="danger"
      danger
      disabled={!connected}
      title="Cancel this order?"
      consequence={
        <span>
          Order <b>{id}</b> will be cancelled for both sides. The customer is notified and can re-broadcast; the rider
          gets no strike if the reason is not theirs.
        </span>
      }
      reasons={REASONS.orderCancel}
      confirmLabel="Cancel order"
      onConfirm={(r) => cancelOrder(id, r.reasonCode, r.note)}
    />
  );
}
