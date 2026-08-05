import { tokens } from "@lynia/shared";
import React from "react";
import { Pressable, Text, View } from "react-native";
import { Icon } from "../index";

/**
 * `offline_resume` (kit `r-rider.jsx` — `RR.offline_resume`): the "Job restored" banner a rider sees
 * when the app was killed mid-job and relaunched straight back onto the same delivery.
 *
 * The kit renders it as an info banner above the job — an INFO tone, never a warning: nothing went
 * wrong for the rider, and the point of the screen is to say so out loud. Sits above the live job card
 * (which the screen already renders from fresh server state), so "Continue delivery" in the kit is
 * just "the job is right there" here — no separate confirm step to re-enter a state we never left.
 *
 * `onDismiss` makes it a one-time acknowledgement rather than a permanent header — it's news on the
 * frame the app comes back, and clutter for the rest of the leg.
 *
 * See job-resume.ts for how the restore is detected and, importantly, for why this copy carries no
 * "you were offline for N minutes" figure.
 */
export function JobRestoredBanner({ onDismiss }: { onDismiss: () => void }): React.ReactElement {
  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={{
        flexDirection: "row",
        alignItems: "flex-start",
        gap: tokens.space.sm,
        padding: tokens.space.md,
        borderRadius: tokens.radius.card,
        backgroundColor: tokens.color.accentWash,
        marginBottom: tokens.space.md,
      }}
    >
      <Icon name="refresh-cw" size={18} color={tokens.color.accentText} style={{ marginTop: 1 }} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 14.5, fontWeight: tokens.font.weight.bold, color: tokens.color.accentText }}>Job restored</Text>
        <Text style={{ fontSize: 12.5, color: tokens.color.accentText, lineHeight: 18, marginTop: 3 }}>
          The app restarted while this job was live. Your order stayed open the whole time — it was never cancelled, and every
          step you&apos;d already confirmed is still recorded.
        </Text>
      </View>
      <Pressable
        onPress={onDismiss}
        accessibilityRole="button"
        accessibilityLabel="Dismiss job restored notice"
        hitSlop={10}
        style={{ minWidth: 28, minHeight: 28, alignItems: "center", justifyContent: "center" }}
      >
        <Icon name="x" size={16} color={tokens.color.accentText} />
      </Pressable>
    </View>
  );
}
