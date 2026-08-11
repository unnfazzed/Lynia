// GENERATED — do not edit by hand. Structural-parity source of truth for RC.cart#footer.
// Source mock: packages/design/explorations/restaurants/r-customer-a.jsx :: cart :: region footer
// Regenerate:  node tools/parity/codegen/cli.mjs gen RC.cart#footer
// Guardrail:   apps/api/src/parity/structure-snapshot.spec.ts asserts this tree ≡ the mock's.
//
// The transpiler owns STRUCTURE + STYLE (mechanical, from the mock). Data flows in as
// props from the container (apps/mobile/app/food/cart.tsx) — that is the ONLY hand-wired seam.
import React from "react";
import { Button } from "../../src/ui";

export type CartCheckoutBarViewProps = {
  label: string;
  onCheckout: () => void;
};

export function CartCheckoutBarView({
  label,
  onCheckout
}: CartCheckoutBarViewProps): React.ReactElement {
  return <Button label={label} onPress={onCheckout} />;
}
