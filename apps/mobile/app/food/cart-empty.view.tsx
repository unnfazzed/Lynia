// GENERATED — do not edit by hand. Structural-parity source of truth for RC.cart_empty.
// Source mock: packages/design/explorations/restaurants/r-customer-a.jsx :: cart_empty
// Regenerate:  node tools/parity/codegen/cli.mjs gen RC.cart_empty
// Guardrail:   apps/api/src/parity/structure-snapshot.spec.ts asserts this tree ≡ the mock's.
//
// The transpiler owns STRUCTURE + STYLE (mechanical, from the mock). Data flows in as
// props from the container (apps/mobile/app/food/cart.tsx) — that is the ONLY hand-wired seam.
import React from "react";
import { View } from "react-native";
import { tokens } from "@lynia/shared/tokens";
import { AppBar, Screen, Card, Button, EmptyState } from "../../src/ui";

export type CartEmptyViewProps = {
  onBack: () => void;
  onBrowse: () => void;
};

export function CartEmptyView({
  onBack,
  onBrowse
}: CartEmptyViewProps): React.ReactElement {
  return <Screen>
    <AppBar title="Your cart" onBack={onBack} />
    <View style={{
      padding: tokens.space.screen,
      minHeight: "100%",
      paddingTop: 24
    }}>
      <Card style={{
        paddingTop: 10,
        paddingRight: 16,
        paddingBottom: 18,
        paddingLeft: 16
      }}>
        <EmptyState icon="shopping-bag" title="Your cart is empty" message="Add something from a kitchen near you — we'll show the delivery fee before you order.">
          <Button label="Browse restaurants" onPress={onBrowse} />
        </EmptyState>
      </Card>
    </View>
  </Screen>;
}
