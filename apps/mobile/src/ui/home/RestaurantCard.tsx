import type { RestaurantListItem } from "@lynia/shared";
import { tokens } from "@lynia/shared";
import React, { useState } from "react";
import { Image, Pressable, Text, View } from "react-native";
import { avatarTint } from "../../logic/avatar";

const CARD_WIDTH = 172;
// Kit RestaurantCard (r-parts.jsx RC_HOME_VENUES / DS RestaurantCard): 84px photo band.
const PHOTO_HEIGHT = 84;

/**
 * Home "Restaurants near you" card (plan §5 A2, ported from
 * `packages/design/components/home/RestaurantCard.jsx`) — photo-led venue card, tinted-initial
 * fallback (D-22 photo policy: a photo is an upgrade, never a dependency, and never blocks first
 * paint — the fallback renders synchronously, the photo swaps in once it loads). Rating/ETA/delivery
 * fee are omitted: the customer read API (Lane C1) doesn't carry them yet, the same gap D1's
 * `RestaurantRow` already flagged for the full browse list — showing invented numbers here would be
 * worse than the honest degraded card.
 */
export function RestaurantCard({
  restaurant,
  closed,
  note,
  onPress,
}: {
  restaurant: Pick<RestaurantListItem, "name" | "coverPhotoUrl">;
  closed: boolean;
  note: string | null;
  onPress: () => void;
}): React.ReactElement {
  const [photoFailed, setPhotoFailed] = useState(false);
  const showPhoto = !!restaurant.coverPhotoUrl && !photoFailed;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${restaurant.name}${closed ? " — closed" : ""}`}
      style={{ width: CARD_WIDTH, opacity: closed ? 0.65 : 1 }}
    >
      <View style={{ borderRadius: tokens.radius.card, backgroundColor: tokens.color.bg, overflow: "hidden", ...tokens.shadow.card }}>
        <View style={{ height: PHOTO_HEIGHT }}>
          {showPhoto ? (
            <Image
              source={{ uri: restaurant.coverPhotoUrl! }}
              onError={() => setPhotoFailed(true)}
              accessibilityElementsHidden
              importantForAccessibility="no"
              style={{ width: "100%", height: "100%", backgroundColor: tokens.color.surface }}
            />
          ) : (
            <View
              accessibilityElementsHidden
              importantForAccessibility="no"
              style={{ flex: 1, backgroundColor: avatarTint(restaurant.name), alignItems: "center", justifyContent: "center" }}
            >
              <Text style={{ fontSize: 30, fontWeight: "800", color: tokens.color.ink, opacity: 0.5 }}>
                {(restaurant.name[0] ?? "•").toUpperCase()}
              </Text>
            </View>
          )}
          {closed && note ? (
            <View
              style={{
                position: "absolute",
                left: 8,
                top: 8,
                backgroundColor: tokens.color.bg,
                borderRadius: 999,
                paddingHorizontal: 8,
                paddingVertical: 3,
                ...tokens.shadow.card,
              }}
            >
              <Text numberOfLines={1} style={{ fontSize: 10.5, fontWeight: "700", color: tokens.color.ink }}>
                {note}
              </Text>
            </View>
          ) : null}
        </View>
        <View style={{ paddingTop: 7, paddingHorizontal: 10, paddingBottom: 9 }}>
          <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: "700", color: tokens.color.ink }}>
            {restaurant.name}
          </Text>
          <Text style={{ fontSize: 11.5, fontWeight: "600", color: closed ? tokens.color.muted : tokens.color.accentText, marginTop: 2 }}>
            {closed ? "Closed" : "Open now"}
          </Text>
        </View>
      </View>
    </Pressable>
  );
}
