"use client";

import { ConfirmModal } from "../../components/ConfirmModal";
import { REASONS } from "../../lib/reasons";
import { money } from "../../lib/format";
import type { AdminTopupRow } from "../../lib/adminTypes";
import { topupAction } from "../actions";

/**
 * Admin console v2 §6: the actions on one top-up row — Re-poll (ask Paynow now), Credit what was paid (a
 * short-paid / paid-on-declined top-up), Mark resolved (close the anomaly without a credit). Each is
 * reason-coded through <ConfirmModal>; the endpoints write the audit row, so `auditInEndpoint`.
 */
export function TopupActions({ row, connected }: { row: AdminTopupRow; connected: boolean }) {
  const path = "/cash/topups";
  const openAnomaly = row.anomaly && !row.anomaly.resolved && row.status !== "confirmed" ? row.anomaly : null;
  const canRepoll = !row.manual && (row.status === "pending" || row.status === "expired");
  if (!canRepoll && !openAnomaly) return <span className="mut">—</span>;
  return (
    <span style={{ display: "inline-flex", gap: 6, flexWrap: "wrap", position: "relative", zIndex: 2 }}>
      {canRepoll ? (
        <ConfirmModal
          action="topup.repoll"
          auditInEndpoint
          target={row.id}
          path={path}
          triggerLabel="Re-poll"
          triggerVariant="quiet"
          disabled={!connected}
          title="Ask Paynow about this top-up?"
          consequence="Asks Paynow for its status now. If it was paid, the balance is credited; if it was refused, it is marked declined."
          reasons={REASONS.topupRepoll}
          confirmLabel="Ask Paynow"
          onConfirm={(v) => topupAction(row.id, "repoll", v.reasonCode, v.note)}
        />
      ) : null}
      {openAnomaly && openAnomaly.paid != null ? (
        <ConfirmModal
          action="wallet.topup_credit"
          auditInEndpoint
          target={row.riderName}
          path={path}
          triggerLabel="Credit what was paid"
          triggerVariant="solid"
          disabled={!connected}
          title={`Credit ${row.riderName}'s top-up?`}
          consequence={
            <span>
              Paynow reported <b>{money(openAnomaly.paid)}</b> paid against a {money(row.amount)} top-up. The balance gets what that
              covers after the fee, never more than {money(row.amount)}. This can only happen once.
            </span>
          }
          reasons={REASONS.topupCreditPaid}
          confirmLabel="Credit"
          onConfirm={(v) => topupAction(row.id, "credit-paid", v.reasonCode, v.note)}
        />
      ) : null}
      {openAnomaly ? (
        <ConfirmModal
          action="topup.anomaly_resolve"
          auditInEndpoint
          target={row.id}
          path={path}
          triggerLabel="Mark resolved"
          triggerVariant="ghost"
          disabled={!connected}
          title="Mark this top-up resolved?"
          consequence="Takes it off the short-paid / paid-on-declined list. Nothing is credited."
          reasons={REASONS.topupResolve}
          confirmLabel="Mark resolved"
          onConfirm={(v) => topupAction(row.id, "resolve", v.reasonCode, v.note)}
        />
      ) : null}
    </span>
  );
}
