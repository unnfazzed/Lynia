// GENERATED — do not edit by hand. Structural-parity source of truth for RC.placing.
// Source mock: packages/design/explorations/restaurants/r-customer-a.jsx :: placing
// Regenerate:  node tools/parity/codegen/cli.mjs gen RC.placing
// Guardrail:   apps/api/src/parity/structure-snapshot.spec.ts asserts this tree ≡ the mock's.
//
// The transpiler owns STRUCTURE + STYLE (mechanical, from the mock). Data flows in as
// props from the container (apps/mobile/app/food/checkout.tsx) — that is the ONLY hand-wired seam.
import React from "react";
import { View, Text } from "react-native";
import { tokens } from "@lynia/shared/tokens";
import { Screen, Icon, Skeleton } from "../../src/ui";

export function CheckoutPlacingView(): React.ReactElement {
  return <Screen>
    <View style={{
      height: "100%",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: 24,
      gap: 14
    }}>
      <View style={{
        width: 60,
        height: 60,
        borderRadius: 30,
        backgroundColor: tokens.color.accentWash,
        alignItems: "center",
        justifyContent: "center"
      }}>
        <Icon name="receipt" size={26} color={tokens.color.accentText} />
      </View>
      <Text style={{
        fontSize: 17,
        fontWeight: "700",
        textAlign: "center"
      }}>Sending your order to the kitchen…</Text>
      <Text style={{
        fontSize: 13,
        color: tokens.color.muted,
        textAlign: "center",
        lineHeight: 19
      }}>Don't close the app. If this fails, nothing is ordered and nothing is paid.</Text>
      <View style={{
        width: "100%",
        marginTop: 6
      }}><Skeleton height={10} radius={5} /><View style={{
          height: 8
        }} /><Skeleton height={10} width="70%" radius={5} /></View>
    </View>
  </Screen>;
}
