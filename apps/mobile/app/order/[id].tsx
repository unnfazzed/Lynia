import { OFFER_WINDOW_MS, type RatingTag, SOS_POLICY } from "@lynia/shared";
import { tokens } from "@lynia/shared/tokens";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, BackHandler, Linking, Share, useWindowDimensions, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import * as Location from "expo-location";
import { ApiError } from "../../src/api/client";
import { listOffers, selectOffer } from "../../src/api/offers";
import { raiseSos } from "../../src/api/safety";
import { cancelOrder, getOrder, notifyWhenRiderOnline, type OrderSnapshot, raiseOrderPrice, rateOrder, resendOrder, rotateDeliveryCode } from "../../src/api/orders";
import { clearDeliveryCode, clearPendingRating, loadDeliveryCode, loadDeliveryCodeAttempts, loadDeliveryCodeRotatedAt, loadPendingRating, savePendingRating, saveDeliveryCode, saveDeliveryCodeAttempts, saveDeliveryCodeRotatedAt, type PendingRating } from "../../src/auth/session";
import { liveEta } from "../../src/logic/eta";
import type { LastActive } from "../../src/logic/last-active";
import { mapsDirectionsUrl } from "../../src/logic/maps";
import { goHomeClearingStack } from "../../src/logic/nav";
import { buildRebroadcastParams } from "../../src/logic/order-draft";
import { orderOffers } from "../../src/logic/order-offers";
import { isLiveStage, minutesSince, type OrderStage, phoneMasked, resolveStage, showsHelp, stageMapShare, stageTitleKey, stepIndex, suggestedRetryPrice } from "../../src/logic/order-stage";
import { orderLoadErrorKind, reconcileDeliveryCode, reconcilePendingRating, selectOfferReconciled, selectOrderShell, selectRiderTelemetry } from "../../src/logic/order-tracking";
import { loadRiderIdentity, type RiderIdentity, saveRiderIdentity } from "../../src/logic/rider-identity";
import { clearLastActiveOrder, loadLastActiveOrder, saveLastActiveOrder } from "../../src/net/last-active-store";
import { useClaimOfflineBanner } from "../../src/net/offline-banner-owner";
import { useReachability } from "../../src/net/use-reachability";
import { offersKey, orderKey, pendingOrQueued } from "../../src/query/client";
import { useForegroundRefetch } from "../../src/realtime/use-foreground-refetch";
import { useOrderSocket } from "../../src/realtime/use-order-socket";
import { haptic, SkeletonList, useActionErrorEffect, useDial } from "../../src/ui";
import { type OfferView, type ReceiptView, type RiderView } from "../../src/ui/order/cards";
import { hhmm, initials, maskPhone, ORDER_COPY as A, orderText, riderShortName, usd } from "../../src/ui/order/copy";
import { CtaButton, H2, Muted, OrderToast } from "../../src/ui/order/kit";
import { OrderMap, type MapFrame } from "../../src/ui/order/OrderMap";
import { OrderSheet, type OrderSheetHandle } from "../../src/ui/order/OrderSheet";
import { HelpPanel, OrderHeader, PhotoViewer, ReconnectBanner } from "../../src/ui/order/panels";
import {
  CancelBar,
  CancelledSheet,
  cancelReasonText,
  CancelSheet,
  CompletedSheet,
  FindingBar,
  FindingSheet,
  HandoffSheet,
  NotDeliveredSheet,
  OffersSheet,
  OneButtonBar,
  RateBar,
  RatedSheet,
  RateSheet,
  RetryBar,
  RetrySheet,
  type TrackActions,
  TrackSheet,
  type TrackVM,
  TwoButtonBar,
} from "../../src/ui/order/stages";
import { TripIssueSheet } from "../../src/ui/safety";
import { useReduceMotion } from "../../src/ui/useReduceMotion";

/**
 * The customer's order screen — the After Send handoff (`packages/design/handoff/after-send/`, ledger
 * D-53). ONE screen for the whole order: a full-bleed map under the Send flow's header, and a bottom
 * sheet whose content follows the order's stage (finding → offers → to pickup → to drop-off → hand-off
 * → delivered / completed, plus no match, rider cancelled, not delivered, cancelled, GPS paused and
 * offline). Stages never push screens, so Back never walks through old stages: it closes a panel,
 * collapses a full sheet, then leaves for Home.
 *
 * The data plumbing is unchanged from the screen this replaces: the snapshot is subscribed through the
 * telemetry-stripped shell (GPS ticks only reach the map + stage via `selectRiderTelemetry`), the order
 * socket streams status / offers / positions with a socket-gated poll fallback, the handover code is
 * restored from SecureStore and reconciled against server rotations, a select 409 is reconciled before
 * the "just taken" toast, and a rating armed before an app kill is re-sent on the next start (BH-06).
 */

const ACTIVE = new Set(["assigned", "confirmed", "en_route_pickup", "picked_up", "en_route_dropoff"]);
// C2: keep the socket through `cancelled` briefly so a rider-bail `order:rebroadcast` can still land.
const CANCELLED_GRACE_MS = 20_000;
const NOTE_MS = 4_000;
const RATE_UNDO_S = 10;
// The parcel rating tags, index-aligned with the copy's `tg` / `tn` labels.
const PARCEL_TAGS: readonly RatingTag[] = ["on_time", "careful", "friendly", "communication"];
const PARCEL_TAGS_LOW: readonly RatingTag[] = ["late", "damaged", "rude", "hard_to_reach"];

