import { tokens } from "@lynia/shared/tokens";
import React from "react";
import { Text, View, type ViewStyle } from "react-native";
import { Icon, type IconName } from "../Icon";
import { Tappable } from "../Tappable";

/**
 * The First Run v2 bottom toast (README §1 "Toast", `fr-kit.js` `.toast`, ledger D-80): `forest`,
 * radius 14, padding 14 16, white Inter 600 14, a 20 brand check, 10 gap. D-80 §2 #4 makes it the
 * app-wide toast — `ToastProvider` (src/ui/Toast.tsx) draws exactly this bar, 96 above the bottom
 * (+ the safe-area inset), and dismisses it after 2.5s.
 *
 * `warning` (an action failure) swaps the check for a `circle-alert` in `highlight`: the handoff draws
 * only the success toast, and a green check on "Couldn't send the offer." would read as success (D-80 §4,
 * owner-approved 2026-10-06).
 *
 * The five screen-local toasts (Order, Browse, Review, rider board, Send) draw this same bar too (owner,
 * 2026-10-06: "move all five to the new bar"). They keep their own position above their screen's CTA and
 * their action ("Try again", "Undo"), drawn as a 44 mint pill on the right; `icon` keeps their glyph.
 */
export type FirstRunToastTone = "success" | "warning";

export function FirstRunToast({
  text,
  tone = "success",
  icon,
  action,
  actionIcon,
  onAction,
  style,
  assertive = false,
}: {
  text: string;
  tone?: FirstRunToastTone;
  /** Overrides the tone's glyph (the screen-local toasts keep their own: bell, check, alert). */
  icon?: IconName;
  action?: string;
  actionIcon?: IconName;
  onAction?: () => void;
  style?: ViewStyle;
  assertive?: boolean;
}): React.ReactElement {
  const glyph: IconName = icon ?? (tone === "warning" ? "circle-alert" : "check");
  const glyphColor = glyph === "circle-alert" ? tokens.color.highlight : tokens.color.accent;
  const withAction = !!(action && onAction);
  return (
    <View
      testID="first-run-toast"
      accessibilityRole="alert"
      accessibilityLiveRegion={assertive ? "assertive" : "polite"}
      style={[
        {
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          backgroundColor: tokens.color.forest,
          borderRadius: 14,
          ...(withAction ? { paddingVertical: 4, paddingLeft: 16, paddingRight: 4 } : { paddingVertical: 14, paddingHorizontal: 16 }),
        },
        style,
      ]}
    >
      <Icon name={glyph} size={20} color={glyphColor} />
      <Text style={{ flex: 1, fontSize: 14, lineHeight: 19, fontWeight: tokens.font.weight.semibold, color: tokens.color.onAccent }}>{text}</Text>
      {withAction ? (
        <Tappable
          onPress={onAction}
          accessibilityRole="button"
          accessibilityLabel={action}
          style={{ minHeight: tokens.touchTargetMin, flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 12, borderRadius: 10, backgroundColor: tokens.color.accentWash }}
        >
          {actionIcon ? <Icon name={actionIcon} size={16} color={tokens.color.accentText} /> : null}
          <Text style={{ fontSize: 14, fontWeight: tokens.font.weight.semibold, color: tokens.color.accentText }}>{action}</Text>
        </Tappable>
      ) : null}
    </View>
  );
}
