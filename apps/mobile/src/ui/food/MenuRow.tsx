import type { RestaurantMenuDish } from "@lynia/shared";
import { tokens } from "@lynia/shared";
import React from "react";
import { Pressable, Text, View } from "react-native";
import { formatMoney } from "../../logic/money";
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
      style={{ opacity: disabled ? 0.5 : 1, flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 10, borderBottomWidth: 1, borderBottomColor: tokens.color.line }}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 14.5, fontWeight: "700", color: tokens.color.ink }} numberOfLines={1}>
          {dish.name}
        </Text>
        {dish.description ? (
          <Text style={{ fontSize: 12.5, color: tokens.color.muted, marginTop: 2 }} numberOfLines={2}>
            {dish.description}
          </Text>
        ) : null}
        <Text style={{ fontSize: 13.5, fontWeight: "700", color: tokens.color.ink, marginTop: 4 }}>{formatMoney(dish.priceUsd)}</Text>
        {dish.outOfStock ? (
          <Text style={{ fontSize: 12, fontWeight: "700", color: tokens.color.muted, marginTop: 2 }}>Sold out today</Text>
        ) : qtyInCart > 0 ? (
          <Text style={{ fontSize: 12, fontWeight: "700", color: tokens.color.accentText, marginTop: 2 }}>In cart · {qtyInCart}</Text>
        ) : null}
      </View>
      <FoodThumb name={dish.name} photoUrl={dish.photoUrl} size={64} radius={12} />
    </Pressable>
  );
}
