// GENERATED — do not edit by hand. Structural-parity source of truth for RC.list_error.
// Source mock: packages/design/explorations/restaurants/r-customer-a.jsx :: list_error
// Regenerate:  node tools/parity/codegen/cli.mjs gen RC.list_error
// Guardrail:   apps/api/src/parity/structure-snapshot.spec.ts asserts this tree ≡ the mock's.
//
// The transpiler owns STRUCTURE + STYLE (mechanical, from the mock). Data flows in as
// props from the container (apps/mobile/app/food/index.tsx) — that is the ONLY hand-wired seam.
import React from "react";
import { View } from "react-native";
import { AppBar, Screen, Card, Button, EmptyState, Banner } from "../../src/ui";

export type FoodListErrorViewProps = {
  onBack: () => void;
  onRetry: () => void;
  loading?: boolean;
};

export function FoodListErrorView({
  onBack,
  onRetry,
  loading
}: FoodListErrorViewProps): React.ReactElement {
  return <Screen banner={<Banner tone="offline" icon="wifi-off" title="You're offline" msg="Showing what we had at 09:12." action="Retry" />}>
    <View style={{
      paddingTop: 10,
      paddingRight: 16,
      paddingBottom: 10,
      paddingLeft: 16
    }}>
      <AppBar title="Restaurants" sub="Last updated 09:12" onBack={onBack} />
      <Card style={{
        paddingTop: 10,
        paddingRight: 16,
        paddingBottom: 18,
        paddingLeft: 16,
        marginTop: 30
      }}>
        <EmptyState icon="wifi-off" title="We can't reach the kitchens" message="Your connection dropped. Nothing was ordered and nothing was charged.">
          <Button label="Try again" onPress={onRetry} loading={loading} />
        </EmptyState>
      </Card>
    </View>
  </Screen>;
}
