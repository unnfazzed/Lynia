import { tokens } from "@lynia/shared";
import React from "react";
import { Text, View } from "react-native";
import { Icon, isTestBuild } from "../index";

/**
 * The mandatory, unmissable marker for any screen a QA tester reached through a SIMULATED transition.
 *
 * Why this exists: the mobile-money PAYMENT RAIL DOES NOT EXIST in this codebase. There is no
 * prompt-send endpoint and no decline callback — the only real payment path is the manual rail
 * (ManualPayRail + "submit my reference", which the merchant matches against their own statement).
 * The R5·4 "check your phone" wait and the R5·b2 "declined" screens are therefore designed-but-unbacked:
 * they can be WALKED in the QA APK so the journey is testable, and they must never be mistaken for a
 * real money event.
 *
 * Rules this component enforces at the call site:
 *  - it renders NOTHING outside the QA test build ({@link isTestBuild}), so a real release can't leak it;
 *  - every simulated screen paints it ABOVE its own hero, so it's read first, not found later;
 *  - it states plainly that nothing was sent and nothing was charged.
 *
 * A simulated screen must NEVER claim money moved. There is deliberately no "payment succeeded"
 * simulation anywhere in this app — a fake success is the exact defect this programme exists to fix.
 */
export function SimulatedPathNotice({
  /** The one-line truth about this screen, e.g. "no payment prompt was sent". */
  what,
}: {
  what: string;
}): React.ReactElement | null {
  if (!isTestBuild()) return null;
  return (
    <View
      accessibilityRole="alert"
      style={{
        flexDirection: "row",
        gap: tokens.space.sm,
        padding: tokens.space.md,
        borderRadius: tokens.radius.input,
        backgroundColor: tokens.color.dangerWash,
        borderWidth: 1,
        borderColor: tokens.color.danger,
        marginBottom: tokens.space.md,
      }}
    >
      <Icon name="triangle-alert" size={17} color={tokens.color.dangerInk} style={{ marginTop: 1 }} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 13, fontWeight: "700", color: tokens.color.dangerInk }}>SIMULATED — {what} (test build)</Text>
        <Text style={{ fontSize: 12, color: tokens.color.dangerInk, marginTop: 3, lineHeight: 17 }}>
          Nothing was charged and nothing was sent to any rail. This screen exists so the journey can be walked end to end — the
          only real way to pay is still the manual rail below.
        </Text>
      </View>
    </View>
  );
}
