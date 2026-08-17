import { tokens } from "@lynia/shared/tokens";
import React from "react";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "../Icon";
import { MoonSticker, SunSticker } from "./ServiceStickers";

/**
 * Customer home header — home 8c (`packages/design/handoff/home-8c`, DS card
 * `ui_kits/mobile/home-8c.html`), replacing the pre-8c accent-green `BrandHeader` on this screen.
 * `BrandHeader` itself is untouched: the rider board still uses it, and it is still the app's one
 * sanctioned accent-FILLED surface. This one is the mint block.
 *
 * What the mock draws, top to bottom:
 *   · `accentWash` block with a SQUARE bottom edge and 24px of bottom padding. Nothing floats over
 *     the seam — the pre-8c search bar's `marginTop: -22` overhang is gone with the green.
 *   · Greeting 25px/700 ink, time-aware, with the 46px sun sticker (moon after 18:00) beside it.
 *   · A 42px WHITE circle bell with a gold unread dot. NO avatar button — the bell is the only
 *     round action in the header (the mock draws one; "not drawn ⇒ not rendered").
 *   · The address row 11px under the greeting: 13px map-pin + the DETECTED CURRENT LOCATION in
 *     12.5px/600 `accentText` + a chevron. Tap opens the location sheet.
 *   · A deliberately quiet search bar: white, radius 12 (NOT a pill), padding 10×15, 12.5px muted
 *     placeholder. It must not outweigh the greeting or the tiles.
 *
 * ZERO shadows anywhere on this screen (the handoff's hard rule, Android elevation included), so
 * nothing here spreads `tokens.shadow.*`.
 */
export function HomeHeader({
  greeting,
  address,
  evening = false,
  unread = false,
  searchPlaceholder = "Search food, or send a parcel",
  onAddress,
  onSearch,
  onBell,
}: {
  /** The whole greeting line, name included ("Good morning, Rudo") — built by `logic/greeting.ts`. */
  greeting: string;
  /** The detected street address, or the "Set your location" prompt when there is nothing to show. */
  address: string;
  evening?: boolean;
  unread?: boolean;
  searchPlaceholder?: string;
  onAddress?: () => void;
  onSearch?: () => void;
  onBell?: () => void;
}): React.ReactElement {
  // Full-bleed: the mint block runs behind the status bar, so it owns the top inset rather than
  // stopping at the safe-area edge (the same exception BrandHeader takes for the green block).
  const insets = useSafeAreaInsets();
  return (
    <View style={{ backgroundColor: tokens.color.accentWash, paddingTop: insets.top, paddingBottom: 24 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 18, paddingTop: 16 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          {/* WRAPS, like the mock: the greeting column is ~216px wide beside the 46px sticker and
              the 42px bell, so "Good morning, Rudo" is already two lines at 360px in the reference.
              Forcing one line would ellipsize the customer's own name. Two is the ceiling —
              `greetingLine` caps the name, so nothing can push the header past it. */}
          <Text numberOfLines={2} style={{ fontSize: 25, fontWeight: "700", letterSpacing: -0.25, color: tokens.color.ink }}>
            {greeting}
          </Text>
          <Pressable
            onPress={onAddress}
            disabled={!onAddress}
            accessibilityRole={onAddress ? "button" : undefined}
            accessibilityLabel={onAddress ? `Deliver to ${address}. Change location` : undefined}
            style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 11 }}
          >
            <Icon name="map-pin" size={13} color={tokens.color.accentText} />
            <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: 12.5, fontWeight: "600", color: tokens.color.accentText }}>
              {address}
            </Text>
            <Icon name="chevron-down" size={13} color={tokens.color.accentText} />
          </Pressable>
        </View>
        {/* Decorative — the greeting text already says which half of the day it is. */}
        <View accessibilityElementsHidden importantForAccessibility="no" style={{ marginRight: 2 }}>
          {evening ? <MoonSticker size={46} /> : <SunSticker size={46} />}
        </View>
        <Pressable
          onPress={onBell}
          disabled={!onBell}
          accessibilityRole="button"
          accessibilityLabel={unread ? "Notifications, unread" : "Notifications"}
          style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: tokens.color.bg, alignItems: "center", justifyContent: "center" }}
        >
          <Icon name="bell" size={18} color={tokens.color.accentText} />
          {unread ? (
            <View
              style={{
                position: "absolute",
                top: 9,
                right: 10,
                width: 8,
                height: 8,
                borderRadius: 4,
                backgroundColor: tokens.color.highlight,
                borderWidth: 1.5,
                borderColor: tokens.color.bg,
              }}
            />
          ) : null}
        </Pressable>
      </View>
      <Pressable
        onPress={onSearch}
        disabled={!onSearch}
        accessibilityRole={onSearch ? "button" : undefined}
        accessibilityLabel={searchPlaceholder}
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 8,
          marginTop: 16,
          marginHorizontal: 18,
          backgroundColor: tokens.color.bg,
          borderRadius: tokens.radius.input,
          paddingHorizontal: 15,
          paddingVertical: 10,
        }}
      >
        <Icon name="search" size={16} color={tokens.color.muted} />
        <Text style={{ fontSize: 12.5, color: tokens.color.muted }}>{searchPlaceholder}</Text>
      </Pressable>
    </View>
  );
}
