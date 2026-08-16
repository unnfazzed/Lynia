import { tokens } from "@lynia/shared";
import React from "react";
import { Pressable, Text, View, type StyleProp, type ViewStyle } from "react-native";
import { Icon } from "../Icon";

/**
 * Pushed-screen header — the RN port of the kit's `components/shell/AppBar.jsx`: back chevron,
 * title (+ optional sub) and an optional right slot. Root (tab) screens use BrandHeader instead.
 *
 * Two deliberate ports from the web source:
 * - The kit draws its back glyph as a rotated `chevron-right` because the icon subset carries no
 *   left-pointing glyph; same trick here, but the rotation goes on a wrapper View — react-native-web
 *   drops a transform set on the glyph itself, which pointed every rendered AppBar chevron right.
 * - The kit's 32×32 back hit area is below the 44px device rule, so the Pressable keeps the kit's
 *   32px visual footprint and makes up the difference with hitSlop.
 *
 * `title` is optional (unlike the kit's d.ts): auth and KYC screens keep their in-body Heading per
 * the kit's own auth layouts, and mount this bar as back-only chrome above it.
 */
export function AppBar({
  title,
  sub,
  back = true,
  right,
  onBack,
  transparent = false,
  style,
}: {
  title?: string;
  sub?: string;
  back?: boolean;
  right?: React.ReactNode;
  onBack?: () => void;
  transparent?: boolean;
  style?: StyleProp<ViewStyle>;
}): React.ReactElement {
  return (
    <View
      style={[
        {
          flexDirection: "row",
          alignItems: "center",
          gap: 10,
          paddingTop: 6,
          paddingBottom: 10,
          backgroundColor: transparent ? "transparent" : tokens.color.bg,
        },
        style,
      ]}
    >
      {back ? (
        <Pressable
          onPress={onBack}
          disabled={!onBack}
          accessibilityRole="button"
          accessibilityLabel="Back"
          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          style={{ width: 32, height: 32, marginLeft: -4, alignItems: "center", justifyContent: "center", flexShrink: 0 }}
        >
          {/* Rotation on a wrapper View, not the glyph's own style. react-native-svg honours an
              SVG-level transform, but the react-native-web build the parity renderer (and any future
              web target) uses drops it — every AppBar screen was rendering a chevron pointing RIGHT in
              the parity sheets. Same fix as the D-14 puck and the D-18 food header. */}
          <View style={{ transform: [{ rotate: "180deg" }] }}>
            <Icon name="chevron-right" size={20} color={tokens.color.ink} />
          </View>
        </Pressable>
      ) : null}
      <View style={{ flex: 1, minWidth: 0 }}>
        {title ? (
          <Text numberOfLines={1} style={{ fontSize: 16, fontWeight: tokens.font.weight.bold, color: tokens.color.ink, letterSpacing: -0.16 }}>
            {title}
          </Text>
        ) : null}
        {sub ? <Text style={{ fontSize: 11.5, color: tokens.color.muted }}>{sub}</Text> : null}
      </View>
      {right}
    </View>
  );
}
