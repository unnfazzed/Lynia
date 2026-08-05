import { rejectionCopy, tokens, type MerchantOrderResponse } from "@lynia/shared";
import React from "react";
import { Text, View } from "react-native";
import { formatMoney } from "../../logic/money";
import { Button, Card, EmptyState, Icon, OfflineBanner, Screen } from "../index";
import { Row } from "./FoodOrderHelpers";

type CancelledOrder = Pick<MerchantOrderResponse, "rejectionReason" | "refundedAt" | "refundAmount" | "refundReference">;

/** RF-18: the `order.status === "cancelled"` terminal branch of app/food/order/[orderId].tsx,
 *  extracted verbatim — a self-contained view over the three cancellation shapes (no rider found,
 *  merchant-issued refund, generic cancel) with no state of its own. */
export function FoodOrderCancelledView({
  order,
  restaurantName,
  reachable,
  onRetry,
  onBrowse,
}: {
  order: CancelledOrder;
  restaurantName: string;
  reachable: boolean;
  /** D-13: "try again" from the no-rider apology — re-orders from the same restaurant. */
  onRetry: () => void;
  /** Every other way back to browsing (see other restaurants / order elsewhere / back to browsing). */
  onBrowse: () => void;
}): React.ReactElement {
  // D-13: NO_RIDER is designed as an apology, not an error — what we tried, for how long, nothing
  // charged, two ways forward.
  if (order.rejectionReason === "no_rider") {
    return (
      <Screen>
        <OfflineBanner state={reachable ? "online" : "offline"} />
        <EmptyState icon="bike" title="We couldn't find a rider" message={rejectionCopy("no_rider")}>
          <Button label="Try again" onPress={onRetry} />
          <Button label="See other restaurants nearby" variant="ghost" onPress={onBrowse} />
        </EmptyState>
      </Screen>
    );
  }
  // D-12/R-12: a merchant-issued refund on an already-paid order it couldn't fulfil — the reference
  // stays in the order forever, the customer's evidence against the merchant's own statement.
  // `refundOrder` sets `refundedAt` atomically WITH the cancel (food-debt.service.ts), so there is no
  // separate "pending" window to render server-side — open item noted in the PR body.
  if (order.refundedAt) {
    return (
      <Screen>
        <OfflineBanner state={reachable ? "online" : "offline"} />
        <Card accent>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: tokens.color.accentWash, alignItems: "center", justifyContent: "center" }}>
              <Icon name="circle-check" size={19} color={tokens.color.accentText} />
            </View>
            <View style={{ flex: 1 }}>
              <Text style={{ fontSize: 15, fontWeight: "700", color: tokens.color.ink }}>Refunded in full</Text>
              <Text style={{ fontSize: 12, color: tokens.color.muted }}>{restaurantName} sent it back</Text>
            </View>
          </View>
          <Row label="Amount" value={formatMoney(order.refundAmount ?? 0)} />
          <Row label="Their reference" value={order.refundReference ?? "—"} />
          <Text style={{ fontSize: 12, color: tokens.color.muted, marginTop: 8, lineHeight: 17 }}>
            Keep this reference — it&apos;s your proof against the restaurant&apos;s own statement, not a screenshot.
          </Text>
        </Card>
        <Button label="Order from somewhere else" onPress={onBrowse} />
      </Screen>
    );
  }
  return (
    <Screen>
      <OfflineBanner state={reachable ? "online" : "offline"} />
      <EmptyState
        icon="circle-alert"
        title="This order was cancelled"
        message={order.rejectionReason ? rejectionCopy(order.rejectionReason) : "Nothing was charged."}
      >
        <Button label="Back to browsing" onPress={onBrowse} />
      </EmptyState>
    </Screen>
  );
}
