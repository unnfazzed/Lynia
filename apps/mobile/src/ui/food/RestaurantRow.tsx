import type { RestaurantListItem } from "@lynia/shared";
import { tokens } from "@lynia/shared";
import { isMerchantOpenNow, minutesUntilClose } from "@lynia/shared";
import React from "react";
import { Pressable, Text, View } from "react-native";
import { Card, Icon } from "../index";
import { FoodThumb } from "./FoodThumb";

/** R1·1 restaurant row: photo-led, distance/rating omitted (not in the wire contract yet — corridor
 *  scoping and geo-distance are Lane C data this app doesn't have), open/closed derived from `hours`. */
export function RestaurantRow({ r, onPress, now }: { r: RestaurantListItem; onPress: () => void; now: Date }): React.ReactElement {
  const open = isMerchantOpenNow(r.hours, now);
  const closingIn = open ? minutesUntilClose(r.hours, now) : null;

  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${r.name}${open ? "" : " — closed"}`}>
      <Card style={{ opacity: open ? 1 : 0.65 }}>
        <View style={{ flexDirection: "row", gap: 12 }}>
          <FoodThumb name={r.name} photoUrl={r.coverPhotoUrl} size={72} radius={14} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontSize: 15, fontWeight: "700", color: tokens.color.ink }} numberOfLines={1}>
              {r.name}
            </Text>
            {r.cuisineTags.length > 0 ? (
              <Text style={{ fontSize: 12.5, color: tokens.color.muted, marginTop: 2 }} numberOfLines={1}>
                {r.cuisineTags.join(" · ")}
                {r.priceLevel ? ` · ${"$".repeat(r.priceLevel)}` : ""}
              </Text>
            ) : null}
            <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginTop: 6 }}>
              <Icon name="clock" size={13} color={open ? tokens.color.accentText : tokens.color.muted} />
              <Text style={{ fontSize: 12.5, fontWeight: "600", color: open ? tokens.color.accentText : tokens.color.muted }}>
                {open ? (closingIn != null ? `Closing in ${closingIn} min` : "Open now") : "Closed"}
              </Text>
            </View>
          </View>
        </View>
      </Card>
    </Pressable>
  );
}
