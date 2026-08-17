import { tokens } from "@lynia/shared/tokens";
import React from "react";
import { View } from "react-native";
import Svg, { Path, Polygon } from "react-native-svg";
import { WORDMARK_ASPECT, WORDMARK_GO_D, WORDMARK_LYNIA_D, WORDMARK_VIEWBOX } from "./wordmark-paths";

/**
 * The Paper Dove — the LyniaGo mark (packages/design/assets/brand/lyniago-mark.svg). A folded paper
 * dart that is also a dove; the crease lines cross at the upper third (the hidden cross). Brand rule:
 * the creases (and the cross) only render at ≥ 32px — below that use the silhouette alone.
 */
export function DoveMark({ size = 28, on = "white" }: { size?: number; on?: "white" | "green" }): React.ReactElement {
  const showCrease = size >= 32;
  // On the brand-green splash the mark inverts (DS Dove `on="green"`): white body, translucent-white
  // keel, and the crease switches to the accent green so it stays visible against the white body.
  const body = on === "green" ? tokens.color.onAccent : tokens.color.accent;
  const keel = on === "green" ? "rgba(255,255,255,0.62)" : tokens.color.accentPressed;
  const crease = on === "green" ? tokens.color.accent : tokens.color.onAccent;
  return (
    <Svg width={size} height={size} viewBox="0 0 96 96">
      <Polygon points="28,6 58,32 38,42" fill={body} />
      <Polygon points="90,26 14,52 48,60" fill={body} />
      <Polygon points="90,26 48,60 42,84" fill={keel} />
      {showCrease ? (
        <>
          <Path d="M90 26 L48 60" stroke={crease} strokeWidth={2.4} fill="none" />
          <Path d="M70.5 30.2 L81.5 43.8" stroke={crease} strokeWidth={2.4} fill="none" />
        </>
      ) : null}
    </Svg>
  );
}

/**
 * The "LyniaGo" wordmark — Fredoka 600 letterforms shipped as OUTLINED vector paths (kerned), so
 * the logo never depends on a font file loading. "Go" carries the deep brand green in the standard
 * lockup; passing an explicit `color` renders the whole mark one-colour (e.g. white on a dark bar).
 */
export function Wordmark({ size = 22, color }: { size?: number; color?: string }): React.ReactElement {
  return (
    <Svg width={size * WORDMARK_ASPECT} height={size} viewBox={WORDMARK_VIEWBOX} accessibilityLabel="LyniaGo">
      <Path d={WORDMARK_LYNIA_D} fill={color ?? tokens.color.ink} />
      <Path d={WORDMARK_GO_D} fill={color ?? tokens.color.accentPressed} />
    </Svg>
  );
}

/** The full LyniaGo lockup: Paper Dove + wordmark. The single consumer brand (splash, auth, header). */
export function BrandLockup({ size = 32, color }: { size?: number; color?: string }): React.ReactElement {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: tokens.space.sm }}>
      {/* 0.68 keeps the cap height where the old Fredoka fontSize (0.72×size) put it. */}
      <DoveMark size={size} />
      <Wordmark size={Math.round(size * 0.68)} color={color} />
    </View>
  );
}
