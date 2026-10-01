import { tokens } from "@lynia/shared/tokens";
import React, { useEffect, useRef } from "react";
import { ActivityIndicator, ScrollView, Text, TextInput, View } from "react-native";
import type { ResolvedPlace } from "../../api/places";
import type { Stop } from "../../logic/send-steps";
import type { SuggestRow, SuggestStatus } from "../../logic/use-address-suggest";
import { Icon, type IconName } from "../Icon";
import { Tappable } from "../Tappable";
import { Dot, LABEL_STYLE, SEND_COPY, Sq, TextAction } from "./kit";

/**
 * Step 1's floating address card (ledger D-51; handoff README "Address card"). Two rows — PICKUP (green
 * dot) and DROP-OFF (red square). Tapping a row turns THAT ROW into the search input in place, and the
 * dropdown opens directly under it inside the same card, with the live map still showing around it.
 * There is no search screen, no confirm-pin screen and no landmark line, ever.
 *
 * Stateless: the screen owns which row is editing, the query, and what a pick does.
 */

export type Slot = "pickup" | "drop";

function Marker({ slot, empty }: { slot: Slot; empty: boolean }): React.ReactElement {
  return slot === "pickup" ? <Dot size={14} empty={empty} /> : <Sq size={14} empty={empty} />;
}

function IdleRow(props: {
  slot: Slot;
  stop: Stop | null;
  meta?: string | null;
  out: boolean;
  divider: boolean;
  onPress: () => void;
}): React.ReactElement {
  const isPickup = props.slot === "pickup";
  const label = isPickup ? SEND_COPY.pickup : SEND_COPY.drop;
  const value = props.stop?.name ?? "";
  const filled = value.length > 0;
  return (
    <Tappable
      onPress={props.onPress}
      accessibilityRole="button"
      accessibilityLabel={`${label}. ${filled ? value : isPickup ? SEND_COPY.pickPh : SEND_COPY.dropPh}. ${filled ? SEND_COPY.change : SEND_COPY.search}`}
      style={{
        minHeight: 56,
        paddingVertical: 6,
        paddingLeft: 14,
        paddingRight: 8,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        borderTopWidth: props.divider ? 1 : 0,
        borderTopColor: tokens.color.line,
      }}
    >
      <Marker slot={props.slot} empty={!filled} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={LABEL_STYLE}>
          {label}
          {props.meta ? <Text style={{ color: tokens.color.accentText }}>{` · ${props.meta}`}</Text> : null}
        </Text>
        <Text
          numberOfLines={1}
          style={{ fontSize: 15, fontWeight: tokens.font.weight.semibold, lineHeight: 20, color: filled ? tokens.color.ink : tokens.color.muted }}
        >
          {filled ? value : isPickup ? SEND_COPY.pickPh : SEND_COPY.dropPh}
        </Text>
        {props.out ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 2 }}>
            <Icon name="circle-alert" size={13} color={tokens.color.danger} />
            <Text style={{ fontSize: 12, fontWeight: tokens.font.weight.semibold, color: tokens.color.danger }}>{SEND_COPY.outTag}</Text>
          </View>
        ) : null}
      </View>
      <View style={{ minHeight: tokens.touchTargetMin, flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 6 }}>
        <Icon name={filled ? "pencil" : "search"} size={15} color={tokens.color.accentText} />
        <Text style={{ fontSize: 13, fontWeight: tokens.font.weight.semibold, color: tokens.color.accentText }}>
          {filled ? SEND_COPY.change : SEND_COPY.search}
        </Text>
      </View>
    </Tappable>
  );
}

