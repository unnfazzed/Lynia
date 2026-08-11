// GENERATED — do not edit by hand. Structural-parity source of truth for RC.list_loading.
// Source mock: packages/design/explorations/restaurants/r-customer-a.jsx :: list_loading
// Regenerate:  node tools/parity/codegen/cli.mjs gen RC.list_loading
// Guardrail:   apps/api/src/parity/structure-snapshot.spec.ts asserts this tree ≡ the mock's.
//
// The transpiler owns STRUCTURE + STYLE (mechanical, from the mock). Data flows in as
// props from the container (apps/mobile/app/food/index.tsx) — that is the ONLY hand-wired seam.
import React from "react";
import { View } from "react-native";
import { Screen, Card, Skeleton } from "../../src/ui";

export function FoodListLoadingView(): React.ReactElement {
  return <Screen>
    <View style={{
      paddingTop: 14,
      paddingRight: 16,
      paddingBottom: 14,
      paddingLeft: 16
    }}>
      <Skeleton height={12} width="30%" /><View style={{
        height: 6
      }} /><Skeleton height={17} width="70%" />
      <View style={{
        height: 16
      }} />
      {[0, 1, 2, 3].map(i => <Card key={i} style={{
        padding: 12,
        marginBottom: 10
      }}>
          <View style={{
          gap: 12,
          flexDirection: "row"
        }}>
            <Skeleton width={76} height={76} radius={14} />
            <View style={{
            flex: 1
          }}>
              <Skeleton height={15} width="65%" /><View style={{
              height: 8
            }} />
              <Skeleton height={12} width="45%" /><View style={{
              height: 10
            }} />
              <Skeleton height={12} width="80%" />
            </View>
          </View>
        </Card>)}
    </View>
  </Screen>;
}
