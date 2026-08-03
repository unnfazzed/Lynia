import { DELIVERY_OTP_MAX_ATTEMPTS, tokens, type AdvanceStatusRequest, type MerchantOrderResponse } from "@lynia/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Linking, Pressable, ScrollView, Text, View } from "react-native";
import { ApiError } from "../../src/api/client";
import {
  confirmFoodPickup,
  confirmFoodRiderCash,
  disputeFoodCash,
  dropFoodDispatch,
  getFoodOrderAsRider,
  logFoodDoorstepCall,
  reportFoodCustomerRefused,
  reportFoodNoShow,
} from "../../src/api/food-rider";
import { advanceStatus, confirmDelivery, getActiveOrder, rateSender, type OrderSnapshot } from "../../src/api/orders";
import { acknowledgeHandback, loadAcknowledgedHandbacks } from "../../src/auth/session";
import { handshakeState, codeEligible } from "../../src/logic/food-doorstep";
import { FOOD_DROPPABLE, foodCashBreakdown, noShowStatus, returnLegNeeded, RIDER_FOOD_NEXT } from "../../src/logic/food-rider-job";
import { ACTIVE, reconcileOtpAttempts } from "../../src/logic/rider-job";
import { formatMoney } from "../../src/logic/money";
import { mapsPlaceUrl } from "../../src/logic/maps";
import { invalidateRiderJobQueries } from "../../src/query/use-history-feed";
import { useForegroundRefetch } from "../../src/realtime/use-foreground-refetch";
import { useRiderLocationStream } from "../../src/realtime/use-rider-location";
import { Button, Card, Celebrate, ErrorText, haptic, Heading, Icon, Screen, SkeletonList, StatusPill, Sub, orderStatusTone, useToast } from "../../src/ui";
import { DeliveryOtp } from "../../src/ui/rider/DeliveryOtp";
import { JobDetailsCard } from "../../src/ui/rider/JobDetailsCard";
import { LeaveJobButton } from "../../src/ui/rider/LeaveJobButton";
import { CashHeldStrip } from "../../src/ui/rider/CashHeldStrip";
import { BailSheet } from "../../src/ui/rider/BailSheet";
import { PickupCodeCard } from "../../src/ui/food/PickupCodeCard";
import { RiderCashHandshakeCard } from "../../src/ui/food/RiderCashHandshakeCard";
import { UnreachableCustomerCard } from "../../src/ui/food/UnreachableCustomerCard";
import { GetHelpControl, SosControl } from "../../src/ui/safety";

/**
 * D5 — the rider's active FOOD job: accept → navigate → N-16 pickup code → collect → navigate →
 * doorstep handshake → delivery code → delivered → (collect-and-return CASH only) return-the-cash
 * leg → hand-back confirm. Sits alongside job.tsx (the parcel screen) rather than forking it — see
 * job.tsx's own early redirect for the split. Reuses the SAME generic order machinery a parcel does
 * (advanceStatus for assigned→confirmed→en_route_pickup and picked_up→en_route_dropoff, confirmDelivery
 * for the final 6-digit code, rateSender, the safety controls, JobDetailsCard/Stepper via its
 * `jobType` prop) — only the pickup-code gate (N-16), the cash handshake, and the debt/return-leg are
 * genuinely food-specific.
 *
 * Open items (surfaced, not silently decided): no durable app-kill-survives terminal marker like
 * job.tsx's saveRiderJobTerminal (a kill in the narrow window between confirmDelivery landing and this
 * screen freezing its acknowledgement loses that screen on relaunch — debtStatus stays server-enforced
 * either way, so this is a UX-recall gap, not a money-safety one); no live WS wired for a mid-job
 * customer cancel (poll-only, same precedent D2/D3 already used for the customer-side food screens).
 */
