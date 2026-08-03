import { ACTIVE_RIDE_STATUSES, CUSTOMER_CANCELLABLE_STATUSES, RESTAURANTS_TIMING, tokens } from "@lynia/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { ScrollView, Text, View } from "react-native";
import { ApiError } from "../../../src/api/client";
import { cancelUnpaidFoodOrder, confirmFoodCustomerCash, respondToFoodOrderItems, submitFoodPaymentReference } from "../../../src/api/food-orders";
import { cancelOrder, getOrder, rateOrder, rotateDeliveryCode } from "../../../src/api/orders";
import {
  clearDeliveryCode,
  clearPendingRating,
  loadDeliveryCode,
  loadDeliveryCodeAttempts,
  loadDeliveryCodeRotatedAt,
  loadPendingRating,
  saveCodeRevealedAt,
  saveDeliveryCode,
  saveDeliveryCodeAttempts,
  saveDeliveryCodeRotatedAt,
  savePendingRating,
  type PendingRating,
} from "../../../src/auth/session";
import { canCancelFreely, isStillUnpaidReminderDue } from "../../../src/logic/food-checkout";
import { codeEligible, handshakeState } from "../../../src/logic/food-doorstep";
import { fmtClock } from "../../../src/logic/format-time";
import { formatMoney } from "../../../src/logic/money";
import { reconcileDeliveryCode, reconcilePendingRating } from "../../../src/logic/order-tracking";
import { clearFoodOrderSnapshot, saveFoodOrderSnapshot } from "../../../src/net/food-order-store";
import { useReachability } from "../../../src/net/use-reachability";
import { orderKey } from "../../../src/query/client";
import { useFoodOrder } from "../../../src/query/use-food-order";
import { useRestaurantMenu } from "../../../src/query/use-restaurants";
import { Button, Card, EmptyState, ErrorText, Field, Icon, OfflineBanner, Screen, SkeletonCard, SkeletonList, Stepper, useToast } from "../../../src/ui";
import { CashHandshakeCard } from "../../../src/ui/food/CashHandshakeCard";
import { CountdownRing, formatCountdown } from "../../../src/ui/food/CountdownRing";
import { DeliveryCodeCard } from "../../../src/ui/food/DeliveryCodeCard";
import { FoodOrderCancelledView } from "../../../src/ui/food/FoodOrderCancelledView";
import { OrderHeader, Row } from "../../../src/ui/food/FoodOrderHelpers";
import { FoodOrderUndeliveredView } from "../../../src/ui/food/FoodOrderUndeliveredView";
import { ManualPayRail } from "../../../src/ui/food/ManualPayRail";
import { PriceMath } from "../../../src/ui/food/PriceMath";
import { LiveTrackingCard } from "../../../src/ui/order/LiveTrackingCard";
import { RatingCard } from "../../../src/ui/order/RatingCard";
import { GetHelpControl, SosControl } from "../../../src/ui/safety";

// D3 (track): once dispatched a food order rides the SAME assigned→…→en_route_dropoff edges as a
// parcel (order-lifecycle.service.ts: "the food order rides the same edges as a parcel from here on,
// orderType: both") — these are the shared, status-keyed sets B4/the parcel tracker already use.
const ACTIVE = ACTIVE_RIDE_STATUSES as string[];
const CUSTOMER_CANCELLABLE = new Set<string>(CUSTOMER_CANCELLABLE_STATUSES);
// Post-pickup cancels get the harsher "it's already on the bike" warning, mirroring app/order/[id].tsx.
const POST_PICKUP_CANCEL = new Set<string>(["picked_up", "en_route_dropoff"]);

const TRACK_STATUS_LABEL: Record<string, string> = {
  assigned: "Rider secured",
  confirmed: "At the restaurant",
  en_route_pickup: "Picking up",
  picked_up: "Picked up",
  en_route_dropoff: "On the way",
};

