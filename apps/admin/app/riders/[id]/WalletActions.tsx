"use client";

import { ConfirmModal } from "../../components/ConfirmModal";
import { creditRiderWallet } from "../actions";

/**
 * DOC-16-03 rider-wallet credit control. A reason-coded <ConfirmModal> with an amount field that posts a
 * manual prepaid credit (the launch top-up rail). `auditInEndpoint` because WalletService.creditManual
 * writes the ledger + audit row transactionally — the modal must NOT also POST a standalone audit row.
 * Inert off the connected path.
 */
export function WalletCreditButton({ id, name, connected }: { id: string; name: string; connected: boolean }) {
  return (
    <ConfirmModal
      action="rider.wallet_credit"
      auditInEndpoint
      target={name}
      path={`/riders/${id}`}
      triggerLabel="Credit account…"
      triggerVariant="solid"
      disabled={!connected}
      title={`Credit ${name}'s commission account?`}
      consequence="Adds a manual prepaid credit to this rider's commission balance (e.g. a launch grace credit or a support correction). It lands on the wallet ledger below, attributed to you."
      amount={{ label: "Amount", prefix: "$", placeholder: "0.00", required: true }}
      noteRequired
      notePlaceholder="Why this credit — shows on the ledger (e.g. launch grace, support adjustment)."
      confirmLabel="Credit account"
      onConfirm={(v) => creditRiderWallet(id, v.amount, v.note, v.idempotencyKey)}
    />
  );
}
