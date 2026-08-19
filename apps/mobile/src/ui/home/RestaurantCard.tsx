import { tokens } from "@lynia/shared/tokens";
import { Tappable } from "../Tappable";
import React, { useState } from "react";
import { Text, View } from "react-native";
import { RemoteImage } from "../RemoteImage";
import { avatarTint } from "../../logic/avatar";

/** The mock's photo band. The card itself is a grid cell, so it takes its width from the column. */
const PHOTO_HEIGHT = 76;

/**
 * Home 8c "Popular near you" card (`packages/design/handoff/home-8c` §4) — a two-column photo card,
 * replacing the pre-8c 172px-wide horizontal-rail card.
 *
 * The mock draws: radius 16, a 1px `line` border and NO shadow, a 76px photo with a white bordered
 * ETA pill bottom-right on it, then the name 13px/700 and a meta row of `★ rating` (gold star) with
 * the delivery fee pushed right in `accentText` 700. Every number is tabular.
 *
 * D-22 photo policy is unchanged: a photo is an upgrade, never a dependency — the tinted-initial
 * fallback renders synchronously and the photo swaps in when it loads.
 *
 * Rating / ETA / fee are each rendered ONLY when the caller has a real value. The customer read API
 * now carries `ratingAvg`/`ratingCount` and enough to estimate the rest (see
 * `logic/home-feed.ts :: popularNearYou`), but an unrated shop, a merchant with no location, or a
 * customer with no location fix legitimately has no number — and an invented one would be worse
 * than an absent element (CLAUDE.md: never ship fabricated figures).
 */
export function RestaurantCard({
  name,
  photoUrl,
  rating,
  etaMinutes,
  deliveryFee,
  closed = false,
  width,
  onPress,
}: {
  name: string;
  photoUrl: string | null;
  /** Column width, measured by the caller from the viewport (two columns, 16px gutters, 10px gap).
   *  A percentage can't express "half of what's left after the gap", and a `flex: 1` cell in a
   *  wrapping row stretches a lone third card across the whole width. */
  width: number;
  /** Already formatted to one decimal ("4.9"), or null when the shop has no ratings yet. */
  rating: string | null;
  etaMinutes: number | null;
  /** Already formatted with its currency ("$1.00"), or null when it cannot be estimated. */
  deliveryFee: string | null;
  closed?: boolean;
  onPress: () => void;
}): React.ReactElement {
  const [photoFailed, setPhotoFailed] = useState(false);
  const showPhoto = !!photoUrl && !photoFailed;

  return (
    <Tappable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${name}${closed ? " — closed" : ""}`}
      style={{
        width,
        borderRadius: 16,
        backgroundColor: tokens.color.bg,
        borderWidth: 1,
        borderColor: tokens.color.line,
        overflow: "hidden",
        opacity: closed ? 0.65 : 1,
      }}
    >
      <View style={{ height: PHOTO_HEIGHT }}>
        {showPhoto ? (
          <RemoteImage
            source={{ uri: photoUrl! }}
            onError={() => setPhotoFailed(true)}
            accessibilityElementsHidden
            importantForAccessibility="no"
            style={{ width: "100%", height: "100%", backgroundColor: tokens.color.surface }}
          />
        ) : (
          <View
            accessibilityElementsHidden
            importantForAccessibility="no"
            style={{ flex: 1, backgroundColor: avatarTint(name), alignItems: "center", justifyContent: "center" }}
          >
            <Text style={{ fontSize: 26, fontWeight: "800", color: tokens.color.ink, opacity: 0.5 }}>
              {(name[0] ?? "•").toUpperCase()}
            </Text>
          </View>
        )}
        {etaMinutes != null ? (
          <View
            style={{
              position: "absolute",
              right: 8,
              bottom: 8,
              backgroundColor: tokens.color.bg,
              borderWidth: 1,
              borderColor: tokens.color.line,
              borderRadius: tokens.radius.pill,
              paddingHorizontal: 10,
              paddingVertical: 4,
            }}
          >
            <Text style={{ fontSize: 11.5, lineHeight: 13.92, fontWeight: "800", color: tokens.color.ink, fontVariant: ["tabular-nums"] }}>{etaMinutes} min</Text>
          </View>
        ) : null}
      </View>
      <View style={{ paddingTop: 7, paddingHorizontal: 10, paddingBottom: 9 }}>
        <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: "700", color: tokens.color.ink }}>
          {name}
        </Text>
        <View style={{ flexDirection: "row", gap: 6, marginTop: 2 }}>
          {rating ? (
            <Text numberOfLines={1} style={{ fontSize: 11.5, color: tokens.color.ink, fontVariant: ["tabular-nums"] }}>
              <Text style={{ color: tokens.color.highlight }}>★</Text> <Text style={{ fontWeight: "700" }}>{rating}</Text>
            </Text>
          ) : null}
          {deliveryFee ? (
            <Text
              numberOfLines={1}
              style={{ marginLeft: "auto", fontSize: 11.5, fontWeight: "700", color: tokens.color.accentText, fontVariant: ["tabular-nums"] }}
            >
              {deliveryFee}
            </Text>
          ) : null}
        </View>
      </View>
    </Tappable>
  );
}
