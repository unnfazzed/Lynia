import { tokens } from "@lynia/shared/tokens";
import { Tappable } from "./Tappable";
import React from "react";
import { Pressable, Text, View } from "react-native";
import { BrandLockup } from "./Brand";
import { Icon, type IconName } from "./index";

/**
 * Presentational pieces for the map-anchored compose home (customer-journey 1·1). Stateless — all
 * state + handlers stay in app/send.tsx. `MapHomeTopBar` is the floating brand/nav chrome; `AddressRows`
 * is the search-first pickup/drop selector (pickup = green dot, drop-off = red square, per the mockup's
 * AddressFields) that also chooses which pin the single map hero edits.
 */

export function MapHomeTopBar(props: { onAccount: () => void; onBack?: () => void }): React.ReactElement {
  // Kit Home (screens.jsx:154–162): the floating chrome over the map is a brand pill top-left and a
  // SINGLE round action top-right — the account avatar. The mock draws no second (notifications) button
  // here; that entry point lives on the Account tab instead, so it is not duplicated on the map.
  //
  // `onBack` is the one addition (ledger D-14): the mock's map-home is the ROOT of a rootless app, so
  // it draws no back affordance — but the shipped app pushes /send on top of the tab shell, which hides
  // the tab bar and left the composer with no way out. The button is not invented chrome: it is the
  // kit's OWN floating back, lifted verbatim from `LJ addr_confirm` (screens.jsx:443–445) — a 40×40
  // round `--bg` puck with `shadow-card` and an 18px `--ink` arrow — so it is the same object as the
  // account puck opposite it. Omitted when there is nothing to go back to.
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: tokens.space.sm, marginBottom: tokens.space.sm }}>
      {props.onBack ? <RoundButton icon="arrow-right" flip label="Back" onPress={props.onBack} /> : null}
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
      <RoundButton icon="user" label="Account" onPress={props.onAccount} />
    </View>
  );
}

function RoundButton(props: { icon: IconName; label: string; flip?: boolean; onPress: () => void }): React.ReactElement {
  return (
    <Pressable
      onPress={props.onPress}
      accessibilityRole="button"
      accessibilityLabel={props.label}
      // The 40px puck is the kit's drawn size; hitSlop makes up the device touch floor without
      // growing the glyph (same trade the shell AppBar makes for its 32px back chevron).
      hitSlop={{ top: 4, bottom: 4, left: 4, right: 4 }}
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
      {/* Neither icon set carries a left-pointing arrow (the kit's own 38-glyph subset stops at
          `ArrowRight` — ledger D-08), so a flipped `arrow-right` stands in for the mock's `arrow-left`,
          the same substitution `shell/AppBar` makes for its back chevron. The rotation lives on a
          wrapper View, not on the glyph's own style: an SVG-level transform survives react-native-svg
          but is dropped by the react-native-web build the parity renderer uses, which would have shipped
          a screenshot (and any future web target) with the arrow pointing the wrong way.
          Back is drawn in `--ink` (addr_confirm), the account puck in `--accent-text` (Home). */}
      <View style={props.flip ? { transform: [{ rotate: "180deg" }] } : undefined}>
        <Icon name={props.icon} size={18} color={props.flip ? tokens.color.ink : tokens.color.accentText} />
      </View>
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
      {/* Kit inset (screens.jsx:83): the divider starts past the dot, not past the whole gutter. */}
      <View style={{ height: 1, backgroundColor: tokens.color.line, marginLeft: 35 }} />
      <AddressRow slot="drop" value={props.drop} active={props.active === "drop"} onPress={() => props.onPick("drop")} />
    </View>
  );
}

/**
 * The kit's one-line caption under the address rows (`screens.jsx` AddressFields: "Search an address,
 * or tap the map to drop a pin."). It never shipped, which left the rows' search magnifier as the only
 * hint that addressing is anything other than a pin drop.
 *
 * It used to take a `searchEnabled` prop and swap to a pins-only sentence on a build with no Places
 * key — honest at the time, because the search field genuinely wasn't there. It is now unconditional
 * (kit copy verbatim): `AddressSearch` always renders a working field, falling back to the device
 * geocoder when Places isn't keyed, so both halves of the sentence are always true.
 */
export function AddressHint(): React.ReactElement {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginBottom: tokens.space.sm, paddingHorizontal: 2 }}>
      <Icon name="map-pin" size={13} color={tokens.color.muted} />
      <Text style={{ flex: 1, fontSize: 11.5, color: tokens.color.muted }}>Search an address, or tap the map to drop a pin.</Text>
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
    <Tappable
      onPress={props.onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: props.active }}
      accessibilityLabel={`${label}. ${filled ? props.value : placeholder}`}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 11,
        // Kit row box (screens.jsx:69): 48px min height, 6×12 padding — still clear of the 44px
        // touch-target floor.
        minHeight: 48,
        paddingHorizontal: 12,
        paddingVertical: 6,
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
      {/* Kit AddressFields: a filled row shows `pencil` (edit), an empty row `search`. */}
      <Icon name={filled ? "pencil" : "search"} size={16} color={props.active ? tokens.color.accentText : tokens.color.muted} />
    </Tappable>
  );
}
