import { tokens, type MerchantOrderResponse } from "@lynia/shared";
import React, { useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { isStillUnpaidReminderDue } from "../../logic/food-checkout";
import { formatMoney } from "../../logic/money";
import { Button, Card, EmptyState, ErrorText, Field, Icon, isTestBuild, OfflineBanner, Screen, Stepper } from "../index";
import { Money } from "../Money";
import { FoodPayFailedView } from "./FoodPayFailedView";
import { FoodPayWaitView } from "./FoodPayWaitView";
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

  // R5·4/R5·b2 — the rail prompt wait and its decline, WHICH THIS BACKEND CANNOT DO.
  //
  // There is no prompt-send endpoint and no decline callback anywhere in this codebase: the shipped
  // payment path is the manual rail below (dial USSD → submit your reference → the merchant matches it
  // against their own statement). Those two designed screens still have to be walkable for internal
  // testing, so the transition into them is SIMULATED — and simulation is confined to the QA APK by
  // `isTestBuild()` (false in every real release, so `simulateRail` is permanently null there and the
  // entry button never renders).
  //
  // Non-negotiable: there is NO simulated success. `payPhase` can only reach "wait" and "failed" —
  // both of which state that no money moved — and the sole route to a paid order stays the real
  // reference submission. A screen that claimed money moved when nothing was sent is the exact defect
  // this programme exists to fix.
  const [payPhase, setPayPhase] = useState<"form" | "wait" | "failed">("form");
  const simulateRail = isTestBuild();
  if (simulateRail && payPhase === "wait") {
    return (
      <FoodPayWaitView
        restaurantName={restaurantName}
        amount={amount}
        merchantPaymentPhone={order.merchantPaymentPhone}
        reachable={reachable}
        onEnterReference={() => setPayPhase("form")}
        onSimulateDecline={() => setPayPhase("failed")}
      />
    );
  }
  if (simulateRail && payPhase === "failed") {
    return (
      <FoodPayFailedView
        restaurantName={restaurantName}
        amount={amount}
        reachable={reachable}
        onTryAgain={() => setPayPhase("wait")}
        onPayManually={() => setPayPhase("form")}
      />
    );
  }

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
        {/* Keep the journey tracker visible during the longest wait — the neighbouring phases all show
            it, so dropping it here made progress vanish exactly when the customer doubts the order. */}
        <Stepper events={[]} currentStatus={order.status} view="customer" jobType="food" merchantPhase={order.merchantPhase} />
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
        {/* Kit R5·3 (r-customer-b.jsx:87-88): the amount-to-pay card is the accent-bordered emphasis
            card, and its eyebrow is accent-text — not another muted micro-label. */}
        <Card accent>
          <Text style={{ fontSize: 12, fontWeight: "700", color: tokens.color.accentText, letterSpacing: 0.4 }}>PAY EXACTLY</Text>
          <Money v={amount} size={30} style={{ marginTop: 4 }} />
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
        {/* QA APK only (see the payPhase comment above): the door into R5·4/R5·b2. Labelled for what it
            is — no rail prompt is sent, because no such endpoint exists. Never rendered in a release. */}
        {simulateRail ? (
          <Button label="SIMULATE: send payment prompt (test build)" variant="ghost" onPress={() => setPayPhase("wait")} />
        ) : null}
        {/* The pay screen is the other long wait the tracker had gone missing on — restore it below the
            pay actions so the kitchen-confirm/payment phase stays legible while the money is in flight. */}
        <Stepper events={[]} currentStatus={order.status} view="customer" jobType="food" merchantPhase={order.merchantPhase} />
        {cancelFooter}
      </ScrollView>
    </Screen>
  );
}
