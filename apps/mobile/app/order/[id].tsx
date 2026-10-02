import { type MerchantOrderResponse, OFFER_WINDOW_MS, type RatingTag, SOS_POLICY } from "@lynia/shared";
import { tokens } from "@lynia/shared/tokens";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import * as Location from "expo-location";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, BackHandler, Linking, PixelRatio, Share, useWindowDimensions, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { ApiError } from "../../src/api/client";
import { listOffers, selectOffer } from "../../src/api/offers";
import { cancelOrder, getOrder, notifyWhenRiderOnline, type OrderSnapshot, raiseOrderPrice, rateOrder, resendOrder, rotateDeliveryCode } from "../../src/api/orders";
import { raiseIssue, raiseSos } from "../../src/api/safety";
import { clearDeliveryCode, clearPendingRating, loadDeliveryCode, loadDeliveryCodeAttempts, loadDeliveryCodeRotatedAt, loadPendingRating, savePendingRating, saveDeliveryCode, saveDeliveryCodeAttempts, saveDeliveryCodeRotatedAt, type PendingRating } from "../../src/auth/session";
import { liveEta } from "../../src/logic/eta";
import { mapsDirectionsUrl } from "../../src/logic/maps";
import { goHomeClearingStack } from "../../src/logic/nav";
import { buildRebroadcastParams } from "../../src/logic/order-draft";
import { orderOffers } from "../../src/logic/order-offers";
import { isLiveStage, minutesSince, type OrderStage, phoneMasked, resolveStage, showsHelp, stageMapShare, stagePeekFloor, stageTitleKey, stepIndex, suggestedRetryPrice } from "../../src/logic/order-stage";
import { orderLoadErrorKind, reconcileDeliveryCode, reconcilePendingRating, selectOfferReconciled, selectOrderShell, selectRiderTelemetry } from "../../src/logic/order-tracking";
import { loadRiderIdentity, type RiderIdentity, saveRiderIdentity } from "../../src/logic/rider-identity";
import { clearLastActiveOrder, saveLastActiveOrder } from "../../src/net/last-active-store";
import { useClaimOfflineBanner } from "../../src/net/offline-banner-owner";
import { clearOrderCopy, loadOrderCopy, type OrderCopy, saveOrderCopy } from "../../src/net/order-copy-store";
import { useReachability } from "../../src/net/use-reachability";
import { offersKey, orderKey, pendingOrQueued } from "../../src/query/client";
import { useForegroundRefetch } from "../../src/realtime/use-foreground-refetch";
import { useOrderSocket } from "../../src/realtime/use-order-socket";
import { haptic, useActionErrorEffect, useDial } from "../../src/ui";
import { type OfferView, type ReceiptView, type RiderView } from "../../src/ui/order/cards";
import { hhmm, initials, maskPhone, ORDER_COPY as A, orderText, riderShortName } from "../../src/ui/order/copy";
import { CtaBar, CtaButton, OrderToast } from "../../src/ui/order/kit";
import { BlankMap, type MapFrame, OrderMap } from "../../src/ui/order/OrderMap";
import { OrderSheet, type OrderSheetHandle } from "../../src/ui/order/OrderSheet";
import { HelpPanel, OrderHeader, PhotoViewer, ReconnectBanner, ReportPanel } from "../../src/ui/order/panels";
import {
  CancelBar,
  CancelledSheet,
  cancelReasonText,
  CancelSheet,
  CompletedSheet,
  FindingBar,
  FindingSheet,
  HandoffSheet,
  LoadErrorSheet,
  NotDeliveredSheet,
  OffersSheet,
  OneButtonBar,
  OpeningSheet,
  RateBar,
  RatedSheet,
  RateSheet,
  ReopenedBar,
  ReopenedSheet,
  RetryBar,
  RetrySheet,
  type TrackActions,
  TrackSheet,
  type TrackVM,
  TwoButtonBar,
} from "../../src/ui/order/stages";
import { isCachedMerchantOrder, MerchantOrderScreen } from "../../src/orderflow/MerchantOrderScreen";
import { useReduceMotion } from "../../src/ui/useReduceMotion";
import { uuidV4FromSeed } from "../../src/util";

