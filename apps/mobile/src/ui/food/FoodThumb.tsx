import { tokens } from "@lynia/shared/tokens";
import React, { useState } from "react";
import { Image, Text, View } from "react-native";
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
}: {
  name: string;
  photoUrl?: string | null;
  size?: number;
  radius?: number;
}): React.ReactElement {
  const [failed, setFailed] = useState(false);
  const showPhoto = !!photoUrl && !failed;

  if (showPhoto) {
    return (
      <Image
        source={{ uri: photoUrl! }}
        onError={() => setFailed(true)}
        accessibilityElementsHidden
        importantForAccessibility="no"
        style={{ width: size, height: size, borderRadius: radius, backgroundColor: tokens.color.surface }}
      />
    );
  }

  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no"
      style={{ width: size, height: size, borderRadius: radius, backgroundColor: avatarTint(name), alignItems: "center", justifyContent: "center" }}
    >
      <Text style={{ fontSize: size * 0.32, fontWeight: "700", color: tokens.color.ink }}>{firstGlyph(name)}</Text>
    </View>
  );
}
