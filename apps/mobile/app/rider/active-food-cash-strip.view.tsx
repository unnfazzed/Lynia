// GENERATED — do not edit by hand. Structural-parity source of truth for RJM.active_food#cash_strip.
// Source mock: packages/design/explorations/journey/rider-one-app.jsx :: active_food :: region cash_strip
// Regenerate:  node tools/parity/codegen/cli.mjs gen RJM.active_food#cash_strip
// Guardrail:   apps/api/src/parity/structure-snapshot.spec.ts asserts this tree ≡ the mock's.
//
// The transpiler owns STRUCTURE + STYLE (mechanical, from the mock). Data flows in as
// props from the container (apps/mobile/app/rider/food-job.tsx) — that is the ONLY hand-wired seam.
import React from "react";
import { CashStrip } from "../../src/ui/rider/CashStrip";

export type RiderActiveFoodCashStripViewProps = {
  /** What the rider keeps (the delivery fee) — the accent 'YOURS' tile. */
  yours: number;
  /** The kitchen's money still riding back on an open collect-and-return debt (0 otherwise) —
   *  the 'OWED TO A KITCHEN' tile, danger-washed while owing. */
  owed: number;
};

export function RiderActiveFoodCashStripView({
  yours,
  owed
}: RiderActiveFoodCashStripViewProps): React.ReactElement {
  return <CashStrip yours={yours} owed={owed} />;
}
