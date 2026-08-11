import { tokens } from "@lynia/shared";
import React, { useState } from "react";
import { Image, Text, View, type ViewStyle } from "react-native";

/**
 * Round shop logo — the RN port of the design kit's `ShopLogo` (r-parts.jsx :: ShopLogo): a circular
 * tile with a 3px white ring (so it reads on any cover photo) and the kit's card shadow, sat over the
 * menu cover's bottom-left corner. Positioned by the caller (`style` merges last).
 *
 * This is a codegen TARGET primitive: the transpiler emits `<ShopLogo size=… name=… photo=… />`
 * verbatim, so the prop shape mirrors the kit exactly. Every colour/shadow is a token.
 *
 * Fidelity note — like `CoverPhoto`, the kit's `photo={true}` state is a design-tool placeholder (a
 * grey tile bearing the monospace word "logo"), because the mock has no asset. The app cannot ship
 * that placeholder as a real screen, so `photo` is widened: a real image URI renders the actual
 * `Image`; `false` (or a bare boolean with no URI) renders the kit's photoless fallback — an accent
 * circle bearing the shop-name initial in white.
 */
export function ShopLogo({
  size = 54,
  name = "S",
  photo = true,
  style,
}: {
  size?: number;
  name?: string;
  /** A real image URI renders the logo; `false` (or a bare boolean with no URI) renders the
   *  accent-circle initial fallback — the kit's `photo={false}` state. */
  photo?: boolean | string;
  style?: ViewStyle;
}): React.ReactElement {
  const [failed, setFailed] = useState(false);
  const uri = typeof photo === "string" && photo.length > 0 ? photo : null;
  const showPhoto = !!uri && !failed;
  const initial = ([...String(name).trim()][0] || "•").toUpperCase();
  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: tokens.color.accent,
          borderWidth: 3,
          borderColor: tokens.color.bg,
          alignItems: "center",
          justifyContent: "center",
          overflow: "hidden",
          ...tokens.shadow.card,
        },
        style,
      ]}
    >
      {showPhoto ? (
        <Image source={{ uri: uri! }} onError={() => setFailed(true)} accessibilityElementsHidden importantForAccessibility="no" style={{ width: "100%", height: "100%" }} />
      ) : (
        <Text style={{ fontSize: size * 0.42, fontWeight: "800", color: tokens.color.onAccent }}>{initial}</Text>
      )}
    </View>
  );
}
