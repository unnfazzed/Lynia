import { type MerchantOrderResponse } from "@lynia/shared";
import { tokens } from "@lynia/shared/tokens";
import React from "react";
import { Text, View } from "react-native";
import { OfflineBanner, Screen } from "../index";
import { CountdownRing } from "./CountdownRing";
import { FoodPrepTrackerView } from "./food-prep-tracker.view";
import { OrderHeader } from "./FoodOrderHelpers";

type PreparingOrder = Pick<MerchantOrderResponse, "prepMinutes" | "prepStartedAt" | "status" | "merchantPhase">;

/** RF-18: the `merchantPhase === "preparing"` branch of app/food/order/[orderId].tsx, extracted
 *  verbatim — payment landed (or CASH needs none) and the kitchen has started, no state of its own.
 *  D-03: the ring sits ABOVE the same seven-step tracker, not a new timeline component. */
export function FoodOrderPreparingView({
  order,
  restaurantName,
  reachable,
  now,
}: {
  order: PreparingOrder;
  restaurantName: string;
  reachable: boolean;
  now: number;
}): React.ReactElement {
  const totalMs = (order.prepMinutes ?? 0) * 60_000;
  const startedAt = order.prepStartedAt ? new Date(order.prepStartedAt).getTime() : null;
  const elapsedMs = startedAt ? Math.max(0, now - startedAt) : 0;
  const remainingMin = totalMs > 0 ? Math.max(0, Math.ceil((totalMs - elapsedMs) / 60_000)) : 0;
  return (
    <Screen>
      <OfflineBanner state={reachable ? "online" : "offline"} />
      <OrderHeader restaurantName={restaurantName} pillLabel="Cooking" pillTone="success" />
      <View style={{ alignItems: "center", paddingVertical: tokens.space.lg }}>
        {/* Kit R6·1 (r-customer-b.jsx:236) labels the prep ring "min prep". */}
        <CountdownRing elapsedMs={elapsedMs} totalMs={totalMs} label={String(remainingMin)} sub="min prep" />
        <Text style={{ fontSize: 17, fontWeight: "700", color: tokens.color.ink, marginTop: tokens.space.md, textAlign: "center" }}>
          {restaurantName} is cooking your order
        </Text>
        <Text style={{ fontSize: 13.5, color: tokens.color.muted, textAlign: "center", marginTop: 6, maxWidth: 280 }}>
          We&apos;ll start looking for a rider once it&apos;s ready.
        </Text>
      </View>
      {/* merchantPhase drives the two pre-dispatch steps — without it the whole kitchen phase reads as
          "not started yet" because the order is still `requested` on the dispatch side. */}
      <FoodPrepTrackerView events={[]} currentStatus={order.status} view="customer" jobType="food" merchantPhase={order.merchantPhase} />
    </Screen>
  );
}
