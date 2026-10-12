"use client";

import { REASONS } from "../lib/reasons";
import { decideKyc, resetKycAttempts } from "../riders/actions";
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
 * application → support. Decline is offered only while the check is `pending`.
 *
 * Owner 2026-10-12: rendered for `failed` and `expired` bikers too, not only `pending` — the review screen
 * hides it only once the biker is verified. A declined or expired biker can be approved (ops verified them
 * another way) or have their tries reset: "Reset attempts…" (`canReset`) gives a biker who used tries — a
 * locked one included — a fresh start: attempts back to 0, the decline reason cleared, the check reopened
 * (`resetKycAttempts`, audited `rider.kyc_reset` in the same transaction). It requires a note.
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
  status = "pending",
  canReset = false,
}: {
  profileId: string;
  name: string;
  /** Attempt number for the decline copy (2 = the single allowed resubmit; a decline now locks). */
  attempt: number;
  face?: string;
  connected: boolean;
  unfinishedCheck?: boolean;
  /** The biker's KYC status: decline is offered only while `pending`. */
  status?: "pending" | "failed" | "expired";
  /** Offer "Reset attempts…": the biker has used tries, or is declined / expired. */
  canReset?: boolean;
}) {
  const path = `/riders/${profileId}/kyc`;
  const isResubmit = attempt >= 2;
  // decideKyc returns a refusal instead of throwing it (Next redacts a thrown server-action message in
  // production). Re-thrown here, the modal stays open and shows it in the API's own words, e.g. a D-75
  // approval refused because the ID-check number is on another live account.
  const decide = async (decision: "verified" | "failed", reasonCode: string | null, note: string) => {
    const res = await decideKyc(profileId, decision, reasonCode, note);
    if (!res.ok) throw new Error(res.message);
  };
  const reset = async (note: string) => {
    const res = await resetKycAttempts(profileId, note);
    if (!res.ok) throw new Error(res.message);
  };

  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
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
      {status === "pending" ? (
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
      ) : null}
      {canReset ? (
        <ConfirmModal
          action="rider.kyc_reset"
          target={name}
          path={path}
          auditInEndpoint
          triggerLabel="Reset attempts…"
          disabled={!connected}
          title={`Reset ${name}'s ID check attempts?`}
          consequence={
            <span>
              Their attempts go back to <b>0</b> and the decline reason is cleared. The check reopens: they can start a
              new ID check from the app, and get a notification to finish it.
            </span>
          }
          noteRequired
          notePlaceholder="Why this biker gets their tries back"
          confirmLabel="Reset attempts"
          onConfirm={(r) => reset(r.note)}
        />
      ) : null}
    </div>
  );
}
