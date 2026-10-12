"use client";

import { REASONS } from "../lib/reasons";
import { decideKyc } from "../riders/actions";
import { ConfirmModal } from "./ConfirmModal";
import { IconCheck } from "./icons";

/**
 * A-02 KYC decision pair (kit kyc.html `approve()` / `decline()`). Two reason-coded <ConfirmModal>s;
 * each `onConfirm` writes the real KYC decision via the `decideKyc` server action (approve → verified,
 * decline → failed + reason + attempt increment). The endpoint records the audit row in the SAME
 * transaction as the decision (A-01), so both modals set `auditInEndpoint` — no standalone audit POST,
 * which previously could persist a decision that never took effect.
 *
 * Approve carries no reason (it's not destructive); decline REQUIRES a code from `REASONS.kycDecline`.
 * On the single-resubmit-left attempt the decline consequence warns that a second decline locks the
 * application → support. When already locked or decided, the parent hides this and shows the terminal
 * state instead, so this component only renders for a pending, still-open review.
 *
 * `unfinishedCheck`: the rider never finished the Didit ID check (not started / in progress / abandoned /
 * expired, and not held). Approving is still possible — ops may have verified them another way — but the
 * modal says so plainly and REQUIRES a note, which lands on the in-transaction audit row, so an approval
 * without a finished check is never one click and never unexplained.
 */
export function KycDecision({
  profileId,
  name,
  face,
  attempt,
  connected,
  unfinishedCheck = false,
}: {
  profileId: string;
  name: string;
  /** Attempt number for the decline copy (2 = the single allowed resubmit; a decline now locks). */
  attempt: number;
  face?: string;
  connected: boolean;
  unfinishedCheck?: boolean;
}) {
  const path = `/riders/${profileId}/kyc`;
  const isResubmit = attempt >= 2;
  // decideKyc returns a refusal instead of throwing it (Next redacts a thrown server-action message in
  // production). Re-thrown here, the modal stays open and shows it in the API's own words, e.g. a D-75
  // approval refused because the ID-check number is on another live account.
  const decide = async (status: "verified" | "failed", reasonCode: string | null, note: string) => {
    const res = await decideKyc(profileId, status, reasonCode, note);
    if (!res.ok) throw new Error(res.message);
  };

  return (
    <div style={{ display: "flex", gap: 8 }}>
      <ConfirmModal
        action="rider.kyc_approve"
        target={name}
        path={path}
        auditInEndpoint
        triggerLabel="Approve biker"
        triggerVariant="solid"
        triggerIcon={<IconCheck />}
        disabled={!connected}
        title={`Approve ${name}?`}
        consequence={
          <span>
            {unfinishedCheck ? (
              <>
                <b>This biker hasn&apos;t finished the Didit ID check.</b> Approve only if you&apos;ve verified their
                identity another way, and say how in the note.{" "}
              </>
            ) : null}
            They&apos;ll be marked <b>verified</b> and can go online right away.
            {face ? <> Face match <b>{face}</b> · attempt {attempt}.</> : <> Attempt {attempt}.</>}
          </span>
        }
        noteRequired={unfinishedCheck}
        notePlaceholder={
          unfinishedCheck ? "How you verified this biker without a finished ID check" : undefined
        }
        confirmLabel={unfinishedCheck ? "Approve without the ID check" : "Approve biker"}
        onConfirm={(r) => decide("verified", null, r.note)}
      />
      <ConfirmModal
        action="rider.kyc_decline"
        target={name}
        path={path}
        auditInEndpoint
        triggerLabel="Decline…"
        triggerVariant="danger"
        danger
        disabled={!connected}
        title={`Decline ${name}?`}
        consequence={
          isResubmit ? (
            <span>
              This is <b>attempt 2</b> — a decline <b>locks the application</b> and the biker must contact support. No
              further resubmission is allowed.
            </span>
          ) : (
            <span>
              The biker sees the reason in the app and can fix and resubmit <b>once</b>. A second decline locks the
              application.
            </span>
          )
        }
        reasons={REASONS.kycDecline}
        confirmLabel="Decline application"
        onConfirm={(r) => decide("failed", r.reasonCode, r.note)}
      />
    </div>
  );
}
