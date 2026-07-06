"use client";

import { REASONS } from "../lib/reasons";
import { decideKyc } from "../riders/actions";
import { ConfirmModal } from "./ConfirmModal";
import { IconCheck } from "./icons";

/**
 * A-02 KYC decision pair (kit kyc.html `approve()` / `decline()`). Two reason-coded <ConfirmModal>s
 * over the audit seam; each `onConfirm` additionally writes the real KYC decision via the `decideKyc`
 * server action (approve → verified, decline → failed + reason + attempt increment).
 *
 * Approve carries no reason (it's not destructive); decline REQUIRES a code from `REASONS.kycDecline`.
 * On the single-resubmit-left attempt the decline consequence warns that a second decline locks the
 * application → support. When already locked or decided, the parent hides this and shows the terminal
 * state instead, so this component only renders for a pending, still-open review.
 */
export function KycDecision({
  profileId,
  name,
  face,
  attempt,
  connected,
}: {
  profileId: string;
  name: string;
  /** Attempt number for the decline copy (2 = the single allowed resubmit; a decline now locks). */
  attempt: number;
  face?: string;
  connected: boolean;
}) {
  const path = `/riders/${profileId}/kyc`;
  const isResubmit = attempt >= 2;

  return (
    <div style={{ display: "flex", gap: 8 }}>
      <ConfirmModal
        action="rider.kyc_approve"
        target={name}
        path={path}
        triggerLabel="Approve rider"
        triggerVariant="solid"
        triggerIcon={<IconCheck />}
        disabled={!connected}
        title={`Approve ${name}?`}
        consequence={
          <span>
            They&apos;ll be marked <b>verified</b> and can go online right away.
            {face ? <> Face match <b>{face}</b> · attempt {attempt}.</> : <> Attempt {attempt}.</>}
          </span>
        }
        confirmLabel="Approve rider"
        onConfirm={() => decideKyc(profileId, "verified", null)}
      />
      <ConfirmModal
        action="rider.kyc_decline"
        target={name}
        path={path}
        triggerLabel="Decline…"
        triggerVariant="danger"
        danger
        disabled={!connected}
        title={`Decline ${name}?`}
        consequence={
          isResubmit ? (
            <span>
              This is <b>attempt 2</b> — a decline <b>locks the application</b> and the rider must contact support. No
              further resubmission is allowed.
            </span>
          ) : (
            <span>
              The rider sees the reason in the app and can fix and resubmit <b>once</b>. A second decline locks the
              application.
            </span>
          )
        }
        reasons={REASONS.kycDecline}
        confirmLabel="Decline application"
        onConfirm={(r) => decideKyc(profileId, "failed", r.reasonCode)}
      />
    </div>
  );
}
