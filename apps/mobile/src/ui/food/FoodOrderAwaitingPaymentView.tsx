import { tokens, type MerchantOrderResponse } from "@lynia/shared";
import React from "react";
import { ScrollView, Text, View } from "react-native";
import { isStillUnpaidReminderDue } from "../../logic/food-checkout";
import { formatMoney } from "../../logic/money";
import { Button, Card, EmptyState, ErrorText, Field, Icon, OfflineBanner, Screen, Stepper } from "../index";
import { ManualPayRail } from "./ManualPayRail";
import { OrderHeader, Row } from "./FoodOrderHelpers";

type AwaitingPaymentOrder = Pick<
  MerchantOrderResponse,
  | "id"
  | "total"
  | "merchantGoodsTotal"
  | "merchantPaymentReference"
  | "merchantPaymentConfirmedAt"
  | "paymentRequestedAt"
  | "merchantPaymentPhone"
  | "status"
  | "merchantPhase"
>;

/** RF-18: the `merchantPhase === "awaiting_payment"` branch of app/food/order/[orderId].tsx, extracted
 *  verbatim — R5·1b calling-first, R5·6 paid-waiting, R5·b1 still-unpaid free-cancel reminder, and
 *  R5·3/4/5 the manual pay rail with "I paid another way" reference submission. */
export function FoodOrderAwaitingPaymentView({
  order,
  restaurantName,
  reachable,
  now,
  error,
  busy,
  forcePayScreen,
  onForcePay,
  referenceInput,
  onReferenceChange,
  onSubmitReference,
  onCancelFree,
  cancelFooter,
}: {
  order: AwaitingPaymentOrder;
  restaurantName: string;
  reachable: boolean;
  now: number;
  error: string | null;
  busy: boolean;
  forcePayScreen: boolean;
  onForcePay: () => void;
  referenceInput: string;
  onReferenceChange: (value: string) => void;
  onSubmitReference: () => void;
  onCancelFree: () => void;
  cancelFooter: React.ReactNode;
}): React.ReactElement {
  const amount = order.total ?? order.merchantGoodsTotal ?? 0;

  // R5·6: paid, waiting for the restaurant's own confirm.
  if (order.merchantPaymentReference && !order.merchantPaymentConfirmedAt) {
    return (
      <Screen>
        <OfflineBanner state={reachable ? "online" : "offline"} />
        <OrderHeader restaurantName={restaurantName} pillLabel="Paid" pillTone="highlight" />
        <View style={{ alignItems: "center", paddingVertical: tokens.space.lg }}>
          <View style={{ width: 84, height: 84, borderRadius: 42, backgroundColor: tokens.color.highlightWash, alignItems: "center", justifyContent: "center", marginBottom: tokens.space.md }}>
            <Icon name="clock" size={34} color={tokens.color.highlightInk} strokeWidth={1.75} />
          </View>
          <Text style={{ fontSize: 17, fontWeight: "700", color: tokens.color.ink, textAlign: "center" }}>Payment sent — waiting for the restaurant</Text>
          <Text style={{ fontSize: 13.5, color: tokens.color.muted, textAlign: "center", marginTop: 6, maxWidth: 280 }}>
            {restaurantName} is checking their statement. Nothing is cooked until they confirm, and if they can&apos;t find it we refund and cancel.
          </Text>
        </View>
        <Card>
          <Row label="Amount sent" value={formatMoney(amount)} />
          <Row label="Your reference" value={order.merchantPaymentReference} />
        </Card>
        <Stepper events={[]} currentStatus={order.status} view="customer" jobType="food" merchantPhase={order.merchantPhase} />
        <ErrorText message={error} />
        {cancelFooter}
      </Screen>
    );
  }

  // R5·b1: still unpaid after the soft N-22 reminder window — free cancel offered front and center.
  if (!forcePayScreen && isStillUnpaidReminderDue(order.paymentRequestedAt, now)) {
    return (
      <Screen>
        <OfflineBanner state={reachable ? "online" : "offline"} />
        <OrderHeader restaurantName={restaurantName} pillLabel="Still waiting" pillTone="neutral" />
        <EmptyState icon="clock" title={`${restaurantName} is still waiting`} message="Nothing is cooking and nothing was charged — they start the moment your payment arrives.">
          <Button label={`Pay now · ${formatMoney(amount)}`} onPress={onForcePay} />
          <Button variant="ghost" label="Cancel the order — free" onPress={onCancelFree} disabled={busy} />
        </EmptyState>
        <ErrorText message={error} />
      </Screen>
    );
  }

  // R5·1b: the kitchen calls first (logged), before any payment is requested.
  if (!order.paymentRequestedAt) {
    return (
      <Screen>
        <OfflineBanner state={reachable ? "online" : "offline"} />
        <OrderHeader restaurantName={restaurantName} pillLabel="Confirming" pillTone="neutral" />
        <View style={{ alignItems: "center", paddingVertical: tokens.space.lg }}>
          <View style={{ width: 84, height: 84, borderRadius: 42, backgroundColor: tokens.color.accentWash, alignItems: "center", justifyContent: "center", marginBottom: tokens.space.md }}>
            <Icon name="phone" size={34} color={tokens.color.accentText} strokeWidth={1.75} />
          </View>
          <Text style={{ fontSize: 17, fontWeight: "700", color: tokens.color.ink, textAlign: "center" }}>{restaurantName} is calling you</Text>
          <Text style={{ fontSize: 13.5, color: tokens.color.muted, textAlign: "center", marginTop: 6, maxWidth: 280 }}>
            They confirm every order by phone before asking for payment — answer, agree the total, and the request arrives right after.
          </Text>
        </View>
        <Stepper events={[]} currentStatus={order.status} view="customer" jobType="food" merchantPhase={order.merchantPhase} />
        <ErrorText message={error} />
        {cancelFooter}
      </Screen>
    );
  }

  // R5·3/R5·4/R5·5: pay the restaurant — manual rail (D-24), plus "I paid another way".
  return (
    <Screen>
      <OfflineBanner state={reachable ? "online" : "offline"} />
      <OrderHeader restaurantName={restaurantName} pillLabel="Payment requested" pillTone="neutral" />
      <ScrollView showsVerticalScrollIndicator={false}>
        <Card>
          <Text style={{ fontSize: 11.5, fontWeight: "700", color: tokens.color.muted, letterSpacing: 0.4 }}>PAY EXACTLY</Text>
          <Text style={{ fontSize: 30, fontWeight: "700", color: tokens.color.ink, marginTop: 4 }}>{formatMoney(amount)}</Text>
          <Text style={{ fontSize: 12.5, color: tokens.color.muted, marginTop: 6 }}>No deadline — the kitchen starts the moment the money lands.</Text>
        </Card>
        {order.merchantPaymentPhone ? (
          <ManualPayRail
            rows={[
              { label: "Merchant number", value: order.merchantPaymentPhone },
              { label: "Exact amount", value: formatMoney(amount) },
              { label: "Reference", value: order.id.slice(0, 8).toUpperCase() },
            ]}
          />
        ) : null}
        <Field
          label="Your transaction reference"
          value={referenceInput}
          onChangeText={onReferenceChange}
          placeholder="e.g. EC240727.1132.A81043"
          hint="Copy it from the confirmation SMS — not a screenshot."
        />
        <ErrorText message={error} />
        <Button label="Submit my reference" onPress={onSubmitReference} disabled={busy || !referenceInput.trim()} loading={busy} />
        {cancelFooter}
      </ScrollView>
    </Screen>
  );
}
