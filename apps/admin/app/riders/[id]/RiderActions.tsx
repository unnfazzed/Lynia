"use client";

import { REASONS } from "../../lib/reasons";
import { ConfirmModal } from "../../components/ConfirmModal";
import { mutateRider } from "../actions";
import { IconPhone } from "../../components/icons";

/**
 * Rider account-status actions (item 1). Suspended riders get Lift + Ban; an active rider the
 * reliability engine has put on hold gets Clear hold + Call + Suspend (an on_hold rider can never earn
 * their way back — the online-gate blocks going online at all, so `RECOVER_PER_COMPLETION` can never
 * run — this is the only escape); everyone else gets Call + Suspend. Each destructive action is
 * reason-coded through <ConfirmModal> (the audit seam) and, on confirm, writes the real account-status
 * change via `mutateRider` → `POST /admin/riders/:id/…`. Suspend/ban additionally require a note.
 * Triggers are inert off the connected path.
 */
export function RiderActions({
  id,
  name,
  suspended,
  onHold,
  suspendSummary,
  telHref,
  connected,
}: {
  id: string;
  name: string;
  suspended: boolean;
  /** Active rider locked out by the reliability engine (distinct from an admin suspension). */
  onHold: boolean;
  /** "{trips} trips · {rating}" for the suspend consequence copy. */
  suspendSummary: string;
  telHref: string;
  connected: boolean;
}) {
  if (suspended) {
    return (
      <>
        <ConfirmModal
          action="rider.lift_suspension"
          auditInEndpoint // endpoint writes the audit row in-tx (A-01) — don't double-record
          target={name}
          path={`/riders/${id}`}
          triggerLabel="Lift suspension…"
          triggerVariant="solid"
          disabled={!connected}
          title={`Lift suspension for ${name}?`}
          consequence="They can go online again immediately. Their strike count stays as it is."
          reasons={REASONS.riderLift}
          confirmLabel="Lift suspension"
          onConfirm={(r) => mutateRider(id, "lift", name, r.reasonCode, r.note)}
        />
        <ConfirmModal
          action="rider.ban"
          auditInEndpoint // endpoint writes the audit row in-tx (A-01) — don't double-record
          target={name}
          path={`/riders/${id}`}
          triggerLabel="Ban permanently…"
          triggerVariant="danger"
          danger
          disabled={!connected}
          title={`Permanently ban ${name}?`}
          consequence={
            <span>
              <b>This can&apos;t be undone from the console.</b> Their account is blocked. A fresh signup with the same
              bike registration or national ID is <b>not</b> automatically prevented — a duplicate ID only flags the new
              account for manual KYC review, so ops vigilance is still needed to catch a re-registration.
            </span>
          }
          reasons={REASONS.riderBan}
          noteRequired
          notePlaceholder="Required — describe the incident and evidence."
          confirmLabel="Ban rider"
          onConfirm={(r) => mutateRider(id, "ban", name, r.reasonCode, r.note)}
        />
      </>
    );
  }

  return (
    <>
      <a className="btn ghost" href={telHref}>
        <span style={{ display: "inline-flex", fontSize: 14 }}>
          <IconPhone />
        </span>
        Call rider
      </a>
      {onHold ? (
        <ConfirmModal
          action="rider.clear_hold"
          auditInEndpoint // endpoint writes the audit row in-tx (A-01) — don't double-record
          target={name}
          path={`/riders/${id}`}
          triggerLabel="Clear hold…"
          triggerVariant="solid"
          disabled={!connected}
          title={`Clear the reliability hold on ${name}?`}
          consequence="They can go online again immediately. This does not reset their cancel-strike count."
          reasons={REASONS.riderClearHold}
          confirmLabel="Clear hold"
          onConfirm={(r) => mutateRider(id, "clear-hold", name, r.reasonCode, r.note)}
        />
      ) : null}
      <ConfirmModal
        action="rider.suspend"
        auditInEndpoint // endpoint writes the audit row in-tx (A-01) — don't double-record
        target={name}
        path={`/riders/${id}`}
        triggerLabel="Suspend rider…"
        triggerVariant="danger"
        danger
        disabled={!connected}
        title={`Suspend ${name}?`}
        consequence={
          <span>
            They are taken offline immediately and can&apos;t accept work. <b>{suspendSummary}</b>. Suspension holds
            until an admin lifts it.
          </span>
        }
        reasons={REASONS.riderSuspend}
        noteRequired
        notePlaceholder="What happened? The rider sees this context when they contact support."
        confirmLabel="Suspend rider"
        onConfirm={(r) => mutateRider(id, "suspend", name, r.reasonCode, r.note)}
      />
    </>
  );
}
