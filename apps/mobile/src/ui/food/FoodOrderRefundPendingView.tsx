import { RESTAURANTS_DEBT, rejectionCopy, tokens, type MerchantOrderResponse } from "@lynia/shared";
import React from "react";
import { Text, View } from "react-native";
import { formatMoney } from "../../logic/money";
import { Button, Card, EmptyState, OfflineBanner, Screen, StatusPill } from "../index";
import { Row } from "./FoodOrderHelpers";

type RefundPendingOrder = Pick<
  MerchantOrderResponse,
  "total" | "merchantGoodsTotal" | "merchantPaymentReference" | "merchantPaymentConfirmedAt" | "rejectionReason"
>;

/** Hours in the N-12 refund SLA, from the shared config rather than a number typed into copy. */
const REFUND_SLA_HOURS = Math.round(RESTAURANTS_DEBT.refundSlaMs / (60 * 60 * 1000));

/**
 * R6·b3 (r-customer-b.jsx:333) — the order was cancelled AFTER the money had already gone to the
 * merchant, and no refund has been recorded against it yet. `REFUND PENDING`, the amount, the evidence
 * rows, and a way to escalate.
 *
 * This is REAL state, not a simulation. Two shipped paths land here:
 *  1. the customer submits their transaction reference (`merchantPaymentReference`) and the merchant
 *     then releases/rejects the order instead of confirming it — money out, order cancelled, no
 *     `refundedAt`; and
 *  2. the merchant CONFIRMS payment (`merchantPaymentConfirmedAt`) and the order later dies in
 *     dispatch — the NO_RIDER cap cancels it with `rejectionReason: "no_rider"` and never touches the
 *     refund fields (`refundOrder` is the only writer of `refundedAt`, and it's scoped to the
 *     merchant's own pre-dispatch cancel).
 *
 * Case 2 is why this view has to sit AHEAD of FoodOrderCancelledView: that screen's no_rider branch
 * renders `rejectionCopy("no_rider")`, which promises "nothing was charged" — true for cash, a lie for
 * a wallet order that had already paid. The reason is still named here, minus that clause.
 */
export function FoodOrderRefundPendingView({
  order,
  restaurantName,
  reachable,
  onGetHelp,
  onBrowse,
}: {
  order: RefundPendingOrder;
  restaurantName: string;
  reachable: boolean;
  /** Kit ghost: "Get help with this refund" — LyniaGo never held the money (D-12/N-12), so the only
   *  honest action is a route into support, not a refund button we can't back. */
  onGetHelp: () => void;
  onBrowse: () => void;
}): React.ReactElement {
  const amount = order.total ?? order.merchantGoodsTotal ?? 0;
  // `rejectionCopy("no_rider")` ends "nothing was charged" — false on an order that had already paid,
  // which is precisely the case that reaches this screen. Substitute the same fact without that clause.
  const reason =
    order.rejectionReason === "no_rider"
      ? "We couldn't find a rider for your order in time."
      : order.rejectionReason
        ? rejectionCopy(order.rejectionReason)
        : `${restaurantName} couldn't complete this order.`;

  return (
    <Screen>
      <OfflineBanner state={reachable ? "online" : "offline"} />
      <EmptyState
        icon="circle-alert"
        title={`${restaurantName} couldn't take your order`}
        message={`${reason} Because you'd already paid, they owe you that money back — we're tracking it.`}
      />
      <Card>
        <View style={{ flexDirection: "row", alignItems: "center", gap: tokens.space.sm, marginBottom: tokens.space.sm }}>
          <StatusPill status="REFUND PENDING" tone="highlight" />
          <View style={{ flex: 1 }} />
          <Text style={{ fontSize: 17, fontWeight: "700", color: tokens.color.ink, fontVariant: ["tabular-nums"] }}>
            {formatMoney(amount)}
          </Text>
        </View>
        <Row label="Paid to" value={`${restaurantName} · mobile money`} />
        <Row label="Your reference" value={order.merchantPaymentReference ?? "—"} />
        {/* N-12's SLA is a stated POLICY window, not a server-side deadline — the order carries no
            refund-due timestamp (and no `cancelledAt` to count from), so this names the policy rather
            than inventing a wall-clock time we can't stand behind. */}
        <Row label="Refund due" value={`Within ${REFUND_SLA_HOURS} hours`} />
        <Text style={{ fontSize: 12, color: tokens.color.muted, marginTop: tokens.space.sm, lineHeight: 17 }}>
          The money went straight to {restaurantName}&apos;s merchant number — LyniaGo never held it, so the refund comes from them.
          Keep your reference: it&apos;s your evidence against their own statement.
        </Text>
        <Button label="Get help with this refund" variant="ghost" onPress={onGetHelp} />
      </Card>
      <Button label="Order from somewhere else" variant="ghost" onPress={onBrowse} />
    </Screen>
  );
}