export default function RiderFoodJob(): React.ReactElement {
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);

  const jobQ = useQuery({ queryKey: ["activeJob"], queryFn: getActiveOrder, refetchInterval: 8000 });
  const order = jobQ.data ?? null;
  const orderId = order?.id ?? null;

  // job.tsx owns every parcel order — a food order landing there redirects to this screen (see its own
  // early check); the mirror image here in case this screen is reached (deep link, stale bookmark) for
  // a parcel job.
  useEffect(() => {
    if (order && order.orderType !== "merchant") router.replace("/rider/job");
  }, [order, router]);

  const foodQ = useQuery({
    queryKey: ["foodOrderAsRider", orderId],
    queryFn: () => getFoodOrderAsRider(orderId as string),
    enabled: !!orderId && order?.orderType === "merchant",
    refetchInterval: 5000,
  });
  const foodOrder = foodQ.data ?? null;

  const orderRef = useRef<OrderSnapshot | null>(order);
  orderRef.current = order;
  const foodOrderRef = useRef<MerchantOrderResponse | null>(foodOrder);
  foodOrderRef.current = foodOrder;

  const refresh = (): void => {
    invalidateRiderJobQueries(qc);
    if (orderId) void qc.invalidateQueries({ queryKey: ["foodOrderAsRider", orderId] });
  };
  useForegroundRefetch(refresh);

  // B-O2: memoized off the primitive lat/lng — a fresh `{lat,lng}` object literal every render (even
  // with identical values) would defeat JobDetailsCard's memo boundary for every OTHER re-render this
  // screen goes through that has nothing to do with the rider's actual position.
  const riderPoint = useMemo(
    () =>
      order?.rider != null && order.rider.currentLat != null && order.rider.currentLng != null
        ? { lat: order.rider.currentLat, lng: order.rider.currentLng }
        : null,
    [order?.rider?.currentLat, order?.rider?.currentLng],
  );
  const { permissionDenied: locationDenied } = useRiderLocationStream(order && ACTIVE.includes(order.status) ? orderId : null);

  const fail = (e: unknown): void => setError(e instanceof ApiError ? e.message : "Couldn't update this delivery. Check your connection and try again.");

  // ── Pre-pickup drop (D-33) ──────────────────────────────────────────────────────────────────────
  const [dropping, setDropping] = useState(false);
  // BailSheet's reason field is UI-only here — dropDispatch takes no body (unlike a parcel's
  // CancelRequest.reason; see food-dispatch.service.ts's own docstring on why). Reused verbatim
  // rather than forked for a one-field difference; the reliability-strike warning it also renders is
  // accurate for a food drop too (same cancelStrikes axis).
  const [dropReason, setDropReason] = useState("");
  const dropM = useMutation({
    mutationFn: () => dropFoodDispatch(orderId!),
    onSuccess: () => {
      setDropping(false);
      toast.show("Job dropped — it's back with the kitchen for another rider.", "warning");
      router.replace("/rider");
    },
    onError: (e) => {
      setDropping(false);
      fail(e);
    },
  });

  // ── Generic forward advance (assigned→confirmed→en_route_pickup, picked_up→en_route_dropoff) ─────
  const advanceM = useMutation({
    mutationFn: (to: AdvanceStatusRequest["to"]) => advanceStatus(orderId!, to),
    onSuccess: () => setError(null),
    onError: (e) => fail(e),
    onSettled: refresh,
  });

  // ── N-16 pickup code ────────────────────────────────────────────────────────────────────────────
  const [pickupCode, setPickupCode] = useState("");
  const [pickupAttempts, setPickupAttempts] = useState(0);
  useEffect(() => {
    const next = reconcileOtpAttempts({ local: pickupAttempts, serverAttempts: foodOrder?.pickupCodeAttempts });
    if (next != null) setPickupAttempts(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reconcile off a FRESH server value only.
  }, [foodOrder?.pickupCodeAttempts]);
  const confirmPickupM = useMutation({
    mutationFn: () => confirmFoodPickup(orderId!, pickupCode.trim()),
    onSuccess: () => {
      haptic("success");
      setPickupCode("");
      setPickupAttempts(0);
      setError(null);
      refresh();
    },
    onError: (e) => {
      // confirmPickup's own error shapes differ from confirmDelivery's: a wrong code is 400
      // (BadRequestException), the lockout is 403 (ForbiddenException) — not 401/403.
      if (e instanceof ApiError && e.status === 403) {
        haptic("warning");
        setPickupAttempts(DELIVERY_OTP_MAX_ATTEMPTS);
      } else if (e instanceof ApiError && e.status === 400) {
        haptic("warning");
        setPickupAttempts((n) => n + 1);
      } else {
        fail(e);
      }
      refresh();
    },
  });

  // ── Doorstep dual-confirm handshake (R-04/R-05) ────────────────────────────────────────────────
  const confirmCashM = useMutation({
    mutationFn: () => confirmFoodRiderCash(orderId!),
    onSuccess: () => {
      haptic("success");
      setError(null);
      refresh();
    },
    onError: (e) => {
      fail(e);
      refresh();
    },
  });
  const disputeCashM = useMutation({
    mutationFn: () => disputeFoodCash(orderId!),
    onSuccess: refresh,
    onError: (e) => {
      fail(e);
      refresh();
    },
  });
  const [nowMs, setNowMs] = useState(() => Date.now());

  // ── Delivery code (6-digit, generic — reused verbatim) ─────────────────────────────────────────
  const [deliveryCode, setDeliveryCode] = useState("");
  const [otpTries, setOtpTries] = useState(0);
  useEffect(() => {
    const next = reconcileOtpAttempts({ local: otpTries, serverAttempts: order?.deliveryOtpAttempts });
    if (next != null) setOtpTries(next);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reconcile off a FRESH server value only.
  }, [order?.deliveryOtpAttempts]);

  // ── Delivered terminal (frozen — `delivered` drops out of the active feed) ────────────────────
  const [deliveredFood, setDeliveredFood] = useState<{
    orderId: string;
    pickupPoint: { lat: number; lng: number } | null;
    merchantCashRule: string | null;
    paymentMethod: string | null;
    merchantGoodsTotal: number | null;
    deliveryFee: number | null;
  } | null>(null);
  const deliverM = useMutation({
    mutationFn: () => confirmDelivery(orderId!, deliveryCode.trim()),
    onSuccess: () => {
      haptic("success");
      setDeliveryCode("");
      setOtpTries(0);
      const fo = foodOrderRef.current;
      const o = orderRef.current;
      if (o) {
        setDeliveredFood({
          orderId: o.id,
          pickupPoint: o.pickup.point,
          merchantCashRule: fo?.merchantCashRule ?? null,
          paymentMethod: fo?.paymentMethod ?? null,
          merchantGoodsTotal: fo?.merchantGoodsTotal ?? null,
          deliveryFee: fo?.deliveryFee ?? null,
        });
      }
      refresh();
    },
    onError: (e) => {
      if (e instanceof ApiError && e.status === 403) {
        haptic("warning");
        setOtpTries(DELIVERY_OTP_MAX_ATTEMPTS);
        setError("Too many attempts — ask the customer to re-issue the delivery code.");
      } else if (e instanceof ApiError && e.status === 401) {
        haptic("warning");
        setOtpTries((n) => n + 1);
        setError(null);
      } else {
        fail(e);
      }
      refresh();
    },
  });
  // Poll the return-leg state directly against the frozen order id — `delivered` drops out of
  // activeForRider, so this is a second, independent source of truth, not the `foodQ` above.
  const returnLegQ = useQuery({
    queryKey: ["foodReturnLeg", deliveredFood?.orderId],
    queryFn: () => getFoodOrderAsRider(deliveredFood!.orderId),
    enabled: deliveredFood != null,
    refetchInterval: (q) => (q.state.data ? (returnLegNeeded(q.state.data) ? 5000 : false) : 5000),
  });

  // ── No-show / refusal (N-10/R-08) ──────────────────────────────────────────────────────────────
  const [undeliveredFoodReason, setUndeliveredFoodReason] = useState<"unreachable" | "refused" | null>(null);
  const logCallM = useMutation({
    mutationFn: () => logFoodDoorstepCall(orderId!),
    onSuccess: refresh,
    onError: (e) => {
      fail(e);
      refresh();
    },
  });
  const noShowM = useMutation({
    mutationFn: () => reportFoodNoShow(orderId!),
    onSuccess: () => {
      setUndeliveredFoodReason("unreachable");
      refresh();
    },
    onError: (e) => fail(e),
  });
  const refusedM = useMutation({
    mutationFn: () => reportFoodCustomerRefused(orderId!),
    onSuccess: () => {
      setUndeliveredFoodReason("refused");
      refresh();
    },
    onError: (e) => fail(e),
  });
  const [showUnreachable, setShowUnreachable] = useState(false);

  // ── Rate the customer (optional, recorded-only — mirrors job.tsx's rate-the-sender) ──────────────
  const [customerScore, setCustomerScore] = useState(0);
  const rateM = useMutation({
    mutationFn: (score: number) => rateSender(deliveredFood!.orderId, { score }),
    onError: () => setCustomerScore(0),
  });

  // ── Cancelled-while-active handback (24h reopen window — same activeForRider fallback a
  //    collected-then-cancelled parcel already gets; `collectedAt`/`counterpartyPhone` are generic). ──
  const [ackedHandbacks, setAckedHandbacks] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    let alive = true;
    void loadAcknowledgedHandbacks().then((ids) => {
      if (alive) setAckedHandbacks(new Set(ids));
    });
    return () => {
      alive = false;
    };
  }, []);

  // B-O8: `nowMs` only feeds the no-show wait-countdown and the cash-handshake card, both reachable
  // only from the main active-job render below — the delivered/undelivered/cancelled-handback terminal
  // screens (and the loading/redirect states above) never read it. Gating the interval on reaching that
  // branch (rather than ticking for the order's whole lifetime) stops the once/sec re-render once the
  // job has nothing left for a clock to drive.
  const needsClock = order != null && !deliveredFood && !undeliveredFoodReason && !(order.status === "cancelled" && !ackedHandbacks.has(order.id));
  useEffect(() => {
    if (!needsClock) return;
    const t = setInterval(() => setNowMs(Date.now()), 1000);
    return () => clearInterval(t);
  }, [needsClock]);

  // ── Render ──────────────────────────────────────────────────────────────────────────────────────

  if (deliveredFood) {
    const cashCollect = deliveredFood.paymentMethod === "cash" && deliveredFood.merchantCashRule === "collect_and_return";
    const breakdown = cashCollect ? foodCashBreakdown(deliveredFood) : null;
    const stillOwed = returnLegQ.data ? returnLegNeeded(returnLegQ.data) : cashCollect;
    return (
      <Screen>
        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: tokens.space.md }}>
            <Heading>Your job</Heading>
            <View style={{ flex: 1 }} />
            <StatusPill status="delivered" tone={orderStatusTone("delivered")} dot />
          </View>
          <Card>
            <Celebrate />
            <Text style={{ fontWeight: "700", color: tokens.color.accentText, textAlign: "center", marginTop: tokens.space.sm }}>
              Delivered — you&apos;re free for the next job{cashCollect && stillOwed ? " once the cash is back with the kitchen" : ""}.
            </Text>
          </Card>
          {breakdown ? (
            <Card>
              <Text style={{ fontWeight: "700", marginBottom: tokens.space.sm }}>Cash breakdown</Text>
              <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                <Sub>Collected at the door</Sub>
                <Text style={{ fontVariant: ["tabular-nums"] }}>{formatMoney(breakdown.collected)}</Text>
              </View>
              <View style={{ flexDirection: "row", justifyContent: "space-between", marginBottom: 4 }}>
                <Sub>You keep (delivery fee)</Sub>
                <Text style={{ fontVariant: ["tabular-nums"] }}>{formatMoney(breakdown.kept)}</Text>
              </View>
              <View style={{ flexDirection: "row", justifyContent: "space-between" }}>
                <Sub>Owed to the kitchen</Sub>
                <Text style={{ fontVariant: ["tabular-nums"], fontWeight: "700" }}>{formatMoney(breakdown.owed)}</Text>
              </View>
            </Card>
          ) : null}
          {cashCollect && stillOwed ? (
            <Card style={{ borderColor: tokens.color.danger }}>
              <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 9 }}>
                <Icon name="triangle-alert" size={18} color={tokens.color.danger} />
                <View style={{ flex: 1 }}>
                  <Text style={{ fontSize: 14.5, fontWeight: "700", color: tokens.color.ink }}>Ride the food money back</Text>
                  <Text style={{ fontSize: 13, color: tokens.color.muted, lineHeight: 18, marginTop: 4 }}>
                    No new offers until the kitchen confirms the cash.
                  </Text>
                </View>
              </View>
              <View style={{ marginTop: tokens.space.sm }}>
                <CashHeldStrip yours={breakdown?.kept ?? 0} owed={breakdown?.owed ?? 0} />
              </View>
              {deliveredFood.pickupPoint ? (
                <Pressable
                  onPress={() => void Linking.openURL(mapsPlaceUrl(deliveredFood.pickupPoint!))}
                  accessibilityRole="button"
                  accessibilityLabel="Navigate back to the restaurant"
                  style={{ minHeight: tokens.touchTargetMin, flexDirection: "row", alignItems: "center", gap: tokens.space.sm, marginTop: tokens.space.sm }}
                >
                  <Icon name="navigation" size={16} color={tokens.color.accentText} />
                  <Text style={{ fontSize: 14, fontWeight: "600", color: tokens.color.accentText }}>Navigate back to the kitchen</Text>
                </Pressable>
              ) : null}
            </Card>
          ) : cashCollect ? (
            <Card style={{ backgroundColor: tokens.color.accentWash, borderColor: "transparent" }}>
              <Text style={{ fontWeight: "700", color: tokens.color.accentText }}>Hand-back confirmed</Text>
              <Text style={{ fontSize: 13, color: tokens.color.accentText, marginTop: 2 }}>The kitchen has the cash. You&apos;re clear for your next job.</Text>
            </Card>
          ) : null}
          <Card>
            <Text style={{ fontWeight: "700", marginBottom: 2 }}>Rate the customer</Text>
            <Sub>Optional — a no-show or cash problem here protects other riders.</Sub>
            {rateM.isSuccess ? (
              <Text style={{ fontSize: 14, color: tokens.color.accentText, fontWeight: "600" }}>Thanks for the feedback.</Text>
            ) : (
              <View style={{ flexDirection: "row", gap: 4 }}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <Pressable
                    key={n}
                    onPress={() => {
                      setCustomerScore(n);
                      rateM.mutate(n);
                    }}
                    disabled={rateM.isPending}
                    accessibilityRole="button"
                    accessibilityLabel={`Rate the customer ${n} star${n === 1 ? "" : "s"}`}
                    hitSlop={8}
                    style={{ minWidth: tokens.touchTargetMin, minHeight: tokens.touchTargetMin, alignItems: "center", justifyContent: "center" }}
                  >
                    <Text style={{ fontSize: 30, color: n <= customerScore ? tokens.color.highlight : tokens.color.line }}>★</Text>
                  </Pressable>
                ))}
              </View>
            )}
          </Card>
          <GetHelpControl orderId={deliveredFood.orderId} />
          <Button
            label={cashCollect && stillOwed ? "Cash not returned yet — leave anyway" : "Back to board"}
            variant={cashCollect && stillOwed ? "ghost" : "primary"}
            onPress={() => router.replace("/rider")}
          />
          <ErrorText message={error} />
          <View style={{ height: tokens.space.xxl }} />
        </ScrollView>
      </Screen>
    );
  }

  if (undeliveredFoodReason) {
    return (
      <Screen>
        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: tokens.space.md }}>
            <Heading>Your job</Heading>
            <View style={{ flex: 1 }} />
            <StatusPill status="undelivered" tone="offline" dot />
          </View>
          <Card>
            <Text style={{ fontSize: tokens.font.size.bodyLg, fontWeight: tokens.font.weight.bold, color: tokens.color.ink, marginBottom: tokens.space.sm }}>
              {undeliveredFoodReason === "refused" ? "Marked as customer refused" : "Marked as no-show"}
            </Text>
            <Text style={{ fontSize: tokens.font.size.body, color: tokens.color.muted, lineHeight: 20 }}>
              {undeliveredFoodReason === "refused"
                ? "The customer's cash access is now on hold for food orders — mobile money only from here on. You're free for the next job."
                : "Recorded after your wait and logged calls. The customer has been told. You're free for the next job."}
            </Text>
          </Card>
          <Button label="Back to board" onPress={() => router.replace("/rider")} />
        </ScrollView>
      </Screen>
    );
  }

  if (order && order.status === "cancelled" && !ackedHandbacks.has(order.id)) {
    // activeForRider's own R8 handback fallback only ever surfaces a cancelled order once
    // `collectedAt` is set (see orders.service.ts) — a pre-pickup food cancel drops straight to null
    // on the next poll instead, so reaching this branch at all means the food (and possibly cash) was
    // already collected.
    const collected = true;
    return (
      <Screen>
        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: tokens.space.md }}>
            <Heading>Your job</Heading>
            <View style={{ flex: 1 }} />
            <StatusPill status="cancelled" tone="offline" dot />
          </View>
          <Card>
            <Text style={{ fontSize: tokens.font.size.bodyLg, fontWeight: tokens.font.weight.bold, color: tokens.color.danger, marginBottom: tokens.space.sm }}>
              This order was cancelled
            </Text>
            <Text style={{ fontSize: tokens.font.size.body, color: tokens.color.muted, lineHeight: 20 }}>
              {collected
                ? "You may still be holding the food (and, if collected, cash) for this order. Contact support to sort out the hand-back — this doesn't affect your reliability score."
                : "Cancelled before pickup — you're simply free. No food, straight back to the board."}
            </Text>
            {order.counterpartyPhone ? (
              <Pressable
                onPress={() => void Linking.openURL(`tel:${order.counterpartyPhone}`)}
                accessibilityRole="button"
                accessibilityLabel="Call customer"
                style={{ minHeight: tokens.touchTargetMin, flexDirection: "row", alignItems: "center", gap: tokens.space.sm, marginTop: tokens.space.sm }}
              >
                <Icon name="phone" size={16} color={tokens.color.accentText} />
                <Text style={{ fontSize: 14, fontWeight: "600", color: tokens.color.accentText }}>Call customer · {order.counterpartyPhone}</Text>
              </Pressable>
            ) : null}
          </Card>
          <GetHelpControl orderId={order.id} />
          <Button
            label="Back to board"
            onPress={() => {
              void acknowledgeHandback(order.id);
              router.replace("/rider");
            }}
          />
        </ScrollView>
      </Screen>
    );
  }

  if (jobQ.isLoading || (order && order.orderType === "merchant" && foodQ.isLoading && !foodOrder)) {
    return (
      <Screen>
        <SkeletonList />
      </Screen>
    );
  }

  if (!order || order.status === "cancelled") {
    return (
      <Screen>
        <Heading>No active job</Heading>
        <Sub>Accept an offer to start a delivery.</Sub>
        <Button label="Back" onPress={() => router.replace("/rider")} />
      </Screen>
    );
  }

  if (order.orderType !== "merchant" || !foodOrder) {
    // Redirect effect above handles the mismatched-type case; this is the brief frame before it fires.
    return (
      <Screen>
        <SkeletonList />
      </Screen>
    );
  }

  const isActive = ACTIVE.includes(order.status);
  const next = RIDER_FOOD_NEXT[order.status];
  const cashOrder = foodOrder.paymentMethod === "cash";
  const hState = handshakeState({
    paymentMethod: foodOrder.paymentMethod,
    customerCashConfirmedAt: foodOrder.customerCashConfirmedAt,
    riderCashConfirmedAt: foodOrder.riderCashConfirmedAt,
    cashHandshakeFrozenAt: foodOrder.cashHandshakeFrozenAt,
  });
  const codeReady = codeEligible({
    paymentMethod: foodOrder.paymentMethod,
    customerCashConfirmedAt: foodOrder.customerCashConfirmedAt,
    riderCashConfirmedAt: foodOrder.riderCashConfirmedAt,
    cashHandshakeFrozenAt: foodOrder.cashHandshakeFrozenAt,
  });
  const total = foodOrder.merchantGoodsTotal != null && foodOrder.deliveryFee != null ? foodOrder.merchantGoodsTotal + foodOrder.deliveryFee : null;
  const noShow = noShowStatus(foodOrder.noShowCallTimestamps, nowMs);
  const canReportUnreachable = order.status === "picked_up" || order.status === "en_route_dropoff";

  return (
    <Screen>
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: tokens.space.md }}>
          <Icon name="utensils" size={18} color={tokens.color.accentText} />
          <Heading> Your job</Heading>
          <View style={{ flex: 1 }} />
          <StatusPill status={order.status} tone={orderStatusTone(order.status)} />
        </View>

        {isActive ? (
          <View style={{ marginBottom: tokens.space.md }}>
            <CashHeldStrip yours={foodOrder.deliveryFee ?? 0} owed={foodOrder.debtStatus === "open" ? (foodOrder.debtAmount ?? 0) : 0} />
          </View>
        ) : null}

        {isActive && locationDenied ? (
          <View
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
            style={{ flexDirection: "row", alignItems: "center", gap: tokens.space.sm, padding: tokens.space.sm, borderRadius: tokens.radius.input, backgroundColor: tokens.color.surface, borderWidth: 1, borderColor: tokens.color.line, marginBottom: tokens.space.sm }}
          >
            <Icon name="triangle-alert" size={15} color={tokens.color.muted} />
            <Text style={{ flex: 1, fontSize: tokens.font.size.caption, color: tokens.color.muted, lineHeight: 18 }}>
              Location is off — the customer can&apos;t see where you are.
            </Text>
            <Pressable onPress={() => void Linking.openSettings()} hitSlop={8}>
              <Text style={{ fontSize: tokens.font.size.caption, fontWeight: tokens.font.weight.bold, color: tokens.color.accent }}>Turn on</Text>
            </Pressable>
          </View>
        ) : null}

        <JobDetailsCard order={order} riderPoint={riderPoint} isActive={isActive} jobType="food" />

        <Card>
          <Text style={{ fontWeight: "700", marginBottom: tokens.space.sm }}>Order</Text>
          {foodOrder.items.map((it, i) => (
            <Text key={i} style={{ fontSize: 14, color: tokens.color.ink, fontVariant: ["tabular-nums"] }}>
              {it.quantity}× {it.name}
            </Text>
          ))}
        </Card>

        {order.status === "en_route_pickup" ? (
          <PickupCodeCard
            code={pickupCode}
            onChangeCode={setPickupCode}
            attempts={pickupAttempts}
            pending={confirmPickupM.isPending}
            onConfirm={() => confirmPickupM.mutate()}
            paid={foodOrder.merchantPaymentConfirmedAt != null}
            paidReference={foodOrder.merchantPaymentReference}
            amountDue={cashOrder ? total : null}
          />
        ) : next ? (
          <Button label={next.label} onPress={() => advanceM.mutate(next.to)} loading={advanceM.isPending} />
        ) : null}

        {order.status === "en_route_dropoff" ? (
          cashOrder && hState !== "confirmed" ? (
            <RiderCashHandshakeCard
              state={hState}
              amount={foodOrder.cashHandshakeAmount ?? total ?? 0}
              confirmedAt={foodOrder.customerCashConfirmedAt}
              nowMs={nowMs}
              onConfirm={() => confirmCashM.mutate()}
              onDispute={() => disputeCashM.mutate()}
              busy={confirmCashM.isPending || disputeCashM.isPending}
            />
          ) : codeReady ? (
            <DeliveryOtp code={deliveryCode} onChangeCode={setDeliveryCode} otpTries={otpTries} pending={deliverM.isPending} onConfirm={() => deliverM.mutate()} senderPhone={order.counterpartyPhone} />
          ) : null
        ) : null}

        {canReportUnreachable ? (
          showUnreachable ? (
            <UnreachableCustomerCard
              customerPhone={order.counterpartyPhone}
              callsLogged={noShow.callsLogged}
              callsNeeded={noShow.callsNeeded}
              waitRemainingMs={noShow.waitRemainingMs}
              eligible={noShow.eligible}
              onLogCall={() => logCallM.mutate()}
              onReportNoShow={() => noShowM.mutate()}
              onReportRefused={() => refusedM.mutate()}
              logPending={logCallM.isPending}
              reportPending={noShowM.isPending || refusedM.isPending}
            />
          ) : (
            <Button label="Can't reach the customer?" variant="ghost" onPress={() => setShowUnreachable(true)} />
          )
        ) : null}

        {isActive ? <SosControl orderId={order.id} lat={riderPoint?.lat} lng={riderPoint?.lng} /> : null}

        {FOOD_DROPPABLE.has(order.status) ? (
          dropping ? (
            <BailSheet reason={dropReason} onChangeReason={setDropReason} pending={dropM.isPending} onConfirm={() => dropM.mutate()} onDismiss={() => setDropping(false)} />
          ) : (
            <Button label="Drop this job" variant="ghost" onPress={() => setDropping(true)} />
          )
        ) : null}

        {isActive ? <GetHelpControl orderId={order.id} /> : null}
        <LeaveJobButton isActive={isActive} onLeave={() => router.replace("/rider")} />
        <ErrorText message={error} />
        <View style={{ height: tokens.space.xxl }} />
      </ScrollView>
    </Screen>
  );
}
