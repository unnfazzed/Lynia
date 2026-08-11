// GENERATED — do not edit by hand. Structural-parity source of truth for RC.checkout_cash#summary.
// Source mock: packages/design/explorations/restaurants/r-customer-a.jsx :: checkout_cash :: region summary
// Regenerate:  node tools/parity/codegen/cli.mjs gen RC.checkout_cash#summary
// Guardrail:   apps/api/src/parity/structure-snapshot.spec.ts asserts this tree ≡ the mock's.
//
// The transpiler owns STRUCTURE + STYLE (mechanical, from the mock). Data flows in as
// props from the container (apps/mobile/app/food/checkout.tsx) — that is the ONLY hand-wired seam.
import React from "react";
import { PriceMath } from "../../src/ui";

export type CheckoutSummaryViewProps = {
  /** Food subtotal (the kit PriceMath's 'Food' row). */
  goods: number;
  /** Honest delivery-fee estimate from the drop pin (0 before a drop-off is set). */
  fee: number;
  /** Honest drop distance in km (drives the delivery row's per-km sub-line). */
  km: number;
  total: number;
  /** Cash/wallet consequence copy, with any small-order fee folded in (cart_min convention). */
  note?: string;
};

export function CheckoutSummaryView({
  goods,
  fee,
  km,
  total,
  note
}: CheckoutSummaryViewProps): React.ReactElement {
  return <PriceMath goods={goods} fee={fee} km={km} total={total} note={note} />;
}
