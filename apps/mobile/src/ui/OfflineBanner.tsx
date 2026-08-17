import { tokens } from "@lynia/shared/tokens";
import React from "react";
import { Text, View } from "react-native";
import { Icon } from "./Icon";

export type ConnectivityState = "online" | "offline" | "reconnecting";

/**
 * Lynia connectivity banner — mirrors packages/design/components/feedback/OfflineBanner.jsx.
 * Sits at the very top of the screen, full-width. Offline is a calm ink bar (a state, not an
 * alarm — never danger-red); reconnecting is a muted surface strip. Renders nothing when state
 * is "online", so it can stay mounted permanently.
 */
export function OfflineBanner({ state = "online" }: { state?: ConnectivityState }): React.ReactElement | null {
  if (state !== "offline" && state !== "reconnecting") return null;
  const offline = state === "offline";
  const fg = offline ? tokens.color.onAccent : tokens.color.muted;
  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: tokens.space.sm,
        paddingVertical: tokens.space.sm,
        paddingHorizontal: tokens.space.md,
        backgroundColor: offline ? tokens.color.ink : tokens.color.surface,
        borderBottomWidth: offline ? 0 : 1,
        borderBottomColor: tokens.color.line,
      }}
    >
      <Icon name={offline ? "wifi-off" : "clock"} size={14} color={fg} />
      <Text style={{ fontSize: 12, fontWeight: "600", color: fg }}>
        {offline ? "You're offline — some things may be out of date." : "Reconnecting… your data may be a moment behind."}
      </Text>
    </View>
  );
}
