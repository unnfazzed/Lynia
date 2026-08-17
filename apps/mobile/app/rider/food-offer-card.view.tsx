// GENERATED — do not edit by hand. Structural-parity source of truth for RJM.offer_food#offer.
// Source mock: packages/design/explorations/journey/rider-one-app.jsx :: offer_food :: region offer
// Regenerate:  node tools/parity/codegen/cli.mjs gen RJM.offer_food#offer
// Guardrail:   apps/api/src/parity/structure-snapshot.spec.ts asserts this tree ≡ the mock's.
//
// The transpiler owns STRUCTURE + STYLE (mechanical, from the mock). Data flows in as
// props from the container (apps/mobile/app/rider/food-offer.tsx) — that is the ONLY hand-wired seam.
import React from "react";
import { View, Text } from "react-native";
import { tokens } from "@lynia/shared/tokens";
import { Card, Money } from "../../src/ui";
import { TypeTag } from "../../src/ui/rider/TypeTag";

export type RiderFoodOfferCardViewProps = {
  /** The rider's fixed delivery fare (the mock header Money). */
  fare: string | number | null | undefined;
  /** The kitchen's money collected at the door and handed back after the drop (the tile Money). */
  collectAmount: string | number | null | undefined;
};

export function RiderFoodOfferCardView({
  fare,
  collectAmount
}: RiderFoodOfferCardViewProps): React.ReactElement {
  return <Card style={{
    padding: 12
  }}>
        <View style={{
      alignItems: "center",
      gap: 8,
      marginBottom: 10,
      flexDirection: "row"
    }}><TypeTag food /><View style={{
        flex: 1
      }} /><Money v={fare} size={20} /></View>
        <Text style={{
      fontSize: 13,
      color: tokens.color.muted,
      lineHeight: 20
    }}>Your fare is fixed for food jobs — $1.50 base + $0.60/km over 2.4 km. No bidding.</Text>
        <View style={{
      marginTop: 10,
      padding: 10,
      borderRadius: 10,
      backgroundColor: tokens.color.surface
    }}>
          <Text style={{
        fontSize: 11.5,
        fontWeight: "800",
        color: tokens.color.muted,
        letterSpacing: 0.46
      }}>MONEY AT THE DOOR</Text>
          <View style={{
        marginTop: 2
      }}><Money v={collectAmount} size={13.5} /></View>
          <Text style={{
        fontSize: 12,
        color: tokens.color.muted,
        marginTop: 2,
        lineHeight: 17
      }}>Nothing from your pocket. You hand this back at the restaurant after the drop.</Text>
        </View>
      </Card>;
}
