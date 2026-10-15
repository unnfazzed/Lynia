"use client";

import { setSelfieCheck } from "../riders/actions";
import { ConfirmModal } from "./ConfirmModal";

/**
 * Owner 2026-10-15: the selfie actions on a VERIFIED biker's KYC review. "Ask for a selfie re-check…" sends the
 * biker a reminder push and puts a Redo on their Bike & documents ID row — it never stops them going online (the
 * owner chose a reminder, not a gate). "Mark selfie checked…" clears the flag once ops have looked at the selfie in
 * Didit themselves. Both write the flag and their audit row in one transaction (`auditInEndpoint`).
 *
 * `selfieCheck` decides what's offered: a re-check can be asked for at any time (again, to re-send the reminder);
 * "Mark checked" only while there is a flag to clear.
 */
export function SelfieCheckActions({
  profileId,
  name,
  connected,
  selfieCheck,
}: {
  profileId: string;
  name: string;
  connected: boolean;
  selfieCheck: "unverified" | "recheck_requested" | null;
}) {
  const path = `/riders/${profileId}/kyc`;
  const run = async (action: "request" | "clear", note: string) => {
    const res = await setSelfieCheck(profileId, action, note);
    if (!res.ok) throw new Error(res.message);
  };
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <ConfirmModal
        action="rider.selfie_recheck_request"
        target={name}
        path={path}
        auditInEndpoint
        triggerLabel={selfieCheck === "recheck_requested" ? "Remind again…" : "Ask for a selfie re-check…"}
        disabled={!connected}
        title={`Ask ${name} for a new selfie?`}
        consequence={
          <span>
            They get a notification and a <b>Redo</b> on their Bike &amp; documents screen. It&apos;s a reminder only:
            they <b>stay verified and can keep taking jobs</b> whether or not they do it. Suspend them separately if
            they must stop.
          </span>
        }
        notePlaceholder="Why you're asking (optional)"
        confirmLabel="Send the reminder"
        onConfirm={(r) => run("request", r.note)}
      />
      {selfieCheck ? (
        <ConfirmModal
          action="rider.selfie_check_clear"
          target={name}
          path={path}
          auditInEndpoint
          triggerLabel="Mark selfie checked…"
          disabled={!connected}
          title={`Mark ${name}'s selfie as checked?`}
          consequence={
            <span>
              The flag clears and any reminder stops. Do this only after you&apos;ve compared their selfie with the ID
              photo in Didit — say what you checked in the note.
            </span>
          }
          noteRequired
          notePlaceholder="What you checked, and where"
          confirmLabel="Mark checked"
          onConfirm={(r) => run("clear", r.note)}
        />
      ) : null}
    </div>
  );
}
