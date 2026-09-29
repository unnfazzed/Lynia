"use client";

import { REASONS } from "../lib/reasons";
import { ConfirmModal } from "../components/ConfirmModal";
import { transferMerchantOwner } from "./actions";

/**
 * Merchant web upgrade L4 ("Owner rules"): the only way a business changes hands, for a sale or an owner
 * who lost their number. Support checks identity first (docs/MERCHANT-GO-LIVE-RUNBOOK.md §8), and the
 * note is required. The API refuses a number with no account, one on another business, a held account
 * and the current owner, and the modal shows that refusal in its own words.
 */
export function OwnerTransferButton({ merchantId, name, connected }: { merchantId: string; name: string; connected: boolean }) {
  return (
    <ConfirmModal
      action="merchant.owner_transfer"
      auditInEndpoint
      target={merchantId}
      path={`/merchants/${merchantId}`}
      triggerLabel="Hand over…"
      triggerVariant="ghost"
      disabled={!connected}
      danger
      title={`Hand ${name} to someone else?`}
      consequence="Only after checking who they are by a call or a visit, plus their ID. The new owner must have signed in to LyniaGo once, and be on this business's team or on no business. The old owner stays on the team as Staff."
      reasons={REASONS.merchantOwnerTransfer}
      textField={{ label: "New owner's phone", placeholder: "0771234567", required: true, inputMode: "tel" }}
      noteRequired
      notePlaceholder="Who did you speak to, and how did you check their ID?"
      confirmLabel="Hand over"
      onConfirm={async (r) => {
        const res = await transferMerchantOwner(merchantId, r.text, r.reasonCode, r.note);
        if (!res.ok) throw new Error(res.message);
      }}
    />
  );
}
