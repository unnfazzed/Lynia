import { tokens } from "@lynia/shared/tokens";
import React from "react";
import { Pressable, Text, type ViewStyle } from "react-native";
import { EmptyState } from "../EmptyState";
import { Icon } from "../Icon";
import { RP } from "./copy";

/**
 * First Run v2 P14 — what a rider who skipped a permission sees on the board (handoff `first-run-v2` README
 * §2B, `fr-states.js` P14, ledger D-81). Presentational; the board decides when to show them and routes
 * "Turn on" into the flow (`RIDER_PERM_ROUTES`, src/logic/rider-perm-flow.ts).
 */

/**
 * J8 — the danger box: a bell-off icon, "Notifications are off. You won't get new jobs or food offers." and a
 * bold "Turn on" (→ P9). The whole box is the button, so the target is the box (≥ 44), not the word.
 */
export function RiderNotifOffRow({ onTurnOn, style }: { onTurnOn: () => void; style?: ViewStyle }): React.ReactElement {
  return (
    <Pressable
      testID="rider-j8"
      onPress={onTurnOn}
      accessibilityRole="button"
      accessibilityLabel={`${RP.j8} ${RP.turnOn}`}
      style={({ pressed }) => [
        {
          minHeight: tokens.touchTargetMin,
          borderRadius: 14,
          paddingVertical: 12,
          paddingHorizontal: 14,
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          backgroundColor: tokens.color.dangerWash,
          opacity: pressed ? 0.85 : 1,
        },
        style,
      ]}
    >
      <Icon name="bell-off" size={20} color={tokens.color.dangerInk} />
      <Text style={{ flex: 1, fontSize: 14, lineHeight: 19.6, color: tokens.color.dangerInk }}>{RP.j8}</Text>
      <Text style={{ fontSize: 14, fontWeight: tokens.font.weight.bold, color: tokens.color.dangerInk }}>{RP.turnOn}</Text>
    </Pressable>
  );
}

/** G8 — the Empty States v2 mark (D-78): a mint map-pin disc, "Turn on location", "Jobs need your location.",
 *  and a soft "Turn on" pill (→ P1). */
export function RiderLocEmpty({ onTurnOn }: { onTurnOn: () => void }): React.ReactElement {
  return <EmptyState testID="rider-g8" icon="map-pin" title={RP.g8A} body={RP.g8Body} primary={{ label: RP.turnOn, onPress: onTurnOn }} />;
}
