import { tokens } from "@lynia/shared/tokens";
import React from "react";
import { Text, View, type ViewStyle } from "react-native";
import { Icon } from "../Icon";

/**
 * The First Run v2 bottom toast (README §1 "Toast", `fr-kit.js` `.toast`, ledger D-80): `forest`,
 * radius 14, padding 14 16, white Inter 600 14, a 20 brand check, 10 gap. D-80 §2 #4 makes it the
 * app-wide toast — `ToastProvider` (src/ui/Toast.tsx) draws exactly this bar, 96 above the bottom
 * (+ the safe-area inset), and dismisses it after 2.5s.
 *
 * `warning` (an action failure raised through `useActionError`) swaps the check for a `circle-alert`
 * in `highlight`: the handoff draws only the success toast, and a green check on "Couldn't send the
 * offer." would read as success (D-80 §4).
 */
export type FirstRunToastTone = "success" | "warning";

export function FirstRunToast({ text, tone = "success", style }: { text: string; tone?: FirstRunToastTone; style?: ViewStyle }): React.ReactElement {
  return (
    <View
      testID="first-run-toast"
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={[{ flexDirection: "row", alignItems: "center", gap: 10, backgroundColor: tokens.color.forest, borderRadius: 14, paddingVertical: 14, paddingHorizontal: 16 }, style]}
    >
      <Icon name={tone === "warning" ? "circle-alert" : "check"} size={20} color={tone === "warning" ? tokens.color.highlight : tokens.color.accent} />
      <Text style={{ flex: 1, fontSize: 14, lineHeight: 19, fontWeight: tokens.font.weight.semibold, color: tokens.color.onAccent }}>{text}</Text>
    </View>
  );
}
