// GENERATED — do not edit by hand. Structural-parity source of truth for RC.menu#footer.
// Source mock: packages/design/explorations/restaurants/r-customer-a.jsx :: menu :: region footer
// Regenerate:  node tools/parity/codegen/cli.mjs gen RC.menu#footer
// Guardrail:   apps/api/src/parity/structure-snapshot.spec.ts asserts this tree ≡ the mock's.
//
// The transpiler owns STRUCTURE + STYLE (mechanical, from the mock). Data flows in as
// props from the container (apps/mobile/app/food/[id].tsx) — that is the ONLY hand-wired seam.
import React from "react";
import { View, Text } from "react-native";
import { tokens } from "@lynia/shared/tokens";
import { Button, Money } from "../../src/ui";

export type MenuCartBarViewProps = {
  itemLabel: string;
  subtotal: number;
  onViewCart: () => void;
};

export function MenuCartBarView({
  itemLabel,
  subtotal,
  onViewCart
}: MenuCartBarViewProps): React.ReactElement {
  return <View style={{
    alignItems: "center",
    gap: 10,
    flexDirection: "row"
  }}>
      <View style={{
      flex: 1
    }}>
        <Text style={{
        fontSize: 12.5,
        color: tokens.color.muted
      }}>{itemLabel}</Text>
        <Money size={17} v={subtotal} />
      </View>
      <Button label="View cart" onPress={onViewCart} />
    </View>;
}
