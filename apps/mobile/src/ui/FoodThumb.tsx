import { tokens } from "@lynia/shared";
import React, { useState } from "react";
import { Image, type ImageStyle, Text, View, type ViewStyle } from "react-native";
import { Icon } from "./Icon";

/**
 * Food thumbnail — the RN port of the design kit's `FoodThumb` (r-parts.jsx :: FoodThumb): a rounded
 * tile used for the menu-row dish image and the cart's "Add a drink?" upsell cards. Photos are an
 * UPGRADE, never a dependency (most Harare merchants ship without one), so the photoless block is the
 * default: a category-tint tile bearing the dish initial set large, with a small utensils/bag glyph.
 *
 * This is a codegen TARGET primitive: the transpiler emits `<FoodThumb name=… cat=… size=… radius=…
 * photo=… />` verbatim, so the prop shape mirrors the kit exactly (category tint `cat`, `size`,
 * `radius`, an optional `style` the caller merges). Every colour/radius is a token.
 *
 * Fidelity note — the kit's `photo` state is a design-tool placeholder (a grey tile bearing the
 * monospace `label`), because the mock has no asset. Here `photo` is widened: a real image URI
 * renders the actual `Image`; anything else (`false`, a bare boolean) renders the tinted-initial
 * block rather than draw placeholder chrome the user would never see.
 */
export type FoodThumbCategory = "mains" | "sides" | "drinks";

// Kit CAT map (r-parts.jsx): [tile wash, glyph/initial ink] per category.
const CAT: Record<FoodThumbCategory, { bg: string; fg: string }> = {
  mains: { bg: tokens.color.accentWash, fg: tokens.color.accentText },
  sides: { bg: tokens.color.surface, fg: tokens.color.muted },
  drinks: { bg: tokens.color.highlightWash, fg: tokens.color.highlightInk },
};

export function FoodThumb({
  name = "",
  cat = "mains",
  size = 72,
  radius = 12,
  photo = false,
  style,
}: {
  name?: string;
  cat?: FoodThumbCategory;
  size?: number;
  radius?: number;
  /** A real image URI shows the photo; `false`/absent shows the tinted-initial fallback. */
  photo?: boolean | string;
  /** Caller override (the cart upsell sizes it `width:"100%", height:54`); merges last. */
  style?: ViewStyle;
}): React.ReactElement {
  const { bg, fg } = CAT[cat] ?? CAT.mains;
  const [failed, setFailed] = useState(false);
  const uri = typeof photo === "string" && photo.length > 0 ? photo : null;
  if (uri && !failed) {
    return (
      <Image
        source={{ uri }}
        onError={() => setFailed(true)}
        accessibilityElementsHidden
        importantForAccessibility="no"
        style={[{ width: size, height: size, borderRadius: radius, backgroundColor: tokens.color.surface }, style as ImageStyle]}
      />
    );
  }
  const initial = ([...String(name).trim()][0] || "•").toUpperCase();
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no"
      style={[{ width: size, height: size, borderRadius: radius, backgroundColor: bg, alignItems: "center", justifyContent: "center", position: "relative", overflow: "hidden" }, style]}
    >
      <Text style={{ fontSize: Math.round(size * 0.42), fontWeight: "800", color: fg, opacity: 0.9, lineHeight: Math.round(size * 0.42) }}>{initial}</Text>
      <Icon name={cat === "drinks" ? "shopping-bag" : "utensils"} size={13} color={fg} style={{ position: "absolute", right: 5, bottom: 5, opacity: 0.55 }} />
    </View>
  );
}
