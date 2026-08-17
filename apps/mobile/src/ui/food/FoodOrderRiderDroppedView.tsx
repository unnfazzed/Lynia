import { type MerchantOrderResponse } from "@lynia/shared";
import { tokens } from "@lynia/shared/tokens";
import React from "react";
import { Text, View } from "react-native";
import { Card, Icon, OfflineBanner, Screen, Skeleton, Stepper } from "../index";
import { OrderHeader } from "./FoodOrderHelpers";

type RiderDroppedOrder = Pick<MerchantOrderResponse, "status" | "merchantPhase" | "noRiderHoldAt">;

/**
 * R6·b6 (r-customer-b.jsx:570) — the rider dropped the job AFTER being secured. Express grammar: the
 * tracker steps back one, the reason is named, and the food is not lost.
 *
 * REAL state, no simulation. `food-dispatch.service.ts:dropDispatch` (D-33, pre-pickup only) puts the
 * order back to `status: "requested"` / `merchantPhase: "ready_for_pickup"` with `riderId` cleared and
 * a fresh dispatch budget — so "we had a rider, now we don't, and we're searching again" is directly
 * observable. The caller (app/food/order/[orderId].tsx) is what notices the transition.
 *
 * Two deliberate departures from the kit's copy, because the data doesn't support it:
 *  - "Your rider had a bike problem" — `dropDispatch` takes no reason, so the app cannot know WHY. The
 *    headline states what happened, not an invented cause.
 *  - "same code" — the drop clears `otpHash` and resets `deliveryOtpAttempts`, so the door code is
 *    genuinely re-issued. The copy says a new code is coming, and the caller drops the stale local one.
 *
 * The Stepper is passed the order's own state and steps itself back (foodCustomerStepIndex →
 * ready_for_pickup = "Restaurant accepted", one behind "Rider secured"). Nothing here touches the
 * step model.
 */
export function FoodOrderRiderDroppedView({
  order,
  restaurantName,
  reachable,
}: {
  order: RiderDroppedOrder;
  restaurantName: string;
  reachable: boolean;
}): React.ReactElement {
  const onHold = order.noRiderHoldAt != null;
  return (
    <Screen>
      <OfflineBanner state={reachable ? "online" : "offline"} />
      {/* Kit R6·b6: a warn banner carries the news; the screen underneath stays a calm search state.
          Same highlight-wash treatment the cart/checkout warnings already use — no new banner type. */}
      <Card style={{ backgroundColor: tokens.color.highlightWash, borderColor: "transparent" }}>
        <View style={{ flexDirection: "row", gap: 9 }}>
          <Icon name="bike" size={17} color={tokens.color.highlightInk} style={{ marginTop: 1 }} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontSize: 14, fontWeight: "700", color: tokens.color.ink }}>Your rider couldn&apos;t finish the trip</Text>
            <Text style={{ fontSize: 12.5, color: tokens.color.highlightInk, marginTop: 3, lineHeight: 17 }}>
              Finding another one now — same food, same price, nothing extra to pay. You&apos;ll get a new door code once the new
              rider is on the way.
            </Text>
          </View>
        </View>
      </Card>
      <OrderHeader restaurantName={restaurantName} pillLabel={onHold ? "Still searching" : "Finding a rider"} pillTone="highlight" />
      {/* Kit R6·b6 (r-customer-b.jsx:576): the re-finding card — bike mark, one line of what we're
          doing, and a skeleton standing in for the search that's genuinely still running. */}
      <Card>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 11 }}>
          <View
            style={{
              width: 40,
              height: 40,
              borderRadius: 20,
              backgroundColor: tokens.color.highlightWash,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name="bike" size={19} color={tokens.color.highlightInk} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontSize: 14, fontWeight: "700", color: tokens.color.ink }}>Looking for another rider</Text>
            <Text style={{ fontSize: 12.5, color: tokens.color.muted, marginTop: 1 }}>
              {onHold ? "Still searching · we'll keep going" : "Nearest riders first · usually a minute or two"}
            </Text>
          </View>
          <Skeleton width={38} height={10} radius={5} />
        </View>
        <Text style={{ fontSize: 12, color: tokens.color.muted, marginTop: tokens.space.md, lineHeight: 17 }}>
          Your food is still with {restaurantName} — the drop costs you nothing, and the total hasn&apos;t changed.
        </Text>
      </Card>
      {/* Stepped back one: ready_for_pickup lands on "Restaurant accepted", behind "Rider secured". */}
      <Card>
        <Stepper events={[]} currentStatus={order.status} view="customer" jobType="food" merchantPhase={order.merchantPhase} />
      </Card>
    </Screen>
  );
}
