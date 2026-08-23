import { tokens } from "@lynia/shared/tokens";
import React, { useState } from "react";
import { Text, View, type StyleProp, type ViewStyle } from "react-native";
import { RemoteImage } from "../RemoteImage";
import { avatarTint } from "../../logic/avatar";

function firstGlyph(name: string): string {
  const ch = [...name.trim()][0];
  return ch ? ch.toUpperCase() : "•";
}

/**
 * D-22 photo policy: photos are an upgrade, never a dependency. Shows the restaurant/dish photo when
 * one loads; otherwise a deterministic tinted block with the name's initial (same monogram-first
 * philosophy as `Avatar`, just rounded-rect instead of circular — a shop/dish tile, not a person).
 */
export function FoodThumb({
  name,
  photoUrl,
  size = 76,
  radius = 14,
  style,
}: {
  name: string;
  photoUrl?: string | null;
  size?: number;
  radius?: number;
  /** Dimension override for a non-square slot (RC.list's hero row: a 100%-wide photo band) — the
   *  monogram glyph still sizes off `size`, matching the mock's own `RestRow` (r-parts.jsx:350-352). */
  style?: StyleProp<ViewStyle>;
}): React.ReactElement {
  const [failed, setFailed] = useState(false);
  const showPhoto = !!photoUrl && !failed;

  if (showPhoto) {
    return (
      <RemoteImage
        source={{ uri: photoUrl! }}
        onError={() => setFailed(true)}
        accessibilityElementsHidden
        importantForAccessibility="no"
        style={[{ width: size, height: size, borderRadius: radius, backgroundColor: tokens.color.surface }, style as never]}
      />
    );
  }

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no"
      style={[{ width: size, height: size, borderRadius: radius, backgroundColor: avatarTint(name), alignItems: "center", justifyContent: "center" }, style]}
    >
      <Text style={{ fontSize: size * 0.32, fontWeight: "700", color: tokens.color.ink }}>{firstGlyph(name)}</Text>
    </View>
  );
}
