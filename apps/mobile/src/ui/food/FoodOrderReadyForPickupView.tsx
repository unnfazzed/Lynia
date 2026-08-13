import { tokens, type MerchantOrderResponse } from "@lynia/shared";
import React from "react";
import { Text, View } from "react-native";
import { Icon, OfflineBanner, Screen, Stepper } from "../index";
import { OrderHeader } from "./FoodOrderHelpers";

type ReadyForPickupOrder = Pick<MerchantOrderResponse, "noRiderHoldAt" | "status" | "merchantPhase">;

/** RF-18: the `merchantPhase === "ready_for_pickup"` branch of app/food/order/[orderId].tsx,
 *  extracted verbatim — dispatch is searching (N-08) or held after the N-07 attempt cap (D-34), no
 *  state of its own. Non-terminal, waiting on the merchant's resume/cancel, no auto-timeout. */
export function FoodOrderReadyForPickupView({
  order,
  restaurantName,
  reachable,
}: {
  order: ReadyForPickupOrder;
  restaurantName: string;
  reachable: boolean;
}): React.ReactElement {
  const onHold = order.noRiderHoldAt != null;
  return (
    <Screen>
      <OfflineBanner state={reachable ? "online" : "offline"} />
      <OrderHeader restaurantName={restaurantName} pillLabel={onHold ? "Still searching" : "Finding a rider"} pillTone="neutral" />
      <View style={{ alignItems: "center", paddingVertical: tokens.space.lg }}>
        <View style={{ width: 84, height: 84, borderRadius: 42, backgroundColor: tokens.color.accentWash, alignItems: "center", justifyContent: "center", marginBottom: tokens.space.md }}>
          <Icon name="bike" size={34} color={tokens.color.accentText} strokeWidth={1.75} />
        </View>
        <Text style={{ fontSize: 17, fontWeight: "700", color: tokens.color.ink, textAlign: "center" }}>
          {onHold ? "This is taking longer than usual" : "Finding a rider nearby"}
        </Text>
        <Text style={{ fontSize: 13.5, color: tokens.color.muted, textAlign: "center", marginTop: 6, maxWidth: 280 }}>
          {onHold
            ? `Your order from ${restaurantName} is ready and on hold — nothing further happens until a rider is found. You won't be charged extra either way.`
            : `Your order from ${restaurantName} is ready. We're offering it to the nearest riders first — this usually takes a minute or two.`}
        </Text>
      </View>
      <Stepper events={[]} currentStatus={order.status} view="customer" jobType="food" merchantPhase={order.merchantPhase} />
    </Screen>
  );
}
