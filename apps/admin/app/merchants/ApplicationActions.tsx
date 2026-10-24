"use client";

import { MERCHANT_REJECT_REASONS, MERCHANT_REJECT_REASON_LABELS } from "@lynia/shared";
import { REASONS } from "../lib/reasons";
import { ConfirmModal } from "../components/ConfirmModal";
import type { MerchantApplication, MerchantApplicationAction } from "../lib/adminTypes";
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
    consequence: "The reason you pick is saved for the business in these words, and pushed to the owner's phone if they have LyniaGo notifications on. You can reopen it later.",
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
    consequence: "Customers stop seeing it and it takes no new orders. Orders in progress carry on; scheduled ones that haven't started are cancelled.",
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

const n = (count: number, one: string, many: string) => `${count} ${count === 1 ? one : many}`;

/**
 * The modal's consequence, with what this business's state adds: Go live / Resume into a customer section
 * that is switched off (customers still won't see it), and what a suspension leaves running.
 */
export function applicationConsequence(action: MerchantApplicationAction, app?: Pick<MerchantApplication, "section" | "orders"> | null): string {
  const base = COPY[action].consequence;
  if ((action === "go_live" || action === "resume") && app?.section?.enabled === false) {
    return `${base.replace(/( straight away)?\.$/, "")} once ${app.section.name} is switched on. It's off now, so customers can't see it yet.`;
  }
  if (action === "suspend" && app?.orders) {
    const { open, scheduled } = app.orders;
    const inProgress = `${n(open, "order", "orders")} in progress carry on.`;
    const later = scheduled > 0 ? ` ${n(scheduled, "scheduled order hasn't", "scheduled orders haven't")} started: each is cancelled when its time comes, and the customer is told.` : "";
    return `Customers stop seeing it and it takes no new orders. ${inProgress}${later}`;
  }
  return base;
}

export function ApplicationActionButton({
  merchantId,
  name,
  action,
  connected,
  app,
}: {
  merchantId: string;
  name: string;
  action: MerchantApplicationAction;
  connected: boolean;
  /** Adds the section and open-order facts to the consequence (applicationConsequence). */
  app?: Pick<MerchantApplication, "section" | "orders"> | null;
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
      consequence={applicationConsequence(action, app)}
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
