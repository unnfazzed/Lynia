import { tokens } from "@lynia/shared/tokens";
import React from "react";
import { Text, View } from "react-native";
import { PrimaryButton } from "./actions";
import { KY } from "./copy";
import { em } from "./metrics";

/**
 * First Run v2 G2 — the customer Account's violet "Become a rider" card (README §2 G, `fr-states.js` G2,
 * ledger D-82): radius 24, `riderWash`, padding 20; a 120 `highlight` sun overhanging the top-right corner
 * (right/top −40) and a 14 `coral` dot (right 70, top 24); the title 22/700 on two lines with "your bike"
 * in `riderAccent`; `KY.becomeBody` 14 muted; the 52 CTA `KY.becomeCta` with a trailing arrow → R1.
 */
export function BecomeRiderCard({ onStart }: { onStart: () => void }): React.ReactElement {
  return (
    <View testID="become-rider-card" style={{ position: "relative", overflow: "hidden", borderRadius: 24, backgroundColor: tokens.color.riderWash, padding: 20 }}>
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        pointerEvents="none"
        style={{ position: "absolute", right: -40, top: -40, width: 120, height: 120, borderRadius: 60, backgroundColor: tokens.color.highlight }}
      />
      <View
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
        pointerEvents="none"
        style={{ position: "absolute", right: 70, top: 24, width: 14, height: 14, borderRadius: 7, backgroundColor: tokens.color.coral }}
      />
      <Text accessibilityRole="header" style={{ fontSize: 22, lineHeight: 25.3, fontWeight: tokens.font.weight.bold, letterSpacing: em(-0.02, 22), color: tokens.color.ink }}>
        {`${KY.becomeA}\n`}
        <Text style={{ color: tokens.color.riderAccent }}>{KY.becomeB}</Text>
      </Text>
      <Text style={{ marginTop: 6, fontSize: 14, lineHeight: 19.6, color: tokens.color.muted }}>{KY.becomeBody}</Text>
      <View style={{ marginTop: 16 }}>
        <PrimaryButton label={KY.becomeCta} icon="arrow-right" iconAfter onPress={onStart} testID="become-rider-start" />
      </View>
    </View>
  );
}
