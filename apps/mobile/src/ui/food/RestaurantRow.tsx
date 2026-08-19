import type { RestaurantListItem } from "@lynia/shared";
import { Tappable } from "../Tappable";
import { tokens } from "@lynia/shared/tokens";
import { isMerchantOpenNow, minutesUntilClose } from "@lynia/shared";
import React from "react";
import { Text, View } from "react-native";
import { Card, Icon } from "../index";
import { FoodThumb } from "./FoodThumb";

/** R1·1 restaurant row: photo-led, open/closed derived from `hours`.
 *
 *  The mock's meta line (★ rating (n) · <km> km · <eta> min · $<fee> delivery) is still omitted, but
 *  NOT for the reason this comment used to give ("not in the wire contract yet"). That expired: #673
 *  put `ratingAvg`/`ratingCount`/`prepBaselineMinutes` on `RestaurantListItem` beside the existing
 *  `location`, and `home-location.ts` gives the list a live customer fix — `logic/food-list.ts`'s
 *  `restaurantMeta()` already derives all four for the header's pills. Wiring them into this row is
 *  an open parity gap (docs/parity/PHASE4-browse.md), not a data one. */
export function RestaurantRow({ r, onPress, now }: { r: RestaurantListItem; onPress: () => void; now: Date }): React.ReactElement {
  const open = isMerchantOpenNow(r.hours, now);
  const closingIn = open ? minutesUntilClose(r.hours, now) : null;

  return (
    <Tappable onPress={onPress} accessibilityRole="button" accessibilityLabel={`${r.name}${open ? "" : " — closed"}`}>
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
    </Tappable>
  );
}
