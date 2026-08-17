import { tokens } from "@lynia/shared/tokens";
import React from "react";
import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Icon, type IconName } from "./Icon";

/**
 * Full-screen blocking state — permissions, offline, suspended, force-update, hard errors. The RN
 * port of the kit's `components/feedback/SystemState.jsx`: one language for every journey — centred
 * mark (brand `mark` slot or icon disc), title, one sentence, then primary / secondary actions.
 * In-context empties (an empty list inside a working screen) use EmptyState instead.
 *
 * A11y decision (2026-08-10, closes DESIGN-KIT-A11Y-OVERRIDES.md §2 for this surface): the green
 * tone fills with `cta` (#00812F, white text ≈4.7:1, passes AA) — NOT the kit's bright `accent`
 * (#00B14F, ≈2.9:1, fails for body copy). The bright green stays reserved for non-text graphics
 * (splash, tiles), exactly what the colour token's own comment prescribes. The kit adopts this
 * value back rather than the app regressing to the kit's.
 */
export function SystemState({
  tone = "white",
  icon,
  mark,
  title,
  message,
  primary,
  secondary,
  onPrimary,
  onSecondary,
}: {
  tone?: "white" | "green";
  icon?: IconName;
  mark?: React.ReactNode;
  title: string;
  message: string;
  primary?: string;
  secondary?: string;
  onPrimary?: () => void;
  onSecondary?: () => void;
}): React.ReactElement {
  const green = tone === "green";
  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: green ? tokens.color.cta : tokens.color.bg }}>
      <View style={{ flex: 1, padding: tokens.space.screen, alignItems: "center", justifyContent: "center" }}>
        {mark ? (
          <View style={{ marginBottom: 12 }}>{mark}</View>
        ) : (
          <View
            style={{
              width: 84,
              height: 84,
              borderRadius: 42,
              backgroundColor: green ? "rgba(255,255,255,0.16)" : tokens.color.surface,
              alignItems: "center",
              justifyContent: "center",
              marginBottom: 14,
            }}
          >
            <Icon name={icon ?? "circle-alert"} size={36} color={green ? tokens.color.onAccent : tokens.color.accentText} />
          </View>
        )}
        <Text style={{ fontSize: 19, fontWeight: tokens.font.weight.bold, color: green ? tokens.color.onAccent : tokens.color.ink, textAlign: "center" }}>
          {title}
        </Text>
        <Text
          style={{
            fontSize: 13,
            lineHeight: Math.round(13 * 1.55),
            color: green ? "rgba(255,255,255,0.9)" : tokens.color.muted,
            textAlign: "center",
            maxWidth: 230,
            marginTop: 4,
          }}
        >
          {message}
        </Text>
        {/* Local button renders (mirroring Button's primary/ghost look) rather than importing Button
            from ./index — index re-exports this file, and that import would be a require cycle. */}
        <View style={{ alignSelf: "stretch", marginTop: 18 }}>
          {primary ? (
            <Pressable
              onPress={onPrimary}
              accessibilityRole="button"
              style={({ pressed }) => ({
                // Green tone inverts: white pill, legible text-green label. White tone is the standard
                // cta-filled primary.
                backgroundColor: green ? (pressed ? tokens.color.surface : tokens.color.onAccent) : pressed ? tokens.color.ctaPressed : tokens.color.cta,
                borderRadius: tokens.radius.button,
                minHeight: tokens.touchTargetPrimary,
                alignItems: "center",
                justifyContent: "center",
              })}
            >
              <Text
                style={{
                  color: green ? tokens.color.accentText : tokens.color.onAccent,
                  fontWeight: tokens.font.weight.bold,
                  fontSize: tokens.font.size.bodyLg,
                }}
              >
                {primary}
              </Text>
            </Pressable>
          ) : null}
          {secondary ? (
            <Pressable
              onPress={onSecondary}
              accessibilityRole="button"
              style={({ pressed }) => ({
                backgroundColor: pressed ? (green ? "rgba(255,255,255,0.16)" : tokens.color.surface) : "transparent",
                borderRadius: tokens.radius.button,
                minHeight: tokens.touchTargetMin,
                alignItems: "center",
                justifyContent: "center",
                marginTop: tokens.space.sm,
              })}
            >
              <Text
                style={{
                  color: green ? tokens.color.onAccent : tokens.color.accentText,
                  fontWeight: tokens.font.weight.semibold,
                  fontSize: tokens.font.size.body,
                }}
              >
                {secondary}
              </Text>
            </Pressable>
          ) : null}
        </View>
      </View>
    </SafeAreaView>
  );
}