/**
 * The customer's order screen — the After Send handoff (`packages/design/handoff/after-send-v2/`, ledger
 * D-53 and its v2 round). ONE screen for the whole order: a full-bleed map under the Send flow's header,
 * and a bottom sheet whose content follows the order's stage (finding → offers → to pickup → to drop-off
 * → hand-off → delivered / completed, plus no match, rider cancelled, not delivered, cancelled, GPS
 * paused, offline, opening and load errors). Stages never push screens, so Back never walks through old
 * stages: it closes a panel, collapses a full sheet, then leaves.
 *
 * The data plumbing: the snapshot is subscribed through the telemetry-stripped shell (GPS ticks reach
 * the map + stage via `selectRiderTelemetry`), the order socket streams status / offers / positions with
 * a socket-gated poll fallback, the handover code is restored from SecureStore and reconciled against
 * server rotations, a select 409 is reconciled before the "just taken" toast, and a rating armed before
 * an app kill is re-sent on the next start (BH-06). The last snapshot is kept on disk so an offline cold
 * start shows a saved copy (2.4).
 */

const ACTIVE = new Set(["assigned", "confirmed", "en_route_pickup", "picked_up", "en_route_dropoff"]);
// C2: keep the socket through `cancelled` briefly so a rider-bail `order:rebroadcast` can still land.
const CANCELLED_GRACE_MS = 20_000;
const NOTE_MS = 4_000;
const RATE_UNDO_S = 10;
/** After the offer window, offers already on screen stay choosable this long (v2 2.10). */
const CHOOSE_GRACE_MS = 15_000;
/** "Still confirming…" after this long (2.9b). */
const CHOOSE_SLOW_MS = 5_000;
/** A completed order can still be rated for 7 days after delivery (2.25). */
const RATE_LATE_MS = 7 * 24 * 60 * 60 * 1000;
// The parcel rating tags, index-aligned with the copy's `tg` / `tn` labels.
const PARCEL_TAGS: readonly RatingTag[] = ["on_time", "careful", "friendly", "communication"];
const PARCEL_TAGS_LOW: readonly RatingTag[] = ["late", "damaged", "rude", "hard_to_reach"];
// The report types, index-aligned with the copy's `rp` labels.
const REPORT_TYPES = ["wrong_item", "damaged", "rider_conduct", "payment_dispute", "other"] as const;

type Panel = null | "cancelRequest" | "cancel" | "help" | "photo" | "report";
type Toast = { text: string; icon?: "circle-alert" | "circle-check"; action?: string; actionIcon?: "refresh-cw" | "undo-2"; onAction?: () => void; ttl?: number };

/**
 * One order screen for every service (Order flow v2, BRIEF §1, ledger D-59): a merchant (restaurant)
 * order renders the Order flow v2.1 stages (`src/orderflow/MerchantOrderScreen.tsx`) on the same
 * shell; a parcel renders After Send v2 below. The type comes from the cached food order (seeded at
 * checkout) or the snapshot's `orderType`; until it is known the parcel screen's opening state shows.
 */
export default function OrderRoute(): React.ReactElement {
  const { id } = useLocalSearchParams<{ id: string }>();
  const orderId = typeof id === "string" ? id : "";
  const qc = useQueryClient();
  const cachedFood = isCachedMerchantOrder((k) => qc.getQueryData<MerchantOrderResponse>(k), orderId);
  const typeQ = useQuery({
    queryKey: orderKey(orderId),
    queryFn: () => getOrder(orderId),
    enabled: orderId !== "" && !cachedFood,
    // A rider viewing a food job they carried keeps the After Send rider view.
    select: (s: OrderSnapshot) => (s.orderType === "merchant" && s.viewerRole !== "rider" ? "merchant" : "parcel"),
  });
  if (cachedFood || typeQ.data === "merchant") return <MerchantOrderScreen key={orderId} orderId={orderId} />;
  return <ParcelOrderScreen />;
}

