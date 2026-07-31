"use client";

import { REASONS } from "../lib/reasons";
import { ConfirmModal } from "../components/ConfirmModal";
import { resolveHandshake } from "./actions";

/** X1: the one action on the R-05 dispute queue — releases a frozen doorstep handshake (rider's job
 *  lock + the customer's masked delivery code) once support has called both parties. Reason required —
 *  overriding a money mismatch is always justified in the audit trail. */
export function ResolveHandshakeButton({ orderId, connected }: { orderId: string; connected: boolean }) {
  return (
    <ConfirmModal
      action="order.handshake_resolve"
      auditInEndpoint
      target={orderId}
      path="/merchants/disputes"
      triggerLabel="Resolve…"
      triggerVariant="solid"
      disabled={!connected}
      title={`Resolve the payment dispute on order ${orderId.slice(0, 8)}?`}
      consequence="The rider can take new deliveries again and the customer's delivery code unlocks. Only confirm once you've verified the amount with both parties."
      reasons={REASONS.handshakeResolve}
      notePlaceholder="What did the rider and customer say? (optional)"
      confirmLabel="Resolve dispute"
      onConfirm={(r) => resolveHandshake(orderId, r.reasonCode, r.note)}
    />
  );
}
