import { tokens } from "@lynia/shared";
import React from "react";
import { Text, View } from "react-native";
import { StatusPill } from "../index";

/** Shared header row (restaurant name + status pill) reused across every phase/status branch of the
 *  food order tracking screen (app/food/order/[orderId].tsx) and its extracted terminal-state views. */
export function OrderHeader({
  restaurantName,
  pillLabel,
  pillTone,
}: {
  restaurantName: string;
  pillLabel: string;
  pillTone: "neutral" | "highlight" | "success";
}): React.ReactElement {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
      <Text style={{ fontSize: 19, fontWeight: "700" }}>{restaurantName}</Text>
      <StatusPill status={pillLabel} tone={pillTone} />
    </View>
  );
}

/** Shared label/value summary row reused across the food order tracking screen and its extracted
 *  terminal-state views. */
export function Row({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 }}>
      <Text style={{ fontSize: 13, fontWeight: "500", color: tokens.color.muted }}>{label}</Text>
      <Text style={{ fontSize: 14.5, fontWeight: "700", color: tokens.color.ink }}>{value}</Text>
    </View>
  );
}
