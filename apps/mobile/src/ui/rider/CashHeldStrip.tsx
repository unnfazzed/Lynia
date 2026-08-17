import { tokens } from "@lynia/shared/tokens";
import React from "react";
import { Text, View } from "react-native";
import { formatMoney } from "../../logic/money";

/**
 * Cash-held split (plan §5 B3/B4; RIDER-ONE-APP-PLAN.md decision 6; `rider-one-app.jsx`'s `CashStrip`):
 * "yours" (kept fare/commission-in-hand) vs "owed to a kitchen" (collect-and-return food money still
 * riding back to the merchant) — never one blended figure, so a rider can never mistake kitchen money
 * for their own. Written once here so both the Money tab and B4's active-job screen (`app/rider/
 * job.tsx`) render the identical component.
 *
 * B4 (`app/rider/job.tsx`) renders `yours` off the active parcel job's agreed fare; D5's own active-job
 * screen (`app/rider/food-job.tsx`) renders it off the delivery fee the rider keeps. `owed` is D5's
 * own single active food job's open debt (one job at a time — §7 open Q1 — so there's no separate
 * aggregate to sum). The Money tab wires `owed` the same way but keeps `yours={0}`: it has no single
 * job to point that figure at (see money.tsx's own comment).
 */
export function CashHeldStrip({ yours, owed }: { yours: number; owed: number }): React.ReactElement {
  const owing = owed > 0;
  return (
    <View style={{ flexDirection: "row", gap: tokens.space.sm }}>
      <View style={{ flex: 1, borderRadius: tokens.radius.card, padding: tokens.space.sm, backgroundColor: tokens.color.accentWash }}>
        <Text style={{ fontSize: 10.5, fontWeight: tokens.font.weight.bold, letterSpacing: 0.4, color: tokens.color.accentText }}>YOURS</Text>
        <Text style={{ fontSize: 15, fontWeight: tokens.font.weight.bold, color: tokens.color.accentText, marginTop: 2, fontVariant: ["tabular-nums"] }}>
          {formatMoney(yours)}
        </Text>
      </View>
      <View
        style={{
          flex: 1,
          borderRadius: tokens.radius.card,
          padding: tokens.space.sm,
          backgroundColor: owing ? tokens.color.dangerWash : tokens.color.surface,
        }}
      >
        <Text
          style={{ fontSize: 10.5, fontWeight: tokens.font.weight.bold, letterSpacing: 0.4, color: owing ? tokens.color.dangerInk : tokens.color.muted }}
        >
          OWED TO A KITCHEN
        </Text>
        <Text
          style={{
            fontSize: 15,
            fontWeight: tokens.font.weight.bold,
            color: owing ? tokens.color.dangerInk : tokens.color.muted,
            marginTop: 2,
            fontVariant: ["tabular-nums"],
          }}
        >
          {formatMoney(owed)}
        </Text>
      </View>
    </View>
  );
}
