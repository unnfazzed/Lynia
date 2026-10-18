"use client";

import { ConfirmModal } from "../components/ConfirmModal";
import type { AdminReferralRow } from "../lib/adminTypes";
import { createReferralLink, markReferralPaid } from "./actions";

/**
 * Biker referrals (D-112): record the cash paid to the referrer for one verified friend. Once per referral;
 * the API refuses a friend who isn't verified. The endpoint writes the audit row, so `auditInEndpoint`.
 */
export function MarkPaidButton({ row, connected }: { row: AdminReferralRow; connected: boolean }) {
  if (row.paid || row.stage === "joined") return <span className="mut">—</span>;
  return (
    <ConfirmModal
      action="referral.paid"
      auditInEndpoint
      target={row.referrer.name}
      path="/referrals"
      triggerLabel="Mark paid…"
      triggerVariant="quiet"
      disabled={!connected}
      title={`Mark ${row.referrer.name} paid for ${row.friend.name}?`}
      consequence={
        <span>
          Records the cash you paid {row.referrer.name} for bringing in {row.friend.name}. Nothing is paid in the app. It can only be
          recorded once{row.flags.length ? <>, and this referral has warnings: check them first</> : null}.
        </span>
      }
      amount={{ label: "Cash paid", prefix: "$", placeholder: "0.00", required: true }}
      notePlaceholder="Optional: where or how you paid."
      confirmLabel="Mark paid"
      onConfirm={(v) => markReferralPaid(row.id, v.amount, v.note)}
    />
  );
}

/** The biker page's "Create referral link": mints the biker's one code for lyniago.com/r/<code>. */
export function CreateReferralLinkButton({ id, name, connected }: { id: string; name: string; connected: boolean }) {
  return (
    <ConfirmModal
      action="referral.link_create"
      auditInEndpoint
      target={name}
      path={`/riders/${id}`}
      triggerLabel="Create referral link"
      triggerVariant="quiet"
      disabled={!connected}
      title={`Create ${name}'s referral link?`}
      consequence="Gives this biker a personal link to share. Friends who install the app from it on Android and become bikers show on the Referrals page. The link never changes."
      confirmLabel="Create link"
      onConfirm={() => createReferralLink(id)}
    />
  );
}
