"use client";

import { REASONS } from "../../lib/reasons";
import { ConfirmModal } from "../../components/ConfirmModal";
import { liftCashBan, mutateCustomer } from "../actions";

/**
 * S·2 customer account-hold actions. A held customer gets Lift; everyone else gets Hold. Each is
 * reason-coded through <ConfirmModal> (the audit seam) and, on confirm, writes the real state change
 * via `mutateCustomer` → `POST /admin/customers/:id/{hold|lift}`, whose endpoint records the audit row
 * in the same transaction (so `auditInEndpoint`). Triggers are inert off the connected path.
 */
export function CustomerActions({
  id,
  name,
  onHold,
  connected,
}: {
  id: string;
  name: string;
  onHold: boolean;
  connected: boolean;
}) {
  if (onHold) {
    return (
      <ConfirmModal
        action="customer.lift"
        auditInEndpoint
        target={name}
        path={`/customers/${id}`}
        triggerLabel="Lift hold…"
        triggerVariant="solid"
        disabled={!connected}
        title={`Lift the hold on ${name}?`}
        consequence="They can send parcels again immediately. The hold history stays on record."
        reasons={REASONS.customerLift}
        confirmLabel="Lift hold"
        onConfirm={(r) => mutateCustomer(id, "lift", r.reasonCode, r.note)}
      />
    );
  }
  return (
    <ConfirmModal
      action="customer.hold"
      auditInEndpoint
      target={name}
      path={`/customers/${id}`}
      triggerLabel="Hold account…"
      triggerVariant="danger"
      danger
      disabled={!connected}
      title={`Put ${name} on hold?`}
      consequence={
        <span>
          <b>They can&apos;t broadcast new parcels</b> until the hold is lifted. Existing orders are unaffected. This
          is reversible from the console.
        </span>
      }
      reasons={REASONS.customerHold}
      noteRequired
      notePlaceholder="What prompted the hold? The customer sees this context when they contact support."
      confirmLabel="Hold account"
      onConfirm={(r) => mutateCustomer(id, "hold", r.reasonCode, r.note)}
    />
  );
}

/** X1/R-08: lift a food cash-ban (R-08's only lift path — the ban itself is written by
 *  FoodDebtService.reportCustomerRefused, C4, with no console-side "apply" counterpart to pair it
 *  with). Shown only when the customer is actually cash-banned. */
export function LiftCashBanAction({ id, name, connected }: { id: string; name: string; connected: boolean }) {
  return (
    <ConfirmModal
      action="customer.cash_ban_lift"
      auditInEndpoint
      target={name}
      path={`/customers/${id}`}
      triggerLabel="Lift cash-ban…"
      triggerVariant="solid"
      disabled={!connected}
      title={`Lift ${name}'s cash-ban?`}
      consequence="They can pay cash for food orders again immediately. The ban history stays on record."
      reasons={REASONS.cashBanLift}
      confirmLabel="Lift cash-ban"
      onConfirm={(r) => liftCashBan(id, r.reasonCode, r.note)}
    />
  );
}