function EditRow(props: {
  slot: Slot;
  query: string;
  divider: boolean;
  onChangeQuery: (t: string) => void;
  onSubmit: () => void;
}): React.ReactElement {
  const input = useRef<TextInput>(null);
  useEffect(() => {
    // The row became the input: put the cursor in it and raise the keyboard.
    const t = setTimeout(() => input.current?.focus(), 0);
    return () => clearTimeout(t);
  }, []);
  const label = props.slot === "pickup" ? SEND_COPY.pickup : SEND_COPY.drop;
  return (
    <View
      style={{
        paddingVertical: 4,
        paddingLeft: 14,
        paddingRight: 8,
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        borderTopWidth: props.divider ? 1 : 0,
        borderTopColor: tokens.color.line,
      }}
    >
      <Marker slot={props.slot} empty={false} />
      <View
        style={{
          flex: 1,
          minWidth: 0,
          height: 52,
          borderWidth: 2,
          borderColor: tokens.color.accentText,
          borderRadius: tokens.radius.input,
          flexDirection: "row",
          alignItems: "center",
          paddingLeft: 10,
          paddingRight: 4,
          gap: 4,
        }}
      >
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ ...LABEL_STYLE, color: tokens.color.accentText }}>{label}</Text>
          <TextInput
            ref={input}
            value={props.query}
            onChangeText={props.onChangeQuery}
            onSubmitEditing={props.onSubmit}
            returnKeyType="search"
            autoCorrect={false}
            accessibilityLabel={`${label} address`}
            placeholder={props.slot === "pickup" ? SEND_COPY.pickPh : SEND_COPY.dropPh}
            placeholderTextColor={tokens.color.muted}
            style={{ fontSize: 15, fontWeight: tokens.font.weight.semibold, lineHeight: 20, color: tokens.color.ink, padding: 0, margin: 0 }}
          />
        </View>
        {props.query.length > 0 ? (
          <TextAction icon="x" label={SEND_COPY.clear} size={12} color={tokens.color.muted} onPress={() => props.onChangeQuery("")} />
        ) : null}
      </View>
    </View>
  );
}

function SugRow(props: {
  icon: IconName;
  title: string;
  sub?: string;
  action?: boolean;
  onPress: () => void;
}): React.ReactElement {
  return (
    <Tappable
      onPress={props.onPress}
      accessibilityRole="button"
      accessibilityLabel={props.sub ? `${props.title}, ${props.sub}` : props.title}
      style={{
        minHeight: 48,
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingHorizontal: 14,
        borderTopWidth: 1,
        borderTopColor: tokens.color.line,
      }}
    >
      <View
        style={{
          width: 32,
          height: 32,
          borderRadius: 16,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: props.action ? tokens.color.accentWash : tokens.color.surface,
        }}
      >
        <Icon name={props.icon} size={16} color={props.action ? tokens.color.accentText : tokens.color.muted} />
      </View>
      <View style={{ flex: 1, minWidth: 0, paddingVertical: 6 }}>
        <Text
          numberOfLines={1}
          style={{ fontSize: 14, fontWeight: tokens.font.weight.semibold, color: props.action ? tokens.color.accentText : tokens.color.ink }}
        >
          {props.title}
        </Text>
        {props.sub ? <Text style={{ fontSize: 12, lineHeight: 16, color: tokens.color.muted }}>{props.sub}</Text> : null}
      </View>
    </Tappable>
  );
}

function SkeletonRow(): React.ReactElement {
  return (
    <View style={{ height: 48, flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 14 }}>
      <View style={{ width: 32, height: 32, borderRadius: 16, backgroundColor: tokens.color.surface }} />
      <View style={{ flex: 1 }}>
        <View style={{ height: 10, width: "60%", backgroundColor: tokens.color.line, borderRadius: 5, marginBottom: 6 }} />
        <View style={{ height: 8, width: "36%", backgroundColor: tokens.color.surface, borderRadius: 4 }} />
      </View>
    </View>
  );
}

