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
      <Card style={{ opacity: open ? 1 : 0.72 }}>
        <View style={{ flexDirection: "row", gap: 12 }}>
          <FoodThumb name={r.name} photoUrl={r.coverPhotoUrl} size={96} radius={14} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
              <Text style={{ flex: 1, fontSize: 15, fontWeight: "700", color: tokens.color.ink }} numberOfLines={1}>
                {r.name}
              </Text>
              {/* Kit RestRow (r-parts.jsx:337): a closed shop carries its state as a pill beside the
                  name, not buried in the meta line. */}
              {!open ? (
                <Text
                  style={{
                    fontSize: 11,
                    fontWeight: "700",
                    color: tokens.color.muted,
                    backgroundColor: tokens.color.surface,
                    borderRadius: tokens.radius.pill,
                    paddingHorizontal: 8,
                    paddingVertical: 2,
                    overflow: "hidden",
                  }}
                >
                  Closed
                </Text>
              ) : null}
            </View>
            {r.cuisineTags.length > 0 ? (
              <Text style={{ fontSize: 12.5, color: tokens.color.muted, marginTop: 2 }} numberOfLines={1}>
                {r.cuisineTags.join(" · ")}
                {r.priceLevel ? ` · ${"$".repeat(r.priceLevel)}` : ""}
              </Text>
            ) : null}
            {open ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 5, marginTop: 6 }}>
                <Icon name="clock" size={13} color={tokens.color.accentText} />
                <Text style={{ fontSize: 12.5, fontWeight: "600", color: tokens.color.accentText }}>
                  {closingIn != null ? `Closing in ${closingIn} min` : "Open now"}
                </Text>
              </View>
            ) : null}
          </View>
        </View>
      </Card>
    </Pressable>
  );
}
