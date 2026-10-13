"use client";

import { ConfirmModal } from "../components/ConfirmModal";
import { REASONS } from "../lib/reasons";
import { nudgePerson } from "./actions";

/**
 * Admin console v2 §4: the Nudge action on one stuck-list row. Push only (owner decision 6). The copy is fixed
 * per list and shown before sending; the API writes the audit row (`auditInEndpoint`) and caps it at one per
 * person per list per Harare day. A row with no push device, or already nudged today, shows why instead.
 */
export function NudgeButton({
  profileId,
  name,
  step,
  copy,
  hasPush,
  nudgedToday,
  connected,
}: {
  profileId: string;
  name: string;
  step: string;
  copy: { title: string; body: string } | null;
  hasPush: boolean;
  nudgedToday: boolean;
  connected: boolean;
}) {
  if (!hasPush) return <span className="kpill mut">No push</span>;
  if (nudgedToday) return <span className="kpill good">Nudged today</span>;
  return (
    <span style={{ position: "relative", zIndex: 2 }}>
      <ConfirmModal
        action="person.nudge"
        auditInEndpoint
        target={name}
        path="/people"
        triggerLabel="Nudge"
        triggerVariant="ghost"
        disabled={!connected}
        title={`Nudge ${name}?`}
        consequence={
          copy ? (
            <span>
              Sends this push: <b>{copy.title}</b> {copy.body} One per person a day.
            </span>
          ) : (
            "Sends this list's push. One per person a day."
          )
        }
        reasons={REASONS.personNudge}
        confirmLabel="Send push"
        onConfirm={(v) => nudgePerson(profileId, step, v.reasonCode, v.note)}
      />
    </span>
  );
}
