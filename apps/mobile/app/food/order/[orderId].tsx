import { ACTIVE_RIDE_STATUSES, tokens } from "@lynia/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
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
import { canCancelFreely } from "../../../src/logic/food-checkout";
import { codeEligible } from "../../../src/logic/food-doorstep";
import { formatMoney } from "../../../src/logic/money";
import { reconcileDeliveryCode, reconcilePendingRating } from "../../../src/logic/order-tracking";
import { clearFoodOrderSnapshot, type FoodOrderSnapshot, loadFoodOrderSnapshot, saveFoodOrderSnapshot } from "../../../src/net/food-order-store";
import { useReachability } from "../../../src/net/use-reachability";
import { orderKey } from "../../../src/query/client";
import { useFoodOrder } from "../../../src/query/use-food-order";
import { useRestaurantMenu } from "../../../src/query/use-restaurants";
import { useOrderSocket } from "../../../src/realtime/use-order-socket";
import { Button, Card, EmptyState, OfflineBanner, Screen, SkeletonList, Stepper, useActionError, useToast } from "../../../src/ui";
import { FoodOrderAwaitingAcceptView } from "../../../src/ui/food/FoodOrderAwaitingAcceptView";
import { FoodOrderAwaitingPaymentView } from "../../../src/ui/food/FoodOrderAwaitingPaymentView";
import { FoodOrderCancelledView } from "../../../src/ui/food/FoodOrderCancelledView";
import { FoodOrderDeliveredView } from "../../../src/ui/food/FoodOrderDeliveredView";
import { OrderHeader, Row } from "../../../src/ui/food/FoodOrderHelpers";
import { FoodOrderItemApprovalView } from "../../../src/ui/food/FoodOrderItemApprovalView";
import { FoodOrderLiveTrackerView } from "../../../src/ui/food/FoodOrderLiveTrackerView";
import { FoodOrderPreparingView } from "../../../src/ui/food/FoodOrderPreparingView";
import { FoodOrderReadyForPickupView } from "../../../src/ui/food/FoodOrderReadyForPickupView";
import { FoodOrderRefundPendingView } from "../../../src/ui/food/FoodOrderRefundPendingView";
import { FoodOrderRiderDroppedView } from "../../../src/ui/food/FoodOrderRiderDroppedView";
import { FoodOrderUndeliveredView } from "../../../src/ui/food/FoodOrderUndeliveredView";

