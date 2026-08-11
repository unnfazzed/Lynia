// GENERATED — do not edit by hand. Structural-parity source of truth for RC.checkout_cash#footer.
// Source mock: packages/design/explorations/restaurants/r-customer-a.jsx :: checkout_cash :: region footer
// Regenerate:  node tools/parity/codegen/cli.mjs gen RC.checkout_cash#footer
// Guardrail:   apps/api/src/parity/structure-snapshot.spec.ts asserts this tree ≡ the mock's.
//
// The transpiler owns STRUCTURE + STYLE (mechanical, from the mock). Data flows in as
// props from the container (apps/mobile/app/food/checkout.tsx) — that is the ONLY hand-wired seam.
import React from "react";
import { Button } from "../../src/ui";

export type CheckoutPlaceBarViewProps = {
  label: string;
  onPlace: () => void;
  disabled?: boolean;
  loading?: boolean;
};

export function CheckoutPlaceBarView({
  label,
  onPlace,
  disabled,
  loading
}: CheckoutPlaceBarViewProps): React.ReactElement {
  return <Button label={label} onPress={onPlace} disabled={disabled} loading={loading} />;
}
