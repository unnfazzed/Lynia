import { tokens } from "@lynia/shared/tokens";
import React from "react";
import { Text, View } from "react-native";
import type { SuggestRow } from "../../logic/use-address-suggest";
import { HAIRLINE } from "../browse/kit";
import { Icon } from "../Icon";
import { Tappable } from "../Tappable";
import { O, ofFmt } from "./copy";
import { PinMap } from "./PinMap";
import { ReviewBlock, ReviewField, ReviewNote } from "./review";

/**
 * R3a/R3b — "Deliver to ✎" opens the address in place, as Send v2's step-1 card does (D-52): the block
 * gets a green border and "Done", the street search with its dropdown, "Use my current location", a
 * 200px map with the drop pin on the gate, and — out of area — the danger-wash hint (never a red line).
 * Stateless: the Review screen owns the draft, the query and what a pick does.
 */
export function AddressEdit(props: {
  draft: { lat: number; lng: number } | null;
  query: string;
  rows: SuggestRow[];
  /** R3b: `{v} doesn’t deliver to {a}` when set. */
  outOf: { venue: string; area: string } | null;
  onQuery: (q: string) => void;
  onSubmitQuery: () => void;
  onPick: (row: SuggestRow) => void;
  onUseCurrent: () => void;
  onMove: (p: { lat: number; lng: number }) => void;
  onName: (p: { lat: number; lng: number }, name: string) => void;
  onDone: () => void;
}): React.ReactElement {
  return (
    <ReviewBlock label={O.r.to} edit={{ label: O.c.done, onPress: props.onDone, icon: false }} focused>
      <Text accessibilityRole="header" style={{ fontSize: 16, lineHeight: 20.8, fontWeight: tokens.font.weight.bold, color: tokens.color.ink }}>
        {O.r.addrT}
      </Text>
      <ReviewField
        icon="search"
        value={props.query}
        onChangeText={props.onQuery}
        onSubmitEditing={props.onSubmitQuery}
        placeholder={O.r.addrSearch}
        accessibilityLabel={O.r.addrT}
        returnKeyType="search"
        autoCorrect={false}
      />
      {props.rows.slice(0, 5).map((r) => (
        <Tappable
          key={r.key}
          onPress={() => props.onPick(r)}
          accessibilityRole="button"
          accessibilityLabel={r.sub ? `${r.title}, ${r.sub}` : r.title}
          style={{ minHeight: 48, flexDirection: "row", alignItems: "center", gap: 10, borderBottomWidth: 1, borderBottomColor: HAIRLINE }}
        >
          <Icon name="map-pin" size={16} color={tokens.color.muted} />
          <View style={{ flex: 1, minWidth: 0, paddingVertical: 6 }}>
            <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: tokens.font.weight.semibold, color: tokens.color.ink }}>
              {r.title}
            </Text>
            {r.sub ? <Text style={{ fontSize: 12, lineHeight: 16, color: tokens.color.muted }}>{r.sub}</Text> : null}
          </View>
        </Tappable>
      ))}
      <Tappable
        tone="icon"
        onPress={props.onUseCurrent}
        accessibilityRole="button"
        style={{ minHeight: tokens.touchTargetMin, flexDirection: "row", alignItems: "center", gap: 8, alignSelf: "flex-start" }}
      >
        <Icon name="navigation" size={16} color={tokens.color.accentText} />
        <Text style={{ fontSize: 14, fontWeight: tokens.font.weight.semibold, color: tokens.color.accentText }}>{O.r.addrUse}</Text>
      </Tappable>
      <PinMap value={props.draft} onMove={props.onMove} onName={props.onName} />
      <Text style={{ fontSize: 13, lineHeight: 18.2, color: tokens.color.muted }}>{O.r.addrPin}</Text>
      {props.outOf ? (
        <ReviewNote tone="dn" icon="circle-alert">
          {ofFmt(O.r.outArea, { v: props.outOf.venue, a: props.outOf.area })}
        </ReviewNote>
      ) : null}
    </ReviewBlock>
  );
}
