"use client";

import { MERCHANT_REJECT_REASONS, MERCHANT_REJECT_REASON_LABELS } from "@lynia/shared";
import { REASONS } from "../lib/reasons";
import { ConfirmModal } from "../components/ConfirmModal";
import type { MerchantApplicationAction } from "../lib/adminTypes";
import { logMerchantCall, moveMerchantApplication, recordMerchantLicence, verifyMerchantLicence } from "./actions";

const REJECT_REASONS = MERCHANT_REJECT_REASONS.map((r) => ({ value: r, label: MERCHANT_REJECT_REASON_LABELS[r] }));

/** The audit action each one writes (in the API's own transaction, hence `auditInEndpoint`). */
const AUDIT_ACTION: Record<MerchantApplicationAction, string> = {
  review: "merchant.application_review",
  approve: "merchant.application_approve",
  reject: "merchant.application_reject",
  go_live: "merchant.go_live",
  suspend: "merchant.suspend",
  resume: "merchant.resume",
};

/** Each application action's modal (admin console v2 §5). The API re-checks every rule and the modal shows its refusal. */
const COPY: Record<
  MerchantApplicationAction,
  { trigger: string; title: (name: string) => string; consequence: string; confirm: string; reasons: readonly (string | { value: string; label: string })[]; danger?: boolean; variant: "ghost" | "solid" | "danger" }
> = {
  review: {
    trigger: "Start review…",
    title: (n) => `Start reviewing ${n}?`,
    consequence: "It moves to In review. Customers still can't see it.",
    confirm: "Start review",
    reasons: REASONS.merchantReview,
    variant: "ghost",
  },
  approve: {
    trigger: "Approve…",
    title: (n) => `Approve ${n}?`,
    consequence: "Every required check passes. Approving doesn't put it live yet: use Go live next.",
    confirm: "Approve",
    reasons: REASONS.merchantApprove,
    variant: "solid",
  },
  reject: {
    trigger: "Reject…",
    title: (n) => `Reject ${n}?`,
    consequence: "The business is told the reason you pick, in these words. You can reopen it later.",
    confirm: "Reject",
    reasons: REJECT_REASONS,
    danger: true,
    variant: "danger",
  },
  go_live: {
    trigger: "Go live…",
    title: (n) => `Put ${n} live?`,
    consequence: "Customers can find it and order straight away.",
    confirm: "Go live",
    reasons: REASONS.merchantGoLive,
    variant: "solid",
  },
  suspend: {
    trigger: "Suspend…",
    title: (n) => `Suspend ${n}?`,
    consequence: "Customers stop seeing it and it takes no new orders. Orders already placed carry on.",
    confirm: "Suspend",
    reasons: REASONS.merchantSuspend,
    danger: true,
    variant: "danger",
  },
  resume: {
    trigger: "Resume…",
    title: (n) => `Resume ${n}?`,
    consequence: "Customers can find it and order again straight away.",
    confirm: "Resume",
    reasons: REASONS.merchantResume,
    variant: "solid",
  },
};

export function ApplicationActionButton({
  merchantId,
  name,
  action,
  connected,
}: {
  merchantId: string;
  name: string;
  action: MerchantApplicationAction;
  connected: boolean;
}) {
  const c = COPY[action];
  return (
    <ConfirmModal
      action={AUDIT_ACTION[action]}
      auditInEndpoint
      target={merchantId}
      path={`/merchants/${merchantId}`}
      triggerLabel={c.trigger}
      triggerVariant={c.variant}
      disabled={!connected}
      danger={c.danger}
      title={c.title(name)}
      consequence={c.consequence}
      reasons={c.reasons}
      notePlaceholder="Anything ops should know? (optional)"
      confirmLabel={c.confirm}
      onConfirm={async (r) => {
        const res = await moveMerchantApplication(merchantId, action, r.reasonCode, r.note);
        if (!res.ok) throw new Error(res.message);
      }}
    />
  );
}

/** Log an ops call. Only a call that reached the business ticks the checklist. */
export function LogCallButton({ merchantId, name, connected }: { merchantId: string; name: string; connected: boolean }) {
  return (
    <ConfirmModal
      action="merchant.application_call"
      auditInEndpoint
      target={merchantId}
      path={`/merchants/${merchantId}`}
      triggerLabel="Log call…"
      triggerVariant="ghost"
      disabled={!connected}
      title={`Log a call to ${name}`}
      consequence="Recorded on the application."
      reasons={REASONS.merchantCall}
      notePlaceholder="Who did you speak to? What did they say?"
      confirmLabel="Log call"
      onConfirm={async (r) => {
        const res = await logMerchantCall(merchantId, r.reasonCode, r.note);
        if (!res.ok) throw new Error(res.message);
      }}
    />
  );
}

/** Owner decision 5: ops records a pharmacy's licence after the call, then marks it verified. */
export function LicenceButtons({
  merchantId,
  name,
  connected,
  recorded,
  verified,
}: {
  merchantId: string;
  name: string;
  connected: boolean;
  recorded: boolean;
  verified: boolean;
}) {
  return (
    <>
      <ConfirmModal
        action="merchant.licence_record"
        auditInEndpoint
        target={merchantId}
        path={`/merchants/${merchantId}`}
        triggerLabel={recorded ? "Edit licence…" : "Record licence…"}
        triggerVariant="ghost"
        disabled={!connected}
        title={`${name}'s pharmacy licence`}
        consequence={recorded ? "A different number or pharmacist needs verifying again." : "Then mark it verified once you've seen it."}
        textField={{ label: "Licence number", placeholder: "e.g. PCZ 01234", required: true }}
        textFields={[
          { label: "Pharmacist on the licence", placeholder: "Full name", required: true },
          { label: "Where the copy is", placeholder: "e.g. WhatsApp photo, 13 Oct" },
        ]}
        notePlaceholder="Anything else? (optional)"
        confirmLabel="Save licence"
        onConfirm={async (r) => {
          const res = await recordMerchantLicence(merchantId, { licenceNumber: r.text, pharmacistName: r.texts[0] ?? "", reference: r.texts[1] ?? "" }, r.note);
          if (!res.ok) throw new Error(res.message);
        }}
      />
      {recorded && !verified ? (
        <ConfirmModal
          action="merchant.licence_verify"
          auditInEndpoint
          target={merchantId}
          path={`/merchants/${merchantId}`}
          triggerLabel="Mark verified…"
          triggerVariant="solid"
          disabled={!connected}
          title="Mark the licence verified?"
          consequence="Only once you've seen the licence and it names this pharmacy."
          reasons={REASONS.merchantLicenceVerify}
          confirmLabel="Mark verified"
          onConfirm={async (r) => {
            const res = await verifyMerchantLicence(merchantId, r.reasonCode, r.note);
            if (!res.ok) throw new Error(res.message);
          }}
        />
      ) : null}
    </>
  );
}