// D3 (track): once dispatched a food order rides the SAME assigned→…→en_route_dropoff edges as a
// parcel (order-lifecycle.service.ts: "the food order rides the same edges as a parcel from here on,
// orderType: both") — the status-keyed set B4/the parcel tracker already use, gating which branch
// below renders (the branch body itself, incl. the other status-keyed sets, is FoodOrderLiveTrackerView).
const ACTIVE = ACTIVE_RIDE_STATUSES as string[];

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

  // Kit `resume`: the restart snapshot this screen already writes, read back once on mount so a cold
  // start mid-order warm-paints where the order stood instead of a bare skeleton. Best-effort and
  // read-only — the live fetch is always the source of truth the moment it lands.
  const [warmSnapshot, setWarmSnapshot] = useState<FoodOrderSnapshot | null>(null);
  useEffect(() => {
    let cancelled = false;
    void loadFoodOrderSnapshot().then((snap) => {
      if (!cancelled) setWarmSnapshot(snap);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  const [busy, setBusy] = useState(false);
  // Action errors speak once as an auto-dismissing toast, never as a persistent card
  // (owner instruction 2026-08-12). Same `setError(msg)` shape as the useState setter it replaces.
  const setError = useActionError();
  const [referenceInput, setReferenceInput] = useState("");
  // Tapping "Pay now" from the still-unpaid reminder (R5·b1) jumps straight to the manual-rail pay
  // screen, bypassing the reminder gate — otherwise the elapsed-time check would just show it again.
  const [forcePayScreen, setForcePayScreen] = useState(false);
  // D3: the post-dispatch cancel is a confirm-first action (a rider is already committed), mirroring
  // app/order/[id].tsx's MATCHED_CANCEL pattern.
  const [cancelConfirm, setCancelConfirm] = useState(false);
  // Ticks once a second so the two server-deadline countdown rings move — the deadlines themselves
  // are server timestamps (acceptDeadlineAt/itemApprovalDeadlineAt), this only drives the redraw.
  // B-O8: only the awaiting_accept/awaiting_item_approval/awaiting_payment/preparing phases and the
  // post-dispatch live tracker actually read `now` (see the branches below) — ready_for_pickup,
  // undelivered, delivered/completed and cancelled never do, so the interval stays off there instead
  // of re-rendering this screen once/sec for the rest of the order's lifetime.
  const [now, setNow] = useState(() => Date.now());
  const needsClock =
    !!order &&
    (order.merchantPhase === "awaiting_accept" ||
      order.merchantPhase === "awaiting_item_approval" ||
      order.merchantPhase === "awaiting_payment" ||
      order.merchantPhase === "preparing" ||
      (order.riderId != null && ACTIVE.includes(order.status)));
  useEffect(() => {
    if (!needsClock) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [needsClock]);

  // D3: once a rider is secured (dispatch_accept clears merchantPhase to null and sets riderId), the
  // customer's pickup/dropoff geometry, GPS telemetry, event timeline and counterparty phone all live
  // on the GENERIC order record — the same one a parcel tracks (this order's `orderType` is "merchant",
  // but `getSnapshot` carries no orderType filter, only a party-on-the-order check). Sharing the query
  // key with LiveTrackingCard's own internal telemetry observer is what lets that card repaint on GPS
  // ticks without this ~250-line screen re-rendering.
  //
  // A-O9: the order room this tracker joins is the SAME generic `orderRoom(orderId)` a parcel tracks —
  // `canAccessOrder`/`emitOrderStatus`/the `position` GPS push all key off the shared `Order` row with
  // no `orderType` filter (dispatch already pushes `assigned`/`requested` into this exact room via
  // `FoodDispatchService`; `order-lifecycle.service.ts`'s cancel/advance path is shared verbatim too).
  // So `useOrderSocket` — unmodified — subscribes correctly here; the 10s poll below only runs as the
  // reconnect/offline fallback, mirroring the already-audited A-O1 gating on the parcel/rider board.
  const trackingEnabled = order?.riderId != null;
  const { connected: trackerConnected } = useOrderSocket(trackingEnabled ? orderId : null);
  const trackQ = useQuery({
    queryKey: orderKey(orderId),
    queryFn: () => getOrder(orderId),
    enabled: trackingEnabled,
    refetchInterval:
      trackingEnabled && order?.status !== "cancelled" && order?.status !== "completed"
        ? trackerConnected
          ? false
          : 10_000
        : false,
  });

  // D4 (doorstep): the delivery code, loaded/persisted exactly like the parcel screen's own copy
  // (src/auth/device-state.ts, keyed per-order, SecureStore-backed) — restart tolerance for free.
  // Restart tolerance (§3): reloading it on mount is what lets a killed-and-relaunched app still read
  // an already-earned CASH code offline at the door (DeliveryCodeCard's reveal touches no network).
  const [deliveryCode, setDeliveryCode] = useState<string | null>(null);
  const [codeAttemptsSeen, setCodeAttemptsSeen] = useState<number | null>(null);
  const [codeRotatedAtSeen, setCodeRotatedAtSeen] = useState<string | null>(null);
  // Whether the restore above has SETTLED (mirrors app/order/[id].tsx's own `codeRestored`): a plain
  // `null` conflates "not read yet" with "no code held", and DeliveryCodeCard renders the second as
  // `unavailableHint` + an inert press-and-hold. A customer who already earned their code would be
  // told it "appears once you and your rider both confirm the cash" until the keychain read lands.
  const [codeRestored, setCodeRestored] = useState(false);
  useEffect(() => {
    if (!orderId) return;
    let alive = true;
    void Promise.all([loadDeliveryCode(orderId), loadDeliveryCodeAttempts(orderId), loadDeliveryCodeRotatedAt(orderId)]).then(([c, hw, rotAt]) => {
      if (!alive) return;
      setDeliveryCode(c);
      setCodeAttemptsSeen(hw);
      setCodeRotatedAtSeen(rotAt);
      setCodeRestored(true);
    })
      // Belt-and-braces, mirroring app/order/[id].tsx: `codeRestored` also gates the code-fetch effect
      // below, so stranding it false on a rejected read would mean no restore AND no fetch.
      .catch(() => {
        if (alive) setCodeRestored(true);
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

  // R6·b6 (rider dropped): `food-dispatch.service.ts:dropDispatch` (D-33) puts a SECURED food order
  // straight back to `requested` / `merchantPhase: "ready_for_pickup"` with `riderId` cleared — byte
  // for byte the same shape as an order that has never had a rider at all. What tells them apart is
  // that we SAW one, so latch it — from the live `riderId`, OR from the restart snapshot for THIS
  // order, so a cold start after the drop still shows the specific rider-dropped screen rather than a
  // generic "finding a rider". The latch only ever goes true (never back to false).
  const [sawRider, setSawRider] = useState(false);
  useEffect(() => {
    if (order?.riderId != null) setSawRider(true);
  }, [order?.riderId]);
  useEffect(() => {
    if (warmSnapshot?.orderId === orderId && warmSnapshot.sawRider) setSawRider(true);
  }, [warmSnapshot, orderId]);
  const riderDropped = sawRider && order != null && order.riderId == null && order.merchantPhase === "ready_for_pickup";

  // The drop also clears `otpHash` and resets `deliveryOtpAttempts` server-side, so a delivery code
  // this device is still holding is dead. Forget it the moment the drop is seen — otherwise the
  // customer confidently reads a dead code to the NEXT rider and burns that rider's attempts toward a
  // lockout. A fresh one is fetched by the effect below once the new trip reaches en_route_dropoff.
  useEffect(() => {
    if (!riderDropped || !deliveryCode) return;
    setDeliveryCode(null);
    setCodeAttemptsSeen(null);
    setCodeRotatedAtSeen(null);
    void clearDeliveryCode(orderId);
  }, [riderDropped, deliveryCode, orderId]);

  // R-09: unlike a parcel (issued its code at `select`), a food order has no client-side "choose a
  // rider" moment to fetch one from — nobody has asked the server for a code yet by the time the trip
  // reaches `en_route_dropoff`. WALLET is eligible immediately; CASH only once both handshake confirms
  // land (server-enforced — rotateDeliveryCode 409s otherwise, this effect just avoids firing that).
  // Fires at most once per code (guarded on `deliveryCode` already being set) and never while offline.
  // Also waits for `codeRestored`: the restore effect above is async, so on a cold mount already at
  // `en_route_dropoff` this would otherwise see a not-yet-restored `null`, decide no code exists and
  // re-issue one the customer already holds — racing the restore to set state, and burning a rotation.
  const codeFetchInFlight = useRef(false);
  useEffect(() => {
    if (!order || order.status !== "en_route_dropoff" || !codeRestored || deliveryCode || !reachable || codeFetchInFlight.current) return;
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
  }, [order, codeRestored, deliveryCode, reachable, orderId]);

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

  // Restart survival (RESTAURANTS-DECISIONS.md §3): remember this order's id/status + the sawRider
  // latch so a killed-and-relaunched app can warm-paint it (and still know a rider had been secured);
  // cleared once the order reaches a terminal cancelled state. `sawRider` is in the deps so the
  // moment the latch flips true the snapshot is re-written, before any drop can strip the live signal.
  useEffect(() => {
    if (!order) return;
    if (order.status === "cancelled") void clearFoodOrderSnapshot();
    else void saveFoodOrderSnapshot(order.id, order.status, order.merchantPhase, sawRider);
  }, [order, sawRider]);

  if (isLoading && !order) {
    return (
      <Screen>
        <Text style={{ fontSize: 19, fontWeight: "700", marginBottom: 14 }}>Your order</Text>
        {/* Warm paint (kit `resume`): the snapshot this screen has always WRITTEN is now also read, so a
            cold start / app-kill mid-order shows where the order actually stood instead of a bare
            skeleton. Only for THIS order id, and only until the live fetch lands. */}
        {warmSnapshot && warmSnapshot.orderId === orderId ? (
          <Card>
            <Text style={{ fontSize: tokens.font.size.body, color: tokens.color.muted }}>
              Picking up where you left off — your order is still live, nothing was lost.
            </Text>
            <View style={{ marginTop: tokens.space.sm }}>
              <Stepper events={[]} currentStatus={warmSnapshot.status} view="customer" jobType="food" merchantPhase={warmSnapshot.merchantPhase} />
            </View>
          </Card>
        ) : null}
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

  // ── Terminal: cancelled AFTER the money had already gone out, with no refund recorded (R6·b3) ────
  // Ahead of FoodOrderCancelledView deliberately. Two shipped paths land here: the customer submits a
  // reference and the merchant releases the order instead of confirming it, or the merchant confirms
  // payment and the order then dies on the NO_RIDER cap (which writes `rejectionReason: "no_rider"`
  // and never touches the refund fields — `refundOrder` is the only writer of `refundedAt`, and it's
  // scoped to the merchant's own pre-dispatch cancel). The second case is why this must come first:
  // the cancelled view's no_rider copy promises "nothing was charged", which is a lie on an order that
  // had already paid. CASH is excluded — nothing is pre-paid on that rail, so there's nothing to
  // refund (the doorstep handshake is its own path).
  const paidOut = order.paymentMethod !== "cash" && (order.merchantPaymentConfirmedAt != null || order.merchantPaymentReference != null);
  if (order.status === "cancelled" && paidOut && order.refundedAt == null) {
    return (
      <FoodOrderRefundPendingView
        order={order}
        restaurantName={restaurantName}
        reachable={reachable}
        onGetHelp={() => router.push("/help")}
        onBrowse={() => router.replace("/food")}
      />
    );
  }

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

  // ── awaiting_accept: extracted to FoodOrderAwaitingAcceptView (RF-18) ───────────────────────────
  if (order.merchantPhase === "awaiting_accept") {
    return (
      <FoodOrderAwaitingAcceptView
        order={order}
        restaurantName={restaurantName}
        reachable={reachable}
        now={now}
        cancelFooter={CancelFooter}
      />
    );
  }

  // ── awaiting_item_approval: extracted to FoodOrderItemApprovalView (RF-18) ──────────────────────
  if (order.merchantPhase === "awaiting_item_approval") {
    return (
      <FoodOrderItemApprovalView
        order={order}
        restaurantName={restaurantName}
        reachable={reachable}
        now={now}
        busy={busy}
        onApprove={(approve) => void approveItems(approve)}
      />
    );
  }

  // ── awaiting_payment: extracted to FoodOrderAwaitingPaymentView (RF-18) ─────────────────────────
  if (order.merchantPhase === "awaiting_payment") {
    return (
      <FoodOrderAwaitingPaymentView
        order={order}
        restaurantName={restaurantName}
        reachable={reachable}
        now={now}
        busy={busy}
        forcePayScreen={forcePayScreen}
        onForcePay={() => setForcePayScreen(true)}
        referenceInput={referenceInput}
        onReferenceChange={setReferenceInput}
        onSubmitReference={() => void submitReference()}
        onCancelFree={() => void cancelUnpaid()}
        // P1 (navigation review): the pay screen's back must stay INSIDE the live order. When the
        // customer forced it open from the "still waiting · Pay now" overview, back returns to that
        // overview (un-force) rather than popping the whole order off the stack and ejecting them from
        // a live, unpaid order. (Reached directly — payment already requested — there is no in-order
        // overview to return to, so it falls back to a plain pop.)
        onBack={() => (forcePayScreen ? setForcePayScreen(false) : router.back())}
        cancelFooter={CancelFooter}
      />
    );
  }

  // ── preparing: extracted to FoodOrderPreparingView (RF-18) ──────────────────────────────────────
  if (order.merchantPhase === "preparing") {
    return <FoodOrderPreparingView order={order} restaurantName={restaurantName} reachable={reachable} now={now} />;
  }

  // ── ready_for_pickup, but a rider had ALREADY been secured and dropped it (R6·b6) ───────────────
  // Same server state as a first-time search, so it branches on the session latch above. Named
  // explicitly rather than letting the tracker silently rewind a step with no explanation.
  if (riderDropped) {
    return <FoodOrderRiderDroppedView order={order} restaurantName={restaurantName} reachable={reachable} />;
  }

  // ── ready_for_pickup: extracted to FoodOrderReadyForPickupView (RF-18) ──────────────────────────
  if (order.merchantPhase === "ready_for_pickup") {
    return <FoodOrderReadyForPickupView order={order} restaurantName={restaurantName} reachable={reachable} />;
  }

  // ── live tracker: a rider is secured (D-04) — the order rides the generic assigned→…→en_route_dropoff
  // edges from here (fetched via the generic order snapshot, trackQ above). D-27 (plate number) and any
  // rider name/photo/rating can't be shown honestly yet: `MerchantOrderResponse`/`OrderSnapshot` carry no
  // rider identity fields for a food job (dispatch is fully automatic — there's no client-side "choose an
  // offer" moment to cache one from, unlike a parcel). Flagged in the PR body rather than faked. ───────
  if (order.riderId != null && ACTIVE.includes(order.status)) {
    return (
      <FoodOrderLiveTrackerView
        orderId={orderId}
        order={order}
        restaurantName={restaurantName}
        reachable={reachable}
        now={now}
        busy={busy}
        trackData={trackQ.data}
        deliveryCode={deliveryCode}
        codeRestored={codeRestored}
        confirmCashBusy={confirmCashBusy}
        onConfirmCash={() => void confirmCash()}
        onRevealCode={() => void saveCodeRevealedAt(orderId, new Date().toISOString())}
        cancelConfirm={cancelConfirm}
        onCancelConfirmChange={setCancelConfirm}
        onCancelActive={() => void cancelActive()}
      />
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
    return (
      <FoodOrderDeliveredView
        order={order}
        restaurantName={restaurantName}
        reachable={reachable}
        events={trackQ.data?.events}
        rateBusy={rateBusy}
        onRate={(n) => void rateFood(n)}
        onArmRating={(n) => {
          // Armed live this session — RatingCard's own timer/unmount flush is the sole committer;
          // keep the reconcile effect from firing it immediately and skipping the undo window.
          ratingFromStorage.current = false;
          setPendingRating({ orderId, score: n });
          void savePendingRating(orderId, n);
        }}
        onUndoRating={() => {
          setPendingRating(null);
          void clearPendingRating();
        }}
        onOrderElsewhere={() => router.replace("/food")}
      />
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
