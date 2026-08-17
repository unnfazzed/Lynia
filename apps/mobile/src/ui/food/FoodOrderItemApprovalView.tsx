import { RESTAURANTS_TIMING, type MerchantOrderResponse } from "@lynia/shared";
import { tokens } from "@lynia/shared/tokens";
import React from "react";
import { Text, View } from "react-native";
import { Button, Card, Icon, OfflineBanner, Screen } from "../index";
import { formatCountdown } from "./CountdownRing";
import { OrderHeader } from "./FoodOrderHelpers";
import { PriceMath } from "./PriceMath";

type ItemApprovalOrder = Pick<MerchantOrderResponse, "itemApprovalDeadlineAt" | "items">;

/** RF-18: the `merchantPhase === "awaiting_item_approval"` branch of app/food/order/[orderId].tsx,
 *  extracted verbatim — D-23 item-level accept, N-18's 60s customer approval window. */
export function FoodOrderItemApprovalView({
  order,
  restaurantName,
  reachable,
  now,
  busy,
  onApprove,
}: {
  order: ItemApprovalOrder;
  restaurantName: string;
  reachable: boolean;
  now: number;
  busy: boolean;
  onApprove: (approve: boolean) => void;
}): React.ReactElement {
  const deadline = order.itemApprovalDeadlineAt ? new Date(order.itemApprovalDeadlineAt).getTime() : null;
  const total = RESTAURANTS_TIMING.itemApprovalWindowMs;
  const remaining = deadline ? Math.max(0, deadline - now) : total;
  const unavailable = order.items.filter((it) => it.available === false);
  const kept = order.items.filter((it) => it.available !== false);
  const revisedGoodsTotal = kept.reduce((sum, it) => sum + it.priceUsd * it.quantity, 0);
  return (
    // Kit RCB.item_removed (r-customer-b.jsx:173-178) pins BOTH decision buttons in the Screen footer
    // slot over a scrolling body. The app previously rendered them as the last children of the
    // non-scrolling body, so a many-item order pushed the accept/cancel buttons off-screen with no way
    // to scroll to them — under a 60s auto-cancel deadline, an unreachable CTA silently loses the order.
    <Screen
      footer={
        <View style={{ gap: tokens.space.sm }}>
          <Button
            label={`Yes — send it without ${unavailable[0]?.name ?? "it"}`}
            onPress={() => onApprove(true)}
            disabled={busy}
            loading={busy}
          />
          <Button variant="ghost" label="Cancel the whole order" onPress={() => onApprove(false)} disabled={busy} />
        </View>
      }
    >
      <OfflineBanner state={reachable ? "online" : "offline"} />
      <OrderHeader restaurantName={restaurantName} pillLabel="One item unavailable" pillTone="neutral" />
      <Text style={{ fontSize: 12.5, color: tokens.color.muted, marginBottom: 8 }}>
        Answer within {formatCountdown(remaining)} — no answer cancels it, free.
      </Text>
      <Card>
        <View style={{ flexDirection: "row", gap: 9 }}>
          <Icon name="circle-alert" size={17} color={tokens.color.highlightInk} />
          <Text style={{ flex: 1, fontSize: 13.5, color: tokens.color.ink, lineHeight: 18 }}>
            {restaurantName} has everything except{" "}
            <Text style={{ fontWeight: "700" }}>{unavailable.map((it) => it.name).join(", ")}</Text>. They can cook the rest now.
          </Text>
        </View>
      </Card>
      <PriceMath rows={kept.map((it) => ({ label: `${it.quantity}× ${it.name}`, value: it.priceUsd * it.quantity }))} total={revisedGoodsTotal} />
    </Screen>
  );
}
