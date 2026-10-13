"use client";

import { REASONS } from "../lib/reasons";
import { ConfirmModal } from "../components/ConfirmModal";
import { writeOffDebt } from "./actions";
import { shortId } from "../lib/format";

/** D3 (2026-10-07, MJ-RH1): closes a merchant's non-return report — writes the open food debt off (the
 *  merchant carries the loss, R-07) and lifts the rider's job lock. It never suspends the rider: that is
 *  the separate rider action. Reason required — a money write-off is always justified in the audit trail. */
export function WriteOffDebtButton({ orderId, connected }: { orderId: string; connected: boolean }) {
  return (
    <ConfirmModal
      action="order.debt_write_off"
      auditInEndpoint
      target={orderId}
      path="/merchants/disputes"
      triggerLabel="Write off…"
      triggerVariant="solid"
      disabled={!connected}
      title={`Write off the debt on order ${shortId(orderId)}?`}
      consequence="The merchant carries the loss. This doesn't suspend the biker — do that from their page if needed."
      reasons={REASONS.debtWriteOff}
      notePlaceholder="What did the biker and merchant say? (optional)"
      confirmLabel="Write off debt"
      onConfirm={(r) => writeOffDebt(orderId, r.reasonCode, r.note)}
    />
  );
}
