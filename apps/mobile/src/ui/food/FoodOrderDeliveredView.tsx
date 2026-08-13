import { tokens, type MerchantOrderResponse } from "@lynia/shared";
import React from "react";
import { Text, View } from "react-native";
import type { OrderEvent } from "../../api/orders";
import { fmtClock } from "../../logic/format-time";
import { formatMoney } from "../../logic/money";
import { Button, Icon, OfflineBanner, Screen } from "../index";
import { RatingCard } from "../order/RatingCard";

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
      {/* Kit RC.delivered_rate (r-customer-b.jsx:504-511): no top bar / status pill — the screen leads
          with a CENTERED confirmation hero (56 accent-wash check circle, an 18/700 "Delivered at HH:MM"
          headline, and a 13/muted "$X paid in cash · {kitchen}" line), not a left-aligned summary row
          under a header. */}
      <View style={{ alignItems: "center", paddingTop: 18, marginBottom: 16 }}>
        <View
          style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: tokens.color.accentWash, alignItems: "center", justifyContent: "center", marginBottom: 12 }}
        >
          <Icon name="circle-check" size={26} color={tokens.color.accentText} />
        </View>
        <Text style={{ fontSize: 18, fontWeight: "700", color: tokens.color.ink }}>{deliveredAt ? `Delivered at ${deliveredAt}` : "Delivered"}</Text>
        <Text style={{ fontSize: 13, color: tokens.color.muted, marginTop: 4 }}>
          {formatMoney(amount)} {order.paymentMethod === "cash" ? "paid in cash" : "paid"} · {restaurantName}
        </Text>
      </View>
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
    </Screen>
  );
}
