"use client";

import { REASONS } from "../lib/reasons";
import { ConfirmModal } from "../components/ConfirmModal";
import { setMerchantPilot } from "./actions";

/**
 * Merchant web upgrade L1: the go-live switch on a restaurant's or shop's profile (shops since ledger
 * D-58). Switching on is what makes the business visible to customers, so the confirm names the
 * runbook's checks (docs/MERCHANT-GO-LIVE-RUNBOOK.md); switching off is always allowed. The API refuses
 * a business with no pin and one with no live dish or item, and the modal shows that refusal in its own
 * words. A shop can be browsed but not yet ordered from (shop ordering waits for Order flow v2).
 */
export function GoLiveButton({
  merchantId,
  name,
  live,
  connected,
  shop = false,
  pharmacy = false,
}: {
  merchantId: string;
  name: string;
  live: boolean;
  connected: boolean;
  shop?: boolean;
  pharmacy?: boolean;
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
      consequence={
        shop
          ? `Customers can find it in ${pharmacy ? "Pharmacy" : "Shops"} and browse its items straight away. Only switch on once the runbook's checks pass: it answers its contact phone, the pin is where it is, it sells what it says${pharmacy ? ", its pharmacy licence is checked and it lists over-the-counter items only" : ""}, an item has a photo and a price, its hours are set, and the owner's name is recorded.`
          : "Customers can find it and order straight away. Only switch on once the runbook's checks pass: it answers its contact phone, the pin is where it is, it's a restaurant, a dish has a photo and a price, its hours are set, and the owner's name is recorded."
      }
      reasons={REASONS.merchantGoLive}
      notePlaceholder="Who did you speak to? (optional)"
      confirmLabel="Go live"
      onConfirm={onConfirm}
    />
  );
}
