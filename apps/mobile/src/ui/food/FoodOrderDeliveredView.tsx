import { tokens, type MerchantOrderResponse } from "@lynia/shared";
import React from "react";
import { Text, View } from "react-native";
import type { OrderEvent } from "../../api/orders";
import { fmtClock } from "../../logic/format-time";
import { formatMoney } from "../../logic/money";
import { Button, Card, ErrorText, Icon, OfflineBanner, Screen } from "../index";
import { RatingCard } from "../order/RatingCard";
import { OrderHeader } from "./FoodOrderHelpers";

type DeliveredOrder = Pick<MerchantOrderResponse, "status" | "paymentMethod" | "total" | "merchantGoodsTotal">;

/** RF-18: the `order.status === "delivered" || "completed"` terminal branch of app/food/order/[orderId].tsx,
 *  extracted verbatim (D4) — the doorstep dual-confirm handshake is done, hand-off complete. The rating
 *  card mirrors app/order/[id].tsx's RatingCard verbatim (same component, same undo-window semantics) —
 *  re-labelled amount/context only, never forked. `completed` (post-rating) drops the card and just
 *  leaves the summary + a way back to browsing. */
export function FoodOrderDeliveredView({
  order,
  restaurantName,
  reachable,
  error,
  events,
  rateBusy,
  onRate,
  onArmRating,
  onUndoRating,
  onOrderElsewhere,
}: {
  order: DeliveredOrder;
  restaurantName: string;
  reachable: boolean;
  error: string | null;
  events: OrderEvent[] | undefined;
  rateBusy: boolean;
  onRate: (score: number) => void;
  onArmRating: (score: number) => void;
  onUndoRating: () => void;
  onOrderElsewhere: () => void;
}): React.ReactElement {
  const deliveredEvent = events?.find((e) => e.status === "delivered");
  const deliveredAt = deliveredEvent ? fmtClock(deliveredEvent.createdAt) : null;
  const amount = order.total ?? order.merchantGoodsTotal ?? 0;
  return (
    <Screen>
      <OfflineBanner state={reachable ? "online" : "offline"} />
      <OrderHeader restaurantName={restaurantName} pillLabel="Delivered" pillTone="success" />
      <Card>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <View
            style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: tokens.color.accentWash, alignItems: "center", justifyContent: "center" }}
          >
            <Icon name="circle-check" size={22} color={tokens.color.accentText} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={{ fontSize: 16, fontWeight: "700", color: tokens.color.ink }}>{deliveredAt ? `Delivered at ${deliveredAt}` : "Delivered"}</Text>
            <Text style={{ fontSize: 12.5, color: tokens.color.muted, marginTop: 2 }}>
              {formatMoney(amount)} {order.paymentMethod === "cash" ? "paid in cash" : "paid"} · {restaurantName}
            </Text>
          </View>
        </View>
      </Card>
      {order.status === "delivered" ? (
        <RatingCard
          saving={rateBusy}
          onRate={onRate}
          onArm={onArmRating}
          onUndo={onUndoRating}
        />
      ) : (
        <Button label="Order from somewhere else" onPress={onOrderElsewhere} />
      )}
      <ErrorText message={error} />
    </Screen>
  );
}
