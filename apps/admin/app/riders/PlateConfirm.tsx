"use client";

import { ConfirmModal } from "../components/ConfirmModal";
import { REASONS } from "../lib/reasons";
import { verifyPlate } from "./actions";

/**
 * First Run v2 E4 (D-82): "Confirm plate…" for a plate waiting on review (`plateStatus: "checking"`). A
 * self-service plate change saves instantly in the rider app and reads "Checking" there until ops confirm it
 * here; the rider then sees "Verified". Reason-coded through <ConfirmModal> like every rider action; the
 * endpoint writes the audit row in-transaction (`auditInEndpoint`). Used on the rider profile and in the
 * plate review queue (/riders?plate=checking).
 */
export function PlateConfirmButton({
  id,
  name,
  plate,
  connected,
  path,
}: {
  id: string;
  name: string;
  plate: string;
  connected: boolean;
  /** The page to refresh after the write. */
  path: string;
}) {
  return (
    <ConfirmModal
      action="rider.plate_verify"
      auditInEndpoint // the plate-verify endpoint writes the audit row in-tx — don't double-record
      target={name}
      path={path}
      triggerLabel="Confirm plate…"
      triggerVariant="solid"
      disabled={!connected}
      title={`Confirm ${name}'s plate ${plate}?`}
      consequence={
        <span>
          The rider&apos;s app shows <b className="mono">{plate}</b> as <b>Verified</b>. Check it against the bike first. If
          they change it again before you confirm, the confirmation is refused and it stays in the queue.
        </span>
      }
      reasons={REASONS.riderPlateVerify}
      confirmLabel="Confirm plate"
      onConfirm={(r) => verifyPlate(id, plate, r.reasonCode, r.note)}
    />
  );
}
