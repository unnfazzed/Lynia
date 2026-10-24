"use client";

import { MERCHANT_SHOP_KIND_LABELS, type MerchantShopKind } from "@lynia/shared";
import { ConfirmModal } from "../components/ConfirmModal";
import { setMerchantShopKind } from "./actions";

/**
 * Correct what kind of shop a business is: sign-up asks the owner, and a pharmacy can sign up as "something
 * else", out of the licence check. The kinds are the modal's choices; the endpoint writes the audit row. A
 * pharmacy then goes (back) live only with a recorded, verified licence.
 */
export function ShopKindButton({ merchantId, name, current, connected }: { merchantId: string; name: string; current: string | null; connected: boolean }) {
  const kinds = (Object.keys(MERCHANT_SHOP_KIND_LABELS) as MerchantShopKind[])
    .filter((k) => k !== current)
    .map((k) => ({ value: k, label: MERCHANT_SHOP_KIND_LABELS[k] }));
  return (
    <ConfirmModal
      action="merchant.shop_kind"
      auditInEndpoint
      target={merchantId}
      path={`/merchants/${merchantId}`}
      triggerLabel="Change kind…"
      triggerVariant="ghost"
      disabled={!connected}
      title={`What kind of shop is ${name}?`}
      consequence="It moves to that section for customers. A pharmacy needs a recorded, verified licence before it is live."
      reasons={kinds}
      reasonLabel="Kind"
      notePlaceholder="How do you know? (optional)"
      confirmLabel="Change kind"
      onConfirm={async (r) => {
        const res = await setMerchantShopKind(merchantId, r.reasonCode, r.note);
        if (!res.ok) throw new Error(res.message);
      }}
    />
  );
}
