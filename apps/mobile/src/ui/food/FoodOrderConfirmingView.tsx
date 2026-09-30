import { formatPhoneLocal, type MerchantOrderResponse } from "@lynia/shared";
import { tokens } from "@lynia/shared/tokens";
import React from "react";
import { Text, View } from "react-native";
import { Icon, OfflineBanner, Screen, Tappable, useDial } from "../index";
import { FoodAwaitAcceptTrackerView } from "./food-await-accept-tracker.view";
import { OrderHeader } from "./FoodOrderHelpers";

type ConfirmingOrder = Pick<MerchantOrderResponse, "status" | "restaurantPhone">;

/** Auto-accept (owner-approved, not in the mocks): the order went straight into the kitchen
 *  (`autoAccepted`, merchantPhase "preparing") but the kitchen hasn't confirmed it yet
 *  (`kitchenConfirmedAt` null). No rider is sent until it does, and the customer may cancel free.
 *  Built from the awaiting_accept view's pieces — same header, same step-0 tracker — plus the
 *  CallRow shape LiveTrackingCard already draws for "Call rider". */
export function FoodOrderConfirmingView({
  order,
  restaurantName,
  reachable,
  cancelFooter,
}: {
  order: ConfirmingOrder;
  restaurantName: string;
  reachable: boolean;
  cancelFooter: React.ReactNode;
}): React.ReactElement {
  const dial = useDial();
  const phone = order.restaurantPhone ?? null;
  return (
    <Screen>
      <OfflineBanner state={reachable ? "online" : "offline"} />
      <OrderHeader restaurantName={restaurantName} pillLabel="Confirming" pillTone="neutral" />
      <View style={{ alignItems: "center", paddingVertical: tokens.space.lg }}>
        <View style={{ width: 84, height: 84, borderRadius: 42, backgroundColor: tokens.color.accentWash, alignItems: "center", justifyContent: "center", marginBottom: tokens.space.md }}>
          <Icon name="receipt" size={34} color={tokens.color.accentText} strokeWidth={1.75} />
        </View>
        <Text style={{ fontSize: 17, fontWeight: "700", color: tokens.color.ink, textAlign: "center" }}>{`Sent to ${restaurantName}`}</Text>
        <Text style={{ fontSize: 13.5, color: tokens.color.muted, textAlign: "center", marginTop: 6, maxWidth: 280 }}>
          They&apos;re confirming your order. You can cancel free until they do.
        </Text>
      </View>
      {phone ? (
        <Tappable
          onPress={() => dial(phone)}
          accessibilityRole="button"
          accessibilityLabel={`Call ${restaurantName} on ${formatPhoneLocal(phone)}`}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: tokens.space.sm,
            paddingVertical: tokens.space.sm,
            paddingHorizontal: 10,
            backgroundColor: tokens.color.surface,
            borderRadius: tokens.radius.input,
            minHeight: tokens.touchTargetMin,
            marginBottom: tokens.space.sm,
          }}
        >
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: "600", color: tokens.color.ink }}>
              {`Call ${restaurantName}`}
            </Text>
            <Text style={{ fontSize: 13, color: tokens.color.muted, fontVariant: ["tabular-nums"] }}>{formatPhoneLocal(phone)}</Text>
          </View>
          <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: tokens.color.accent, alignItems: "center", justifyContent: "center" }}>
            <Icon name="phone" size={18} color={tokens.color.onAccent} />
          </View>
        </Tappable>
      ) : null}
      {/* Step 0 ("placed"), exactly like awaiting_accept: the kitchen hasn't committed yet, so the
          tracker must not claim "preparing" even though merchantPhase already reads it. */}
      <FoodAwaitAcceptTrackerView events={[]} currentStatus={order.status} view="customer" jobType="food" merchantPhase="awaiting_accept" />
      {cancelFooter}
    </Screen>
  );
}
