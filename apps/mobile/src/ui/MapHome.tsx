import { tokens } from "@lynia/shared";
import React from "react";
import { Pressable, Text, View } from "react-native";
import { BrandLockup, Icon, type IconName } from "./index";

/**
 * Presentational chrome for the map-anchored customer home (customer-journey §1·1–1·5, "Map home").
 * These are pure, stateless pieces — all form state, validation and the broadcast/draft/disclaimer
 * logic stay in app/home.tsx. They only render the two things that float OVER the map: the brand /
 * account top bar, and the two stacked address rows.
 */

/** A 44px round icon button that floats over the map (account / notifications). Icons are always
 *  paired with a screen-reader label — there's no room for visible text on the compact control. */
function RoundButton({ icon, label, onPress }: { icon: IconName; label: string; onPress: () => void }): React.ReactElement {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({
        width: tokens.touchTargetMin,
        height: tokens.touchTargetMin,
        borderRadius: tokens.touchTargetMin / 2,
        // White chip floating on the DS card shadow (same treatment as the brand pill), mint on press.
        backgroundColor: pressed ? tokens.color.accentWash : tokens.color.bg,
        alignItems: "center",
        justifyContent: "center",
        ...tokens.shadow.card,
      })}
    >
      <Icon name={icon} size={18} color={tokens.color.accentText} />
    </Pressable>
  );
}

/**
 * The floating top bar over the map hero: the LyniaGo brand pill (left) and the notifications +
 * account buttons (right). Meant to be absolutely positioned at the top of the map region by the
 * caller. Navigation is passed in so this stays presentational.
 */
export function MapHomeTopBar({
  onAccount,
  onNotifications,
}: {
  onAccount: () => void;
  onNotifications: () => void;
}): React.ReactElement {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: tokens.space.sm }}>
      {/* Brand pill — the LyniaGo lockup floating on the DS card shadow (customer-journey §1·1). */}
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          backgroundColor: tokens.color.bg,
          borderRadius: tokens.radius.pill,
          paddingLeft: tokens.space.sm,
          paddingRight: tokens.space.md,
          paddingVertical: 6,
          ...tokens.shadow.card,
        }}
      >
        <BrandLockup size={22} />
      </View>
      <View style={{ flex: 1 }} />
      {/* "inbox" is the house notifications glyph (mirrors the notifications empty state). */}
      <RoundButton icon="inbox" label="Notifications" onPress={onNotifications} />
      <RoundButton icon="user" label="Account" onPress={onAccount} />
    </View>
  );
}

/** One address row: a filled/hollow marker + label + the current value (or a placeholder). Pickup is
 *  a green dot, drop-off a red square — the marker fills once its point is set. */
function AddressRow({ role, value, set }: { role: "pickup" | "drop"; value: string; set: boolean }): React.ReactElement {
  const isPickup = role === "pickup";
  const color = isPickup ? tokens.color.accent : tokens.color.danger;
  const label = isPickup ? "PICKUP" : "DROP-OFF";
  const placeholder = isPickup ? "Set pickup location" : "Where to?";
  return (
    <View
      accessibilityRole="text"
      accessibilityLabel={`${label}: ${value || placeholder}`}
      style={{ flexDirection: "row", alignItems: "center", gap: 11, minHeight: 48, paddingHorizontal: tokens.space.md, paddingVertical: 6 }}
    >
      <View
        style={{
          width: 12,
          height: 12,
          // Dot for pickup, square for drop-off; the bright fill is a non-text marker (green stays off text).
          borderRadius: isPickup ? 6 : 3,
          backgroundColor: set ? color : tokens.color.bg,
          borderWidth: 2,
          borderColor: color,
        }}
      />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: tokens.font.size.micro, fontWeight: tokens.font.weight.bold, letterSpacing: 0.5, color: tokens.color.muted }}>{label}</Text>
        <Text numberOfLines={1} style={{ fontSize: 15, fontWeight: tokens.font.weight.semibold, color: value ? tokens.color.ink : tokens.color.muted }}>
          {value || placeholder}
        </Text>
      </View>
      <Icon name={set ? "map-pin" : "search"} size={16} color={tokens.color.muted} />
    </View>
  );
}

/**
 * The two stacked address rows floating over the map (customer-journey AddressFields): a live summary
 * of the pickup + drop-off set via the address search / map pin below. Display-only — it reads the
 * points/landmarks; the actual setting stays on the search field + MapPicker the caller renders.
 */
export function AddressSummary({
  pickupValue,
  pickupSet,
  dropValue,
  dropSet,
}: {
  pickupValue: string;
  pickupSet: boolean;
  dropValue: string;
  dropSet: boolean;
}): React.ReactElement {
  return (
    <View style={{ marginBottom: tokens.space.md }}>
      <View
        style={{
          borderWidth: 1,
          borderColor: tokens.color.line,
          borderRadius: tokens.radius.input,
          backgroundColor: tokens.color.bg,
          overflow: "hidden",
          ...tokens.shadow.card,
        }}
      >
        <AddressRow role="pickup" value={pickupValue} set={pickupSet} />
        {/* Hairline divider, inset past the marker column so it aligns under the row text. */}
        <View style={{ height: 1, backgroundColor: tokens.color.line, marginLeft: 35 }} />
        <AddressRow role="drop" value={dropValue} set={dropSet} />
      </View>
      {/* Paired icon + text (low-literacy market): how to actually set each address. */}
      <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginTop: tokens.space.sm }}>
        <Icon name="map-pin" size={13} color={tokens.color.muted} />
        <Text style={{ fontSize: tokens.font.size.caption, color: tokens.color.muted }}>Search an address, or tap the map to drop a pin.</Text>
      </View>
    </View>
  );
}
