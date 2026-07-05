"use client";

import { REASONS } from "../../lib/reasons";
import { ConfirmModal } from "../../components/ConfirmModal";
import { cancelOrder, adjustFare } from "../actions";

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
          Order <b>{id}</b> · current fare <b>${agreedOrProposed}</b>. Cash refunds are paid out via the rider&apos;s next
          settlement.
        </span>
      }
      reasons={REASONS.orderAdjustFare}
      amount={{ label: "New fare", prefix: "$", placeholder: agreedOrProposed, required: true }}
      confirmLabel="Record adjustment"
      onConfirm={(r) => {
        void adjustFare(id, r.amount, r.reasonCode, r.note);
      }}
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
      onConfirm={(r) => {
        void cancelOrder(id, r.reasonCode, r.note);
      }}
    />
  );
}
