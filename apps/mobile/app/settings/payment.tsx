import { tokens } from "@lynia/shared";
import { useRouter } from "expo-router";
import React from "react";
import { View } from "react-native";
import { AppBar, Screen } from "../../src/ui";
import { AccountRowList } from "../../src/ui/account/AccountRows";

/**
 * Settings → Payment. The detail behind the Settings row's "Cash".
 *
 * Exists for the same reason as the Language screen — the owner's 2026-08-16 instruction that a named
 * row must open something viewable (`docs/DESIGN-DEVIATIONS.md` D-25).
 *
 * The two rows are the app's REAL behaviour, not a restatement of the "Cash" value: parcels are cash
 * to the rider at the agreed price, and food is cash at the door OR mobile money chosen per order at
 * checkout (`app/food/checkout.tsx` draws both methods, ungated). A screen that said only "Cash"
 * would contradict the food checkout one tab away.
 *
 * Undrawn by the kit — the mocks draw the Settings ROW but never a payment screen behind it. Covered
 * by D-25.
 */
export default function PaymentScreen(): React.ReactElement {
  const router = useRouter();
  return (
    <Screen scroll>
      <AppBar title="Payment" onBack={() => router.back()} />

      {/* Same `Pad` + card grammar as Settings and the two Account tabs (D-24/D-25). */}
      <View style={{ padding: tokens.space.screen, minHeight: "100%", paddingTop: 0 }}>
        <AccountRowList
          rows={[
            { icon: "package", label: "Parcels", sub: "Cash to the rider on delivery, at the price you agreed" },
            { icon: "utensils", label: "Food", sub: "Cash at the door, or mobile money at checkout" },
          ]}
          style={{ marginTop: 0 }}
        />
      </View>
    </Screen>
  );
}
