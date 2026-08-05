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
import { pendingOrQueued } from "../../src/query/client";
import { handshakeState, codeEligible } from "../../src/logic/food-doorstep";
import { FOOD_DROPPABLE, foodCashBreakdown, noShowStatus, returnLegNeeded, RIDER_FOOD_NEXT } from "../../src/logic/food-rider-job";
import { ACTIVE, reconcileOtpAttempts } from "../../src/logic/rider-job";
import { formatMoney } from "../../src/logic/money";
import { mapsPlaceUrl } from "../../src/logic/maps";
import { invalidateRiderJobQueries } from "../../src/query/use-history-feed";
import { useForegroundRefetch } from "../../src/realtime/use-foreground-refetch";
import { useRiderJobSocket } from "../../src/realtime/use-rider-job-socket";
import { useRiderLocationStream } from "../../src/realtime/use-rider-location";
import { Button, Card, Celebrate, ErrorText, haptic, Heading, Icon, Screen, SkeletonList, StatusPill, Sub, orderStatusTone, useToast } from "../../src/ui";
import { DeliveryOtp } from "../../src/ui/rider/DeliveryOtp";
import { JobDetailsCard } from "../../src/ui/rider/JobDetailsCard";
import { LeaveJobButton } from "../../src/ui/rider/LeaveJobButton";
import { CashHeldStrip } from "../../src/ui/rider/CashHeldStrip";
import { BailSheet } from "../../src/ui/rider/BailSheet";
import { CancelBlockedCard } from "../../src/ui/rider/CancelBlockedCard";
import { JobRestoredBanner } from "../../src/ui/rider/JobRestoredBanner";
import { PayMerchantCard } from "../../src/ui/rider/PayMerchantCard";
import { ReturnToRestaurantCard } from "../../src/ui/rider/ReturnToRestaurantCard";
import { RiderErrorState } from "../../src/ui/rider/RiderErrorState";
import { wasJobRestored } from "../../src/ui/rider/job-resume";
import { clearLastActiveJob, loadLastActiveJob, saveLastActiveJob } from "../../src/net/last-active-store";
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
 * either way, so this is a UX-recall gap, not a money-safety one). A-O9: `activeJob` now resyncs on a
 * `useRiderJobSocket` push (a mid-job customer cancel included) instead of a bare 8s poll; `foodQ`
 * (kitchen/cash-handshake fields) and the cash-return-leg poll stay poll-only — deliberately left alone
 * this run since they carry the cash-handshake/debt-ledger state and the lane rules bar trading
 * correctness for bytes on a money-adjacent path.
 */
