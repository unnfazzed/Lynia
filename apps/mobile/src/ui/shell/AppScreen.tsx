import { tokens } from "@lynia/shared";
import { StatusBar } from "expo-status-bar";
import React from "react";
import { View, type ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

/**
 * Phone screen scaffold, ported from `packages/design/components/shell/AppScreen.jsx`. Sets the
 * native status bar style, renders an optional full-bleed `banner` (e.g. `BrandHeader`, which pads
 * its own top safe-area inset) above the body, and an optional bordered `footer` below it. The root
 * tab bar itself is NOT rendered here — unlike the static mockup, the real app has one live
 * `expo-router` `Tabs` navigator supplying the persistent bar (`app/(tabs)/_layout.tsx`), so a
 * per-screen `tab` prop would just duplicate it.
 *
 * Without a `banner`, the body's top safe-area inset is respected here (`SafeAreaView` `edges:
 * ["top"]`) since there's no full-bleed surface to own it instead.
 */
export function AppScreen({
  children,
  banner,
  footer,
  bg = tokens.color.bg,
  dark = false,
  style,
}: {
  children: React.ReactNode;
  banner?: React.ReactNode;
  footer?: React.ReactNode;
  bg?: string;
  dark?: boolean;
  style?: ViewStyle;
}): React.ReactElement {
  const Wrapper = banner ? View : SafeAreaView;
  const wrapperProps = banner ? {} : { edges: ["top"] as const };
  return (
    <View style={[{ flex: 1, backgroundColor: bg }, style]}>
      <StatusBar style={dark ? "light" : "dark"} />
      {banner}
      <Wrapper style={{ flex: 1 }} {...wrapperProps}>
        {children}
      </Wrapper>
      {footer ? (
        <View style={{ paddingHorizontal: tokens.space.lg, paddingTop: 8, paddingBottom: 12, backgroundColor: bg, borderTopWidth: 1, borderTopColor: tokens.color.line }}>
          {footer}
        </View>
      ) : null}
    </View>
  );
}