function ParcelOrderScreen(): React.ReactElement {
  const { id, riderCx } = useLocalSearchParams<{ id: string; riderCx?: string }>();
  const orderId = typeof id === "string" ? id : "";
  // Set when this auction is the re-broadcast opened because the customer's rider cancelled before
  // pickup (state 13): the cancelled rider's first name.
  const reopenedFrom = typeof riderCx === "string" && riderCx.trim() ? riderCx.trim() : null;
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
  const [savedCopy, setSavedCopy] = useState<OrderCopy | null>(null);

  // ── screen state ──
  const [panel, setPanel] = useState<Panel>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [choosingId, setChoosingId] = useState<string | null>(null);
  const [chooseSlow, setChooseSlow] = useState(false);
  const [prevPrice, setPrevPrice] = useState<number | null>(null);
  const [priceNote, setPriceNote] = useState(false);
  const [cancelReason, setCancelReason] = useState<number | null>(null);
  const [stars, setStars] = useState(0);
  const [tagIdx, setTagIdx] = useState<number[]>([]);
  const [rated, setRated] = useState<{ stars: number; tags: RatingTag[] } | null>(null);
  const [skipped, setSkipped] = useState(false);
  const [undoLeft, setUndoLeft] = useState(0);
  const [sosSent, setSosSent] = useState(false);
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
    setSavedCopy(null);
    void loadRiderIdentity(orderId).then((i) => {
      if (alive && i) setRiderIdentity(i);
    });
    void loadOrderCopy(orderId).then((c) => {
      if (alive) setSavedCopy(c);
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

  // Persist the last-known order once per status transition: the bounded summary (other screens'
  // offline restore) and the full saved copy (this screen's 2.4). Both go when the order ends.
  const persistedStatus = useRef<string | null>(null);
  useEffect(() => {
    const d = orderQ.data;
    if (!d || d.status === persistedStatus.current) return;
    persistedStatus.current = d.status;
    const raw = qc.getQueryData<OrderSnapshot>(orderKey(orderId)) ?? d;
    if (ACTIVE.has(d.status) || d.status === "open_for_offers") {
      void saveLastActiveOrder(raw);
      void saveOrderCopy(raw);
    } else {
      void clearLastActiveOrder(d.id);
      void clearOrderCopy(d.id);
    }
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
  // The rider's first name, for following a rider-bail re-broadcast into state 13.
  const riderFirstRef = useRef<string>(A.rider);
  const followReopened = useCallback(
    (newOrderId: string) => router.replace(`/order/${newOrderId}?riderCx=${encodeURIComponent(riderFirstRef.current)}`),
    [router],
  );
  const { connected } = useOrderSocket(socketExpected ? orderId : null, followReopened, () => setNowMs(Date.now()));
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
    setSosSent(false);
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
  // 2.9b: "Still confirming…" after 5 s.
  useEffect(() => {
    setChooseSlow(false);
    if (!choosingId) return;
    const t = setTimeout(() => setChooseSlow(true), CHOOSE_SLOW_MS);
    return () => clearTimeout(t);
  }, [choosingId]);

  const rotateM = useMutation({
    mutationFn: () => rotateDeliveryCode(orderId),
    onSuccess: (res) => {
      setDeliveryCode(res.deliveryCode);
      setCodeAttemptsSeen(0);
      setCodeRotatedAtSeen(null);
      void saveDeliveryCode(orderId, res.deliveryCode);
    },
  });
  // "+ $0.50" (and state 13's "Raise to $X"): the new price shows only once the server confirms (2.5);
  // a failure leaves the price as it was and offers "Try again" (2.6).
  const raiseM = useMutation({
    mutationFn: (to: number) => raiseOrderPrice(orderId, to),
    onSuccess: (res, to) => {
      const from = Number(qc.getQueryData<OrderSnapshot>(orderKey(orderId))?.proposedFare ?? 0);
      qc.setQueryData<OrderSnapshot>(orderKey(orderId), (o) => (o ? { ...o, proposedFare: res.proposedFare ?? to.toFixed(2) } : o));
      setPrevPrice((p) => p ?? from);
      setPriceNote(true);
      AccessibilityInfo.announceForAccessibility(orderText.raised(to));
    },
    onError: (_e, to) => showToast({ text: A.raiseFail, action: A.tryAgain, actionIcon: "refresh-cw", onAction: () => raiseM.mutate(to), ttl: 0 }),
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
    // 2.24: back to the rate form with the stars and tags kept, and "Try again".
    onError: (_e, r) => {
      setRated(null);
      setPendingRating((cur) => (cur?.orderId === orderId ? null : cur));
      void clearPendingRating();
      showToast({ text: A.rateFail, action: A.tryAgain, actionIcon: "refresh-cw", onAction: () => rateM.mutate(r), ttl: 0 });
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

  // Cancel (1b, 10a/b): a failure keeps the panel open with "Try again" (2.22).
  const cancelM = useMutation({
    mutationFn: (reason: string | undefined) => cancelOrder(orderId, reason ? { reason } : {}),
    onSuccess: () => {
      setPanel(null);
      setCancelReason(null);
      void qc.invalidateQueries({ queryKey: orderKey(orderId) });
      void qc.invalidateQueries({ queryKey: ["history"] });
    },
    onError: (_e, reason) => showToast({ text: A.cancelFail, action: A.tryAgain, actionIcon: "refresh-cw", onAction: () => cancelM.mutate(reason), ttl: 0 }),
  });
  const notifyM = useMutation({
    mutationFn: () => {
      const pickup = qc.getQueryData<OrderSnapshot>(orderKey(orderId))?.pickup.point;
      if (!pickup) throw new Error("No pickup on this order yet.");
      return notifyWhenRiderOnline(pickup, orderId);
    },
  });
  // State 12's one-tap "Send again at $X" (2.21: in flight / failed).
  const resendM = useMutation({
    mutationFn: (price: number) => resendOrder(orderId, price),
    onSuccess: (res) => {
      haptic("tap");
      void qc.invalidateQueries({ queryKey: ["history"] });
      router.replace(`/order/${res.id}`);
    },
    onError: (_e, price) => showToast({ text: A.sendFail, action: A.tryAgain, actionIcon: "refresh-cw", onAction: () => resendM.mutate(price), ttl: 0 }),
  });

  const selectRace = selectM.error instanceof ApiError && selectM.error.status === 409;
  // The failures with their own "Try again" toast (raise, cancel, rate, resend) don't speak twice.
  useActionErrorEffect((selectRace ? null : selectM.error) ?? rotateM.error ?? null);
  useEffect(() => {
    selectM.reset();
    rotateM.reset();
    rateM.reset();
    cancelM.reset();
    notifyM.reset();
    resendM.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset stale mutation errors on a real status change.
  }, [status]);

  // ── which order is on screen: the live one, or the saved copy on an offline cold start (2.4) ──
  const loadErrorKind = !orderQ.data && orderQ.isError ? orderLoadErrorKind(orderQ.error instanceof ApiError ? orderQ.error.status : undefined) : null;
  const saved = loadErrorKind === "transient" && savedCopy != null ? savedCopy : null;
  const order: OrderSnapshot | undefined = orderQ.data ?? (saved ? selectOrderShell(saved.order) : undefined);
  const isRiderViewer = order?.viewerRole === "rider";
  const riderPoint = !saved && telemetry && telemetry.lat != null && telemetry.lng != null ? { lat: telemetry.lat, lng: telemetry.lng } : null;
  const { stage, gpsPaused, offline, noFix } = order
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
        reopened: reopenedFrom != null,
      })
    : { stage: "finding" as OrderStage, gpsPaused: false, offline: !online, noFix: false };
  const live = isLiveStage(stage);
  // Re-evaluate the 60s GPS-paused rule even when no new fix arrives.
  useEffect(() => {
    if (!live) return;
    const iv = setInterval(() => setNowMs(Date.now()), 15_000);
    return () => clearInterval(iv);
  }, [live]);
  useClaimOfflineBanner(true);

  // 2.10: when the window closes with offers on screen they stay choosable for 15 s.
  const windowEnd = order?.expiresAt ? Date.parse(order.expiresAt) : NaN;
  useEffect(() => {
    if (stage !== "offers" || !Number.isFinite(windowEnd)) return;
    const now = Date.now();
    if (now < windowEnd) {
      const t = setTimeout(() => setNowMs(Date.now()), windowEnd - now + 50);
      return () => clearTimeout(t);
    }
    if (now < windowEnd + CHOOSE_GRACE_MS) {
      const iv = setInterval(() => setNowMs(Date.now()), 1000);
      return () => clearInterval(iv);
    }
    return undefined;
  }, [stage, windowEnd, nowMs]);
  const graceLeftMs = stage === "offers" && Number.isFinite(windowEnd) && nowMs >= windowEnd ? Math.max(0, windowEnd + CHOOSE_GRACE_MS - nowMs) : null;

  // A rider who cancels before pickup: the server has already re-broadcast the order at the same price —
  // follow it, and show it as state 13 there (a finding state with the reason).
  useEffect(() => {
    if (stage === "retryRiderCancelled" && order?.rebroadcastedToId && !isRiderViewer && !saved) followReopened(order.rebroadcastedToId);
  }, [stage, order?.rebroadcastedToId, isRiderViewer, saved, followReopened]);

  // A live order with no local handover code (a dropped select response, a rotation while killed):
  // issue a fresh one once; the card shows "Getting your code…" meanwhile (2.14). No "Re-issue" button.
  const rotatedOnce = useRef(false);
  const rotate = rotateM.mutate;
  useEffect(() => {
    // A restaurant order (the route hands it to MerchantOrderScreen as soon as its type is known) never
    // gets a code from here: its code waits for both cash confirms (R-09).
    if (!live || isRiderViewer || saved || !codeRestored || deliveryCode || rotatedOnce.current || !online || order?.orderType === "merchant") return;
    rotatedOnce.current = true;
    rotate();
  }, [live, isRiderViewer, saved, codeRestored, deliveryCode, online, rotate, order?.orderType]);

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

  // ── layout shared by every state ──
  const area = areaH || Math.max(0, height - 80);
  const fontScale = PixelRatio.getFontScale();
  const frame = (p: {
    title: string;
    help?: boolean;
    map: React.ReactNode;
    banner?: string | null;
    content: React.ReactNode;
    bar: React.ReactNode;
    floor: number;
    fallbackShare: number;
    contentKey: string;
    toast?: Toast | null;
    overlays?: React.ReactNode;
  }): React.ReactElement => (
    <SafeAreaView edges={["top", "bottom"]} style={{ flex: 1, backgroundColor: tokens.color.bg }}>
      <OrderHeader title={p.title} help={!!p.help} onBack={() => onBack()} onHelp={() => setPanel("help")} />
      <View style={{ flex: 1 }} onLayout={(e) => setAreaH(e.nativeEvent.layout.height)}>
        {p.map}
        {p.banner ? (
          <View style={{ position: "absolute", left: 0, right: 0, top: 0, zIndex: 21 }}>
            <ReconnectBanner text={p.banner} />
          </View>
        ) : null}
        {area > 0 ? (
          <OrderSheet
            ref={sheetRef}
            areaHeight={area}
            fallbackShare={p.fallbackShare}
            floor={p.floor}
            bottomInset={p.bar ? ctaH : 0}
            contentKey={p.contentKey}
            reduceMotion={reduceMotion}
            onVisibleHeight={setSheetVisible}
          >
            {p.content}
          </OrderSheet>
        ) : null}
        {p.bar ? (
          <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 25 }} onLayout={(e) => setCtaH(e.nativeEvent.layout.height)}>
            {p.bar}
          </View>
        ) : null}
        {p.toast ? (
          <View style={{ position: "absolute", left: 12, right: 12, bottom: (p.bar ? ctaH : 0) + 10, zIndex: 35 }}>
            <OrderToast text={p.toast.text} icon={p.toast.icon} action={p.toast.action} actionIcon={p.toast.actionIcon} onAction={p.toast.onAction} />
          </View>
        ) : null}
      </View>
      {p.overlays}
    </SafeAreaView>
  );

  // 2.1 · 2.2 · 2.3 — opening / couldn't load / not found.
  if (!order) {
    if (orderQ.isLoading || !loadErrorKind) {
      return frame({ title: "", map: <BlankMap />, content: <OpeningSheet />, bar: null, floor: 0, fallbackShare: 0.34, contentKey: "opening" });
    }
    const gone = loadErrorKind !== "transient";
    const bar = gone ? (
      <OneButtonBar label={A.home} icon="home" onPress={() => goHomeClearingStack(router)} />
    ) : (
      <CtaBar>
        <CtaButton label={A.tryAgain} icon="refresh-cw" onPress={() => void orderQ.refetch()} loading={orderQ.isFetching} />
        <CtaButton ghost label={A.home} onPress={() => goHomeClearingStack(router)} />
      </CtaBar>
    );
    return frame({ title: "", map: <BlankMap />, content: <LoadErrorSheet gone={gone} />, bar, floor: 0, fallbackShare: 0.36, contentKey: gone ? "gone" : "fail" });
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
  riderFirstRef.current = riderFirst;
  const phone = order.counterpartyPhone;
  const masked = phoneMasked(stage);
  const eventAt = (s: string): string | null => order.events?.find((e) => e.status === s)?.createdAt ?? null;
  const pickedUpAt = eventAt("picked_up");
  const deliveredAt = eventAt("delivered");
  const toPickup = stage === "toPickup";
  const eta = live && !saved ? liveEta({ status: order.status, rider: riderPoint, pickup: order.pickup.point, dropoff: order.dropoff.point }) : null;
  const receipt: ReceiptView = {
    ref: orderText.ref(order.id),
    pickup: order.pickup.landmark,
    pickupAt: hhmm(pickedUpAt),
    dropoff: order.dropoff.landmark,
    dropoffAt: hhmm(deliveredAt),
    items: (order.items ?? []).map((i) => `${i.description} × ${i.quantity}`),
    rider: rider ? orderText.riderLine(rider.name, rider.plate) : null,
    riderPhone: phone || masked ? maskPhone(phone) : null,
    price,
  };
  const ratedStars = rated?.stars ?? order.rating?.score ?? null;

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
  const nextPrice = Math.round((ask + 0.5) * 100) / 100;

  // ── actions ──
  const raise = (): void => {
    if (raiseM.isPending) return;
    setToast(null);
    raiseM.mutate(nextPrice);
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
  // Get help → Emergency: dial at once, and alert the safety team with the last-known fix, best-effort —
  // never delaying the call. The sheet then carries "Our safety team has been told" (2.18).
  const emergency = (): void => {
    haptic("alert");
    dial(SOS_POLICY.emergencyNumber);
    setSosSent(true);
    setPanel(null);
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
  const sendFlow = (fare: string | number): void =>
    router.push({
      pathname: "/send",
      params: buildRebroadcastParams({
        pickup: order.pickup,
        dropoff: order.dropoff,
        items: order.items,
        proposedFare: fare,
        note: order.note,
        createdAt: order.events?.[0]?.createdAt ?? null,
      }),
    });
  const report = async (typeIndex: number, text: string): Promise<boolean> => {
    const type = REPORT_TYPES[typeIndex] ?? "other";
    // The form's text is optional; the case still needs a description — the picked type stands in.
    const description = text || A.rp[typeIndex] || A.rp[4];
    try {
      await raiseIssue(orderId, { type, description, idempotencyKey: uuidV4FromSeed(`${orderId}|${type}|${description}`) });
      return true;
    } catch {
      showToast({ text: A.sendFail });
      return false;
    }
  };
  const submitRating = (): void => {
    const keys = stars <= 2 ? PARCEL_TAGS_LOW : PARCEL_TAGS;
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
  const cancelPanel = panel === "cancel" && live && !saved;
  const afterPickup = order.status === "picked_up" || order.status === "en_route_dropoff";
  const title = cancelPanel ? A[stageTitleKey(afterPickup ? "toDropoff" : "toPickup")] : A[stageTitleKey(stage)];
  const help = showsHelp(stage) && !isRiderViewer;
  const mapFrame: MapFrame = toPickup ? "pickupRider" : live || stage === "undelivered" || stage === "delivered" ? "riderDrop" : "route";
  const dim = cancelPanel || stage === "retryNoMatch" || stage === "retryRiderCancelled" || stage === "cancelled";
  const showRider = !saved && (live || stage === "undelivered" || stage === "delivered");
  const riderLabel = gpsPaused || offline ? orderText.lastSeen(minutesSince(telemetry?.updatedAt, nowMs)) : riderFirst;
  const suggested = suggestedRetryPrice(price);
  const savedAtText = saved ? hhmm(saved.at) : null;

  const trackVM: TrackVM = {
    status: order.status,
    toPickup,
    etaMinutes: eta?.minutes ?? null,
    stopName: toPickup ? order.pickup.landmark : order.dropoff.landmark,
    step: stepIndex(order.status),
    gpsPaused,
    offline,
    noFix,
    savedAt: savedAtText,
    rider,
    riderFirst,
    code: deliveryCode,
    showCode: !isRiderViewer && codeRestored && (deliveryCode != null || rotateM.isPending || (saved == null && rotatedOnce.current && !rotateM.isError)),
    photo: order.pickupPhotoUrl ? { url: order.pickupPhotoUrl, sub: orderText.photoSub(riderFirst, hhmm(pickedUpAt)) } : null,
    hasPhone: !!phone,
    sosSent,
    emergencyNumber: SOS_POLICY.emergencyNumber,
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
    onEmergency: () => dial(SOS_POLICY.emergencyNumber),
  };
  const cancelling = pendingOrQueued(cancelM) !== false;
  const findingBar = (
    <FindingBar
      confirming={panel === "cancelRequest"}
      onAsk={() => setPanel("cancelRequest")}
      onYes={() => cancelM.mutate(undefined)}
      onKeep={() => setPanel(null)}
      cancelling={cancelling}
      disabled={choosingId != null}
    />
  );

  let content: React.ReactNode = null;
  let bar: React.ReactNode = null;
  if (cancelPanel) {
    content = <CancelSheet afterPickup={afterPickup} riderFirst={riderFirst} reason={cancelReason} onReason={(i) => setCancelReason((c) => (c === i ? null : i))} />;
    bar = <CancelBar afterPickup={afterPickup} onKeep={() => setPanel(null)} onCancel={() => cancelM.mutate(cancelReasonText(cancelReason))} cancelling={cancelling} />;
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
          state: notifyM.isSuccess ? (notifyM.data?.queued ? "queued" : "unavailable") : notifyM.isError ? "unavailable" : "idle",
        }}
      />
    );
    bar = isRiderViewer ? null : findingBar;
  } else if (stage === "reopened") {
    content = <ReopenedSheet riderFirst={reopenedFrom ?? A.rider} price={ask} next={nextPrice} expiresAt={order.expiresAt} windowMs={OFFER_WINDOW_MS} frozen={frozen} onZero={() => void orderQ.refetch()} />;
    bar = panel === "cancelRequest" ? findingBar : <ReopenedBar next={nextPrice} onRaise={raise} raising={raiseM.isPending} onCancel={() => setPanel("cancelRequest")} />;
  } else if (stage === "offers") {
    const chooser = choosingId ? offerViews.find((o) => o.id === choosingId)?.name ?? A.rider : null;
    content = (
      <OffersSheet
        offers={offerViews}
        bestId={bestId}
        expiresAt={order.expiresAt}
        frozen={frozen}
        onZero={() => void orderQ.refetch()}
        price={ask}
        was={prevPrice}
        onRaise={raise}
        raising={raiseM.isPending}
        raisedNote={priceNote}
        choosingId={choosingId}
        confirming={chooser ? (chooseSlow ? orderText.choosingSlow(chooser) : orderText.choosing(chooser)) : null}
        onChoose={choose}
        graceLeftMs={graceLeftMs}
      />
    );
    bar = findingBar;
  } else if (stage === "toPickup" || stage === "toDropoff") {
    content = <TrackSheet vm={trackVM} a={trackA} />;
    bar = saved ? <OneButtonBar label={A.tryAgain} icon="refresh-cw" onPress={() => void orderQ.refetch()} loading={orderQ.isFetching} /> : null;
  } else if (stage === "handoff") {
    content = <HandoffSheet vm={trackVM} a={trackA} screenWidth={width} />;
    bar = trackVM.code ? <OneButtonBar label={A.shareCode} icon="share-2" onPress={shareCode} /> : null;
  } else if (stage === "retryNoMatch" || stage === "retryRiderCancelled") {
    content = <RetrySheet riderFirst={stage === "retryRiderCancelled" ? riderFirst : null} lastPrice={price} suggested={suggested} />;
    bar = isRiderViewer ? null : <RetryBar suggested={suggested} onSend={() => resendM.mutate(suggested)} onEdit={() => sendFlow(suggested)} sending={pendingOrQueued(resendM) !== false} />;
  } else if (stage === "delivered") {
    const showRate = !isRiderViewer && !rated && !skipped && !order.rating;
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
      <RatedSheet riderFirst={riderFirst} stars={ratedStars} receipt={receipt} onShareReceipt={() => share(orderText.receiptText(receipt))} />
    );
    bar = showRate ? <RateBar onSkip={() => setSkipped(true)} onSubmit={submitRating} canSubmit={stars > 0} /> : <OneButtonBar label={A.home} onPress={() => goHomeClearingStack(router)} />;
  } else if (stage === "completed") {
    // 2.25: not rated yet and delivered within 7 days (the server says it still takes a rating).
    const deliveredMs = deliveredAt ? Date.parse(deliveredAt) : NaN;
    const canRateLater = !isRiderViewer && order.rating === null && !rated && !skipped && Number.isFinite(deliveredMs) && nowMs - deliveredMs < RATE_LATE_MS;
    content = (
      <CompletedSheet
        deliveredAt={deliveredAt}
        riderFirst={riderFirst}
        stars={ratedStars}
        rateLater={canRateLater ? { riderPhoto: rider?.photoUrl ?? null, riderInitials: rider?.initials ?? "", stars, onStars, tags: tagIdx, onTag: toggleTag } : null}
        receipt={receipt}
        onShareReceipt={() => share(orderText.receiptText(receipt))}
        onHelp={() => setPanel("report")}
      />
    );
    bar = isRiderViewer ? null : canRateLater && stars > 0 ? <RateBar onSkip={() => setSkipped(true)} onSubmit={submitRating} canSubmit /> : <OneButtonBar label={A.sendAgain} icon="refresh-cw" onPress={() => sendFlow(order.proposedFare)} />;
  } else if (stage === "undelivered") {
    content = (
      <NotDeliveredSheet
        riderFirst={riderFirst}
        reason={orderText.undeliveredReason(order.undeliveredReason, order.undeliveredAttempts)}
        body={orderText.undeliveredBody(order.undeliveredReason, riderFirst)}
        rider={rider}
      />
    );
    bar = isRiderViewer ? null : (
      <TwoButtonBar primary={{ label: A.callRider, icon: "phone", onPress: () => dial(phone) }} secondary={{ label: A.sendAgain, icon: "refresh-cw", onPress: () => sendFlow(order.proposedFare) }} />
    );
  } else {
    const by = order.cancelledBy;
    const lynia = by !== "customer" && by !== "rider";
    const headline = by === "customer" ? A.cxYou : by === "rider" ? orderText.cxRider(riderFirst) : A.cxLynia;
    content = <CancelledSheet headline={headline} reason={order.cancelReason ?? null} extra={lynia ? A.cxLyniaGeneric : null} />;
    bar = isRiderViewer ? null : lynia ? (
      <TwoButtonBar primary={{ label: A.sendAgain, icon: "refresh-cw", onPress: () => sendFlow(order.proposedFare) }} secondary={{ label: A.callSupport, icon: "phone", onPress: () => dial(SOS_POLICY.safetyLine) }} />
    ) : (
      <OneButtonBar label={A.sendAgain} icon="refresh-cw" onPress={() => sendFlow(order.proposedFare)} />
    );
  }
  // An offline cold start keeps the stage's sheet but its one action is "Try again" (2.4).
  if (saved && !live) bar = <OneButtonBar label={A.tryAgain} icon="refresh-cw" onPress={() => void orderQ.refetch()} loading={orderQ.isFetching} />;

  const banner = saved
    ? orderText.savedCopy(savedAtText ?? "")
    : offline || (live && frozen)
      ? orderText.offline(hhmm(telemetry?.updatedAt ?? (orderQ.dataUpdatedAt ? new Date(orderQ.dataUpdatedAt).toISOString() : null)))
      : null;
  const undoToast: Toast | null =
    rated && undoLeft > 0 ? { text: orderText.rated(riderFirst, rated.stars), icon: "circle-check", action: orderText.undo(undoLeft), actionIcon: "undo-2", onAction: undoRating, ttl: 0 } : null;
  const peekStage: OrderStage = cancelPanel ? "toPickup" : stage;

  return frame({
    title,
    help,
    map: (
      <OrderMap
        pickup={order.pickup.point}
        dropoff={order.dropoff.point}
        rider={riderPoint}
        riderLabel={riderLabel}
        riderPaused={gpsPaused || offline}
        showRider={showRider}
        toPickupLine={toPickup}
        rings={stage === "finding" || stage === "reopened"}
        dim={dim}
        frame={mapFrame}
        padBottom={sheetVisible || Math.round(area * (1 - stageMapShare(peekStage)))}
        reduceMotion={reduceMotion}
      />
    ),
    banner,
    content,
    bar,
    floor: stagePeekFloor(peekStage, height, fontScale),
    fallbackShare: stageMapShare(peekStage),
    contentKey: `${stage}|${cancelPanel ? "c" : ""}|${rated ? "r" : ""}|${skipped ? "s" : ""}|${noFix ? "n" : ""}|${saved ? "v" : ""}`,
    toast: undoToast ?? toast,
    overlays: (
      <>
        <HelpPanel
          visible={panel === "help"}
          onClose={() => setPanel(null)}
          onEmergency={emergency}
          onShareTrip={() => share(orderText.shareTrip(order.pickup.landmark, order.dropoff.landmark, rider?.name ?? null, rider?.plate ?? null, orderText.ref(order.id)))}
          onReport={() => setPanel("report")}
        />
        <ReportPanel visible={panel === "report"} onClose={() => setPanel(null)} onSend={report} />
        <PhotoViewer
          url={order.pickupPhotoUrl ?? null}
          caption={orderText.photoBy(riderFirst, hhmm(pickedUpAt), order.pickup.landmark)}
          visible={panel === "photo"}
          onClose={() => setPanel(null)}
        />
      </>
    ),
  });
}
