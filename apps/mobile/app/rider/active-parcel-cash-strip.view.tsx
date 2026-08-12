// GENERATED — do not edit by hand. Structural-parity source of truth for RJM.active_parcel#cash_strip.
// Source mock: packages/design/explorations/journey/rider-one-app.jsx :: active_parcel :: region cash_strip
// Regenerate:  node tools/parity/codegen/cli.mjs gen RJM.active_parcel#cash_strip
// Guardrail:   apps/api/src/parity/structure-snapshot.spec.ts asserts this tree ≡ the mock's.
//
// The transpiler owns STRUCTURE + STYLE (mechanical, from the mock). Data flows in as
// props from the container (apps/mobile/app/rider/job.tsx) — that is the ONLY hand-wired seam.
import React from "react";
import { CashStrip } from "../../src/ui/rider/CashStrip";

export type RiderActiveParcelCashStripViewProps = {
  /** What the rider keeps — the accent 'YOURS' tile. On a parcel this is the whole agreed fare. */
  yours: number;
  /** Kitchen money still owed — always 0 on a parcel (nothing is collected-and-returned), so the
   *  'OWED TO A KITCHEN' tile stays the muted zero state. Kept for parity with the shared strip. */
  owed: number;
};

export function RiderActiveParcelCashStripView({
  yours,
  owed
}: RiderActiveParcelCashStripViewProps): React.ReactElement {
  return <CashStrip yours={yours} owed={owed} />;
}
