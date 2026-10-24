"use client";

import { REASONS } from "../lib/reasons";
import { ConfirmModal } from "../components/ConfirmModal";
import { resolveHandshake } from "./actions";
import { shortId } from "../lib/format";

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
      title={`Resolve the payment dispute on order ${shortId(orderId)}?`}
      consequence="The customer's delivery code unlocks. Confirm only once both parties agree the amount."
      reasons={REASONS.handshakeResolve}
      notePlaceholder="What did the biker and customer say? (optional)"
      confirmLabel="Resolve dispute"
      onConfirm={async (r) => {
        const res = await resolveHandshake(orderId, r.reasonCode, r.note);
        if (!res.ok) throw new Error(res.message);
      }}
    />
  );
}
