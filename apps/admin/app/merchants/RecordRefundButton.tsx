"use client";

import { REASONS } from "../lib/reasons";
import { ConfirmModal } from "../components/ConfirmModal";
import { recordRefund } from "./actions";
import { shortId } from "../lib/format";

/** N-12: clears a "Refunds past SLA" row once support has checked the merchant refunded the customer outside
 *  the app. It records the refund time only: LyniaGo never holds the money, so nothing is paid from here. */
export function RecordRefundButton({ orderId, connected }: { orderId: string; connected: boolean }) {
  return (
    <ConfirmModal
      action="order.refund_record"
      auditInEndpoint
      target={orderId}
      path="/merchants/disputes"
      triggerLabel="Refund done…"
      triggerVariant="ghost"
      disabled={!connected}
      title={`Record the refund on order ${shortId(orderId)}?`}
      consequence="Only once the customer has the money back. Nothing is paid from here: it records that the merchant refunded them."
      reasons={REASONS.refundRecord}
      notePlaceholder="How was it refunded, and who confirmed? (optional)"
      confirmLabel="Record refund"
      onConfirm={async (r) => {
        const res = await recordRefund(orderId, r.reasonCode, r.note);
        if (!res.ok) throw new Error(res.message);
      }}
    />
  );
}
