"use client";

import { IssueResolution } from "@lynia/shared";
import { REASONS } from "../../lib/reasons";
import { ConfirmModal } from "../../components/ConfirmModal";
import { resolveIssue } from "../actions";

/**
 * The three dispute resolutions (A-05) as reason-coded <ConfirmModal>s over the audit seam. Each
 * requires a reason + note; refund adds a required cash-amount input (the ConfirmModal `amount` field
 * added for fare-adjust). On confirm the modal records the audit row via `submitAdminAction`, then
 * `onConfirm` writes the outcome through `resolveIssue` → `POST /admin/issues/:id/resolve`. Triggers
 * are inert off the connected path.
 */
export function ResolveActions({
  id,
  order,
  rider,
  fare,
  connected,
}: {
  id: string;
  order: string;
  rider: string;
  /** Current agreed fare — prefilled as the refund default. */
  fare: string;
  connected: boolean;
}) {
  const path = `/issues/${id}`;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <ConfirmModal
        action="issue.refund"
        auditInEndpoint
        target={id}
        path={path}
        triggerLabel="Refund the fare…"
        triggerVariant="ghost"
        disabled={!connected}
        title={`Refund the customer for order ${order}?`}
        consequence={
          <span>
            Repay the customer directly for now — this <b>records</b> the amount owed against the rider on order{" "}
            <b>{order}</b>. Automatic netting off the rider&apos;s settlement arrives with the commission/billing
            infra (not yet live), which will then consume this record.
          </span>
        }
        reasons={REASONS.issueRefund}
        amount={{ label: "Refund amount", prefix: "$", placeholder: fare, required: true }}
        noteRequired
        notePlaceholder="Required — what was agreed and why."
        confirmLabel="Record refund"
        onConfirm={(r) => resolveIssue(id, IssueResolution.REFUND, r.note, r.amount)}
      />
      <ConfirmModal
        action="issue.strike_rider"
        auditInEndpoint
        target={rider}
        path={path}
        triggerLabel="Strike the rider…"
        triggerVariant="danger"
        danger
        disabled={!connected}
        title={`Give ${rider} a strike?`}
        consequence="Three strikes trigger an automatic cooldown. Consider a suspension instead if this involves safety or fraud."
        reasons={REASONS.issueStrike}
        noteRequired
        notePlaceholder="Required — what the rider did and the evidence."
        confirmLabel="Add strike"
        onConfirm={(r) => resolveIssue(id, IssueResolution.RIDER_STRIKE, r.note)}
      />
      <ConfirmModal
        action="issue.close_no_action"
        auditInEndpoint
        target={id}
        path={path}
        triggerLabel="Close — no action…"
        triggerVariant="quiet"
        disabled={!connected}
        title={`Close ${id} with no action?`}
        consequence="Both sides are notified that the issue is closed. It stays on record and reopens if new evidence arrives."
        reasons={REASONS.issueClose}
        noteRequired
        notePlaceholder="Required — why no action is warranted."
        confirmLabel="Close issue"
        onConfirm={(r) => resolveIssue(id, IssueResolution.CLOSE_NO_ACTION, r.note)}
      />
    </div>
  );
}