type Panel = null | "cancelRequest" | "cancel" | "help" | "photo" | "report";
type Toast = { text: string; icon?: "circle-alert" | "circle-check"; action?: string; actionIcon?: "refresh-cw" | "undo-2"; onAction?: () => void; ttl?: number };

export default function OrderScreen(): React.ReactElement {
  const { id } = useLocalSearchParams<{ id: string }>();
  const orderId = typeof id === "string" ? id : "";
  const qc = useQueryClient();
  const router = useRouter();
  const reduceMotion = useReduceMotion();
  const dial = useDial();
  const online = useReachability();
  const { width, height } = useWindowDimensions();

  // ── handover code (restored from SecureStore, reconciled against server rotations) ──
  const [deliveryCode, setDeliveryCode] = useState<string | null>(null);
  const [codeRestored, setCodeRestored] = useState(false);
  const [codeAttemptsSeen, setCodeAttemptsSeen] = useState<number | null>(null);
  const [codeRotatedAtSeen, setCodeRotatedAtSeen] = useState<string | null>(null);
  const [riderIdentity, setRiderIdentity] = useState<RiderIdentity | null>(null);
  const [lastKnown, setLastKnown] = useState<LastActive | null>(null);

  // ── screen state ──
  const [panel, setPanel] = useState<Panel>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [choosingId, setChoosingId] = useState<string | null>(null);
  const [prevPrice, setPrevPrice] = useState<number | null>(null);
  const [priceNote, setPriceNote] = useState(false);
  const [cancelReason, setCancelReason] = useState<number | null>(null);
  const [stars, setStars] = useState(0);
  const [tagIdx, setTagIdx] = useState<number[]>([]);
  const [rated, setRated] = useState<{ stars: number; tags: RatingTag[] } | null>(null);
  const [skipped, setSkipped] = useState(false);
  const [undoLeft, setUndoLeft] = useState(0);
  const [ctaH, setCtaH] = useState(0);
  const [areaH, setAreaH] = useState(0);
  const [sheetVisible, setSheetVisible] = useState(0);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const sheetRef = useRef<OrderSheetHandle>(null);

  useEffect(() => {
    let alive = true;
    void Promise.all([loadDeliveryCode(orderId), loadDeliveryCodeAttempts(orderId), loadDeliveryCodeRotatedAt(orderId)])
      .then(([c, hw, rotAt]) => {
        if (!alive) return;
        if (c) setDeliveryCode(c);
        setCodeAttemptsSeen(hw);
        setCodeRotatedAtSeen(rotAt);
        setCodeRestored(true);
      })
      .catch(() => {
        if (alive) setCodeRestored(true);
      });
    return () => {
      alive = false;
    };
  }, [orderId]);

  useEffect(() => {
    let alive = true;
    setRiderIdentity(null);
    void loadRiderIdentity(orderId).then((i) => {
      if (alive && i) setRiderIdentity(i);
    });
    void loadLastActiveOrder(orderId).then((la) => {
      if (alive) setLastKnown(la);
    });
    return () => {
      alive = false;
    };
  }, [orderId]);

  // ── the order (shell) + rider telemetry ──
  const socketConnectedRef = useRef(false);
  const orderQ = useQuery({
    queryKey: orderKey(orderId),
    queryFn: () => getOrder(orderId),
    enabled: orderId !== "",
    select: selectOrderShell,
    refetchInterval: (q) => {
      const s = q.state.data?.status;
      // The auction polls regardless of socket health: `ridersNearby` only refreshes on a fetch.
      if (s === "open_for_offers") return 15_000;
      if (socketConnectedRef.current) return false;
      if (s !== undefined && ACTIVE.has(s)) return 5_000;
      return false;
    },
  });
  const telemetry = useQuery({
    queryKey: orderKey(orderId),
    queryFn: () => getOrder(orderId),
    enabled: orderId !== "",
    select: selectRiderTelemetry,
    refetchOnMount: false,
  }).data;
  const status = orderQ.data?.status;
  const isActive = status !== undefined && ACTIVE.has(status);

  const persistedStatus = useRef<string | null>(null);
  useEffect(() => {
    const d = orderQ.data;
    if (!d || d.status === persistedStatus.current) return;
    persistedStatus.current = d.status;
    const raw = qc.getQueryData<OrderSnapshot>(orderKey(orderId)) ?? d;
    if (ACTIVE.has(d.status) || d.status === "open_for_offers") void saveLastActiveOrder(raw);
    else void clearLastActiveOrder(d.id);
  }, [orderQ.data, qc, orderId]);

  // 07-14 / KB-DELIVERY-CODE-ROTATION-SIGNAL: drop a local code the server has since rotated.
  useEffect(() => {
    const decision = reconcileDeliveryCode({
      hasLocalCode: deliveryCode != null,
      storedAttemptsHighWater: codeAttemptsSeen,
      snapshotAttempts: orderQ.data?.deliveryOtpAttempts ?? null,
      storedCodeRotatedAt: codeRotatedAtSeen,
      snapshotCodeRotatedAt: orderQ.data?.codeRotatedAt ?? null,
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
  }, [orderQ.data?.deliveryOtpAttempts, orderQ.data?.codeRotatedAt, deliveryCode, codeAttemptsSeen, codeRotatedAtSeen, orderId]);

  // ── socket ──
  const [cancelledExpired, setCancelledExpired] = useState(false);
  useEffect(() => {
    if (status !== "cancelled") {
      setCancelledExpired(false);
      return;
    }
    const t = setTimeout(() => setCancelledExpired(true), CANCELLED_GRACE_MS);
    return () => clearTimeout(t);
  }, [status]);
  const socketExpected = isActive || status === "delivered" || status === "open_for_offers" || (status === "cancelled" && !cancelledExpired);
  // A rider bail no longer teleports to the re-broadcast auction: this screen shows "Rider cancelled"
  // with the one-tap retry (state 13), whose "Send again" re-prices and opens that same auction.
  const { connected } = useOrderSocket(
    socketExpected ? orderId : null,
    () => void qc.invalidateQueries({ queryKey: orderKey(orderId) }),
    () => setNowMs(Date.now()),
  );
  const wasConnected = useRef(false);
  if (connected) wasConnected.current = true;
  socketConnectedRef.current = connected;
  const frozen = wasConnected.current && !connected;

  const offersQ = useQuery({
    queryKey: offersKey(orderId),
    queryFn: () => listOffers(orderId),
    enabled: status === "open_for_offers",
    refetchInterval: status === "open_for_offers" ? 15_000 : false,
  });
  useForegroundRefetch(() => {
    void qc.invalidateQueries({ queryKey: orderKey(orderId) });
    if (status === "open_for_offers") void qc.invalidateQueries({ queryKey: offersKey(orderId) });
  });
  const offers = useMemo(() => (Array.isArray(offersQ.data) ? offersQ.data : []), [offersQ.data]);

  // Announce a newly-arrived bid (not the ones already there on open).
  const prevBidCount = useRef(0);
  const bidsSeeded = useRef(false);
  useEffect(() => {
    if (status !== "open_for_offers" || !offersQ.isSuccess) return;
    if (!bidsSeeded.current) {
      bidsSeeded.current = true;
      prevBidCount.current = offers.length;
      return;
    }
    if (offers.length > prevBidCount.current) {
      haptic("notify");
      AccessibilityInfo.announceForAccessibility(orderText.offers(offers.length));
    }
    prevBidCount.current = offers.length;
  }, [offers.length, status, offersQ.isSuccess]);

  // A success cue at the two moments that land: matched, and delivered.
  const prevStatus = useRef<string | undefined>(undefined);
  useEffect(() => {
    const prev = prevStatus.current;
    if (status && prev && status !== prev && (status === "assigned" || status === "delivered")) haptic("success");
    prevStatus.current = status;
  }, [status]);
  useEffect(() => {
    prevBidCount.current = 0;
    bidsSeeded.current = false;
    prevStatus.current = undefined;
    setPanel(null);
    setPrevPrice(null);
    setPriceNote(false);
  }, [orderId]);

  // ── toasts ──
  const showToast = useCallback((t: Toast) => {
    setToast(t);
    AccessibilityInfo.announceForAccessibility(t.text);
  }, []);
  useEffect(() => {
    if (!toast || toast.ttl === 0) return;
    const t = setTimeout(() => setToast(null), toast.ttl ?? NOTE_MS);
    return () => clearTimeout(t);
  }, [toast]);

  // ── mutations ──
  const ranked = useMemo(() => orderOffers(offers, "best"), [offers]);
  const offerName = (offerId: string): string => {
    const o = offers.find((x) => x.id === offerId);
    return o ? riderShortName(o.rider.profile.firstName, o.rider.profile.lastName) : A.rider;
  };
  const showTaken = (offerId: string): void => showToast({ text: orderText.taken(offerName(offerId)) });

  const selectM = useMutation({
    mutationFn: (offerId: string) => selectOffer(orderId, offerId),
    onMutate: async (offerId) => {
      await qc.cancelQueries({ queryKey: orderKey(orderId) });
      const prev = qc.getQueryData<OrderSnapshot>(orderKey(orderId));
      const selectedRiderId = offers.find((o) => o.id === offerId)?.rider.profileId ?? null;
      return { prev, selectedRiderId, offerId };
    },
    onSuccess: (res) => {
      setDeliveryCode(res.deliveryCode);
      setCodeAttemptsSeen(0);
      setCodeRotatedAtSeen(null);
      void saveDeliveryCode(orderId, res.deliveryCode);
      qc.setQueryData<OrderSnapshot>(orderKey(orderId), (o) => (o ? { ...o, status: "assigned", agreedFare: res.agreedFare } : o));
    },
    onError: (e, offerId, ctx) => {
      if (ctx?.prev !== undefined) qc.setQueryData(orderKey(orderId), ctx.prev);
      if (!(e instanceof ApiError) || e.status !== 409) return;
      // LC-C08: a 409 can be our own pick landing after a lost response — confirm before saying "taken".
      if (ctx?.selectedRiderId == null) {
        showTaken(offerId);
        return;
      }
      void getOrder(orderId)
        .then((fresh) => {
          if (!selectOfferReconciled({ freshStatus: fresh.status, freshRiderId: fresh.rider?.profileId, selectedRiderId: ctx.selectedRiderId })) showTaken(offerId);
        })
        .catch(() => showTaken(offerId));
    },
    onSettled: () => {
      setChoosingId(null);
      void qc.invalidateQueries({ queryKey: orderKey(orderId) });
      void qc.invalidateQueries({ queryKey: offersKey(orderId) });
    },
  });
  const rotateM = useMutation({
    mutationFn: () => rotateDeliveryCode(orderId),
    onSuccess: (res) => {
      setDeliveryCode(res.deliveryCode);
      setCodeAttemptsSeen(0);
      setCodeRotatedAtSeen(null);
      void saveDeliveryCode(orderId, res.deliveryCode);
    },
  });
  const raiseM = useMutation({
    mutationFn: (to: number) => raiseOrderPrice(orderId, to),
    onMutate: async (to) => {
      await qc.cancelQueries({ queryKey: orderKey(orderId) });
      const prev = qc.getQueryData<OrderSnapshot>(orderKey(orderId));
      const from = Number(prev?.proposedFare ?? 0);
      qc.setQueryData<OrderSnapshot>(orderKey(orderId), (o) => (o ? { ...o, proposedFare: to.toFixed(2) } : o));
      setPrevPrice((p) => p ?? from);
      setPriceNote(true);
      return { prev };
    },
    onError: (_e, to, ctx) => {
      if (ctx?.prev !== undefined) qc.setQueryData(orderKey(orderId), ctx.prev);
      setPriceNote(false);
      setPrevPrice(null);
      showToast({ text: A.priceFail, action: A.retry, actionIcon: "refresh-cw", onAction: () => raiseM.mutate(to), ttl: 0 });
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: orderKey(orderId) }),
  });
  useEffect(() => {
    if (!priceNote) return;
    const t = setTimeout(() => setPriceNote(false), NOTE_MS);
    return () => clearTimeout(t);
  }, [priceNote, orderQ.data?.proposedFare]);

  const [pendingRating, setPendingRating] = useState<PendingRating | null>(null);
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
  const rateM = useMutation({
    mutationFn: (r: { score: number; tags: RatingTag[] }) => rateOrder(orderId, { score: r.score, ...(r.tags.length ? { tags: r.tags } : {}) }),
    onSuccess: () => {
      setPendingRating((cur) => (cur?.orderId === orderId ? null : cur));
      void clearPendingRating();
      void qc.invalidateQueries({ queryKey: orderKey(orderId) });
      void qc.invalidateQueries({ queryKey: ["history"] });
    },
  });
  // BH-06: re-send a rating an app kill dropped mid-undo window (only a marker recovered from storage).
  useEffect(() => {
    const snap = orderQ.data;
    const decision = reconcilePendingRating({ pending: pendingRating, order: snap ? { id: snap.id, status: snap.status } : null });
    if (decision === "clear") {
      setPendingRating(null);
      void clearPendingRating();
      return;
    }
    if (decision !== "retry" || !pendingRating || ratingRetryInFlight.current || !ratingFromStorage.current) return;
    ratingRetryInFlight.current = true;
    const { orderId: pid, score, tags } = pendingRating;
    const okTags = (tags ?? []).filter((t): t is RatingTag => (PARCEL_TAGS as readonly string[]).includes(t) || (PARCEL_TAGS_LOW as readonly string[]).includes(t));
    void rateOrder(pid, { score, ...(okTags.length ? { tags: okTags } : {}) })
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
    // eslint-disable-next-line react-hooks/exhaustive-deps -- qc is stable; orderQ.data read fresh each run.
  }, [orderQ.data, pendingRating]);

  // The rating's 10s undo window. The rating commits when it lapses — or on leaving the screen.
  const undoTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const armedRating = useRef<{ score: number; tags: RatingTag[] } | null>(null);
  const rateMutate = rateM.mutate;
  const commitRating = useCallback(() => {
    if (undoTimer.current) clearInterval(undoTimer.current);
    undoTimer.current = null;
    const r = armedRating.current;
    armedRating.current = null;
    setUndoLeft(0);
    setToast(null);
    if (r) rateMutate(r);
  }, [rateMutate]);
  useEffect(() => () => {
    if (undoTimer.current) clearInterval(undoTimer.current);
    if (armedRating.current) rateMutate(armedRating.current);
  }, [rateMutate]);

  const cancelM = useMutation({
    mutationFn: (reason: string | undefined) => cancelOrder(orderId, reason ? { reason } : {}),
    onSuccess: () => {
      setPanel(null);
      setCancelReason(null);
      void qc.invalidateQueries({ queryKey: orderKey(orderId) });
      void qc.invalidateQueries({ queryKey: ["history"] });
    },
  });
  const notifyM = useMutation({
    mutationFn: () => {
      const pickup = qc.getQueryData<OrderSnapshot>(orderKey(orderId))?.pickup.point;
      if (!pickup) throw new Error("No pickup on this order yet.");
      return notifyWhenRiderOnline(pickup, orderId);
    },
  });
  const resendM = useMutation({
    mutationFn: (price: number) => resendOrder(orderId, price),
    onSuccess: (res) => {
      haptic("tap");
      void qc.invalidateQueries({ queryKey: ["history"] });
      router.replace(`/order/${res.id}`);
    },
  });

  const selectRace = selectM.error instanceof ApiError && selectM.error.status === 409;
  useActionErrorEffect((selectRace ? null : selectM.error) ?? rotateM.error ?? rateM.error ?? cancelM.error ?? notifyM.error ?? resendM.error);
  useEffect(() => {
    selectM.reset();
    rotateM.reset();
    rateM.reset();
    cancelM.reset();
    notifyM.reset();
    resendM.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset stale mutation errors on a real status change.
  }, [status]);

  // ── stage ──
  const order = orderQ.data;
  const isRiderViewer = order?.viewerRole === "rider";
  const riderPoint = telemetry && telemetry.lat != null && telemetry.lng != null ? { lat: telemetry.lat, lng: telemetry.lng } : null;
  const { stage, gpsPaused, offline } = order
    ? resolveStage({
        status: order.status,
        offerCount: offers.length,
        ridersNearby: order.ridersNearby,
        cancelledBy: order.cancelledBy,
        events: order.events ?? [],
        rider: riderPoint ? { ...riderPoint, at: telemetry?.updatedAt ?? null } : null,
        dropoff: order.dropoff.point,
        online,
        nowMs,
      })
    : { stage: "finding" as OrderStage, gpsPaused: false, offline: !online };
  const live = isLiveStage(stage);
  // Re-evaluate the 60s GPS-paused rule even when no new fix arrives.
  useEffect(() => {
    if (!live) return;
    const iv = setInterval(() => setNowMs(Date.now()), 15_000);
    return () => clearInterval(iv);
  }, [live]);
  useClaimOfflineBanner(true);
  const showBanner = offline || (live && frozen);

  // A live order with no local handover code (a dropped select response, a rotation while killed):
  // issue a fresh one once so the code card is never empty — the old "Re-issue" button is gone.
  const rotatedOnce = useRef(false);
  const rotate = rotateM.mutate;
  useEffect(() => {
    if (!live || isRiderViewer || !codeRestored || deliveryCode || rotatedOnce.current || !online) return;
    rotatedOnce.current = true;
    rotate();
  }, [live, isRiderViewer, codeRestored, deliveryCode, online, rotate]);

  // ── Back: close a panel → collapse a full sheet → leave ──
  const leave = useCallback(() => (router.canGoBack() ? router.back() : goHomeClearingStack(router)), [router]);
  const onBack = useCallback((): boolean => {
    if (panel) {
      setPanel(null);
      return true;
    }
    if (sheetRef.current?.isFull()) {
      sheetRef.current.collapse();
      return true;
    }
    leave();
    return true;
  }, [panel, leave]);
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener("hardwareBackPress", onBack);
      return () => sub.remove();
    }, [onBack]),
  );

  if (orderQ.isLoading) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: tokens.color.bg }}>
        <OrderHeader title="" help={false} onBack={leave} onHelp={() => undefined} />
        <View style={{ padding: 16 }}>
          <SkeletonList />
        </View>
      </SafeAreaView>
    );
  }
  if (!order) {
    const kind = orderLoadErrorKind(orderQ.error instanceof ApiError ? orderQ.error.status : undefined);
    const known = kind === "transient" && lastKnown != null && lastKnown.id === orderId ? lastKnown : null;
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: tokens.color.bg }}>
        <OrderHeader title="" help={false} onBack={leave} onHelp={() => undefined} />
        {known ? <ReconnectBanner lastUpdate="" /> : null}
        <View style={{ padding: 16, gap: 12 }}>
          {known ? (
            <>
              <H2>{`${known.pickupLandmark || "Pickup"} → ${known.dropoffLandmark || "Drop-off"}`}</H2>
              <Muted>{usd(Number(known.fare))}</Muted>
            </>
          ) : (
            <H2>{kind === "not_found" ? "Order not found" : kind === "forbidden" ? "This order isn't available to you" : "Couldn't load this order"}</H2>
          )}
          {kind === "transient" ? (
            <CtaButton label={A.retry} icon="refresh-cw" onPress={() => void orderQ.refetch()} loading={orderQ.isFetching} />
          ) : null}
          <CtaButton ghost label={A.home} onPress={() => goHomeClearingStack(router)} />
        </View>
      </SafeAreaView>
    );
  }

  // ── view model ──
  const price = Number(order.agreedFare ?? order.proposedFare);
  const ask = Number(order.proposedFare);
  const card = order.riderCard ?? null;
  const rider: RiderView | null = card
    ? {
        name: riderShortName(card.firstName, card.lastName),
        firstName: card.firstName || A.rider,
        initials: initials(card.firstName, card.lastName),
        photoUrl: card.photoUrl,
        ratingAvg: card.ratingCount > 0 ? card.ratingAvg : null,
        trips: card.tripsCount,
        plate: card.plate,
        verified: card.verified,
      }
    : riderIdentity
      ? {
          name: riderShortName(riderIdentity.firstName, riderIdentity.lastName),
          firstName: riderIdentity.firstName || A.rider,
          initials: initials(riderIdentity.firstName, riderIdentity.lastName),
          photoUrl: riderIdentity.photoUrl,
          ratingAvg: riderIdentity.ratingCount > 0 ? Number(riderIdentity.ratingAvg) : null,
          trips: riderIdentity.tripsCount,
          plate: null,
          verified: false,
        }
      : null;
  const riderFirst = rider?.firstName ?? A.rider;
  const phone = order.counterpartyPhone;
  const masked = phoneMasked(stage);
  const eventAt = (s: string): string | null => order.events?.find((e) => e.status === s)?.createdAt ?? null;
  const pickedUpAt = eventAt("picked_up");
  const deliveredAt = eventAt("delivered");
  const toPickup = stage === "toPickup";
  const eta = live ? liveEta({ status: order.status, rider: riderPoint, pickup: order.pickup.point, dropoff: order.dropoff.point }) : null;
  const itemsText = order.items && order.items.length ? order.items.map((i) => `${i.description} × ${i.quantity}`).join(", ") : "";
  const receipt: ReceiptView = {
    ref: orderText.ref(order.id),
    pickup: order.pickup.landmark,
    pickupAt: hhmm(pickedUpAt),
    dropoff: order.dropoff.landmark,
    dropoffAt: hhmm(deliveredAt),
    items: itemsText,
    rider: rider ? orderText.riderLine(rider.name, rider.plate) : null,
    riderPhone: phone || masked ? maskPhone(phone) : null,
    price,
  };

  const offerViews: OfferView[] = ranked.map(({ offer: o }) => ({
    id: o.id,
    name: riderShortName(o.rider.profile.firstName, o.rider.profile.lastName),
    initials: initials(o.rider.profile.firstName, o.rider.profile.lastName),
    photoUrl: o.rider.profile.photoUrl,
    ratingAvg: o.rider.ratingCount > 0 ? Number(o.rider.ratingAvg) : null,
    trips: o.rider.tripsCount,
    etaMinutes: o.etaMinutes,
    price: Number(o.offeredFare),
    ask,
  }));
  const bestId = ranked.find((r) => r.recommended)?.offer.id ?? ranked[0]?.offer.id ?? null;

  // ── actions ──
  const raise = (): void => {
    if (raiseM.isPending) return;
    setToast(null);
    raiseM.mutate(Math.round((ask + 0.5) * 100) / 100);
  };
  const choose = (offerId: string): void => {
    setToast(null);
    setChoosingId(offerId);
    const chosen = offers.find((o) => o.id === offerId);
    if (chosen) {
      const identity: RiderIdentity = {
        orderId,
        profileId: chosen.rider.profileId,
        firstName: chosen.rider.profile.firstName,
        lastName: chosen.rider.profile.lastName,
        photoUrl: chosen.rider.profile.photoUrl,
        ratingAvg: String(chosen.rider.ratingAvg),
        ratingCount: chosen.rider.ratingCount,
        tripsCount: chosen.rider.tripsCount,
      };
      setRiderIdentity(identity);
      void saveRiderIdentity(identity);
    }
    selectM.mutate(offerId);
  };
  // Get help → Emergency: dial at once, and alert the safety team (the old SOS control's job) with the
  // last-known fix, best-effort — never delaying the call.
  const emergency = (): void => {
    haptic("alert");
    dial(SOS_POLICY.emergencyNumber);
    void Location.getForegroundPermissionsAsync()
      .then((p) => (p.status === Location.PermissionStatus.GRANTED ? Location.getLastKnownPositionAsync() : null))
      .then((pos) => raiseSos(orderId, pos ? { lat: pos.coords.latitude, lng: pos.coords.longitude } : {}))
      .catch(() => raiseSos(orderId).catch(() => undefined));
  };
  const share = (message: string): void => void Share.share({ message }).catch(() => undefined);
  const shareCode = (): void => {
    if (deliveryCode) share(orderText.shareMsg(riderFirst, rider?.plate ?? null, deliveryCode));
  };
  const whatsapp = (): void => {
    const digits = (phone ?? "").replace(/\D/g, "");
    if (digits) void Linking.openURL(`https://wa.me/${digits}`).catch(() => undefined);
  };
  const openMaps = (): void => {
    const target = toPickup ? order.pickup.point : order.dropoff.point;
    const origin = riderPoint ?? (toPickup ? target : order.pickup.point);
    void Linking.openURL(mapsDirectionsUrl(origin, target)).catch(() => undefined);
  };
  const editOrder = (): void =>
    router.push({
      pathname: "/send",
      params: buildRebroadcastParams({
        pickup: order.pickup,
        dropoff: order.dropoff,
        items: order.items,
        proposedFare: suggestedRetryPrice(price),
        note: order.note,
        createdAt: order.events?.[0]?.createdAt ?? null,
      }),
    });
  const sendAgainFlow = (): void =>
    router.push({
      pathname: "/send",
      params: buildRebroadcastParams({
        pickup: order.pickup,
        dropoff: order.dropoff,
        items: order.items,
        proposedFare: order.proposedFare,
        note: order.note,
        createdAt: order.events?.[0]?.createdAt ?? null,
      }),
    });
  const submitRating = (): void => {
    const low = stars <= 2;
    const keys = low ? PARCEL_TAGS_LOW : PARCEL_TAGS;
    const r = { score: stars, tags: tagIdx.map((i) => keys[i]).filter((t): t is RatingTag => t != null) };
    armedRating.current = r;
    ratingFromStorage.current = false;
    setPendingRating({ orderId, score: r.score, tags: r.tags });
    void savePendingRating(orderId, r.score, r.tags);
    setRated({ stars: r.score, tags: r.tags });
    setUndoLeft(RATE_UNDO_S);
    let left = RATE_UNDO_S;
    if (undoTimer.current) clearInterval(undoTimer.current);
    undoTimer.current = setInterval(() => {
      left -= 1;
      setUndoLeft(left);
      if (left <= 0) commitRating();
    }, 1000);
  };
  const undoRating = (): void => {
    if (undoTimer.current) clearInterval(undoTimer.current);
    undoTimer.current = null;
    armedRating.current = null;
    setUndoLeft(0);
    setRated(null);
    setPendingRating((cur) => (cur?.orderId === orderId ? null : cur));
    void clearPendingRating();
  };
  const onStars = (n: number): void => {
    // Crossing the ≤2 line swaps the tag set, so the old picks no longer mean anything.
    if ((n <= 2) !== (stars <= 2) && stars > 0) setTagIdx([]);
    setStars(n);
  };
  const toggleTag = (i: number): void => setTagIdx((cur) => (cur.includes(i) ? cur.filter((x) => x !== i) : [...cur, i]));

  // ── per-stage title, map, sheet, CTA ──
  const cancelPanel = panel === "cancel" && live;
  const afterPickup = order.status === "picked_up" || order.status === "en_route_dropoff";
  const title = cancelPanel ? A[stageTitleKey(afterPickup ? "toDropoff" : "toPickup")] : A[stageTitleKey(stage)];
  const help = showsHelp(stage) && !isRiderViewer;
  const frame: MapFrame = toPickup ? "pickupRider" : live || stage === "undelivered" || stage === "delivered" ? "riderDrop" : "route";
  const dim = cancelPanel || stage === "retryNoMatch" || stage === "retryRiderCancelled" || stage === "cancelled";
  const showRider = live || stage === "undelivered" || stage === "delivered";
  const riderLabel = gpsPaused || offline ? orderText.lastSeen(minutesSince(telemetry?.updatedAt, nowMs)) : riderFirst;
  const suggested = suggestedRetryPrice(price);

  const trackVM: TrackVM = {
    status: order.status,
    toPickup,
    etaMinutes: eta?.minutes ?? null,
    stopName: toPickup ? order.pickup.landmark : order.dropoff.landmark,
    step: stepIndex(order.status),
    gpsPaused,
    offline,
    rider,
    code: isRiderViewer ? null : deliveryCode,
    photo: order.pickupPhotoUrl ? { url: order.pickupPhotoUrl, sub: orderText.photoSub(riderFirst, hhmm(pickedUpAt)) } : null,
    canCall: !!phone,
    canWhatsApp: !!phone,
  };
  const trackA: TrackActions = {
    onCall: () => dial(phone),
    onWhatsApp: whatsapp,
    onShareCode: shareCode,
    onMaps: openMaps,
    onViewPhoto: () => setPanel("photo"),
    onCancel: () => {
      setCancelReason(null);
      setPanel("cancel");
    },
  };

  let content: React.ReactNode = null;
  let bar: React.ReactNode = null;
  let mapShare = stageMapShare(stage);
  if (cancelPanel) {
    content = <CancelSheet afterPickup={afterPickup} riderFirst={riderFirst} reason={cancelReason} onReason={(i) => setCancelReason((c) => (c === i ? null : i))} />;
    bar = <CancelBar afterPickup={afterPickup} onKeep={() => setPanel(null)} onCancel={() => cancelM.mutate(cancelReasonText(cancelReason))} cancelling={pendingOrQueued(cancelM) !== false} />;
    mapShare = stageMapShare("toPickup");
  } else if (stage === "finding" || stage === "noRiders") {
    content = (
      <FindingSheet
        noRiders={stage === "noRiders"}
        expiresAt={order.expiresAt}
        windowMs={OFFER_WINDOW_MS}
        frozen={frozen}
        onZero={() => void orderQ.refetch()}
        ridersNearby={order.ridersNearby ?? null}
        price={ask}
        was={prevPrice}
        raisedNote={priceNote}
        onRaise={raise}
        raising={raiseM.isPending}
        notify={{
          onPress: () => notifyM.mutate(),
          loading: notifyM.isPending,
          state: notifyM.isSuccess ? (notifyM.data?.queued ? "queued" : "unavailable") : "idle",
        }}
      />
    );
    bar = isRiderViewer ? null : (
      <FindingBar
        confirming={panel === "cancelRequest"}
        onAsk={() => setPanel("cancelRequest")}
        onYes={() => cancelM.mutate(undefined)}
        onKeep={() => setPanel(null)}
        cancelling={pendingOrQueued(cancelM) !== false}
      />
    );
  } else if (stage === "offers") {
    content = (
      <OffersSheet
        offers={offerViews}
        bestId={bestId}
        expiresAt={order.expiresAt}
        frozen={frozen}
        onZero={() => void orderQ.refetch()}
        price={ask}
        onRaise={raise}
        raising={raiseM.isPending}
        raisedNote={priceNote}
        choosingId={choosingId}
        onChoose={choose}
      />
    );
    bar = (
      <FindingBar
        confirming={panel === "cancelRequest"}
        onAsk={() => setPanel("cancelRequest")}
        onYes={() => cancelM.mutate(undefined)}
        onKeep={() => setPanel(null)}
        cancelling={pendingOrQueued(cancelM) !== false}
      />
    );
  } else if (stage === "toPickup" || stage === "toDropoff") {
    content = <TrackSheet vm={trackVM} a={trackA} screenWidth={width} />;
  } else if (stage === "handoff") {
    content = <HandoffSheet vm={trackVM} a={trackA} riderFirst={riderFirst} screenWidth={width} />;
    bar = trackVM.code ? <OneButtonBar label={A.shareCode} icon="share-2" onPress={shareCode} /> : null;
  } else if (stage === "retryNoMatch" || stage === "retryRiderCancelled") {
    content = <RetrySheet riderCancelled={stage === "retryRiderCancelled"} lastPrice={price} suggested={suggested} />;
    bar = isRiderViewer ? null : <RetryBar suggested={suggested} onSend={() => resendM.mutate(suggested)} onEdit={editOrder} sending={pendingOrQueued(resendM) !== false} />;
  } else if (stage === "delivered") {
    const showRate = !isRiderViewer && !rated && !skipped;
    content = showRate ? (
      <RateSheet
        deliveredSub={orderText.deliveredSub(hhmm(deliveredAt), deliveryCode)}
        riderFirst={riderFirst}
        riderPhoto={rider?.photoUrl ?? null}
        riderInitials={rider?.initials ?? ""}
        stars={stars}
        onStars={onStars}
        tags={tagIdx}
        onTag={toggleTag}
        receipt={receipt}
        onShareReceipt={() => share(orderText.receiptText(receipt))}
      />
    ) : (
      <RatedSheet riderFirst={riderFirst} stars={rated?.stars ?? null} receipt={receipt} onShareReceipt={() => share(orderText.receiptText(receipt))} />
    );
    bar = showRate ? <RateBar onSkip={() => setSkipped(true)} onSubmit={submitRating} canSubmit={stars > 0} /> : <OneButtonBar label={A.home} onPress={() => goHomeClearingStack(router)} />;
  } else if (stage === "completed") {
    content = (
      <CompletedSheet
        deliveredAt={deliveredAt}
        riderFirst={riderFirst}
        stars={rated?.stars ?? null}
        receipt={receipt}
        onShareReceipt={() => share(orderText.receiptText(receipt))}
        onHelp={() => setPanel("report")}
      />
    );
    bar = isRiderViewer ? null : <OneButtonBar label={A.sendAgain} icon="refresh-cw" onPress={sendAgainFlow} />;
  } else if (stage === "undelivered") {
    content = <NotDeliveredSheet riderFirst={riderFirst} reason={orderText.undeliveredReason(order.undeliveredReason, order.undeliveredAttempts)} rider={rider} />;
    bar = isRiderViewer ? null : (
      <TwoButtonBar primary={{ label: A.callRider, icon: "phone", onPress: () => dial(phone) }} secondary={{ label: A.sendAgain, icon: "refresh-cw", onPress: sendAgainFlow }} />
    );
  } else {
    const by = order.cancelledBy;
    const headline = by === "customer" ? A.cxYou : by === "rider" ? orderText.cxRider(riderFirst) : A.cxLynia;
    const lynia = by !== "customer" && by !== "rider";
    content = <CancelledSheet headline={headline} reason={order.cancelReason ?? (lynia ? A.cxLyniaR : null)} nothingOwed={!lynia} />;
    bar = isRiderViewer
      ? null
      : lynia
        ? <TwoButtonBar primary={{ label: A.sendAgain, icon: "refresh-cw", onPress: sendAgainFlow }} secondary={{ label: A.callSupport, icon: "phone", onPress: () => dial(SOS_POLICY.safetyLine) }} />
        : <OneButtonBar label={A.sendAgain} icon="refresh-cw" onPress={sendAgainFlow} />;
  }

  // Before the first layout pass, size the sheet off the window (header 53 + system bars ≈ 80).
  const area = areaH || Math.max(0, height - 80);
  const lastUpdate = hhmm(telemetry?.updatedAt ?? (orderQ.dataUpdatedAt ? new Date(orderQ.dataUpdatedAt).toISOString() : null));
  const undoToast: Toast | null =
    rated && undoLeft > 0 ? { text: orderText.rated(riderFirst, rated.stars), icon: "circle-check", action: orderText.undo(undoLeft), actionIcon: "undo-2", onAction: undoRating, ttl: 0 } : null;
  const shownToast = undoToast ?? toast;

  return (
    <SafeAreaView edges={["top", "bottom"]} style={{ flex: 1, backgroundColor: tokens.color.bg }}>
      <OrderHeader title={title} help={help} onBack={() => onBack()} onHelp={() => setPanel("help")} />
      <View style={{ flex: 1 }} onLayout={(e) => setAreaH(e.nativeEvent.layout.height)}>
        <OrderMap
          pickup={order.pickup.point}
          dropoff={order.dropoff.point}
          rider={riderPoint}
          riderLabel={riderLabel}
          riderPaused={gpsPaused || offline}
          showRider={showRider}
          toPickupLine={toPickup}
          rings={stage === "finding"}
          dim={dim}
          frame={frame}
          padBottom={sheetVisible || Math.round(area * (1 - mapShare))}
          reduceMotion={reduceMotion}
        />
        {showBanner ? (
          <View style={{ position: "absolute", left: 0, right: 0, top: 0, zIndex: 21 }}>
            <ReconnectBanner lastUpdate={lastUpdate} />
          </View>
        ) : null}
        {area > 0 ? (
          <OrderSheet
            ref={sheetRef}
            areaHeight={area}
            mapShare={mapShare}
            bottomInset={bar ? ctaH : 0}
            contentKey={`${stage}|${cancelPanel ? "c" : ""}|${rated ? "r" : ""}|${skipped ? "s" : ""}`}
            reduceMotion={reduceMotion}
            onVisibleHeight={setSheetVisible}
          >
            {content}
          </OrderSheet>
        ) : null}
        {bar ? (
          <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 25 }} onLayout={(e) => setCtaH(e.nativeEvent.layout.height)}>
            {bar}
          </View>
        ) : null}
        {shownToast ? (
          <View style={{ position: "absolute", left: 12, right: 12, bottom: (bar ? ctaH : 0) + 10, zIndex: 35 }}>
            <OrderToast text={shownToast.text} icon={shownToast.icon} action={shownToast.action} actionIcon={shownToast.actionIcon} onAction={shownToast.onAction} />
          </View>
        ) : null}
      </View>
      <HelpPanel
        visible={panel === "help"}
        onClose={() => setPanel(null)}
        onEmergency={emergency}
        onShareTrip={() => share(orderText.shareTrip(order.pickup.landmark, order.dropoff.landmark, rider?.name ?? null, rider?.plate ?? null))}
        onReport={() => setPanel("report")}
      />
      <TripIssueSheet orderId={orderId} visible={panel === "report"} onClose={() => setPanel(null)} />
      <PhotoViewer url={order.pickupPhotoUrl ?? null} visible={panel === "photo"} onClose={() => setPanel(null)} />
    </SafeAreaView>
  );
}