export default function RiderFoodJob(): React.ReactElement {
  const router = useRouter();
  const qc = useQueryClient();
  const toast = useToast();
  const [error, setError] = useState<string | null>(null);

  // A-O9: the job socket (below) resyncs `activeJob` on connect/connect_error/order:status already —
  // same fallback discipline as job.tsx's `jobPollFallback` (the parcel sibling) — so only fall back to
  // the plain 8s REST poll while it isn't connected, instead of a redundant round-trip every 8s for the
  // whole active leg.
  const [jobPollFallback, setJobPollFallback] = useState(true);
  const jobQ = useQuery({ queryKey: ["activeJob"], queryFn: getActiveOrder, refetchInterval: jobPollFallback ? 8000 : false });
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

  // A-O9: mirrors job.tsx's `useRiderJobSocket` wiring verbatim — the room this joins
  // (`orderRoom(orderId)`) and the events it listens for (`order:status`, `job:cancelled`) are keyed off
  // the shared, orderType-agnostic `Order` row, so the SAME hook subscribes correctly for a food job.
  // Unlike the parcel screen, this screen doesn't freeze a separate `cancelledJob` snapshot on
  // `job:cancelled` — it already reads `order.status === "cancelled"` straight off `activeJob` (see the
  // render branch below), which the generic `order:status` handler's `refetchJob()` keeps current, so
  // the callback here has nothing extra to do.
  const { connected: jobSocketConnected } = useRiderJobSocket(
    order && order.orderType === "merchant" && ACTIVE.includes(order.status) ? orderId : null,
    () => {},
  );
  useEffect(() => {
    setJobPollFallback(!jobSocketConnected);
  }, [jobSocketConnected]);

  const fail = (e: unknown): void => setError(e instanceof ApiError ? e.message : "Couldn't update this delivery. Check your connection and try again.");

  // ── `offline_resume` (kit r-rider.jsx RR.offline_resume) ────────────────────────────────────────
  // Mirrors job.tsx's last-known-job slot exactly: persist once per status transition, clear on a
  // terminal or an authoritative "no job". Two things ride on it — job.tsx's offline cold-start card
  // (a food job now gets the same last-known summary a parcel already did, instead of nothing), and
  // the restore check below. The projection (`toLastActive`) is order-type agnostic: id, status, fare,
  // the two landmarks. Wiped at sign-out with the rest of device state (device-state.ts owns JOB_KEY).
  // Read the slot ONCE on mount, before this process has had a chance to overwrite it — a summary of
  // THIS order written by an earlier process is the proof the app was killed mid-job. See job-resume.ts.
  // `resumeChecked` gates the persist effect below so the write can't beat this read (both fire on the
  // same mount whenever the persisted query cache already has `activeJob`).
  const [restoredJobId, setRestoredJobId] = useState<string | null>(null);
  const [restoreDismissed, setRestoreDismissed] = useState(false);
  const [resumeChecked, setResumeChecked] = useState(false);
  useEffect(() => {
    let alive = true;
    void loadLastActiveJob().then((la) => {
      if (!alive) return;
      if (la) setRestoredJobId(wasJobRestored(la, la.id) ? la.id : null);
      setResumeChecked(true);
    });
    return () => {
      alive = false;
    };
  }, []);

  const persistedJobStatus = useRef<string | null>(null);
  useEffect(() => {
    if (!resumeChecked) return; // let the offline_resume read above see the stored value first
    const d = jobQ.data;
    if (d === undefined) return; // loading or errored — keep whatever's stored
    if (d === null) {
      persistedJobStatus.current = null;
      void clearLastActiveJob();
      return;
    }
    if (d.status === persistedJobStatus.current) return;
    persistedJobStatus.current = d.status;
    if (ACTIVE.includes(d.status)) void saveLastActiveJob(d);
    else void clearLastActiveJob();
  }, [jobQ.data, resumeChecked]);

  // ── Pre-pickup drop (D-33) ──────────────────────────────────────────────────────────────────────
  const [dropping, setDropping] = useState(false);
  // `cancel_blocked` (kit RR.cancel_blocked): post-collection the server refuses a drop (FOOD_DROPPABLE
  // mirrors food-dispatch.service.ts). The button used to just vanish; this opens the card that says
  // why and names the routes that DO exist.
  const [showCancelBlocked, setShowCancelBlocked] = useState(false);
  // `pay_merchant` (kit RR.pay_merchant): the rider's own acknowledgement that they handed the goods
  // total over at a `pay_upfront` counter. Session-local on purpose — there is no rider-side "I paid
  // the merchant" endpoint to record it against (see PayMerchantCard), and the 4-digit pickup code is
  // the real gate either way. An app kill re-shows the instruction, which costs a tap and can't
  // mislead; the alternative (persisting a payment claim the server never saw) could.
  const [paidMerchant, setPaidMerchant] = useState(false);
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
  // Frozen the same way `deliveredFood` is, and for the same reason: an `undelivered` order drops out
  // of activeForRider on the next poll, taking the restaurant's pin and the cash-rule with it — and
  // those are exactly what the `return_rest` leg below needs to tell the rider where the food goes.
  const [undeliveredFood, setUndeliveredFood] = useState<{
    reason: "unreachable" | "refused";
    orderId: string;
    pickupLandmark: string | null;
    pickupPoint: { lat: number; lng: number } | null;
    merchantCashRule: "collect_and_return" | "pay_upfront" | null;
    merchantGoodsTotal: number | null;
  } | null>(null);
  const freezeUndelivered = (reason: "unreachable" | "refused"): void => {
    const o = orderRef.current;
    const fo = foodOrderRef.current;
    if (!o) return;
    setUndeliveredFood({
      reason,
      orderId: o.id,
      pickupLandmark: o.pickup.landmark || null,
      pickupPoint: o.pickup.point,
      merchantCashRule: fo?.merchantCashRule ?? null,
      merchantGoodsTotal: fo?.merchantGoodsTotal ?? null,
    });
  };
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
      freezeUndelivered("unreachable");
      refresh();
    },
    onError: (e) => fail(e),
  });
  const refusedM = useMutation({
    mutationFn: () => reportFoodCustomerRefused(orderId!),
    onSuccess: () => {
      freezeUndelivered("refused");
      refresh();
    },
    onError: (e) => fail(e),
  });
  const [showUnreachable, setShowUnreachable] = useState(false);

  // The `return_rest` leg's one server-confirmed beat: `collect_and_return` opens a merchant debt at
  // pickup and the merchant's own `confirmGoodsReturned` settles it as `settled_goods`. Polled off the
  // frozen id (the order is out of activeForRider by now), and stopped the moment it's no longer open —
  // same shape as `returnLegQ` on the delivered branch, a separate key because it's a separate leg.
  const goodsReturnQ = useQuery({
    queryKey: ["foodGoodsReturn", undeliveredFood?.orderId],
    queryFn: () => getFoodOrderAsRider(undeliveredFood!.orderId),
    enabled: undeliveredFood != null,
    refetchInterval: (q) => (q.state.data ? (q.state.data.debtStatus === "open" ? 5000 : false) : 5000),
  });

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
  const needsClock = order != null && !deliveredFood && !undeliveredFood && !(order.status === "cancelled" && !ackedHandbacks.has(order.id));
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
              {/* `r-rider.jsx` return_cash: this banner is about money in your pocket, so it reads
                  with the banknote mark, not the generic alert triangle. */}
              <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 9 }}>
                <Icon name="banknote" size={18} color={tokens.color.danger} />
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

  if (undeliveredFood) {
    // `return_rest` (kit RR.return_rest): the food is still on the bike. Until the kitchen confirms it
    // back, "you're free for the next job" is only true of the dispatch — so the return leg leads and
    // the freed-up line waits for the hand-back.
    const returned = goodsReturnQ.data?.debtStatus != null && goodsReturnQ.data.debtStatus !== "open";
    return (
      <Screen>
        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: tokens.space.md }}>
            <Heading>Your job</Heading>
            <View style={{ flex: 1 }} />
            <StatusPill status="undelivered" tone="offline" dot />
          </View>
          <Card>
            {/* Terminal grammar (kit `rider-screens.jsx` Undelivered / terminals.tsx): the bad news
                rides in a danger-wash circle, not in a bare red line of type. */}
            <View style={{ flexDirection: "row", alignItems: "center", gap: tokens.space.sm, marginBottom: tokens.space.sm }}>
              <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: tokens.color.dangerWash, alignItems: "center", justifyContent: "center" }}>
                <Icon name="circle-alert" size={18} color={tokens.color.danger} />
              </View>
              <Text style={{ fontSize: tokens.font.size.bodyLg, fontWeight: tokens.font.weight.bold, color: tokens.color.danger }}>
                {undeliveredFood.reason === "refused" ? "Marked as customer refused" : "Marked as no-show"}
              </Text>
            </View>
            <Text style={{ fontSize: tokens.font.size.body, color: tokens.color.muted, lineHeight: 20 }}>
              {undeliveredFood.reason === "refused"
                ? "The customer's cash access is now on hold for food orders — mobile money only from here on."
                : "Recorded after your wait and logged calls. The customer has been told."}
            </Text>
          </Card>

          <ReturnToRestaurantCard
            merchantName={undeliveredFood.pickupLandmark}
            pickupPoint={undeliveredFood.pickupPoint}
            cashRule={undeliveredFood.merchantCashRule}
            frontedAmount={undeliveredFood.merchantGoodsTotal}
            debtStatus={goodsReturnQ.data?.debtStatus ?? null}
          />

          <GetHelpControl orderId={undeliveredFood.orderId} />
          <Button
            label={returned ? "Back to board" : "Back to board — I'll return the food"}
            variant={returned ? "primary" : "ghost"}
            onPress={() => router.replace("/rider")}
          />
          <View style={{ height: tokens.space.xxl }} />
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
            {/* Same icon-in-a-circle terminal header the parcel hand-back uses (ui/rider/terminals.tsx). */}
            <View style={{ flexDirection: "row", alignItems: "center", gap: tokens.space.sm, marginBottom: tokens.space.sm }}>
              <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: tokens.color.dangerWash, alignItems: "center", justifyContent: "center" }}>
                <Icon name="circle-alert" size={18} color={tokens.color.danger} />
              </View>
              <Text style={{ fontSize: tokens.font.size.bodyLg, fontWeight: tokens.font.weight.bold, color: tokens.color.danger }}>
                This order was cancelled
              </Text>
            </View>
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

  // `generic_error` (kit rider-screens.jsx `GenericError`). A FAILED READ is not "you have no work" —
  // but that is exactly what this screen used to say, because a `jobQ`/`foodQ` error fell straight
  // through the `!order` branch below into "No active job". For a rider carrying somebody's dinner,
  // that is the single most alarming wrong answer the app can give. The kit's copy leads with the one
  // thing that matters and is provably true: a read that failed changed nothing server-side.
  if ((jobQ.isError && !order) || (foodQ.isError && !foodOrder)) {
    return (
      <Screen>
        <RiderErrorState
          onRetry={() => {
            void jobQ.refetch();
            void foodQ.refetch();
          }}
          retrying={jobQ.isFetching || foodQ.isFetching}
          onBack={() => router.replace("/rider")}
        />
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
  // `pay_merchant` applies to exactly one variant: a CASH order at a kitchen that wants paying before
  // it releases the food (`foodOfferVariant`'s `cash_upfront`, which is what the rider accepted on the
  // offer card). A `collect_and_return` kitchen hands the food over unpaid, so it must never show here.
  const payUpfront = cashOrder && foodOrder.merchantCashRule === "pay_upfront" && foodOrder.merchantPaymentConfirmedAt == null;
  const needsPayMerchant = payUpfront && order.status === "en_route_pickup" && !paidMerchant;
  const restored = restoredJobId != null && restoredJobId === order.id && !restoreDismissed && isActive;

  return (
    <Screen>
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: tokens.space.sm, marginBottom: tokens.space.md }}>
          <Icon name="utensils" size={18} color={tokens.color.accentText} />
          <Heading>Your job</Heading>
          <View style={{ flex: 1 }} />
          <StatusPill status={order.status} tone={orderStatusTone(order.status)} />
        </View>

        {/* `offline_resume`: the app was killed mid-job and came straight back to it. */}
        {restored ? <JobRestoredBanner onDismiss={() => setRestoreDismissed(true)} /> : null}

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

        {/* `pay_merchant` (kit RR.pay_merchant, "R2·2"): at a pay-upfront counter the rider's own cash
            goes over the counter BEFORE the code is read out, so the amount gets a screen of its own
            rather than a line inside the code card — the whole risk of this variant is handing over the
            wrong figure (the delivery fee is not part of it). */}
        {needsPayMerchant ? (
          <PayMerchantCard
            goodsTotal={foodOrder.merchantGoodsTotal ?? 0}
            deliveryFee={foodOrder.deliveryFee ?? 0}
            merchantName={order.pickup.landmark || null}
            onConfirm={() => setPaidMerchant(true)}
          />
        ) : order.status === "en_route_pickup" ? (
          <PickupCodeCard
            code={pickupCode}
            onChangeCode={setPickupCode}
            attempts={pickupAttempts}
            pending={pendingOrQueued(confirmPickupM)}
            onConfirm={() => confirmPickupM.mutate()}
            paid={foodOrder.merchantPaymentConfirmedAt != null}
            paidReference={foodOrder.merchantPaymentReference}
            amountDue={cashOrder ? total : null}
          />
        ) : next ? (
          <Button label={next.label} onPress={() => advanceM.mutate(next.to)} loading={pendingOrQueued(advanceM)} />
        ) : null}

        {order.status === "en_route_dropoff" ? (
          cashOrder && hState !== "confirmed" ? (
            <RiderCashHandshakeCard
              state={hState}
              amount={foodOrder.cashHandshakeAmount ?? total ?? 0}
              confirmedAt={foodOrder.customerCashConfirmedAt ?? null}
              nowMs={nowMs}
              onConfirm={() => confirmCashM.mutate()}
              onDispute={() => disputeCashM.mutate()}
              busy={pendingOrQueued(confirmCashM, disputeCashM)}
            />
          ) : codeReady ? (
            <DeliveryOtp code={deliveryCode} onChangeCode={setDeliveryCode} otpTries={otpTries} pending={pendingOrQueued(deliverM)} onConfirm={() => deliverM.mutate()} senderPhone={order.counterpartyPhone} />
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
              logPending={pendingOrQueued(logCallM)}
              reportPending={pendingOrQueued(noShowM, refusedM)}
            />
          ) : (
            <Button label="Can't reach the customer?" variant="ghost" onPress={() => setShowUnreachable(true)} />
          )
        ) : null}

        {isActive ? <SosControl orderId={order.id} lat={riderPoint?.lat} lng={riderPoint?.lng} /> : null}

        {FOOD_DROPPABLE.has(order.status) ? (
          dropping ? (
            <BailSheet reason={dropReason} onChangeReason={setDropReason} pending={pendingOrQueued(dropM)} onConfirm={() => dropM.mutate()} onDismiss={() => setDropping(false)} />
          ) : (
            <Button label="Drop this job" variant="ghost" onPress={() => setDropping(true)} />
          )
        ) : isActive ? (
          /* `cancel_blocked` (kit RR.cancel_blocked, "R2·b2"): once the food is on the bike the server
             refuses a drop, and the control simply disappeared — leaving a rider who wants out with no
             stated way forward, which is exactly how an order ends up on a doorstep. The rule is now
             said out loud, with the three routes that DO exist. */
          showCancelBlocked ? (
            <CancelBlockedCard
              merchantName={order.pickup.landmark || null}
              paidUpfront={foodOrder.merchantCashRule === "pay_upfront" ? foodOrder.merchantGoodsTotal : null}
              onDismiss={() => setShowCancelBlocked(false)}
              alternatives={[
                {
                  icon: "phone",
                  title: "Call the customer",
                  sub: order.counterpartyPhone ? "Ask for a better spot or a gate code" : "Their number isn't available on this job",
                  onPress: order.counterpartyPhone ? () => void Linking.openURL(`tel:${order.counterpartyPhone}`) : undefined,
                },
                {
                  icon: "circle-alert",
                  title: "Get help from LyniaGo",
                  sub: "Use “Get help with this job” below — support decides what happens next",
                },
                {
                  icon: "refresh-cw",
                  title: "Return the food to the restaurant",
                  sub: canReportUnreachable
                    ? "Opens after the wait and two logged calls — use “Can’t reach the customer?”"
                    : "Only once you're at the door and the customer doesn't show",
                },
              ]}
            />
          ) : (
            <Button label="Can I drop this job?" variant="ghost" onPress={() => setShowCancelBlocked(true)} />
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
