import { tokens } from "@lynia/shared";
import React from "react";
import { Text, View } from "react-native";
import { formatMoney } from "../../logic/money";

/**
 * Cash-held split (plan §5 B3; RIDER-ONE-APP-PLAN.md decision 6; `rider-one-app.jsx`'s `CashStrip`):
 * "yours" (kept fare/commission-in-hand) vs "owed to a kitchen" (collect-and-return food money still
 * riding back to the merchant) — never one blended figure, so a rider can never mistake kitchen money
 * for their own. Written once here so both the Money tab (this PR, always zero — see below) and B4's
 * active-job screen (a real per-trip value, once that ships) render the identical component.
 *
 * The Money tab always renders `owed={0}` today: there is no rider-facing feed for "cash currently
 * owed across any open job" yet — B4 (the active-job screen) is what will first carry a real number,
 * for the one job a rider can hold at a time. Flagged as dark-not-blocked, mirroring B2's JobCard
 * `jobType: "food"` precedent, rather than fabricating a figure with nothing behind it.
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
