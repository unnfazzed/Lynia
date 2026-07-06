import { tokens } from "@lynia/shared";
import React from "react";
import { Linking, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { STORE_URL } from "../src/config";
import { DoveMark } from "../src/ui/Brand";

/**
 * The hard version gate (customer/rider S·3). Brand-green SystemState with the brand mark, mounted by
 * the root layout in place of the whole Stack when isUpdateRequired(current) is true — so there is no
 * route past it. Mirrors the journey mockup `ForceUpdate` (SystemState tone="green" brand).
 */
export default function ForceUpdateScreen(): React.ReactElement {
  const openStore = (): void => {
    if (STORE_URL) void Linking.openURL(STORE_URL);
  };
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: tokens.color.accent }}>
      <View style={{ flex: 1, padding: tokens.space.screen, alignItems: "center", justifyContent: "center" }}>
        {/* White dove on the green fill (DoveMark on="green"). */}
        <View style={{ marginBottom: tokens.space.md }}>
          <DoveMark size={56} on="green" />
        </View>
        <Text style={{ fontSize: tokens.font.size.h2, fontWeight: tokens.font.weight.bold, color: tokens.color.onAccent, textAlign: "center" }}>
          Time to update
        </Text>
        <Text style={{ fontSize: tokens.font.size.body, color: "rgba(255,255,255,0.9)", textAlign: "center", lineHeight: 22, marginTop: 6, maxWidth: 260 }}>
          A new version of LyniaGo is ready with the latest fixes. Update to keep sending.
        </Text>
        {/* Inverted primary: white pill on green, with the legible text-green label. Hides when no store
            URL is configured rather than opening a dead link. */}
        {STORE_URL ? (
          <Pressable
            onPress={openStore}
            accessibilityRole="button"
            style={({ pressed }) => ({
              alignSelf: "stretch",
              marginTop: tokens.space.xl,
              backgroundColor: pressed ? tokens.color.surface : tokens.color.onAccent,
              borderRadius: tokens.radius.button,
              paddingVertical: 14,
              minHeight: tokens.touchTargetPrimary,
              alignItems: "center",
              justifyContent: "center",
            })}
          >
            <Text style={{ color: tokens.color.accentText, fontWeight: tokens.font.weight.semibold, fontSize: tokens.font.size.bodyLg }}>Update now</Text>
          </Pressable>
        ) : null}
      </View>
    </SafeAreaView>
  );
}