export default function FoodOrderScreen(): React.ReactElement {
  const { orderId: param } = useLocalSearchParams<{ orderId: string }>();
  const orderId = typeof param === "string" ? param : "";
  const router = useRouter();
  const toast = useToast();
  const qc = useQueryClient();
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
  // D3: the post-dispatch cancel is a confirm-first action (a rider is already committed), mirroring
  // app/order/[id].tsx's MATCHED_CANCEL pattern.
  const [cancelConfirm, setCancelConfirm] = useState(false);
  // Ticks once a second so the two server-deadline countdown rings move — the deadlines themselves
  // are server timestamps (acceptDeadlineAt/itemApprovalDeadlineAt), this only drives the redraw.
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  // D3: once a rider is secured (dispatch_accept clears merchantPhase to null and sets riderId), the
  // customer's pickup/dropoff geometry, GPS telemetry, event timeline and counterparty phone all live
  // on the GENERIC order record — the same one a parcel tracks (this order's `orderType` is "merchant",
  // but `getSnapshot` carries no orderType filter, only a party-on-the-order check). Sharing the query
  // key with LiveTrackingCard's own internal telemetry observer is what lets that card repaint on GPS
  // ticks without this ~250-line screen re-rendering. No WebSocket wired here (unlike the parcel
  // screen's useOrderSocket) — plain poll while a rider is on the job; open item, see the PR body.
  const trackingEnabled = order?.riderId != null;
  const trackQ = useQuery({
    queryKey: orderKey(orderId),
    queryFn: () => getOrder(orderId),
    enabled: trackingEnabled,
    refetchInterval: trackingEnabled && order?.status !== "cancelled" && order?.status !== "completed" ? 10_000 : false,
  });

  // D4 (doorstep): the delivery code, loaded/persisted exactly like the parcel screen's own copy
  // (src/auth/device-state.ts, keyed per-order, SecureStore-backed) — restart tolerance for free.
  // Restart tolerance (§3): reloading it on mount is what lets a killed-and-relaunched app still read
  // an already-earned CASH code offline at the door (DeliveryCodeCard's reveal touches no network).
  const [deliveryCode, setDeliveryCode] = useState<string | null>(null);
  const [codeAttemptsSeen, setCodeAttemptsSeen] = useState<number | null>(null);
  const [codeRotatedAtSeen, setCodeRotatedAtSeen] = useState<string | null>(null);
  useEffect(() => {
    if (!orderId) return;
    let alive = true;
    void Promise.all([loadDeliveryCode(orderId), loadDeliveryCodeAttempts(orderId), loadDeliveryCodeRotatedAt(orderId)]).then(([c, hw, rotAt]) => {
      if (!alive) return;
      setDeliveryCode(c);
      setCodeAttemptsSeen(hw);
      setCodeRotatedAtSeen(rotAt);
    });
    return () => {
      alive = false;
    };
  }, [orderId]);

  // KB-DELIVERY-CODE-ROTATION-SIGNAL (mirrors app/order/[id].tsx verbatim): a stale local code, held
  // across a re-issue that happened while the app was killed, must not keep painting as "showing" — the
  // customer would confidently relay a dead code and burn the rider's attempts toward a lockout.
  useEffect(() => {
    const decision = reconcileDeliveryCode({
      hasLocalCode: deliveryCode != null,
      storedAttemptsHighWater: codeAttemptsSeen,
      snapshotAttempts: trackQ.data?.deliveryOtpAttempts ?? null,
      storedCodeRotatedAt: codeRotatedAtSeen,
      snapshotCodeRotatedAt: trackQ.data?.codeRotatedAt ?? null,
    });
    if (decision.action === "invalidate") {
      setDeliveryCode(null);
      setCodeAttemptsSeen(null);
      setCodeRotatedAtSeen(null);
      void clearDeliveryCode(orderId);
    } else if (decision.action === "advance-highwater") {
      setCodeAttemptsSeen(decision.attempts);
      void saveDeliveryCodeAttempts(orderId, decision.attempts);
    } else if (decision.action === "sync-rotation-ts") {
      setCodeRotatedAtSeen(decision.codeRotatedAt);
      void saveDeliveryCodeRotatedAt(orderId, decision.codeRotatedAt);
    }
  }, [trackQ.data, deliveryCode, codeAttemptsSeen, codeRotatedAtSeen, orderId]);

  // R-09: unlike a parcel (issued its code at `select`), a food order has no client-side "choose a
  // rider" moment to fetch one from — nobody has asked the server for a code yet by the time the trip
  // reaches `en_route_dropoff`. WALLET is eligible immediately; CASH only once both handshake confirms
  // land (server-enforced — rotateDeliveryCode 409s otherwise, this effect just avoids firing that).
  // Fires at most once per code (guarded on `deliveryCode` already being set) and never while offline.
  const codeFetchInFlight = useRef(false);
  useEffect(() => {
    if (!order || order.status !== "en_route_dropoff" || deliveryCode || !reachable || codeFetchInFlight.current) return;
    const eligible = codeEligible({
      paymentMethod: order.paymentMethod,
      customerCashConfirmedAt: order.customerCashConfirmedAt,
      riderCashConfirmedAt: order.riderCashConfirmedAt,
      cashHandshakeFrozenAt: order.cashHandshakeFrozenAt,
    });
    if (!eligible) return;
    codeFetchInFlight.current = true;
    void rotateDeliveryCode(orderId)
      .then((res) => {
        setDeliveryCode(res.deliveryCode);
        setCodeAttemptsSeen(0);
        setCodeRotatedAtSeen(null);
        void saveDeliveryCode(orderId, res.deliveryCode);
      })
      .catch(() => undefined) // best-effort — the next poll tick (or reachability change) retries
      .finally(() => {
        codeFetchInFlight.current = false;
      });
  }, [order, deliveryCode, reachable, orderId]);

  // D4/R-04: the customer's half of the CASH doorstep handshake — "I gave $X". The rider's own
  // confirm/dispute is the rider app's job (D5), not this screen's.
  const [confirmCashBusy, setConfirmCashBusy] = useState(false);
  const confirmCash = async (): Promise<void> => {
    if (!order) return;
    setConfirmCashBusy(true);
    setError(null);
    try {
      await confirmFoodCustomerCash(order.id);
      void refetch();
      void qc.invalidateQueries({ queryKey: orderKey(orderId) });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't confirm — try again.");
    } finally {
      setConfirmCashBusy(false);
    }
  };

  // D4: a durable "rating still pending for order X" marker — mirrors app/order/[id].tsx's own
  // BH-06 pattern verbatim (same PendingRating shape, same storage) so a cold start after an app-kill
  // mid-undo-window can re-send a rating that never reached the server.
  const [pendingRating, setPendingRating] = useState<PendingRating | null>(null);
  const [rateBusy, setRateBusy] = useState(false);
  const ratingRetryInFlight = useRef(false);
  const ratingFromStorage = useRef(false);
  useEffect(() => {
    let alive = true;
    void loadPendingRating().then((p) => {
      if (alive) {
        setPendingRating(p);
        if (p) ratingFromStorage.current = true;
      }
    });
    return () => {
      alive = false;
    };
  }, []);
  const rateFood = async (score: number): Promise<void> => {
    setRateBusy(true);
    try {
      await rateOrder(orderId, { score });
      setPendingRating((cur) => (cur?.orderId === orderId ? null : cur));
      void clearPendingRating();
      void refetch();
      void qc.invalidateQueries({ queryKey: orderKey(orderId) });
      void qc.invalidateQueries({ queryKey: ["history"] });
    } catch {
      // The armed rating stays in `pendingRating`/storage either way (never dropped) — the reconcile
      // effect below retries it on the next poll/foreground, so a transient failure here is silent by
      // design rather than surfacing a red error under a card that already read "Submitting…".
    } finally {
      setRateBusy(false);
    }
  };
  // Re-send (or retire) a pending rating against the live snapshot — same shape as the parcel screen's
  // own reconcile effect. Fires only while the marker's order is still `delivered` with no rating
  // recorded yet; self-heals on the next poll/foreground without a manual retry.
  useEffect(() => {
    const snap = trackQ.data;
    const decision = reconcilePendingRating({ pending: pendingRating, order: snap ? { id: snap.id, status: snap.status } : null });
    if (decision === "clear") {
      setPendingRating(null);
      void clearPendingRating();
      return;
    }
    if (decision !== "retry" || !pendingRating || ratingRetryInFlight.current || !ratingFromStorage.current) return;
    ratingRetryInFlight.current = true;
    const { orderId: pid, score } = pendingRating;
    void rateOrder(pid, { score })
      .then(() => {
        setPendingRating((cur) => (cur?.orderId === pid ? null : cur));
        void clearPendingRating();
        void qc.invalidateQueries({ queryKey: orderKey(pid) });
        void qc.invalidateQueries({ queryKey: ["history"] });
      })
      .catch(() => undefined)
      .finally(() => {
        ratingRetryInFlight.current = false;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- qc is stable; trackQ.data read fresh each run.
  }, [trackQ.data, pendingRating]);

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

  const cancelUnpaid = async (): Promise<void> => {
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

  // D3: the post-dispatch cancel (a rider already committed, per §5 D3's "cancel sheet") goes through
  // the same generic customer cancel the Express tracker uses — `cancel_customer` is `orderType: "both"`
  // at every status from `open_for_offers` through `en_route_dropoff` (order-lifecycle.transitions.ts).
  // Open item (PR body): whether this auto-refunds an already-paid WALLET order isn't specified anywhere
  // in the transitions table — this reuses the proven, tested Express path rather than guess at new
  // money behaviour.
  const cancelActive = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    try {
      await cancelOrder(order.id);
      toast.show("Order cancelled", "info");
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
    <Button variant="ghost" label="Cancel the order — free" onPress={() => void cancelUnpaid()} disabled={busy} />
  ) : null;

  // ── Terminal: cancelled/rejected — extracted to FoodOrderCancelledView (RF-18) ──────────────────
  if (order.status === "cancelled") {
    return (
      <FoodOrderCancelledView
        order={order}
        restaurantName={restaurantName}
        reachable={reachable}
        onRetry={() => router.replace(`/food/${order.merchantId}`)}
        onBrowse={() => router.replace("/food")}
      />
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
            <Button variant="ghost" label="Cancel the order — free" onPress={() => void cancelUnpaid()} disabled={busy} />
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

  // ── preparing: payment landed (or CASH needs none) — the kitchen has started. Unlike the design
  // mock's "cooking + searching in parallel," this locked architecture dispatches only once the
  // merchant marks the order ready (see C3's own D-04/D-33 note) — so the honest copy here is
  // "we'll look once it's ready," not "we're finding a rider now." D-03: the ring sits ABOVE the same
  // seven-step tracker, not a new timeline component. ──────────────────────────────────────────────
  if (order.merchantPhase === "preparing") {
    const totalMs = (order.prepMinutes ?? 0) * 60_000;
    const startedAt = order.prepStartedAt ? new Date(order.prepStartedAt).getTime() : null;
    const elapsedMs = startedAt ? Math.max(0, now - startedAt) : 0;
    const remainingMin = totalMs > 0 ? Math.max(0, Math.ceil((totalMs - elapsedMs) / 60_000)) : 0;
    return (
      <Screen>
        <OfflineBanner state={reachable ? "online" : "offline"} />
        <OrderHeader restaurantName={restaurantName} pillLabel="Cooking" pillTone="success" />
        <View style={{ alignItems: "center", paddingVertical: tokens.space.lg }}>
          <CountdownRing elapsedMs={elapsedMs} totalMs={totalMs} label={String(remainingMin)} sub="min left" />
          <Text style={{ fontSize: 17, fontWeight: "700", color: tokens.color.ink, marginTop: tokens.space.md, textAlign: "center" }}>
            {restaurantName} is cooking your order
          </Text>
          <Text style={{ fontSize: 13.5, color: tokens.color.muted, textAlign: "center", marginTop: 6, maxWidth: 280 }}>
            We&apos;ll start looking for a rider once it&apos;s ready.
          </Text>
        </View>
        <Stepper events={[]} currentStatus={order.status} view="customer" jobType="food" />
      </Screen>
    );
  }

  // ── ready_for_pickup: dispatch is searching (N-08 60s single-candidate offers, widening radius) or
  // held after the N-07 6-attempt cap (D-34) — non-terminal, waiting on the merchant's resume/cancel,
  // no auto-timeout (a mocked default; flagged in the PR body). ───────────────────────────────────
  if (order.merchantPhase === "ready_for_pickup") {
    const onHold = order.noRiderHoldAt != null;
    return (
      <Screen>
        <OfflineBanner state={reachable ? "online" : "offline"} />
        <OrderHeader restaurantName={restaurantName} pillLabel={onHold ? "Still searching" : "Finding a rider"} pillTone="neutral" />
        <View style={{ alignItems: "center", paddingVertical: tokens.space.lg }}>
          <View style={{ width: 84, height: 84, borderRadius: 42, backgroundColor: tokens.color.accentWash, alignItems: "center", justifyContent: "center", marginBottom: tokens.space.md }}>
            <Icon name="bike" size={34} color={tokens.color.accentText} strokeWidth={1.75} />
          </View>
          <Text style={{ fontSize: 17, fontWeight: "700", color: tokens.color.ink, textAlign: "center" }}>
            {onHold ? "This is taking longer than usual" : "Finding a rider nearby"}
          </Text>
          <Text style={{ fontSize: 13.5, color: tokens.color.muted, textAlign: "center", marginTop: 6, maxWidth: 280 }}>
            {onHold
              ? `Your order from ${restaurantName} is ready and on hold — nothing further happens until a rider is found. You won't be charged extra either way.`
              : `Your order from ${restaurantName} is ready. We're offering it to the nearest riders first — this usually takes a minute or two.`}
          </Text>
        </View>
        <Stepper events={[]} currentStatus={order.status} view="customer" jobType="food" />
        <ErrorText message={error} />
      </Screen>
    );
  }

  // ── live tracker: a rider is secured (D-04) — the order rides the generic assigned→…→en_route_dropoff
  // edges from here (fetched via the generic order snapshot, trackQ above). D-27 (plate number) and any
  // rider name/photo/rating can't be shown honestly yet: `MerchantOrderResponse`/`OrderSnapshot` carry no
  // rider identity fields for a food job (dispatch is fully automatic — there's no client-side "choose an
  // offer" moment to cache one from, unlike a parcel). Flagged in the PR body rather than faked. ───────
  if (order.riderId != null && ACTIVE.includes(order.status)) {
    // D4/money-safety: once the customer has confirmed handing over cash (R-04), a "cancel" no longer
    // means anything sane — the money already left their hands and there's no undo path for it. Kept
    // conservative (hide the action) rather than guessing at a new cancel-after-cash-confirm behaviour.
    const cancellable = CUSTOMER_CANCELLABLE.has(order.status) && !(order.paymentMethod === "cash" && order.customerCashConfirmedAt != null);
    const postPickup = POST_PICKUP_CANCEL.has(order.status);
    const justSecured = order.status === "assigned";
    const atDoor = order.status === "en_route_dropoff";
    const cash = handshakeState({
      paymentMethod: order.paymentMethod,
      customerCashConfirmedAt: order.customerCashConfirmedAt,
      riderCashConfirmedAt: order.riderCashConfirmedAt,
      cashHandshakeFrozenAt: order.cashHandshakeFrozenAt,
    });
    return (
      <Screen>
        <OfflineBanner state={reachable ? "online" : "offline"} />
        {justSecured ? (
          <Card style={{ borderColor: tokens.color.accent, marginBottom: tokens.space.sm }}>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 9 }}>
              <Icon name="circle-check" size={18} color={tokens.color.accentText} />
              <Text style={{ flex: 1, fontSize: 14, fontWeight: "700", color: tokens.color.ink }}>
                Rider secured — {restaurantName} is cooking your order
              </Text>
            </View>
          </Card>
        ) : null}
        <OrderHeader restaurantName={restaurantName} pillLabel={TRACK_STATUS_LABEL[order.status] ?? "On the way"} pillTone="success" />
        <ScrollView showsVerticalScrollIndicator={false}>
          {trackQ.data ? (
            <LiveTrackingCard
              orderId={orderId}
              status={order.status}
              isActive
              jobType="food"
              feeLabel="Order total"
              fare={trackQ.data.agreedFare ?? trackQ.data.proposedFare}
              pickup={trackQ.data.pickup.point}
              dropoff={trackQ.data.dropoff.point}
              events={trackQ.data.events}
              counterpartyPhone={trackQ.data.counterpartyPhone}
              riderIdentity={null}
              connectionState={reachable ? "live" : "reconnecting"}
            />
          ) : (
            <SkeletonCard />
          )}
          {/* D4/R-04/R-09: the CASH doorstep handshake + the (masked, CASH; plain, WALLET) delivery
              code — only relevant once the rider is genuinely at the door. */}
          {atDoor && order.paymentMethod === "cash" ? (
            <>
              <CashHandshakeCard
                state={cash}
                amount={order.cashHandshakeAmount ?? order.total ?? order.merchantGoodsTotal ?? 0}
                confirmedAt={order.customerCashConfirmedAt}
                nowMs={now}
                onConfirm={() => void confirmCash()}
                busy={confirmCashBusy}
              />
              {cash === "confirmed" ? (
                <Card style={{ borderColor: tokens.color.accent, marginBottom: tokens.space.sm }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 9 }}>
                    <Icon name="circle-check" size={18} color={tokens.color.accentText} />
                    <Text style={{ flex: 1, fontSize: 14, fontWeight: "700", color: tokens.color.ink }}>Cash confirmed by both of you</Text>
                  </View>
                </Card>
              ) : null}
              <DeliveryCodeCard
                code={deliveryCode}
                masked
                unavailableHint={
                  cash === "frozen" ? "This order is on hold — support is looking into it." : "Appears once you and your rider both confirm the cash."
                }
                onReveal={() => void saveCodeRevealedAt(orderId, new Date().toISOString())}
              />
            </>
          ) : atDoor ? (
            <DeliveryCodeCard code={deliveryCode} masked={false} unavailableHint="Fetching your code…" />
          ) : null}
          {/* D-28: Express's safety surface, reused verbatim — same riders, same risk, same controls. */}
          <GetHelpControl orderId={orderId} />
          <SosControl orderId={orderId} />
          <ErrorText message={error} />
          {cancellable ? (
            cancelConfirm ? (
              <Card style={{ borderColor: tokens.color.danger }}>
                <Text style={{ fontSize: tokens.font.size.bodyLg, fontWeight: tokens.font.weight.bold, color: tokens.color.ink, marginBottom: tokens.space.xs }}>
                  {postPickup ? "Cancel after pickup?" : "Cancel this order?"}
                </Text>
                <Text style={{ fontSize: tokens.font.size.body, color: tokens.color.muted, lineHeight: 20, marginBottom: tokens.space.sm }}>
                  {postPickup
                    ? `Your rider already has your order from ${restaurantName}. If you cancel now, you'll arrange getting it back directly with them.`
                    : `Your rider is on the way to ${restaurantName}. Cancelling now lets them go — you can order again any time.`}
                </Text>
                <Button
                  label="Yes, cancel this order"
                  onPress={() => {
                    setCancelConfirm(false);
                    void cancelActive();
                  }}
                  loading={busy}
                />
                <Button label="Keep my order" variant="ghost" onPress={() => setCancelConfirm(false)} />
              </Card>
            ) : (
              <Button label="Cancel order" variant="ghost" onPress={() => setCancelConfirm(true)} disabled={busy} />
            )
          ) : null}
        </ScrollView>
      </Screen>
    );
  }

  // ── undelivered: N-10 no-show or R-08 refusal — a thin wrapper around the same terminal a parcel's
  // hand-off failure reaches (markUndelivered), so the reason/attempt-count fields and label map are
  // reused verbatim rather than forked (UNDELIVERED_REASON_LABEL covers both "unreachable"/"refused"
  // already). R-08's cash-ban is a real, undisclosed-until-now consequence — named here, not buried. ──
  if (order.status === "undelivered") {
    return (
      <FoodOrderUndeliveredView
        orderId={orderId}
        restaurantName={restaurantName}
        reachable={reachable}
        reason={trackQ.data?.undeliveredReason}
        attempts={trackQ.data?.undeliveredAttempts}
        onBackToBrowsing={() => router.replace("/food")}
      />
    );
  }

  // ── delivered/completed (D4): the doorstep dual-confirm handshake is done, hand-off complete. The
  // rating card mirrors app/order/[id].tsx's RatingCard verbatim (same component, same undo-window
  // semantics) — re-labelled amount/context only, never forked. `completed` (post-rating) drops the
  // card and just leaves the summary + a way back to browsing. ─────────────────────────────────────
  if (order.status === "delivered" || order.status === "completed") {
    const deliveredEvent = trackQ.data?.events.find((e) => e.status === "delivered");
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
            onRate={(n) => void rateFood(n)}
            onArm={(n) => {
              // Armed live this session — RatingCard's own timer/unmount flush is the sole committer;
              // keep the reconcile effect from firing it immediately and skipping the undo window.
              ratingFromStorage.current = false;
              setPendingRating({ orderId, score: n });
              void savePendingRating(orderId, n);
            }}
            onUndo={() => {
              setPendingRating(null);
              void clearPendingRating();
            }}
          />
        ) : (
          <Button label="Order from somewhere else" onPress={() => router.replace("/food")} />
        )}
        <ErrorText message={error} />
      </Screen>
    );
  }

  // ── Safety net: every merchantPhase (awaiting_accept/awaiting_item_approval/awaiting_payment/
  // preparing/ready_for_pickup) and the post-dispatch riderId branches above are handled — this should
  // be unreachable, kept only so the screen never dead-ends on an unexpected combination. ────────────
  return (
    <Screen>
      <OfflineBanner state={reachable ? "online" : "offline"} />
      <OrderHeader restaurantName={restaurantName} pillLabel="Confirmed" pillTone="success" />
      <Card>
        <Row label="Total" value={formatMoney(order.total ?? order.merchantGoodsTotal ?? 0)} />
      </Card>
    </Screen>
  );
}
