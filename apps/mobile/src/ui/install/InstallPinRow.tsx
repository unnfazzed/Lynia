import { tokens } from "@lynia/shared/tokens";
import React from "react";
import { Text, View } from "react-native";
import { Icon } from "../Icon";
import { Tappable } from "../Tappable";
import { installTipCopy as C } from "./copy";

/**
 * §2.3: after the Add to Home Screen sheet is dismissed, one quiet mint row under the Home header. "How"
 * reopens the sheet; ✕ removes the row for good (handoff download-qr-install-tip-2026-10).
 */
export function InstallPinRow({ onHow, onDismiss }: { onHow: () => void; onDismiss: () => void }): React.ReactElement {
  return (
    <View
      testID="install-pin-row"
      style={{ marginTop: 16, marginHorizontal: 20, borderRadius: tokens.radius.card, backgroundColor: tokens.color.accentWash, paddingVertical: 8, paddingLeft: 14, paddingRight: 6, flexDirection: "row", alignItems: "center", gap: 12 }}
    >
      <Icon name="square-plus" size={24} color={tokens.color.accentText} />
      <Text style={{ flex: 1, fontSize: 14, fontWeight: tokens.font.weight.semibold, color: tokens.color.ink }}>{C.pinRow.label}</Text>
      <Tappable
        tone="icon"
        accessibilityRole="button"
        accessibilityLabel={C.pinRow.action}
        onPress={onHow}
        style={{ height: tokens.touchTargetMin, paddingHorizontal: 10, justifyContent: "center" }}
      >
        <Text style={{ fontSize: 15, fontWeight: tokens.font.weight.semibold, color: tokens.color.accentText }}>{C.pinRow.action}</Text>
      </Tappable>
      <Tappable
        tone="icon"
        accessibilityRole="button"
        accessibilityLabel={C.pinRow.dismissLabel}
        onPress={onDismiss}
        style={{ width: tokens.touchTargetMin, height: tokens.touchTargetMin, borderRadius: tokens.radius.pill, alignItems: "center", justifyContent: "center" }}
      >
        <Icon name="x" size={24} color={tokens.color.muted} />
      </Tappable>
    </View>
  );
}