function Middle({ status, rows, onPick }: { status: SuggestStatus; rows: SuggestRow[]; onPick: (r: SuggestRow) => void }): React.ReactElement | null {
  const list = rows.map((r) => <SugRow key={r.key} icon="map-pin" title={r.title} sub={r.sub || undefined} onPress={() => onPick(r)} />);
  if (status === "slow") {
    return (
      <View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 6, paddingTop: 8, paddingHorizontal: 14, borderTopWidth: 1, borderTopColor: tokens.color.line }}>
          <ActivityIndicator size="small" color={tokens.color.muted} style={{ transform: [{ scale: 0.6 }] }} />
          <Text style={{ fontSize: 12, fontWeight: tokens.font.weight.semibold, color: tokens.color.muted }}>{SEND_COPY.slow}</Text>
        </View>
        <SkeletonRow />
        <SkeletonRow />
      </View>
    );
  }
  if (status === "empty") {
    return (
      <Text
        accessibilityLiveRegion="polite"
        style={{ paddingVertical: 12, paddingHorizontal: 14, fontSize: 13, lineHeight: 18, color: tokens.color.muted, borderTopWidth: 1, borderTopColor: tokens.color.line }}
      >
        {SEND_COPY.noRes}
      </Text>
    );
  }
  if (status === "limited") {
    return (
      <View>
        <View style={{ flexDirection: "row", gap: 6, paddingVertical: 10, paddingHorizontal: 14, borderTopWidth: 1, borderTopColor: tokens.color.line }}>
          <Icon name="wifi-off" size={14} color={tokens.color.muted} />
          <Text style={{ flex: 1, fontSize: 12, lineHeight: 17, color: tokens.color.muted }}>{SEND_COPY.limited}</Text>
        </View>
        {list}
      </View>
    );
  }
  return list.length > 0 ? <View>{list}</View> : null;
}

export function AddressCard(props: {
  pickup: Stop | null;
  drop: Stop | null;
  /** "PICKUP · Your location" while the pickup is the GPS auto-fill. */
  pickupMeta: string | null;
  editing: Slot | null;
  query: string;
  status: SuggestStatus;
  rows: SuggestRow[];
  outPickup: boolean;
  outDrop: boolean;
  /** Px available to the dropdown (keeps a strip of live map visible above the keyboard). */
  dropdownMax: number;
  onEdit: (slot: Slot) => void;
  onChangeQuery: (t: string) => void;
  onSubmitQuery: () => void;
  onPick: (place: ResolvedPlace) => void;
  onUseCurrent: () => void;
  onTapMap: () => void;
}): React.ReactElement {
  const editing = props.editing;
  const pick = (r: SuggestRow): void => {
    void r.resolve().then((place) => {
      if (place) props.onPick(place);
    });
  };
  const row = (slot: Slot, divider: boolean): React.ReactElement =>
    editing === slot ? (
      <EditRow key={slot} slot={slot} query={props.query} divider={divider} onChangeQuery={props.onChangeQuery} onSubmit={props.onSubmitQuery} />
    ) : (
      <IdleRow
        key={slot}
        slot={slot}
        stop={slot === "pickup" ? props.pickup : props.drop}
        meta={slot === "pickup" ? props.pickupMeta : null}
        out={slot === "pickup" ? props.outPickup : props.outDrop}
        divider={divider}
        onPress={() => props.onEdit(slot)}
      />
    );
  return (
    <View
      style={{
        backgroundColor: tokens.color.bg,
        borderRadius: 14,
        overflow: "hidden",
        ...(editing ? tokens.shadow.menu : tokens.shadow.card),
      }}
    >
      {row("pickup", false)}
      {row("drop", true)}
      {editing ? (
        <View style={{ maxHeight: Math.max(96, props.dropdownMax) }}>
          <SugRow icon="navigation" title={SEND_COPY.useCur} action onPress={props.onUseCurrent} />
          <ScrollView style={{ flexShrink: 1 }} keyboardShouldPersistTaps="handled">
            <Middle status={props.status} rows={props.rows} onPick={pick} />
          </ScrollView>
          <SugRow icon="map-pin" title={SEND_COPY.tapMap} action onPress={props.onTapMap} />
        </View>
      ) : null}
    </View>
  );
}
