import { tokens } from "@lynia/shared";
import React from "react";
import { Pressable, Text, View } from "react-native";
import { BrandLockup } from "./Brand";
import { Icon, type IconName } from "./index";

/**
 * Presentational pieces for the map-anchored compose home (customer-journey 1·1). Stateless — all
 * state + handlers stay in app/home.tsx. `MapHomeTopBar` is the floating brand/nav chrome; `AddressRows`
 * is the search-first pickup/drop selector (pickup = green dot, drop-off = red square, per the mockup's
 * AddressFields) that also chooses which pin the single map hero edits.
 */

export function MapHomeTopBar(props: { onNotifications: () => void; onAccount: () => void }): React.ReactElement {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", marginBottom: tokens.space.sm }}>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 6,
          backgroundColor: tokens.color.bg,
          borderRadius: tokens.radius.pill,
          paddingLeft: 10,
          paddingRight: 14,
          paddingVertical: 6,
          ...tokens.shadow.card,
        }}
      >
        <BrandLockup size={22} />
      </View>
      <View style={{ flex: 1 }} />
      <RoundButton icon="inbox" label="Notifications" onPress={props.onNotifications} />
      <View style={{ width: tokens.space.sm }} />
      <RoundButton icon="user" label="Account" onPress={props.onAccount} />
    </View>
  );
}

function RoundButton(props: { icon: IconName; label: string; onPress: () => void }): React.ReactElement {
  return (
    <Pressable
      onPress={props.onPress}
      accessibilityRole="button"
      accessibilityLabel={props.label}
      style={({ pressed }) => ({
        width: 40,
        height: 40,
        borderRadius: 20,
        backgroundColor: tokens.color.bg,
        alignItems: "center",
        justifyContent: "center",
        opacity: pressed ? 0.6 : 1,
        ...tokens.shadow.card,
      })}
    >
      <Icon name={props.icon} size={18} color={tokens.color.accentText} />
    </Pressable>
  );
}

export type AddressSlot = "pickup" | "drop";

export function AddressRows(props: {
  pickup: string;
  drop: string;
  active: AddressSlot;
  onPick: (slot: AddressSlot) => void;
}): React.ReactElement {
  return (
    <View
      style={{
        borderWidth: 1,
        borderColor: tokens.color.line,
        borderRadius: tokens.radius.input,
        backgroundColor: tokens.color.bg,
        overflow: "hidden",
        marginBottom: tokens.space.sm,
        ...tokens.shadow.card,
      }}
    >
      <AddressRow slot="pickup" value={props.pickup} active={props.active === "pickup"} onPress={() => props.onPick("pickup")} />
      <View style={{ height: 1, backgroundColor: tokens.color.line, marginLeft: 40 }} />
      <AddressRow slot="drop" value={props.drop} active={props.active === "drop"} onPress={() => props.onPick("drop")} />
    </View>
  );
}

function AddressRow(props: { slot: AddressSlot; value: string; active: boolean; onPress: () => void }): React.ReactElement {
  const isPickup = props.slot === "pickup";
  const color = isPickup ? tokens.color.accent : tokens.color.danger;
  const label = isPickup ? "PICKUP" : "DROP-OFF";
  const placeholder = isPickup ? "Set pickup location" : "Where to?";
  const filled = props.value.trim().length > 0;
  return (
    <Pressable
      testID={`address-row-${props.slot}`}
      onPress={props.onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: props.active }}
      accessibilityLabel={`${label}. ${filled ? props.value : placeholder}`}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 11,
        minHeight: 52,
        paddingHorizontal: 12,
        // Active slot gets a mint wash so it's clear which pin the map below is editing.
        backgroundColor: props.active ? tokens.color.accentWash : tokens.color.bg,
      }}
    >
      <View
        style={{
          width: 12,
          height: 12,
          borderRadius: isPickup ? 6 : 3,
          backgroundColor: filled ? color : tokens.color.bg,
          borderWidth: 2,
          borderColor: color,
        }}
      />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 10, fontWeight: "700", letterSpacing: 0.5, color: tokens.color.muted }}>{label}</Text>
        <Text numberOfLines={1} style={{ fontSize: 14.5, fontWeight: "600", color: filled ? tokens.color.ink : tokens.color.muted }}>
          {filled ? props.value : placeholder}
        </Text>
      </View>
      <Icon name={filled ? "map-pin" : "search"} size={16} color={props.active ? tokens.color.accentText : tokens.color.muted} />
    </Pressable>
  );
}
