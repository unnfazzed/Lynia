"use client";

import { REASONS } from "../lib/reasons";
import { ConfirmModal } from "../components/ConfirmModal";
import { setMerchantPilot } from "./actions";

/**
 * Merchant web upgrade L1: the go-live switch on a restaurant's profile. Switching on is what makes a
 * restaurant visible to customers, so the confirm names the runbook's checks
 * (docs/MERCHANT-GO-LIVE-RUNBOOK.md); switching off is always allowed. The API refuses a shop, a
 * restaurant with no pin and one with no live dish, and the modal shows that refusal in its own words.
 */
export function GoLiveButton({
  merchantId,
  name,
  live,
  connected,
}: {
  merchantId: string;
  name: string;
  live: boolean;
  connected: boolean;
}) {
  const onConfirm = async (r: { reasonCode: string | null; note: string }) => {
    const res = await setMerchantPilot(merchantId, !live, r.reasonCode, r.note);
    if (!res.ok) throw new Error(res.message);
  };

  if (live) {
    return (
      <ConfirmModal
        action="merchant.go_dormant"
        auditInEndpoint
        target={merchantId}
        path={`/merchants/${merchantId}`}
        triggerLabel="Switch off…"
        triggerVariant="danger"
        disabled={!connected}
        danger
        title={`Switch ${name} off?`}
        consequence="Customers stop seeing it straight away. Orders already placed carry on as normal."
        reasons={REASONS.merchantGoDormant}
        notePlaceholder="What happened? (optional)"
        confirmLabel="Switch off"
        onConfirm={onConfirm}
      />
    );
  }

  return (
    <ConfirmModal
      action="merchant.go_live"
      auditInEndpoint
      target={merchantId}
      path={`/merchants/${merchantId}`}
      triggerLabel="Go live…"
      triggerVariant="solid"
      disabled={!connected}
      title={`Switch ${name} on?`}
      consequence="Customers can find it and order straight away. Only switch on once the runbook's checks pass: it answers its contact phone, the pin is where it is, it's a restaurant, a dish has a photo and a price, its hours are set, and the owner's name is recorded."
      reasons={REASONS.merchantGoLive}
      notePlaceholder="Who did you speak to? (optional)"
      confirmLabel="Go live"
      onConfirm={onConfirm}
    />
  );
}
