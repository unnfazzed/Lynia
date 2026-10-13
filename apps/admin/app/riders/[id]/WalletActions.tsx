"use client";

import { ConfirmModal } from "../../components/ConfirmModal";
import { money } from "../../lib/format";
import { REVERSAL_CAP } from "../../lib/money-labels";
import { REASONS } from "../../lib/reasons";
import { creditRiderWallet, reverseRiderWallet } from "../actions";

/**
 * Admin console v2 §6: take money off a biker's balance — a reversal. With `entry` it corrects that credit
 * (the API refuses more than is left of it); without, it is a plain correction. Capped per action; the note is
 * required because the biker sees it. The endpoint writes the ledger + audit rows, so `auditInEndpoint`.
 */
export function WalletReverseButton({
  id,
  name,
  connected,
  entry,
}: {
  id: string;
  name: string;
  connected: boolean;
  entry?: { id: string; amount: string; reversed: string | null; label: string };
}) {
  const left = entry ? Math.max(0, Math.round((Number(entry.amount) - Number(entry.reversed ?? 0)) * 100) / 100) : null;
  const cap = left != null ? Math.min(left, REVERSAL_CAP) : REVERSAL_CAP;
  if (left != null && left <= 0) return null;
  return (
    <ConfirmModal
      action="wallet.reversal"
      auditInEndpoint
      target={name}
      path={`/riders/${id}`}
      triggerLabel={entry ? "Reverse…" : "Take off balance…"}
      triggerVariant={entry ? "quiet" : "ghost"}
      disabled={!connected}
      title={entry ? `Reverse this ${entry.label.toLowerCase()}?` : `Take money off ${name}'s balance?`}
      consequence={
        <span>
          Takes the amount off the balance as a reversal{entry ? <> against this {money(entry.amount)} entry</> : null}. At most{" "}
          <b>{money(cap)}</b>. The balance can go below $0. The biker sees your note.
        </span>
      }
      amount={{ label: "Amount", prefix: "$", placeholder: cap.toFixed(2), required: true }}
      reasons={REASONS.walletReversal}
      noteRequired
      notePlaceholder="Why — the biker sees this on their wallet."
      confirmLabel="Reverse"
      danger
      onConfirm={(v) => reverseRiderWallet(id, v.amount, v.reasonCode, v.note, v.idempotencyKey, entry?.id ?? null)}
    />
  );
}

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
      consequence="Adds a manual prepaid credit to this biker's commission balance (e.g. a starting credit or a support correction). It lands on the wallet ledger below, attributed to you."
      amount={{ label: "Amount", prefix: "$", placeholder: "0.00", required: true }}
      noteRequired
      notePlaceholder="Why this credit — shows on the ledger (e.g. launch grace, support adjustment)."
      confirmLabel="Credit account"
      onConfirm={(v) => creditRiderWallet(id, v.amount, v.note, v.idempotencyKey)}
    />
  );
}
