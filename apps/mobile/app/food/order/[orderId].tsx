import { RESTAURANTS_TIMING, rejectionCopy, tokens } from "@lynia/shared";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { ApiError } from "../../../src/api/client";
import { cancelUnpaidFoodOrder, respondToFoodOrderItems, submitFoodPaymentReference } from "../../../src/api/food-orders";
import { canCancelFreely, isStillUnpaidReminderDue } from "../../../src/logic/food-checkout";
import { formatMoney } from "../../../src/logic/money";
import { clearFoodOrderSnapshot, saveFoodOrderSnapshot } from "../../../src/net/food-order-store";
import { useReachability } from "../../../src/net/use-reachability";
import { useFoodOrder } from "../../../src/query/use-food-order";
import { useRestaurantMenu } from "../../../src/query/use-restaurants";
import { Button, Card, EmptyState, ErrorText, Field, Icon, OfflineBanner, Screen, SkeletonList, StatusPill, useToast } from "../../../src/ui";
import { CountdownRing, formatCountdown } from "../../../src/ui/food/CountdownRing";
import { ManualPayRail } from "../../../src/ui/food/ManualPayRail";
import { PriceMath } from "../../../src/ui/food/PriceMath";

export default function FoodOrderScreen(): React.ReactElement {
  const { orderId: param } = useLocalSearchParams<{ orderId: string }>();
  const orderId = typeof param === "string" ? param : "";
  const router = useRouter();
  const toast = useToast();
  const reachable = useReachability();
  const { order, isLoading, isError, refetch } = useFoodOrder(orderId, orderId !== "");
  const { menu } = useRestaurantMenu(order?.merchantId, !!order?.merchantId);
  const restaurantName = menu?.restaurant.name ?? "the restaurant";

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [referenceInput, setReferenceInput] = useState("");
  // Tapping "Pay now" from the still-unpaid reminder (R5·b1) jumps straight to the manual-rail pay
  // screen, bypassing the reminder gate — otherwise the elapsed-time check would just show it again.
  const [forcePayScreen, setForcePayScreen] = useState(false);
  // Ticks once a second so the two server-deadline countdown rings move — the deadlines themselves
  // are server timestamps (acceptDeadlineAt/itemApprovalDeadlineAt), this only drives the redraw.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // Restart survival (RESTAURANTS-DECISIONS.md §3): remember this order's id/status so a killed-and-
  // relaunched app can warm-paint it; cleared once the order reaches a terminal cancelled state.
  useEffect(() => {
    if (!order) return;
    if (order.status === "cancelled") void clearFoodOrderSnapshot();
    else void saveFoodOrderSnapshot(order.id, order.status, order.merchantPhase);
  }, [order]);

  if (isLoading && !order) {
    return (
      <Screen>
        <Text style={{ fontSize: 19, fontWeight: "700", marginBottom: 14 }}>Your order</Text>
        <SkeletonList count={3} />
      </Screen>
    );
  }

  if (!order) {
    return (
      <Screen>
        <OfflineBanner state={reachable ? "online" : "offline"} />
        <EmptyState
          icon="circle-alert"
          title={isError ? "Couldn't load this order" : "Order not found"}
          message={isError ? "Check your connection and try again." : "This order may have been removed."}
        >
          <Button label="Retry" onPress={refetch} />
        </EmptyState>
      </Screen>
    );
  }

  const cancel = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await cancelUnpaidFoodOrder(order.id);
      toast.show("Order cancelled — nothing was charged", "info");
      router.replace("/food");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't cancel — try again.");
    } finally {
      setBusy(false);
    }
  };

  const approveItems = async (approve: boolean): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await respondToFoodOrderItems(order.id, approve);
      if (!approve) {
        toast.show("Order cancelled — nothing was charged", "info");
        router.replace("/food");
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't send your answer — try again.");
    } finally {
      setBusy(false);
    }
  };

  const submitReference = async (): Promise<void> => {
    if (!referenceInput.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await submitFoodPaymentReference(order.id, referenceInput.trim());
      toast.show("Reference submitted", "info");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't submit your reference — try again.");
    } finally {
      setBusy(false);
    }
  };

  const CancelFooter = canCancelFreely(order.merchantPhase) ? (
    <Button variant="ghost" label="Cancel the order — free" onPress={() => void cancel()} disabled={busy} />
  ) : null;

  // ── Terminal: cancelled/rejected ─────────────────────────────────────────────────────────────────
  if (order.status === "cancelled") {
    return (
      <Screen>
        <OfflineBanner state={reachable ? "online" : "offline"} />
        <EmptyState
          icon="circle-alert"
          title="This order was cancelled"
          message={order.rejectionReason ? rejectionCopy(order.rejectionReason) : "Nothing was charged."}
        >
          <Button label="Back to browsing" onPress={() => router.replace("/food")} />
        </EmptyState>
      </Screen>
    );
  }

  // ── awaiting_accept: waiting for the kitchen to answer (N-03's 3:00 window) ─────────────────────
  if (order.merchantPhase === "awaiting_accept") {
    const deadline = order.acceptDeadlineAt ? new Date(order.acceptDeadlineAt).getTime() : null;
    const total = RESTAURANTS_TIMING.acceptWindowMs;
    const elapsed = deadline ? Math.max(0, total - (deadline - now)) : 0;
    const remaining = deadline ? Math.max(0, deadline - now) : total;
    return (
      <Screen>
        <OfflineBanner state={reachable ? "online" : "offline"} />
        <OrderHeader restaurantName={restaurantName} pillLabel="Waiting for accept" pillTone="neutral" />
        <View style={{ alignItems: "center", paddingVertical: tokens.space.lg }}>
          <CountdownRing elapsedMs={elapsed} totalMs={total} label={formatCountdown(remaining)} sub="to accept" />
          <Text style={{ fontSize: 17, fontWeight: "700", color: tokens.color.ink, marginTop: tokens.space.md, textAlign: "center" }}>
            Waiting for {restaurantName}
          </Text>
          <Text style={{ fontSize: 13.5, color: tokens.color.muted, textAlign: "center", marginTop: 6, maxWidth: 280 }}>
            They have 3 minutes to accept. You&apos;ll pay only after they do — nothing has left your wallet.
          </Text>
        </View>
        <ErrorText message={error} />
        {CancelFooter}
      </Screen>
    );
  }

  // ── awaiting_item_approval: D-23 item-level accept, N-18's 60s customer approval window ─────────
  if (order.merchantPhase === "awaiting_item_approval") {
    const deadline = order.itemApprovalDeadlineAt ? new Date(order.itemApprovalDeadlineAt).getTime() : null;
    const total = RESTAURANTS_TIMING.itemApprovalWindowMs;
    const remaining = deadline ? Math.max(0, deadline - now) : total;
    const unavailable = order.items.filter((it) => it.available === false);
    const kept = order.items.filter((it) => it.available !== false);
    const revisedGoodsTotal = kept.reduce((sum, it) => sum + it.priceUsd * it.quantity, 0);
    return (
      <Screen>
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
        <ErrorText message={error} />
        <Button
          label={`Yes — send it without ${unavailable[0]?.name ?? "it"}`}
          onPress={() => void approveItems(true)}
          disabled={busy}
          loading={busy}
        />
        <Button variant="ghost" label="Cancel the whole order" onPress={() => void approveItems(false)} disabled={busy} />
      </Screen>
    );
  }

  // ── awaiting_payment: R-16/R-17 kitchen-confirms band (call → pay → confirmed), no clocks ───────
  if (order.merchantPhase === "awaiting_payment") {
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
          <ErrorText message={error} />
          {CancelFooter}
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
            <Button label={`Pay now · ${formatMoney(amount)}`} onPress={() => setForcePayScreen(true)} />
            <Button variant="ghost" label="Cancel the order — free" onPress={() => void cancel()} disabled={busy} />
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
          <ErrorText message={error} />
          {CancelFooter}
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
            onChangeText={setReferenceInput}
            placeholder="e.g. EC240727.1132.A81043"
            hint="Copy it from the confirmation SMS — not a screenshot."
          />
          <ErrorText message={error} />
          <Button label="Submit my reference" onPress={() => void submitReference()} disabled={busy || !referenceInput.trim()} loading={busy} />
          {CancelFooter}
        </ScrollView>
      </Screen>
    );
  }

  // ── confirmed: payment landed (or CASH needs none) — the kitchen has started (D2's terminal state,
  // D3 owns the live tracker from here) ────────────────────────────────────────────────────────────
  return (
    <Screen>
      <OfflineBanner state={reachable ? "online" : "offline"} />
      <OrderHeader restaurantName={restaurantName} pillLabel="Confirmed" pillTone="success" />
      <View style={{ alignItems: "center", paddingVertical: tokens.space.lg }}>
        <View style={{ width: 84, height: 84, borderRadius: 42, backgroundColor: tokens.color.accentWash, alignItems: "center", justifyContent: "center", marginBottom: tokens.space.md }}>
          <Icon name="circle-check" size={34} color={tokens.color.accentText} strokeWidth={1.75} />
        </View>
        <Text style={{ fontSize: 17, fontWeight: "700", color: tokens.color.ink, textAlign: "center" }}>{restaurantName} is cooking your order</Text>
        <Text style={{ fontSize: 13.5, color: tokens.color.muted, textAlign: "center", marginTop: 6, maxWidth: 280 }}>
          We&apos;ll show live progress here soon — for now, sit tight.
        </Text>
      </View>
      <Card>
        <Row label="Total" value={formatMoney(order.total ?? order.merchantGoodsTotal ?? 0)} />
      </Card>
    </Screen>
  );
}

function OrderHeader({
  restaurantName,
  pillLabel,
  pillTone,
}: {
  restaurantName: string;
  pillLabel: string;
  pillTone: "neutral" | "highlight" | "success";
}): React.ReactElement {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
      <Text style={{ fontSize: 19, fontWeight: "700" }}>{restaurantName}</Text>
      <StatusPill status={pillLabel} tone={pillTone} />
    </View>
  );
}

function Row({ label, value }: { label: string; value: string }): React.ReactElement {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", paddingVertical: 4 }}>
      <Text style={{ fontSize: 13, fontWeight: "500", color: tokens.color.muted }}>{label}</Text>
      <Text style={{ fontSize: 14.5, fontWeight: "700", color: tokens.color.ink }}>{value}</Text>
    </View>
  );
}
