import type { RestaurantMenuDish } from "@lynia/shared";
import { tokens } from "@lynia/shared";
import React from "react";
import { Pressable, Text, View } from "react-native";
import { formatMoney } from "../../logic/money";
import { Money } from "../Money";
import { Icon } from "../Icon";
import { FoodThumb } from "./FoodThumb";

/** R2·1/D-10: an out-of-stock dish stays visible and disabled rather than disappearing — hiding it
 *  makes the menu look thin and erodes trust that the kitchen "normally has this". */
export function MenuRow({
  dish,
  qtyInCart,
  disabledReason,
  onPress,
}: {
  dish: RestaurantMenuDish;
  /** Total quantity of this dish already in the cart, across all note-variants. */
  qtyInCart: number;
  /** Non-null disables the row and is shown as the reason (out of stock, or the kitchen is closed). */
  disabledReason?: string | null;
  onPress: () => void;
}): React.ReactElement {
  const disabled = dish.outOfStock || !!disabledReason;
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={`${dish.name}, ${formatMoney(dish.priceUsd)}${disabled ? ", unavailable" : ""}`}
      style={{ opacity: disabled ? 0.55 : 1, flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: tokens.color.line }}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 14.5, fontWeight: "600", color: tokens.color.ink }} numberOfLines={1}>
          {dish.name}
        </Text>
        {dish.description ? (
          <Text style={{ fontSize: 12.5, color: tokens.color.muted, marginTop: 2, lineHeight: 17 }} numberOfLines={2}>
            {dish.description}
          </Text>
        ) : null}
        <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 }}>
          <Money v={dish.priceUsd} />
          {dish.outOfStock ? (
            <Text
              style={{
                fontSize: 11.5,
                fontWeight: "700",
                color: tokens.color.muted,
                backgroundColor: tokens.color.surface,
                borderRadius: tokens.radius.pill,
                paddingHorizontal: 9,
                paddingVertical: 3,
                overflow: "hidden",
              }}
            >
              Out of stock today
            </Text>
          ) : null}
        </View>
      </View>
      {/* Kit r-parts.jsx MenuRow: a 68px thumb with the 44px add target overhanging its corner —
          the badge carries the in-cart quantity when there is one, a plain plus when there isn't. */}
      <View style={{ position: "relative", flexShrink: 0, paddingBottom: 8, paddingRight: 4 }}>
        <FoodThumb name={dish.name} photoUrl={dish.photoUrl} size={68} radius={12} />
        {!disabled ? (
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              right: -4,
              bottom: -2,
              minWidth: 44,
              height: 44,
              borderRadius: 22,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: qtyInCart > 0 ? tokens.color.cta : tokens.color.bg,
              borderWidth: qtyInCart > 0 ? 0 : 1,
              borderColor: tokens.color.line,
              ...tokens.shadow.card,
            }}
          >
            {qtyInCart > 0 ? (
              <Text style={{ fontSize: 15, fontWeight: "700", color: tokens.color.onAccent, fontVariant: ["tabular-nums"] }}>{qtyInCart}</Text>
            ) : (
              <Icon name="plus" size={19} color={tokens.color.accentText} />
            )}
          </View>
        ) : null}
      </View>
    </Pressable>
  );
}
