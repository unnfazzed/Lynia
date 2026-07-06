"use client";

import { ConfirmModal } from "../components/ConfirmModal";
import { REASONS } from "../lib/reasons";
import { recordSettlement } from "./actions";

/**
 * A-06 record-payment control. Wraps the reason-code <ConfirmModal> (the audit seam) and, on confirm,
 * writes the real settlement via `recordSettlement` → `POST /admin/cash/settlements/:id/pay`. The
 * required radio doubles as the settlement method (cash at agent / EcoCash / netted) and rides along
 * as the audit reasonCode. Inert when `connected` is false — matching offline discipline.
 */
export function RecordPayment({
  id,
  name,
  amountDue,
  refundsNetted,
  connected,
}: {
  id: string;
  name: string;
  amountDue: string;
  refundsNetted: string;
  connected: boolean;
}) {
  const netted = refundsNetted && refundsNetted !== "0";
  return (
    <ConfirmModal
      action="cash.settle"
      target={name}
      path="/cash"
      triggerLabel="Record payment…"
      triggerVariant="ghost"
      disabled={!connected}
      title={`Record settlement — ${name}`}
      consequence={
        <span>
          Amount due: <b>${amountDue}</b>
          {netted ? <span className="mut"> (${refundsNetted} refunds already netted)</span> : null}. Confirm only after
          the money is received.
        </span>
      }
      reasons={REASONS.cashSettle}
      confirmLabel="Mark settled"
      onConfirm={(r) => recordSettlement(id, name, r.reasonCode, r.note)}
    />
  );
}
