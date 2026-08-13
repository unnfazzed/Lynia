import { RESTAURANTS_TIMING, tokens, type MerchantOrderResponse } from "@lynia/shared";
import React from "react";
import { Text, View } from "react-native";
import { OfflineBanner, Screen } from "../index";
import { CountdownRing, formatCountdown } from "./CountdownRing";
import { FoodAwaitAcceptTrackerView } from "./food-await-accept-tracker.view";
import { OrderHeader } from "./FoodOrderHelpers";

type AwaitingAcceptOrder = Pick<MerchantOrderResponse, "acceptDeadlineAt" | "status" | "merchantPhase">;

/** RF-18: the `merchantPhase === "awaiting_accept"` branch of app/food/order/[orderId].tsx,
 *  extracted verbatim — N-03's 3:00 kitchen-accept window, no state of its own. */
export function FoodOrderAwaitingAcceptView({
  order,
  restaurantName,
  reachable,
  now,
  cancelFooter,
}: {
  order: AwaitingAcceptOrder;
  restaurantName: string;
  reachable: boolean;
  now: number;
  cancelFooter: React.ReactNode;
}): React.ReactElement {
  const deadline = order.acceptDeadlineAt ? new Date(order.acceptDeadlineAt).getTime() : null;
  const total = RESTAURANTS_TIMING.acceptWindowMs;
  const elapsed = deadline ? Math.max(0, total - (deadline - now)) : 0;
  const remaining = deadline ? Math.max(0, deadline - now) : total;
  return (
    <Screen>
      <OfflineBanner state={reachable ? "online" : "offline"} />
      <OrderHeader restaurantName={restaurantName} pillLabel="Waiting for accept" pillTone="neutral" />
      <View style={{ alignItems: "center", paddingVertical: tokens.space.lg }}>
        <CountdownRing elapsedMs={elapsed} totalMs={total} label={formatCountdown(remaining)} sub="to accept" />
        <Text style={{ fontSize: 17, fontWeight: "700", color: tokens.color.ink, marginTop: tokens.space.md, textAlign: "center" }}>
          Waiting for {restaurantName}
        </Text>
        <Text style={{ fontSize: 13.5, color: tokens.color.muted, textAlign: "center", marginTop: 6, maxWidth: 280 }}>
          They have 3 minutes to accept. You&apos;ll pay only after they do — nothing has left your wallet.
        </Text>
      </View>
      {/* The kit puts the tracker on every tracking screen, including this one (RTracker step=0) —
          it was absent here, so the first thing that happens to an order showed no timeline at all. */}
      <FoodAwaitAcceptTrackerView events={[]} currentStatus={order.status} view="customer" jobType="food" merchantPhase={order.merchantPhase} />
      {cancelFooter}
    </Screen>
  );
}
