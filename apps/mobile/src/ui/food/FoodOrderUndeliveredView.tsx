import { tokens } from "@lynia/shared";
import React from "react";
import { Text, View } from "react-native";
import { UNDELIVERED_REASON_LABEL } from "../../logic/order-labels";
import { Button, Card, Icon, OfflineBanner, Screen } from "../index";
import { GetHelpControl } from "../safety";
import { OrderHeader } from "./FoodOrderHelpers";

/** RF-18: the `order.status === "undelivered"` terminal branch of app/food/order/[orderId].tsx,
 *  extracted verbatim — a thin, state-free wrapper around the same no-show/refusal terminal a
 *  parcel's hand-off failure reaches, reusing UNDELIVERED_REASON_LABEL as-is. */
export function FoodOrderUndeliveredView({
  orderId,
  restaurantName,
  reachable,
  reason,
  attempts,
  onBackToBrowsing,
}: {
  orderId: string;
  restaurantName: string;
  reachable: boolean;
  reason: string | null | undefined;
  attempts: number | null | undefined;
  onBackToBrowsing: () => void;
}): React.ReactElement {
  return (
    <Screen>
      <OfflineBanner state={reachable ? "online" : "offline"} />
      <OrderHeader restaurantName={restaurantName} pillLabel="Not delivered" pillTone="neutral" />
      <Card>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 9, marginBottom: 10 }}>
          <View
            style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: tokens.color.dangerWash, alignItems: "center", justifyContent: "center" }}
          >
            <Icon name="circle-alert" size={18} color={tokens.color.danger} />
          </View>
          <Text style={{ flex: 1, fontSize: 15, fontWeight: "700", color: tokens.color.danger }}>We couldn&apos;t hand your order over</Text>
        </View>
        <Text style={{ fontSize: 13, color: tokens.color.muted, lineHeight: 19, marginBottom: 10 }}>
          Your rider tried at your delivery address. The food is going back to {restaurantName} — you weren&apos;t charged for it.
        </Text>
        <View
          style={{ flexDirection: "row", alignItems: "center", gap: 9, padding: tokens.space.sm, borderRadius: tokens.radius.input, backgroundColor: tokens.color.surface }}
        >
          <Icon name="circle-alert" size={15} color={tokens.color.muted} />
          <Text style={{ flex: 1, fontSize: 12.5, color: tokens.color.ink, lineHeight: 18 }}>
            <Text style={{ fontWeight: "700" }}>Reason recorded by your rider: </Text>
            {UNDELIVERED_REASON_LABEL[reason ?? ""] ?? "delivery not completed"}
            {attempts != null ? ` · ${attempts} attempt${attempts === 1 ? "" : "s"}` : ""}
          </Text>
        </View>
        {reason === "refused" ? (
          <Text style={{ fontSize: 12, color: tokens.color.muted, marginTop: 8, lineHeight: 17 }}>
            Since this order wasn&apos;t paid for, cash is no longer available as a payment method on your account — mobile money only
            from here on.
          </Text>
        ) : null}
      </Card>
      <GetHelpControl orderId={orderId} />
      <Button label="Back to browsing" variant="ghost" onPress={onBackToBrowsing} />
    </Screen>
  );
}
