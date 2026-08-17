import { tokens } from "@lynia/shared/tokens";
import React from "react";
import { Pressable, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Icon } from "../Icon";

/**
 * Lynia green brand header — the ONE sanctioned accent-filled surface, root home only (per
 * `packages/design/components/home/home.prompt.md`). Accent-green block carrying the delivery
 * address and two round actions (bell, profile), with the white search bar floating over the
 * bottom seam. The parent screen must render a light status bar above this and a white body
 * below — see `<StatusBar style="light" />` on the launcher screen. Never used on inner screens,
 * which keep white app bars.
 */
export function BrandHeader({
  address,
  label = "DELIVER TO",
  searchPlaceholder = "Search food, or send a parcel",
  showSearch = true,
  onAddress,
  onSearch,
  onBell,
  onProfile,
}: {
  address: string;
  label?: string;
  searchPlaceholder?: string;
  showSearch?: boolean;
  onAddress?: () => void;
  onSearch?: () => void;
  onBell?: () => void;
  onProfile?: () => void;
}): React.ReactElement {
  // Full-bleed exception (the one accent-filled surface in the app): the green block extends behind
  // the status bar instead of stopping at the safe-area edge like every other screen's white body.
  const insets = useSafeAreaInsets();
  return (
    <View>
      <View style={{ backgroundColor: tokens.color.accent, paddingTop: insets.top + 6, paddingHorizontal: tokens.space.screen, paddingBottom: 30 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
          <Pressable onPress={onAddress} disabled={!onAddress} accessibilityRole={onAddress ? "button" : undefined} style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontSize: 11.5, fontWeight: "700", color: "rgba(255,255,255,.85)", letterSpacing: 0.5 }}>{label}</Text>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
              <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: 16, fontWeight: "700", color: tokens.color.onAccent }}>
                {address}
              </Text>
              <Icon name="chevron-down" size={15} color={tokens.color.onAccent} />
            </View>
          </Pressable>
          <RoundIcon icon="bell" onPress={onBell} label="Notifications" />
          <RoundIcon icon="user" onPress={onProfile} label="Profile" />
        </View>
      </View>
      {showSearch ? (
        <Pressable
          onPress={onSearch}
          disabled={!onSearch}
          accessibilityRole={onSearch ? "button" : undefined}
          accessibilityLabel={searchPlaceholder}
          style={{
            marginTop: -22,
            marginHorizontal: tokens.space.screen,
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            backgroundColor: tokens.color.bg,
            borderRadius: tokens.radius.input,
            paddingHorizontal: 13,
            paddingVertical: 11,
            minHeight: tokens.touchTargetMin,
            ...tokens.shadow.card,
          }}
        >
          <Icon name="search" size={16} color={tokens.color.muted} />
          <Text style={{ fontSize: 13.5, color: tokens.color.muted }}>{searchPlaceholder}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

function RoundIcon({ icon, onPress, label }: { icon: "bell" | "user"; onPress?: () => void; label: string }): React.ReactElement {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: tokens.color.accentPressed, alignItems: "center", justifyContent: "center" }}
    >
      <Icon name={icon} size={17} color={tokens.color.onAccent} />
    </Pressable>
  );
}
