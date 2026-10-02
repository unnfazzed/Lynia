import { type MerchantOrderResponse, type MerchantOrderTrackView, ORDER_SCHEDULE, type OrderStatusEvent, type RatingTag, RESTAURANTS_TIMING, SOS_POLICY, type VenueRatingTag } from "@lynia/shared";
import { tokens } from "@lynia/shared/tokens";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useFocusEffect, useRouter } from "expo-router";
import * as Location from "expo-location";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, ActivityIndicator, BackHandler, Linking, ScrollView, Share, Text, useWindowDimensions, View } from "react-native";
import { SafeAreaInsetsContext, SafeAreaView } from "react-native-safe-area-context";
import { ApiError } from "../api/client";
import { cancelUnpaidFoodOrder, changeFoodOrderSchedule, confirmFoodCustomerCash, confirmFoodSubstitution, rateFoodVenue, respondToFoodOrderItems } from "../api/food-orders";
import { cancelOrder, getOrder, type OrderSnapshot, rateOrder, rotateDeliveryCode } from "../api/orders";
import { raiseIssue, raiseSos } from "../api/safety";
import {
  clearDeliveryCode,
  clearPendingRating,
  loadDeliveryCode,
  loadDeliveryCodeAttempts,
  loadDeliveryCodeRotatedAt,
  loadPendingRating,
  type PendingRating,
  saveDeliveryCode,
  saveDeliveryCodeAttempts,
  saveDeliveryCodeRotatedAt,
  savePendingRating,
} from "../auth/session";
import { supportWhatsAppUrl } from "../config";
import { canCancelFreely } from "../logic/food-checkout";
import { codeEligible, handshakeState } from "../logic/food-doorstep";
import {
  awaitingKitchenConfirm,
  codeCopied,
  type Eta,
  isOpenRound,
  isRiderStage,
  isScheduledWaiting,
  merchantEta,
  merchantService,
  type MerchantService,
  type MerchantStage,
  prepProgress,
  readyAtMs,
  resolveMerchantStage,
  roundClock,
  roundTakenOff,
  serverTrackStep,
  shortOrderId,
  slotDay,
  type SubAnswer,
  substitutionLines,
  substitutionState,
} from "../logic/merchant-order";
import { goHomeClearingStack } from "../logic/nav";
import type { ChosenSlot } from "../logic/review";
import { minutesSince } from "../logic/order-stage";
import { reconcileDeliveryCode, reconcilePendingRating } from "../logic/order-tracking";
import { loadFoodOrderSnapshot, saveFoodOrderSnapshot } from "../net/food-order-store";
import { useClaimOfflineBanner } from "../net/offline-banner-owner";
import { useReachability } from "../net/use-reachability";
import { orderKey } from "../query/client";
import { foodOrderKey, useFoodOrder } from "../query/use-food-order";
import { useScheduleSlots } from "../query/use-order-flow";
import { useForegroundRefetch } from "../realtime/use-foreground-refetch";
import { useOrderSocket } from "../realtime/use-order-socket";
import { haptic, useDial } from "../ui/index";
import { Icon } from "../ui/Icon";
import { clock, hhmm, initials, riderShortName } from "../ui/order/copy";
import { OrderToast } from "../ui/order/kit";
import { BlankMap } from "../ui/order/OrderMap";
import { OrderSheet, type OrderSheetHandle, PeekMark } from "../ui/order/OrderSheet";
import { OrderHeader } from "../ui/order/panels";
import { useReduceMotion } from "../ui/useReduceMotion";
import { O, O_ADDED, ofFmt } from "../ui/orderflow/copy";
import { doorWhere, OX, OXS, rxReasonLabel, svcCopy, trackLabels, withRider } from "../ui/orderflow/kit-copy";
import {
  AnswerHead,
  Bar,
  Btn,
  Card,
  CodeBig,
  Disc,
  DoorCard,
  type DoorRow,
  type EtaView,
  GoldStars,
  KV,
  type LineView,
  LinkRow,
  Mut,
  Note,
  OrderSummary,
  PhotoRow,
  PhotoViewer,
  PrepBar,
  RateRow,
  RiderCard,
  type RiderCardView,
  SmallStars,
  StageTitle,
  StageTop,
  SubCard,
  TAB,
  Track,
  usd,
  VenueDisc,
  VenueRow,
} from "../ui/orderflow/kit";
import { MerchantMap } from "../ui/orderflow/MerchantMap";
import { CancelSheet, HelpSheet, REPORT_ISSUE_TYPES, ReportSheet } from "../ui/orderflow/panels";
import { ScheduleSheet } from "../ui/orderflow/review";
import { uuidV4FromSeed } from "../util";

/**
 * The customer's order screen for a MERCHANT (restaurant) order — Order flow v2.1
 * (`packages/design/handoff/order-flow-v2/`, ledger D-59), on the After Send v2 shell: ‹ Back · venue
 * name · red Help, a full-bleed map from the first second, and a sheet whose order never changes —
 * stage title → ETA hero → four-step track → the stage's block → the rest. Done and the endings are
 * full pages (no map). README states: T2–T4, T5a/b/c, T6, T7, T9, T11a/b, T12a/b, T13a/b, T14a–d,
 * T15a/c/d, T16a/b, U2 (removals), P1/P1s/P1b/P2/P2b/P3a/P3b, D1/D1b, D2a/b, D3a–f, D4, D5a/b — for
 * restaurant, shop and pharmacy orders alike (README "Per service": `venue.businessType/shopKind` picks
 * Cooking vs Packing, dishes vs items, the pin's tile and sticker).
 *
 * Server rules stay as they are: the delivery code only after both cash confirms (2-minute ring), the
 * free cancel only where the server accepts one, the item approval's 60 s window.
 */

const C = tokens.color;
const NOTE_MS = 4_000;
const RATE_UNDO_S = 10;
const RATE_LATE_MS = 7 * 24 * 60 * 60 * 1000;
const ACCEPT_WINDOW_MS = 3 * 60_000;
const ITEM_WINDOW_MS = 60_000;
/** The rider tags, index-aligned with `O.d.tagsR` (On time · Friendly · Careful with food · Easy to reach). */
const RIDER_TAGS: readonly RatingTag[] = ["on_time", "friendly", "careful_with_food", "easy_to_reach"];
/** The venue tags, index-aligned with `O.d.tagsV` (4–5 stars) and `O.d.tagsVbad` (1–3 stars). */
const VENUE_TAGS: readonly VenueRatingTag[] = ["tasty", "hot", "well_packed", "right_order"];
const VENUE_TAGS_BAD: readonly VenueRatingTag[] = ["cold", "missing_item", "spilled", "wrong_item"];
const venueTagsFor = (stars: number): readonly VenueRatingTag[] => (stars >= 4 ? VENUE_TAGS : VENUE_TAGS_BAD);
/** T8 → T9: the pickup-photo row leads the sheet while the photo is this fresh, then follows the rider card. */
const FRESH_PHOTO_MS = 5 * 60_000;
/** U3: the timeout toast is said once, and only while the timeout is news. */
const TIMEOUT_NEWS_MS = 5 * 60_000;
const AFTER_PICKUP = new Set(["picked_up", "en_route_dropoff", "delivered", "completed", "undelivered"]);
const LIVE_STATUS = new Set(["assigned", "confirmed", "en_route_pickup", "picked_up", "en_route_dropoff"]);
const DAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

type Toast = { text: string; icon?: "circle-alert" | "circle-check" | "timer" | "bike"; action?: string; onAction?: () => void; ttl?: number };
type Panel = null | "help" | "report" | "cancel" | "schedule";

/** D-71: what the customer pays for delivery — the fee less the venue's share (0 on free delivery). */
const customerFeeOf = (o: MerchantOrderResponse): number => o.customerDeliveryFee ?? o.deliveryFee ?? 0;
/** D-71: the receipt's Delivery fee value — "Free, paid by {venue}" when the venue paid it. */
const feeTextOf = (o: MerchantOrderResponse, venue: string): string =>
  o.merchantDeliveryShare != null && customerFeeOf(o) === 0 ? ofFmt(O_ADDED.r.freePaidBy, { v: venue }) : usd(customerFeeOf(o));

/** The four cash-handshake fields, explicit (the response omits them when empty). */
const cashOf = (o: MerchantOrderResponse): { paymentMethod: string | null; customerCashConfirmedAt: string | null; riderCashConfirmedAt: string | null; cashHandshakeFrozenAt: string | null } => ({
  paymentMethod: o.paymentMethod,
  customerCashConfirmedAt: o.customerCashConfirmedAt ?? null,
  riderCashConfirmedAt: o.riderCashConfirmedAt ?? null,
  cashHandshakeFrozenAt: o.cashHandshakeFrozenAt ?? null,
});

const fmtRange = (e: Extract<Eta, { kind: "range" }>): string => ofFmt(O.t.etaRange, { a: hhmm(new Date(e.fromMs).toISOString()), b: hhmm(new Date(e.toMs).toISOString()) }).replace(/^Arrives /, "");
const dayTime = (iso: string | null | undefined, nowMs: number): string => {
  if (!iso) return "";
  const d = new Date(iso);
  const today = new Date(nowMs);
  const same = d.getFullYear() === today.getFullYear() && d.getMonth() === today.getMonth() && d.getDate() === today.getDate();
  return `${same ? O.r.today : DAYS[d.getDay()]} ${hhmm(iso)}`;
};

export function MerchantOrderScreen({ orderId }: { orderId: string }): React.ReactElement {
  const qc = useQueryClient();
  const router = useRouter();
  const dial = useDial();
  const online = useReachability();
  const reduceMotion = useReduceMotion();
  const { width, height } = useWindowDimensions();
  useClaimOfflineBanner(true);

  // ── the two reads: the food order (phase, items, cash) + the generic snapshot (map, events, rider) ──
  const food = useFoodOrder(orderId, orderId !== "");
  const order = food.order;
  const status = order?.status;
  // README "Per service": Cooking vs Packing, dishes vs items, the pin's tile and sticker.
  const svc: MerchantService = merchantService(order?.venue);
  const S = svcCopy(svc);
  /** The venue's own section — Order again, Try again and "See other places" go back there. */
  const section = svc === "food" ? "/food" : svc === "shops" ? "/shops" : "/pharmacy";
  const socketExpected = !!order && (order.riderId != null || LIVE_STATUS.has(order.status));
  const [nowMs, setNowMs] = useState(() => Date.now());
  // The server's track (BRIEF §4) from the `order:status` push, until the refetch it triggers lands.
  const [socketTrack, setSocketTrack] = useState<MerchantOrderTrackView | null>(null);
  const onStatus = useCallback(
    (e: OrderStatusEvent) => {
      if (e.track) setSocketTrack(e.track);
      void qc.invalidateQueries({ queryKey: foodOrderKey(orderId) });
    },
    [qc, orderId],
  );
  const { connected } = useOrderSocket(socketExpected ? orderId : null, undefined, () => setNowMs(Date.now()), onStatus);
  const foodUpdatedAt = qc.getQueryState(foodOrderKey(orderId))?.dataUpdatedAt ?? 0;
  useEffect(() => {
    setSocketTrack(null);
  }, [foodUpdatedAt]);
  const snapQ = useQuery({
    queryKey: orderKey(orderId),
    queryFn: () => getOrder(orderId),
    enabled: orderId !== "",
    refetchInterval: () => (status === "cancelled" || status === "completed" ? false : connected ? false : status && LIVE_STATUS.has(status) ? 5_000 : 15_000),
  });
  const snap: OrderSnapshot | undefined = snapQ.data;
  useForegroundRefetch(() => {
    void qc.invalidateQueries({ queryKey: orderKey(orderId) });
    void qc.invalidateQueries({ queryKey: foodOrderKey(orderId) });
  });
  // Keep the two reads in step: a status the socket brings to the snapshot refetches the food order, and
  // a phase / status change on the food order refetches the snapshot.
  const snapStatus = snap?.status;
  useEffect(() => {
    if (snapStatus) void qc.invalidateQueries({ queryKey: foodOrderKey(orderId) });
  }, [snapStatus, qc, orderId]);
  const phaseKey = `${order?.status}|${order?.merchantPhase}|${order?.riderId}`;
  useEffect(() => {
    void qc.invalidateQueries({ queryKey: orderKey(orderId) });
  }, [phaseKey, qc, orderId]);

  // ── the rider-drop latch (a ready order with no rider looks the same before and after a drop) ──
  const [sawRider, setSawRider] = useState(false);
  useEffect(() => {
    if (order?.riderId != null) setSawRider(true);
  }, [order?.riderId]);
  useEffect(() => {
    let alive = true;
    void loadFoodOrderSnapshot().then((s) => {
      if (alive && s?.orderId === orderId && s.sawRider) setSawRider(true);
    });
    return () => {
      alive = false;
    };
  }, [orderId]);
  useEffect(() => {
    if (order && order.status !== "cancelled") void saveFoodOrderSnapshot(order.id, order.status, order.merchantPhase, sawRider);
  }, [order, sawRider]);

  // ── the delivery code: restored from SecureStore, reconciled against server rotations ──
  const [code, setCode] = useState<string | null>(null);
  const [codeRestored, setCodeRestored] = useState(false);
  const [attemptsSeen, setAttemptsSeen] = useState<number | null>(null);
  const [rotatedSeen, setRotatedSeen] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    void Promise.all([loadDeliveryCode(orderId), loadDeliveryCodeAttempts(orderId), loadDeliveryCodeRotatedAt(orderId)])
      .then(([c, hw, rot]) => {
        if (!alive) return;
        setCode(c);
        setAttemptsSeen(hw);
        setRotatedSeen(rot);
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
    const d = reconcileDeliveryCode({
      hasLocalCode: code != null,
      storedAttemptsHighWater: attemptsSeen,
      snapshotAttempts: snap?.deliveryOtpAttempts ?? null,
      storedCodeRotatedAt: rotatedSeen,
      snapshotCodeRotatedAt: snap?.codeRotatedAt ?? null,
    });
    if (d.action === "invalidate") {
      setCode(null);
      setAttemptsSeen(null);
      setRotatedSeen(null);
      void clearDeliveryCode(orderId);
    } else if (d.action === "advance-highwater") {
      setAttemptsSeen(d.attempts);
      void saveDeliveryCodeAttempts(orderId, d.attempts);
    } else if (d.action === "sync-rotation-ts") {
      setRotatedSeen(d.codeRotatedAt);
      void saveDeliveryCodeRotatedAt(orderId, d.codeRotatedAt);
    }
  }, [snap?.deliveryOtpAttempts, snap?.codeRotatedAt, code, attemptsSeen, rotatedSeen, orderId]);
  const riderDropped = sawRider && order != null && order.riderId == null && order.merchantPhase === "ready_for_pickup";
  // A drop clears the server's code: forget ours so it is never read to the next rider.
  useEffect(() => {
    if (!riderDropped || !code) return;
    setCode(null);
    void clearDeliveryCode(orderId);
  }, [riderDropped, code, orderId]);
  // The code is issued only once both cash confirms have landed (R-09, server-enforced).
  const codeInFlight = useRef(false);
  useEffect(() => {
    if (!order || order.status !== "en_route_dropoff" || !codeRestored || code || !online || codeInFlight.current) return;
    if (!codeEligible(cashOf(order))) return;
    codeInFlight.current = true;
    void rotateDeliveryCode(orderId)
      .then((res) => {
        setCode(res.deliveryCode);
        setAttemptsSeen(0);
        setRotatedSeen(null);
        void saveDeliveryCode(orderId, res.deliveryCode);
      })
      .catch(() => undefined)
      .finally(() => {
        codeInFlight.current = false;
      });
  }, [order, codeRestored, code, online, orderId]);

  // ── screen state ──
  const [panel, setPanel] = useState<Panel>(null);
  const [toast, setToast] = useState<Toast | null>(null);
  const [summaryOpen, setSummaryOpen] = useState(false);
  const [ctaH, setCtaH] = useState(0);
  const [areaH, setAreaH] = useState(0);
  const [sheetVisible, setSheetVisible] = useState(0);
  const sheetRef = useRef<OrderSheetHandle>(null);
  const showToast = useCallback((t: Toast) => {
    setToast(t);
    AccessibilityInfo.announceForAccessibility(t.text);
  }, []);
  useEffect(() => {
    if (!toast || toast.ttl === 0) return;
    const t = setTimeout(() => setToast(null), toast.ttl ?? NOTE_MS);
    return () => clearTimeout(t);
  }, [toast]);
  const failText = (e: unknown, fallback: string): string => (!online ? O.c.noData : e instanceof ApiError && e.message ? e.message : fallback);

  // ── mutations ──
  const invalidate = (): void => {
    void qc.invalidateQueries({ queryKey: foodOrderKey(orderId) });
    void qc.invalidateQueries({ queryKey: orderKey(orderId) });
  };
  const cashM = useMutation({
    mutationFn: () => confirmFoodCustomerCash(orderId),
    onSuccess: () => {
      haptic("tap");
      invalidate();
    },
    onError: (e) => showToast({ text: failText(e, O.c.noData) }),
  });
  const itemsM = useMutation({
    mutationFn: (approve: boolean) => respondToFoodOrderItems(orderId, approve),
    onSuccess: () => invalidate(),
    onError: (e) => showToast({ text: failText(e, O.c.noData) }),
  });
  const cancelM = useMutation({
    mutationFn: async (p: { free: boolean; reason?: string }): Promise<void> => {
      if (p.free) await cancelUnpaidFoodOrder(orderId);
      else await cancelOrder(orderId, p.reason ? { reason: p.reason } : {});
    },
    onSuccess: () => {
      setPanel(null);
      invalidate();
      void qc.invalidateQueries({ queryKey: ["history"] });
    },
    onError: () => showToast({ text: O.t.cxFail }),
  });

  // ── T13a "Change time": Review's R5a schedule sheet on the venue's slots for this drop-off, read
  //    only while the sheet is open ──
  const slotsQ = useScheduleSlots(order?.merchantId, snap?.dropoff.point ?? null, panel === "schedule");
  const slotsFailed = panel === "schedule" && slotsQ.isError;
  // The context (not the hook): a host without a SafeAreaProvider (tests) reads no inset rather than throw.
  const insets = React.useContext(SafeAreaInsetsContext) ?? { bottom: 0 };
  const scheduledFor = order?.scheduledFor ?? null;
  const currentSlot = useMemo((): ChosenSlot | null => {
    const s = slotsQ.slots;
    if (!s || !scheduledFor) return null;
    const at = Date.parse(scheduledFor);
    const today = s.today.slots.find((x) => Date.parse(x.start) === at);
    if (today) return { day: "today", slot: today };
    const tomorrow = s.tomorrow.slots.find((x) => Date.parse(x.start) === at);
    return tomorrow ? { day: "tomorrow", slot: tomorrow } : null;
  }, [slotsQ.slots, scheduledFor]);
  useEffect(() => {
    if (!slotsFailed) return;
    setPanel(null);
    showToast({ text: online ? O.t.loadFailSub : O.c.noData });
  }, [slotsFailed, online, showToast]);
  const scheduleM = useMutation({
    mutationFn: (scheduledFor: string) => changeFoodOrderSchedule(orderId, scheduledFor),
    onSuccess: (o) => {
      haptic("tap");
      setPanel(null);
      qc.setQueryData(foodOrderKey(orderId), o);
      invalidate();
    },
    onError: (e) => {
      showToast({ text: failText(e, O.c.noData) });
      void qc.invalidateQueries({ queryKey: ["orderflow", "slots"] });
    },
  });

  // ── substitution (U2/U4a: answer every swap; Confirm sends them all; Cancel the whole order — free) ──
  const round = food.order?.substitution ?? null;
  const [answers, setAnswers] = useState<Record<string, SubAnswer>>({});
  const roundId = round?.id ?? null;
  useEffect(() => {
    setAnswers({});
  }, [roundId]);
  const subM = useMutation({
    mutationFn: (p: { roundId: string; answers: { lineId: string; accept: boolean }[] }) => confirmFoodSubstitution(orderId, p),
    onSuccess: (o) => {
      haptic("tap");
      qc.setQueryData(foodOrderKey(orderId), o);
      invalidate();
    },
    onError: (e) => {
      // round_expired / round_closed: the server already settled it — say so and show what it did.
      showToast({ text: failText(e, O.c.noData) });
      invalidate();
    },
  });
  // U3: a round that ran out is said once, while it is news.
  const timeoutSaid = useRef<string | null>(null);
  const roundStatus = round?.status;
  const roundResolvedAt = round?.resolvedAt ?? null;
  const orderTotalNow = food.order?.total ?? null;
  useEffect(() => {
    if (!round || roundStatus !== "timed_out" || timeoutSaid.current === round.id) return;
    const at = roundResolvedAt ? Date.parse(roundResolvedAt) : NaN;
    if (!Number.isFinite(at) || Date.now() - at > TIMEOUT_NEWS_MS) return;
    timeoutSaid.current = round.id;
    const off = roundTakenOff(round);
    const names = off.declinedSwaps.length ? off.declinedSwaps : off.removed;
    showToast({ text: ofFmt(O.u.timeout, { i: names.join(", "), p: usd(orderTotalNow ?? round.wasTotal - off.saved) }), icon: "timer" });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per round id
  }, [round?.id, roundStatus, roundResolvedAt]);

  // ── photos (T8b pickup photo, P5 door photo) ──
  const [viewer, setViewer] = useState<{ title: string; uri: string | null; caption: string } | null>(null);

  // ── rating (D1: one card, two rows — the venue, then the rider; 10 s Undo; a rider rating armed
  //    before an app kill is re-sent on the next start) ──
  const [stars, setStars] = useState(0);
  const [tagIdx, setTagIdx] = useState<number[]>([]);
  const [vStars, setVStars] = useState(0);
  const [vTagIdx, setVTagIdx] = useState<number[]>([]);
  const [rated, setRated] = useState<number | null>(null);
  const [vRated, setVRated] = useState<number | null>(null);
  const [skipped, setSkipped] = useState(false);
  const [undoLeft, setUndoLeft] = useState(0);
  const [pendingRating, setPendingRating] = useState<PendingRating | null>(null);
  const ratingFromStorage = useRef(false);
  const ratingRetry = useRef(false);
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
      invalidate();
      void qc.invalidateQueries({ queryKey: ["history"] });
    },
    onError: () => {
      setRated(null);
      setPendingRating((cur) => (cur?.orderId === orderId ? null : cur));
      void clearPendingRating();
      showToast({ text: O.c.noData });
    },
  });
  const venueM = useMutation({
    mutationFn: (r: { score: number; tags: VenueRatingTag[] }) => rateFoodVenue(orderId, { score: r.score, ...(r.tags.length ? { tags: r.tags } : {}) }),
    onSuccess: () => invalidate(),
    onError: () => {
      setVRated(null);
      showToast({ text: O.c.noData });
    },
  });
  useEffect(() => {
    const decision = reconcilePendingRating({ pending: pendingRating, order: snap ? { id: snap.id, status: snap.status } : null });
    if (decision === "clear") {
      setPendingRating(null);
      void clearPendingRating();
      return;
    }
    if (decision !== "retry" || !pendingRating || ratingRetry.current || !ratingFromStorage.current) return;
    ratingRetry.current = true;
    const ok = (pendingRating.tags ?? []).filter((t): t is RatingTag => (RIDER_TAGS as readonly string[]).includes(t));
    void rateOrder(pendingRating.orderId, { score: pendingRating.score, ...(ok.length ? { tags: ok } : {}) })
      .then(() => {
        setPendingRating(null);
        void clearPendingRating();
        invalidate();
      })
      .catch(() => undefined)
      .finally(() => {
        ratingRetry.current = false;
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-run on a new snapshot or marker only
  }, [snap, pendingRating]);
  type Armed = { rider: { score: number; tags: RatingTag[] } | null; venue: { score: number; tags: VenueRatingTag[] } | null };
  const undoTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const armed = useRef<Armed | null>(null);
  const rateMutate = rateM.mutate;
  const venueMutate = venueM.mutate;
  const sendArmed = useCallback(
    (r: Armed | null) => {
      if (r?.venue) venueMutate(r.venue);
      if (r?.rider) rateMutate(r.rider);
    },
    [rateMutate, venueMutate],
  );
  const commitRating = useCallback(() => {
    if (undoTimer.current) clearInterval(undoTimer.current);
    undoTimer.current = null;
    const r = armed.current;
    armed.current = null;
    setUndoLeft(0);
    sendArmed(r);
  }, [sendArmed]);
  useEffect(
    () => () => {
      if (undoTimer.current) clearInterval(undoTimer.current);
      if (armed.current) sendArmed(armed.current);
    },
    [sendArmed],
  );
  const submitRating = (canRider: boolean, canVenue: boolean): void => {
    const rider = canRider && stars ? { score: stars, tags: tagIdx.map((i) => RIDER_TAGS[i]).filter((t): t is RatingTag => t != null) } : null;
    const vt = venueTagsFor(vStars);
    const venue = canVenue && vStars ? { score: vStars, tags: vTagIdx.map((i) => vt[i]).filter((t): t is VenueRatingTag => t != null) } : null;
    if (!rider && !venue) return;
    armed.current = { rider, venue };
    ratingFromStorage.current = false;
    if (rider) {
      setPendingRating({ orderId, score: rider.score, tags: rider.tags });
      void savePendingRating(orderId, rider.score, rider.tags);
      setRated(rider.score);
    }
    if (venue) setVRated(venue.score);
    setSkipped(true);
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
    armed.current = null;
    setUndoLeft(0);
    setRated(null);
    setVRated(null);
    setSkipped(false);
    setPendingRating(null);
    void clearPendingRating();
  };

  // ── stage ──
  const venue = snap?.pickup.point ?? null;
  const dropoff = snap?.dropoff.point ?? null;
  const riderFix =
    snap?.rider && snap.rider.currentLat != null && snap.rider.currentLng != null ? { lat: snap.rider.currentLat, lng: snap.rider.currentLng, at: snap.rider.updatedAt } : null;
  const handshake = order ? handshakeState(cashOf(order)) : "pending";
  const res = order
    ? resolveMerchantStage({
        status: order.status,
        merchantPhase: order.merchantPhase,
        autoAccepted: order.autoAccepted,
        kitchenConfirmedAt: order.kitchenConfirmedAt,
        scheduled: isScheduledWaiting(order),
        rxStatus: order.prescription?.status ?? null,
        riderId: order.riderId,
        sawRider,
        rider: riderFix,
        venue,
        dropoff,
        assignedAt: snap?.events.find((e) => e.status === "assigned")?.createdAt ?? null,
        handshakeStarted: handshake === "waiting_rider" || handshake === "confirmed" || handshake === "frozen",
        nowMs,
      })
    : null;
  const stage: MerchantStage | null = res?.stage ?? null;

  // Clocks: a 1 s tick for the countdowns, 15 s to re-check the GPS-paused rule.
  const needsSecond = stage === "waiting" || stage === "itemApproval" || isOpenRound(round) || (stage === "door" && handshake === "waiting_rider");
  const needsSlow = stage != null && (isRiderStage(stage) || stage === "cooking" || stage === "confirming" || stage === "rxCheck" || stage === "rxDeclined");
  useEffect(() => {
    if (!needsSecond && !needsSlow) return;
    const iv = setInterval(() => setNowMs(Date.now()), needsSecond ? 1000 : 15_000);
    return () => clearInterval(iv);
  }, [needsSecond, needsSlow]);

  // T11b: say once that the rider had to cancel.
  const droppedSaid = useRef(false);
  const riderFirst = snap?.riderCard?.firstName || order?.rider?.firstName || "";
  useEffect(() => {
    // Only with a name to say: after the drop the order no longer carries the rider, and the title already says it.
    if (stage !== "riderDropped" || droppedSaid.current || !riderFirst) return;
    droppedSaid.current = true;
    showToast({ text: ofFmt(OX.droppedToast, { n: riderFirst }), icon: "bike" });
  }, [stage, riderFirst, showToast]);

  // A success cue when the rider has it and when it is delivered.
  const prevStatus = useRef<string | undefined>(undefined);
  useEffect(() => {
    const prev = prevStatus.current;
    if (status && prev && status !== prev && (status === "picked_up" || status === "delivered")) haptic("success");
    prevStatus.current = status;
  }, [status]);

  // ── Back: close a panel → collapse a full sheet → leave ──
  const leave = useCallback(() => (router.canGoBack() ? router.back() : goHomeClearingStack(router)), [router]);
  const onBack = useCallback((): boolean => {
    if (viewer) {
      setViewer(null);
      return true;
    }
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
  }, [panel, viewer, leave]);
  useFocusEffect(
    useCallback(() => {
      const sub = BackHandler.addEventListener("hardwareBackPress", onBack);
      return () => sub.remove();
    }, [onBack]),
  );

  const venueName = order?.venue?.name || snap?.merchantName || snap?.pickup.landmark || "";
  const area = areaH || Math.max(0, height - 80);
  // T14d: offline keeps the last state under an ink banner with the time of the last update.
  const lastUpdateMs = Math.max(snapQ.dataUpdatedAt || 0, qc.getQueryState(foodOrderKey(orderId))?.dataUpdatedAt || 0);
  const offlineBanner = !online && lastUpdateMs > 0 ? ofFmt(O.c.offline, { t: hhmm(new Date(lastUpdateMs).toISOString()) }) : null;

  const header = (help: boolean): React.ReactElement => <OrderHeader heavy title={venueName} help={help} onBack={() => onBack()} onHelp={() => setPanel("help")} />;
  const toastView = (bottom: number): React.ReactNode =>
    toast || ((rated != null || vRated != null) && undoLeft > 0) ? (
      <View style={{ position: "absolute", left: 12, right: 12, bottom, zIndex: 35 }}>
        {(rated != null || vRated != null) && undoLeft > 0 ? (
          <OrderToast
            text={
              rated != null && vRated != null
                ? ofFmt(withRider(O.d.rated, riderFirst), { v: venueName, a: `★${vRated}`, b: `★${rated}` })
                : `${O.d.youRated} ${rated != null ? riderFirst : venueName} ★${rated ?? vRated}`
            }
            icon="circle-check"
            action={`${O.c.undo} · ${undoLeft}`}
            actionIcon="undo-2"
            onAction={undoRating}
          />
        ) : toast ? (
          <OrderToast text={toast.text} icon={toast.icon} action={toast.action} onAction={toast.onAction} />
        ) : null}
      </View>
    ) : null;

  // ── panels (help · report · cancel) ──
  const waUrl = supportWhatsAppUrl();
  const emergency = (): void => {
    haptic("alert");
    dial(SOS_POLICY.emergencyNumber);
    setPanel(null);
    void Location.getForegroundPermissionsAsync()
      .then((p) => (p.status === Location.PermissionStatus.GRANTED ? Location.getLastKnownPositionAsync() : null))
      .then((pos) => raiseSos(orderId, pos ? { lat: pos.coords.latitude, lng: pos.coords.longitude } : {}))
      .catch(() => raiseSos(orderId).catch(() => undefined));
  };
  const itemNames = (order?.items ?? []).map((i) => i.name);
  const report = async (typeIndex: number, which: string[], text: string): Promise<boolean> => {
    const type = REPORT_ISSUE_TYPES[typeIndex] ?? "other";
    const label = O.t.rp[typeIndex] ?? O.t.rp[5];
    const description = [label, which.length ? which.join(", ") : null, text || null].filter(Boolean).join(" · ");
    try {
      await raiseIssue(orderId, { type, description, idempotencyKey: uuidV4FromSeed(`${orderId}|${type}|${description}`) });
      showToast({ text: O.t.rpDone, icon: "circle-check" });
      return true;
    } catch {
      showToast({ text: O.c.noData });
      return false;
    }
  };
  const freeCancel = !!order && (canCancelFreely(order.merchantPhase) || awaitingKitchenConfirm(order));
  // T15b: after the rider collects, the customer can still cancel — it costs the full total (D3f).
  const afterPickup = !!order && (order.status === "picked_up" || order.status === "en_route_dropoff");
  const orderTotal = order ? (order.total ?? (order.merchantGoodsTotal ?? 0) + customerFeeOf(order)) : 0;
  const riderCancel = !!order && order.riderId != null && (order.status === "assigned" || order.status === "confirmed" || order.status === "en_route_pickup");
  const panels = (
    <>
      <HelpSheet
        visible={panel === "help"}
        venue={venueName}
        venuePhone={order?.restaurantPhone ?? null}
        onWhatsApp={waUrl ? () => void Linking.openURL(waUrl).catch(() => undefined) : null}
        onReport={() => setPanel("report")}
        onCallVenue={() => dial(order?.restaurantPhone)}
        onEmergency={emergency}
        onClose={() => setPanel(null)}
      />
      <ReportSheet visible={panel === "report"} items={itemNames} onSend={report} onClose={() => setPanel(null)} />
      <ScheduleSheet
        visible={panel === "schedule" && slotsQ.slots != null}
        venue={venueName}
        making={S.making.toLowerCase()}
        slots={slotsQ.slots ?? null}
        initial={currentSlot}
        bottomInset={insets.bottom}
        onPick={(c) => (c.slot.start === currentSlot?.slot.start || scheduleM.isPending ? setPanel(null) : scheduleM.mutate(c.slot.start))}
        onClose={() => setPanel(null)}
      />
      <PhotoViewer visible={viewer != null} title={viewer?.title ?? ""} uri={viewer?.uri ?? null} caption={viewer?.caption ?? ""} onClose={() => setViewer(null)} />
      <CancelSheet
        visible={panel === "cancel"}
        venue={venueName}
        busy={cancelM.isPending}
        onKeep={() => setPanel(null)}
        onCancel={(reason) => cancelM.mutate({ free: freeCancel && !afterPickup, reason })}
        full={afterPickup ? { text: withRider(ofFmt(O.t.cxFull, { p: usd(orderTotal), place: S.place }), riderFirst), amount: usd(orderTotal) } : null}
      />
    </>
  );

  // ── T14a / b / c — opening, couldn't load, not found ──
  if (!order) {
    const notFound = food.isError && snapQ.error instanceof ApiError && snapQ.error.status === 404;
    if (food.isError && !food.isLoading) {
      return (
        <SafeAreaView edges={["top", "bottom"]} style={{ flex: 1, backgroundColor: C.bg }}>
          <OrderHeader heavy title="" help={false} onBack={() => onBack()} onHelp={() => undefined} />
          <View style={{ flex: 1, alignItems: "center", paddingTop: 120, paddingHorizontal: 32, gap: 8 }}>
            <Disc icon={notFound ? "package" : "wifi-off"} />
            <StageTitle style={{ textAlign: "center" }}>{notFound ? O.t.notFound : O.t.loadFail}</StageTitle>
            <Mut size={14} style={{ textAlign: "center" }}>
              {notFound ? O.t.notFoundSub : O.t.loadFailSub}
            </Mut>
          </View>
          <Bar>
            {notFound ? null : <Btn label={O.c.tryAgain} onPress={() => food.refetch()} loading={food.isFetching} />}
            <Btn kind="ghost" label={O.t.home} onPress={() => goHomeClearingStack(router)} />
          </Bar>
        </SafeAreaView>
      );
    }
    return (
      <SafeAreaView edges={["top", "bottom"]} style={{ flex: 1, backgroundColor: C.bg }}>
        <OrderHeader heavy title="" help={false} onBack={() => onBack()} onHelp={() => undefined} />
        <View style={{ flex: 1 }}>
          <BlankMap />
          <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, height: "40%", backgroundColor: C.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, padding: 16, paddingTop: 28, gap: 14, ...tokens.shadow.sheet }}>
            <View style={{ height: 20, width: "70%", borderRadius: 8, backgroundColor: C.surface }} />
            <View style={{ height: 12, width: "45%", borderRadius: 8, backgroundColor: C.surface }} />
            <View style={{ height: 40, borderRadius: 8, backgroundColor: C.surface }} />
            <View style={{ height: 72, borderRadius: 12, backgroundColor: C.surface }} />
            <Mut style={{ textAlign: "center" }}>{O.t.loading}</Mut>
          </View>
        </View>
      </SafeAreaView>
    );
  }

  // ── view model ──
  const total = order.total ?? (order.merchantGoodsTotal ?? 0) + customerFeeOf(order);
  const keptItems = order.items.filter((i) => i.available !== false);
  const lines: LineView[] = keptItems.map((i) => ({ qty: i.quantity, name: i.name, price: i.priceUsd * i.quantity, note: i.note }));
  const count = keptItems.reduce((a, i) => a + i.quantity, 0);
  const shortId = order.shortId || shortOrderId(order.id);
  const orderNo = ofFmt(O.c.orderNo, { id: shortId });
  const card = snap?.riderCard ?? null;
  const fr = order.rider ?? null;
  const rider: RiderCardView | null = card
    ? {
        name: riderShortName(card.firstName, card.lastName),
        initials: initials(card.firstName, card.lastName),
        photoUrl: card.photoUrl,
        ratingAvg: card.ratingCount > 0 ? card.ratingAvg : null,
        trips: card.tripsCount,
        plate: card.plate,
        verified: card.verified,
      }
    : fr
      ? {
          name: riderShortName(fr.firstName, fr.lastName),
          initials: initials(fr.firstName, fr.lastName),
          photoUrl: fr.photoUrl,
          ratingAvg: fr.ratingCount > 0 ? fr.ratingAvg : null,
          trips: fr.tripsCount,
          plate: fr.plate,
          verified: fr.kycVerified,
        }
      : null;
  const rFirst = riderFirst || rider?.name || "";
  const phone = snap?.counterpartyPhone ?? null;
  const whatsapp = (): void => {
    const digits = (phone ?? "").replace(/\D/g, "");
    if (digits) void Linking.openURL(`https://wa.me/${digits}`).catch(() => undefined);
  };
  const riderCard = rider ? <RiderCard r={rider} onCall={phone ? () => dial(phone) : null} onWhatsApp={phone ? whatsapp : null} /> : null;
  const venueRow = <VenueRow svc={svc} name={venueName} sub={orderNo} onCall={order.restaurantPhone ? () => dial(order.restaurantPhone) : null} />;
  const summary = <OrderSummary svc={svc} count={count} total={total} lines={lines} open={summaryOpen} onToggle={() => setSummaryOpen((o) => !o)} />;
  const trackView = socketTrack ?? order.track;
  const step = serverTrackStep(order, trackView);
  // BRIEF §4: pharmacy step 1 reads "Prescription checked" once the Rx was approved.
  const rxChecked = trackView?.rxChecked ?? order.prescription?.status === "approved";
  const labels = trackLabels(svc, rxChecked);
  const track = <Track labels={labels} current={stage === "scheduled" ? -1 : step} reduceMotion={reduceMotion} />;
  // BRIEF §12: the slot ("12:30–13:00") and its day ("tomorrow") for a scheduled order.
  const slot = order.scheduledFor
    ? {
        day: slotDay(order.scheduledFor, nowMs, { today: O.r.today.toLowerCase(), tomorrow: O.r.tomorrow.toLowerCase() }, DAYS),
        range: `${hhmm(order.scheduledFor)}–${hhmm(new Date(Date.parse(order.scheduledFor) + ORDER_SCHEDULE.slotMinutes * 60_000).toISOString())}`,
      }
    : null;
  const prep = prepProgress(order, nowMs);
  const etaRaw = stage ? merchantEta({ stage, noFix: res?.noFix ?? false, nowMs, readyMs: readyAtMs(order), venue, dropoff, rider: riderFix }) : null;
  const eta: EtaView | null = !etaRaw
    ? null
    : etaRaw.kind === "range"
      ? { kind: "range", text: fmtRange(etaRaw) }
      : res?.gpsPaused
        ? { kind: "range", text: fmtRange({ kind: "range", fromMs: Math.floor(etaRaw.atMs / 300_000) * 300_000, toMs: Math.floor(etaRaw.atMs / 300_000) * 300_000 + 600_000 }) }
        : { kind: "one", chip: `~${etaRaw.minutes} ${O.c.min}`, at: ofFmt(OX.arrivesAt, { t: hhmm(new Date(etaRaw.atMs).toISOString()) }) };
  const cancelLink = (label: string): React.ReactNode => <LinkRow label={label} onPress={() => setPanel("cancel")} />;
  const deliveredAt = order.deliveredAt ?? snap?.events.find((e) => e.status === "delivered")?.createdAt ?? null;
  const placedAt = order.createdAt ?? snap?.events[0]?.createdAt ?? null;

  // ── D1 / D2 — Done (a full page: hero, the two-row rating — venue + rider —, the receipt, Order again) ──
  if (stage === "delivered" || stage === "completed") {
    const snapRated = snap?.rating?.score ?? null;
    const shownRated = rated ?? snapRated;
    const shownVenue = vRated ?? order.venueRating?.score ?? null;
    const deliveredMs = deliveredAt ? Date.parse(deliveredAt) : NaN;
    const inWindow = stage === "delivered" || (Number.isFinite(deliveredMs) && nowMs - deliveredMs < RATE_LATE_MS);
    const canRider = !!rider && !shownRated;
    const canVenue = !!venueName && !shownVenue;
    const canRate = !skipped && inWindow && (canRider || canVenue);
    const later = stage === "completed";
    const ratedRows = [
      shownVenue ? { name: venueName, v: shownVenue } : null,
      shownRated && rider ? { name: rFirst, v: shownRated } : null,
    ].filter((r): r is { name: string; v: number } => r != null);
    const goods = order.itemsSubtotal ?? order.merchantGoodsTotal ?? lines.reduce((a, l) => a + l.price, 0);
    const small = order.smallOrderFee ?? 0;
    // P5: the door photo, when the code couldn't be used.
    const door = order.doorProof ?? null;
    const where = door ? doorWhere(door) : null;
    const doorSub = door ? (where ? (door.takenAt ? ofFmt(OX.doorSub, { where, t: hhmm(door.takenAt) }) : where) : hhmm(door.takenAt)) : "";
    const heroSub = door && door.reason === "left_at_gate" && where ? ofFmt(OX.doorAgreed, { where, n: rFirst }) : ofFmt(O.d.deliveredSub, { p: usd(total), v: venueName });
    const shareReceipt = (): void => {
      const text = [
        `${O.d.receipt} · ${orderNo}`,
        ...lines.map((l) => `${l.qty}× ${l.name} ${usd(l.price)}`),
        `${O.r.food} ${usd(goods)}`,
        small > 0 ? `${O.r.small} ${usd(small)}` : null,
        `${O.r.fee} ${feeTextOf(order, venueName)}`,
        `${O.r.total} ${usd(total)}`,
        withRider(O.d.paidCash, rFirst),
        `${O.d.venue} ${venueName}`,
        rider ? `${O.d.rider} ${rider.name}${rider.plate ? ` · ${rider.plate}` : ""}` : null,
        `${O.d.delAt} ${dayTime(deliveredAt, nowMs)}`,
      ]
        .filter(Boolean)
        .join("\n");
      void Share.share({ message: text }).catch(() => undefined);
    };
    const compact = later && !stars && !vStars;
    return (
      <SafeAreaView edges={["top", "bottom"]} style={{ flex: 1, backgroundColor: C.bg }}>
        {header(false)}
        <View style={{ flex: 1, backgroundColor: C.surface }}>
          <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: ctaH + 16, gap: 14 }}>
            <View style={{ alignItems: "center", gap: 8 }}>
              <Disc icon="circle-check" ok />
              <Text accessibilityRole="header" style={{ fontSize: 22, lineHeight: 27, fontWeight: "800", letterSpacing: -0.5, color: C.ink, textAlign: "center", ...TAB }}>
                {ofFmt(O.d.delivered, { t: later ? dayTime(deliveredAt, nowMs) : hhmm(deliveredAt) })}
              </Text>
              <Mut size={14} style={{ textAlign: "center" }}>
                {heroSub}
              </Mut>
            </View>
            {door?.photoUrl ? <PhotoRow title={O.p.doorPhoto} sub={doorSub} uri={door.photoUrl} onView={() => setViewer({ title: O.p.doorPhoto, uri: door.photoUrl, caption: doorSub })} /> : null}
            {ratedRows.length ? (
              <Card style={{ gap: 6 }}>
                {ratedRows.map((r) => (
                  <View key={r.name} style={{ flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                    <Mut>{O.d.youRated}</Mut>
                    <Text style={{ fontSize: 14, fontWeight: "700", color: C.ink }}>{r.name}</Text>
                    <SmallStars value={r.v} />
                  </View>
                ))}
              </Card>
            ) : null}
            {canRate && compact ? (
              <Card style={{ gap: 6, padding: 14 }}>
                <Text style={{ fontSize: 15, fontWeight: "700", color: C.ink }}>{O.d.rateLater}</Text>
                <GoldStars value={0} onChange={canVenue ? setVStars : setStars} labelFor={(n) => O.d.rl[n] ?? ""} />
                <Mut>{O.d.rateLaterSub}</Mut>
              </Card>
            ) : canRate ? (
              <Card style={{ gap: 14, padding: 14 }}>
                {canVenue ? (
                  <RateRow
                    title={ofFmt(O.d.rateV, { v: venueName })}
                    value={vStars}
                    onChange={(n) => {
                      if (n >= 4 !== vStars >= 4) setVTagIdx([]);
                      setVStars(n);
                    }}
                    tags={vStars >= 4 ? O.d.tagsV : O.d.tagsVbad}
                    on={vTagIdx}
                    onToggle={(i) => setVTagIdx((c) => (c.includes(i) ? c.filter((x) => x !== i) : [...c, i]))}
                  />
                ) : null}
                {canVenue && canRider ? <View style={{ borderTopWidth: 1, borderTopColor: C.line }} /> : null}
                {canRider ? (
                  <RateRow
                    title={withRider(O.d.rateR, rFirst)}
                    value={stars}
                    onChange={setStars}
                    tags={O.d.tagsR}
                    on={tagIdx}
                    onToggle={(i) => setTagIdx((c) => (c.includes(i) ? c.filter((x) => x !== i) : [...c, i]))}
                  />
                ) : null}
                <View style={{ flexDirection: "row", gap: 8, alignItems: "center" }}>
                  <Btn flex={1} label={O.d.submit} onPress={() => submitRating(canRider, canVenue)} disabled={!stars && !vStars} />
                  <LinkRow label={O.d.skip} onPress={() => setSkipped(true)} />
                </View>
              </Card>
            ) : null}
            <Card style={{ gap: 0, paddingVertical: 12, paddingHorizontal: 14 }}>
              <View style={{ flexDirection: "row", alignItems: "center", marginBottom: 6 }}>
                <Text style={{ flex: 1, fontSize: 15, fontWeight: "700", color: C.ink }}>{O.d.receipt}</Text>
                <Mut>{`${O.d.orderNo} #${shortId}`}</Mut>
              </View>
              {lines.map((l, i) => (
                <KV key={`${l.name}-${i}`} k={`${l.qty}× ${l.name}`} v={usd(l.price)} />
              ))}
              <KV k={O.r.food} v={usd(goods)} />
              {small > 0 ? <KV k={O.r.small} v={usd(small)} /> : null}
              <KV k={O.r.fee} v={feeTextOf(order, venueName)} />
              <KV k={O.r.total} v={usd(total)} total />
              {rFirst ? (
                <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "flex-end", gap: 6, paddingTop: 4, paddingBottom: 8 }}>
                  <Icon name="banknote" size={15} color={C.accentText} />
                  <Text style={{ fontSize: 13, fontWeight: "600", color: C.ink }}>{withRider(O.d.paidCash, rFirst)}</Text>
                </View>
              ) : null}
              <KV k={O.d.venue} v={venueName} />
              {rider ? <KV k={O.d.rider} v={rider.plate ? `${rider.name} · ${rider.plate}` : rider.name} /> : null}
              {deliveredAt ? <KV k={O.d.delAt} v={dayTime(deliveredAt, nowMs)} /> : null}
              <View style={{ flexDirection: "row", paddingTop: 10 }}>
                <Btn flex={1} kind="ghost" icon="share-2" label={O.d.shareReceipt} onPress={shareReceipt} />
              </View>
            </Card>
            <LinkRow label={OX.helpWithOrder} onPress={() => setPanel("report")} />
          </ScrollView>
          <View style={{ position: "absolute", left: 0, right: 0, bottom: 0 }} onLayout={(e) => setCtaH(e.nativeEvent.layout.height)}>
            <Bar>
              <Btn kind="ghost" icon="refresh-cw" label={O.d.orderAgain} onPress={() => router.push(`${section}/${order.merchantId}` as never)} />
            </Bar>
          </View>
          {toastView(ctaH + 10)}
        </View>
        {panels}
      </SafeAreaView>
    );
  }

  // ── D3 / D4 — the endings (what happened, what it cost, one next step) ──
  if (stage === "cancelled" || stage === "undelivered") {
    const reason = order.rejectionReason;
    const collected = snap?.events.some((e) => e.status === "picked_up") ?? false;
    const byYou = snap?.cancelledBy === "customer";
    let icon: "ban" | "store" | "clock" | "bike" | "shield-check" | "package" | "file-text" = "ban";
    let title: string = O.d.cxYou;
    let sub: string = O.d.cxYouSub;
    let primary = { label: ofFmt(O.d.tryAgain, { v: venueName }), go: (): void => router.push(`${section}/${order.merchantId}` as never) };
    let secondary: { label: string; go: () => void } | null = null;
    const others = { label: O.d.others, go: (): void => router.push(section as never) };
    const whatsApp = waUrl ? { label: O.t.hWa, go: (): void => void Linking.openURL(waUrl).catch(() => undefined) } : null;
    let more: React.ReactNode = null;
    let owedAmt: string | null = null;
    if (stage === "undelivered") {
      icon = "package";
      title = O.d.notDel;
      const unreachable = snap?.undeliveredReason === "unreachable";
      sub = unreachable ? withRider(ofFmt(O.d.notDelSub, { v: venueName }), rFirst) : "";
      const attempt = order.doorProof ?? null;
      const attemptSub = attempt ? ofFmt(OX.attemptSub, { a: snap?.dropoff.landmark ?? "", t: hhmm(attempt.takenAt) }) : "";
      more = (
        <>
          {unreachable ? <Note icon="banknote">{O.d.notDelCash}</Note> : null}
          {attempt?.photoUrl ? (
            <PhotoRow title={OX.attemptPhoto} sub={attemptSub} uri={attempt.photoUrl} onView={() => setViewer({ title: OX.attemptPhoto, uri: attempt.photoUrl, caption: attemptSub })} />
          ) : null}
        </>
      );
      primary = { label: OX.helpWithOrder, go: () => setPanel("report") };
      secondary = { label: O.t.home, go: () => goHomeClearingStack(router) };
    } else if (reason === "all_out_of_stock") {
      // U5 — the venue couldn't supply anything: cancelled, nothing charged.
      icon = "package";
      title = ofFmt(O.u.allOut, { v: venueName });
      sub = O.u.allOutSub;
      primary = others;
    } else if (order.prescription?.status === "declined" && (reason === "rx_declined" || (byYou && !collected))) {
      // D5b — the prescription was declined and the customer cancelled the rest (free). With nothing
      // left to pack the pharmacy's decline cancelled it (`rx_declined`): the same ending, without the
      // "you cancelled the rest" sentence that wouldn't be true.
      icon = "file-text";
      title = reason === "rx_declined" ? O.d.rxNo : O.d.rxNoCx;
      sub = reason === "rx_declined" ? O.d.cxYouSub : O.d.rxNoCxSub;
      primary = { label: OXS.otherPharmacies, go: () => router.push(section as never) };
    } else if (byYou && collected) {
      // D3f — the owed balance needs a ledger line on the customer account (NEEDS BACKEND): the owed
      // sentence and the "owed" amount are not rendered until it exists.
      title = O.d.cxPaid;
      const owed = order.owedUsd ?? null;
      const full = withRider(ofFmt(O.d.cxPaidSub, { p: usd(owed ?? total), v: venueName }), rFirst);
      // The owed sentence and amount only with the server's ledger line (Backend B `owedUsd`).
      // Without the rider's name the "{rider} is bringing …" sentence is dropped rather than left headless.
      const [bringing = "", owes = ""] = full.split(/ (?=You owe)/);
      sub = [rFirst ? bringing : null, owed != null ? owes : null].filter(Boolean).join(" ");
      owedAmt = owed != null ? ofFmt(OX.owed, { p: usd(owed) }) : null;
      primary = whatsApp ?? others;
    } else if (byYou) {
      title = O.d.cxYou;
      sub = O.d.cxYouSub;
    } else if (reason === "no_rider") {
      icon = "bike";
      title = O.d.cxNoRider;
      sub = O.d.cxNoRiderSub;
      secondary = others;
    } else if (reason === "kitchen_unconfirmed") {
      icon = "clock";
      title = ofFmt(O.d.cxKitchen, { v: venueName });
      sub = O.d.cxKitchenSub;
      primary = others;
      secondary = { label: ofFmt(O.d.tryAgain, { v: venueName }), go: () => router.push(`${section}/${order.merchantId}` as never) };
    } else if (reason) {
      icon = "store";
      title = ofFmt(O.d.cxVenue, { v: venueName });
      sub = reason === "too_busy" ? O.d.cxVenueSub : O.d.cxYouSub;
      primary = others;
    } else {
      icon = "shield-check";
      title = O.d.cxLynia;
      sub = ofFmt(O.d.cxLyniaSub, { place: S.place });
      primary = whatsApp ?? others;
      secondary = whatsApp ? others : null;
    }
    return (
      <SafeAreaView edges={["top", "bottom"]} style={{ flex: 1, backgroundColor: C.bg }}>
        {header(false)}
        <View style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={{ paddingHorizontal: 16, paddingTop: 28, paddingBottom: ctaH + 16, gap: 16 }}>
            <View style={{ alignItems: "center", gap: 8 }}>
              <Disc icon={icon} />
              <StageTitle style={{ textAlign: "center" }}>{title}</StageTitle>
              {sub ? (
                <Mut size={14} style={{ textAlign: "center" }}>
                  {sub}
                </Mut>
              ) : null}
            </View>
            <Card style={{ gap: 4 }}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
                <VenueDisc svc={svc} size={40} radius={12} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontSize: 15, fontWeight: "700", color: C.ink }}>{venueName}</Text>
                  <Mut style={TAB}>{placedAt ? ofFmt(OX.orderAt, { order: orderNo, t: hhmm(placedAt) }) : orderNo}</Mut>
                </View>
                {owedAmt ? (
                  <Text style={{ fontSize: 15, fontWeight: "700", color: C.ink, ...TAB }}>{owedAmt}</Text>
                ) : stage === "cancelled" && !(byYou && collected) ? (
                  <Text style={{ fontSize: 15, fontWeight: "700", color: C.ink }}>{OX.noCharge}</Text>
                ) : null}
              </View>
            </Card>
            {more}
          </ScrollView>
          <View style={{ position: "absolute", left: 0, right: 0, bottom: 0 }} onLayout={(e) => setCtaH(e.nativeEvent.layout.height)}>
            <Bar>
              <Btn label={primary.label} onPress={primary.go} />
              {secondary ? <Btn kind="ghost" label={secondary.label} onPress={secondary.go} /> : null}
            </Bar>
          </View>
          {toastView(ctaH + 10)}
        </View>
        {panels}
      </SafeAreaView>
    );
  }

  // ── the live stages: the sheet over the map ──
  let content: React.ReactNode = null;
  let bar: React.ReactNode = null;
  let tall = false;
  const noFix = res?.noFix ?? false;
  const paused = res?.gpsPaused ?? false;
  const awaitingDoor = order.status === "en_route_dropoff" && (noFix || paused);

  // U3 (no answer in time) and U4b (a removal / quantity drop, nothing to answer): said under the track.
  let roundNote: React.ReactNode = null;
  if (round && (round.status === "timed_out" || round.status === "applied")) {
    const off = roundTakenOff(round);
    if (round.status === "timed_out" && off.removed.length) {
      roundNote = <Note icon="circle-alert">{ofFmt(OX.changes, { i: off.removed.join(", "), d: `−${usd(off.saved)}` })}</Note>;
    } else if (round.status === "applied" && (off.removed.length || off.reduced.length)) {
      roundNote = (
        <Note tone="hi" icon="circle-alert">
          {ofFmt(O.u.reduce, { v: venueName, i: [...off.removed, ...off.reduced].join(", "), p: usd(total) })}
        </Note>
      );
    }
  }
  // T8 / T8b: "Collected · sealed bag photo · View" — first while it's fresh (T8), then under the rider card (T9).
  const pickup = order.pickupProof ?? null;
  const pickupCaption = pickup ? ofFmt(O.t.collectedAt, { n: rFirst, t: hhmm(pickup.takenAt), v: venueName }) : "";
  const viewerTitle = (O.t.collected.split(" · ")[1] ?? "").replace(/^./, (c) => c.toUpperCase());
  const pickupRow = pickup?.photoUrl ? (
    <PhotoRow title={O.t.collected} sub={pickupCaption} uri={pickup.photoUrl} onView={() => setViewer({ title: viewerTitle, uri: pickup.photoUrl, caption: pickupCaption })} />
  ) : null;
  const pickedMs = pickup?.takenAt ? Date.parse(pickup.takenAt) : NaN;
  const photoFresh = Number.isFinite(pickedMs) && nowMs - pickedMs < FRESH_PHOTO_MS;

  // P1s / BRIEF §10: pharmacies (always sealed) and shops whose rider ticked "Bag is sealed" say to
  // check the seal before paying.
  const sealed = svc === "pharmacy" || (svc === "shops" && pickup?.bagSealed === true);
  const doorRows = (): DoorRow[] => {
    const paid = handshake === "waiting_rider" || handshake === "confirmed" || handshake === "frozen";
    const both = handshake === "confirmed";
    const p = usd(order.cashHandshakeAmount ?? total);
    const left = order.cashHandshakeDeadlineAt ? clock(Date.parse(order.cashHandshakeDeadlineAt) - nowMs) : null;
    return [
      { state: paid ? "done" : "current", title: O.p.s1, sub: paid ? null : sealed ? O.p.s1Seal : withRider(O.p.s1Sub, rFirst) },
      {
        state: both ? "done" : paid ? "current" : "upcoming",
        title: ofFmt(O.p.s2, { p }),
        sub: both ? ofFmt(OX.bothConfirmed, { t: hhmm(order.riderCashConfirmedAt) }) : paid ? null : O.p.s2Sub,
        extra:
          handshake === "waiting_rider" ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
              <ActivityIndicator size="small" color={C.accent} />
              <Text style={{ fontSize: 13, fontWeight: "600", color: C.ink }}>{withRider(ofFmt(O.p.s2Wait, { p }), rFirst)}</Text>
              {left ? (
                <View style={{ height: 24, paddingHorizontal: 9, borderRadius: tokens.radius.pill, backgroundColor: C.surface, justifyContent: "center" }}>
                  <Text style={{ fontSize: 12, fontWeight: "700", color: C.ink, ...TAB }}>{left}</Text>
                </View>
              ) : null}
            </View>
          ) : null,
      },
      { state: both ? "current" : "upcoming", title: O.p.s3, sub: both ? null : withRider(O.p.s3Lock, rFirst) },
    ];
  };
  const payBar = (): React.ReactNode =>
    handshake === "pending" ? (
      <Bar>
        <Btn icon="banknote" label={ofFmt(O.p.s2Btn, { p: usd(order.cashHandshakeAmount ?? total) })} onPress={() => cashM.mutate()} loading={cashM.isPending} />
      </Bar>
    ) : null;
  const shareCode = (): void => {
    if (!code) return;
    const msg = withRider(ofFmt(O.p.shareMsg, { v: venueName, p: usd(order.cashHandshakeAmount ?? total) }), rFirst)
      .replace("418290", codeCopied(code))
      .replace(/ \(bike [^)]*\)/, rider?.plate ? ` (bike ${rider.plate})` : "");
    void Share.share({ message: msg }).catch(() => undefined);
  };

  // U2a/U2b (at accept) and U4a (mid-prep): an open substitution round is the sheet's first block until it
  // is answered or runs out — a v2 round only; the legacy 60 s approval keeps its own case below.
  const openRound = round && isOpenRound(round) && !AFTER_PICKUP.has(order.status) ? round : null;
  if (openRound) {
    const { leftMs, pct } = roundClock(openRound, nowMs);
    const st = substitutionState(openRound, customerFeeOf(order), answers);
    const subLines = substitutionLines(openRound);
    const mid = openRound.kind === "mid_prep";
    const answerIn = `${Math.round(RESTAURANTS_TIMING.substitutionWindowMs / 60_000)} ${O.c.min}`;
    const out = leftMs <= 0;
    tall = true;
    content = (
      <>
        <AnswerHead
          title={ofFmt(mid ? O.u.mid : O.u.t, { v: venueName })}
          left={clock(leftMs)}
          pct={pct}
          sub={mid ? ofFmt(O.u.midSub, { making: S.making.toLowerCase(), t: answerIn }) : ofFmt(O.u.sub, { t: answerIn })}
        />
        {subLines.map((l, k) => (
          <React.Fragment key={l.id}>
            <SubCard
              line={l}
              answer={answers[l.id] ?? l.answer}
              onAnswer={l.action === "swap" ? (a) => setAnswers((c) => ({ ...c, [l.id]: a })) : undefined}
              disabled={out || subM.isPending}
            />
            {k === 0 ? <PeekMark /> : null}
          </React.Fragment>
        ))}
        <View style={{ paddingHorizontal: 2 }}>
          <KV k={OX.was} v={usd(st.was)} />
          <KV k={O.u.newTotal} v={usd(st.newTotal)} total />
        </View>
        <LinkRow label={O.u.cancelAll} onPress={() => cancelM.mutate({ free: true })} loading={cancelM.isPending} />
      </>
    );
    bar = (
      <Bar hint={st.unanswered > 0 ? OX.answerHint : null}>
        <Btn
          label={ofFmt(O.u.confirm, { p: usd(st.newTotal) })}
          disabled={st.unanswered > 0 || out}
          loading={subM.isPending}
          onPress={() =>
            subM.mutate({
              roundId: openRound.id,
              answers: openRound.lines.filter((l) => l.action === "swap").map((l) => ({ lineId: l.id, accept: (answers[l.id] ?? l.answer) === "accept" })),
            })
          }
        />
      </Bar>
    );
  } else switch (stage) {
    case "confirming":
      content = (
        <>
          <StageTop title={ofFmt(O.t.confirming, { v: venueName })} eta={eta} sub={O.t.confirmingSub} />
          {track}
          {venueRow}
          <PeekMark />
          {summary}
          {cancelLink(O.t.cancelFree)}
        </>
      );
      break;
    case "waiting": {
      const end = order.acceptDeadlineAt ? Date.parse(order.acceptDeadlineAt) : NaN;
      const leftMs = Number.isFinite(end) ? Math.max(0, end - nowMs) : null;
      content = (
        <>
          <StageTop title={ofFmt(O.t.waiting, { v: venueName })} eta={null} sub={O.t.waitingSub} />
          {leftMs != null ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
              <View style={{ height: 28, flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 9, borderRadius: tokens.radius.pill, backgroundColor: C.surface }}>
                <Icon name="timer" size={14} color={C.muted} />
                <Text style={{ fontSize: 12, fontWeight: "700", color: C.ink, ...TAB }}>{`${clock(leftMs)} ${O.t.left}`}</Text>
              </View>
              <View style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: C.line, overflow: "hidden" }}>
                <View style={{ width: `${Math.round((leftMs / ACCEPT_WINDOW_MS) * 100)}%`, height: 6, backgroundColor: C.accent }} />
              </View>
            </View>
          ) : null}
          {track}
          {venueRow}
          <PeekMark />
          {summary}
          {freeCancel ? cancelLink(O.t.cancelFree) : null}
        </>
      );
      break;
    }
    case "itemApproval": {
      const end = order.itemApprovalDeadlineAt ? Date.parse(order.itemApprovalDeadlineAt) : NaN;
      const leftMs = Number.isFinite(end) ? Math.max(0, end - nowMs) : 0;
      const removed = order.items.filter((i) => i.available === false);
      const was = order.items.reduce((a, i) => a + i.priceUsd * i.quantity, 0) + customerFeeOf(order);
      tall = true;
      content = (
        <>
          <AnswerHead title={ofFmt(O.u.t, { v: venueName })} left={clock(leftMs)} pct={(leftMs / ITEM_WINDOW_MS) * 100} />
          {removed.map((i, k) => (
            <React.Fragment key={`${i.name}-${k}`}>
              <SubCard
                line={{ action: "remove", name: i.name, was: i.priceUsd * i.quantity, newQuantity: null, swapName: null, now: null, diff: -(i.priceUsd * i.quantity), photoUrl: null }}
                answer={null}
              />
              {k === 0 ? <PeekMark /> : null}
            </React.Fragment>
          ))}
          <View style={{ paddingHorizontal: 2 }}>
            <KV k={OX.was} v={usd(was)} />
            <KV k={O.u.newTotal} v={usd(total)} total />
          </View>
          <LinkRow label={O.u.cancelAll} onPress={() => itemsM.mutate(false)} loading={itemsM.isPending && itemsM.variables === false} />
        </>
      );
      bar = (
        <Bar>
          <Btn label={ofFmt(O.u.confirm, { p: usd(total) })} onPress={() => itemsM.mutate(true)} loading={itemsM.isPending && itemsM.variables === true} disabled={leftMs <= 0} />
        </Bar>
      );
      break;
    }
    case "cooking": {
      // T13b: a scheduled order the venue started — "{v} started cooking", and the slot is the promise.
      const started = !!order.scheduleStartedAt && slot != null;
      content = (
        <>
          <StageTop
            title={started ? ofFmt(O.t.schedStarted, { v: venueName, making: S.making.toLowerCase() }) : S.makingT}
            eta={started && slot ? { kind: "range", text: slot.range } : eta}
          />
          {track}
          {roundNote}
          {prep ? <PrepBar making={S.making} minutesLeft={prep.minutesLeft} pct={prep.pct} note /> : null}
          {/* T5b: the pharmacy seals the bag. */}
          {svc === "pharmacy" ? (
            <Note tone="ok" icon="shield-check">
              {OXS.sealNote}
            </Note>
          ) : null}
          <PeekMark />
          {venueRow}
          {summary}
        </>
      );
      break;
    }
    case "scheduled": {
      // T13a: Scheduled — free cancel and "Change time" until the venue starts.
      content = (
        <>
          <StageTop
            title={slot ? ofFmt(O.t.sched, { d: slot.day, s: slot.range }) : S.makingT}
            eta={null}
            sub={order.ringsAt ? ofFmt(O.t.schedSub, { v: venueName, making: S.making.toLowerCase(), t: hhmm(order.ringsAt) }) : null}
          />
          {track}
          {summary}
          <PeekMark />
          {freeCancel ? cancelLink(O.t.cancelFree) : null}
        </>
      );
      bar = (
        <Bar>
          <Btn kind="ghost" icon="calendar" label={O.t.schedChange} onPress={() => setPanel("schedule")} />
        </Bar>
      );
      break;
    }
    case "rxCheck":
      // T5c: the pharmacist checks the prescription before packing.
      content = (
        <>
          <StageTop title={O.t.rxCheck} eta={eta} sub={O.t.rxCheckSub} />
          {track}
          {venueRow}
          <PeekMark />
          {summary}
        </>
      );
      break;
    case "rxDeclined": {
      // D5a: the prescription wasn't approved — its lines are off, the rest is packed; "Cancel the rest — free".
      tall = true;
      const rxLines = order.items.filter((i) => i.rxRequired === true).map((i) => i.name);
      const goes = rxLines.length ? O.d.rxNoGo.replace("Amoxicillin 500mg", rxLines.join(", ")) : null;
      content = (
        <>
          <StageTop title={O.d.rxNo} eta={eta} />
          <Card style={{ gap: 4 }}>
            <Text style={{ fontSize: 12, fontWeight: "600", letterSpacing: 0.4, textTransform: "uppercase", color: C.muted }}>{O.d.rxNoReason}</Text>
            <Text style={{ fontSize: 15, fontWeight: "700", color: C.ink }}>{rxReasonLabel(order.prescription?.declineReason, order.prescription?.declineNote)}</Text>
          </Card>
          {goes ? <Note icon="circle-alert">{ofFmt(goes, { p: usd(total) })}</Note> : null}
          {track}
          <PeekMark />
          {summary}
          <LinkRow label={O.d.rxCancel} onPress={() => cancelM.mutate({ free: true })} loading={cancelM.isPending} />
        </>
      );
      break;
    }
    case "slowRider":
      content = (
        <>
          <StageTop title={O.t.slowRider} eta={eta} sub={O.t.slowRiderSub} />
          {track}
          {order.readyAt ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
              <Icon name="circle-check" size={18} color={C.accentText} />
              <Text style={{ fontSize: 14, fontWeight: "600", color: C.ink, ...TAB }}>{ofFmt(OX.readyAt, { ready: S.ready, t: hhmm(order.readyAt) })}</Text>
            </View>
          ) : null}
          <PeekMark />
          {venueRow}
        </>
      );
      break;
    case "riderDropped":
      content = (
        <>
          <StageTop title={O.t.dropped} eta={eta} sub={O.t.droppedSub} />
          {track}
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
            <ActivityIndicator size="small" color={C.accent} />
            <Mut size={14}>{ofFmt(OX.asking, { v: venueName })}</Mut>
          </View>
          <PeekMark />
          {summary}
        </>
      );
      break;
    case "toVenue":
    case "collecting": {
      const collecting = stage === "collecting";
      const title = noFix ? withRider(ofFmt(O.t.noFix, { v: venueName }), rFirst) : collecting ? O.t.collecting : ofFmt(O.t.riderToVenue, { v: venueName });
      const sub = noFix ? O.t.etaNone : collecting ? ofFmt(OX.atVenue, { n: rFirst, v: venueName }) : null;
      const cooking = prep && !order.readyAt && prep.minutesLeft > 0 && !collecting && !noFix;
      content = (
        <>
          <StageTop title={title} eta={noFix ? null : eta} sub={sub} />
          {paused ? <Note icon="clock">{withRider(O.t.paused, rFirst)}</Note> : null}
          {track}
          {cooking ? <PrepBar making={S.making} minutesLeft={prep.minutesLeft} pct={prep.pct} note={false} /> : riderCard}
          <PeekMark />
          {cooking ? riderCard : null}
          {riderCancel ? cancelLink(O.t.cancelFree) : null}
        </>
      );
      break;
    }
    case "onWay":
      content = (
        <>
          <StageTop title={O.t.onWay} eta={noFix ? null : eta} sub={noFix ? O.t.etaNone : null} />
          {paused ? <Note icon="clock">{withRider(O.t.paused, rFirst)}</Note> : null}
          {track}
          {photoFresh ? pickupRow : null}
          {riderCard}
          {photoFresh ? null : pickupRow}
          {awaitingDoor ? null : cancelLink(O.t.cancelFull)}
          <PeekMark />
          {/* No fix at the door: the customer must still be able to pay, so the door card follows. */}
          {awaitingDoor ? <DoorCard rows={doorRows()} /> : null}
        </>
      );
      if (awaitingDoor) bar = payBar();
      break;
    case "door": {
      const frozen = handshake === "frozen";
      const lapsed = frozen && !!order.cashHandshakeDeadlineAt && !!order.cashHandshakeFrozenAt && Date.parse(order.cashHandshakeFrozenAt) >= Date.parse(order.cashHandshakeDeadlineAt);
      const showCode = handshake === "confirmed" && code != null;
      tall = true;
      content = (
        <>
          <StageTop title={O.t.atDoor} eta={null} />
          {frozen ? (
            <Note tone="hi" icon={lapsed ? "clock" : "circle-alert"}>
              <Text style={{ fontSize: 13, lineHeight: 19, color: C.highlightChipInk }}>
                <Text style={{ fontWeight: "700" }}>{lapsed ? O.p.lapsed : withRider(ofFmt(O.p.disagree, { p: usd(order.cashHandshakeAmount ?? total) }), rFirst)}</Text>
                {"\n"}
                {withRider(lapsed ? O.p.lapsedSub : O.p.disagreeSub, rFirst)}
              </Text>
            </Note>
          ) : null}
          <DoorCard rows={doorRows()} />
          {showCode ? null : <PeekMark />}
          {showCode ? <CodeBig code={code} sub={ofFmt(OX.codeBigSub, { s3: O.p.s3, n: rFirst })} screenWidth={width} /> : null}
          {showCode ? <PeekMark /> : null}
          {riderCard}
        </>
      );
      bar = frozen ? (
        waUrl ? (
          <Bar>
            <Btn kind="ghost" icon="message-circle" label={O.t.hWa} onPress={() => void Linking.openURL(waUrl).catch(() => undefined)} />
          </Bar>
        ) : null
      ) : showCode ? (
        <Bar>
          <Btn kind="ghost" icon="share-2" label={O.p.shareCode} onPress={shareCode} />
        </Bar>
      ) : (
        payBar()
      );
      break;
    }
    default:
      content = (
        <>
          <StageTop title={S.makingT} eta={null} />
          {track}
        </>
      );
  }

  const showRider = stage != null && isRiderStage(stage);
  return (
    <SafeAreaView edges={["top", "bottom"]} style={{ flex: 1, backgroundColor: C.bg }}>
      {header(true)}
      <View style={{ flex: 1 }} onLayout={(e) => setAreaH(e.nativeEvent.layout.height)}>
        <MerchantMap
          venue={venue}
          venueName={venueName}
          svc={svc}
          dropoff={dropoff}
          rider={riderFix}
          riderLabel={paused ? O.t.lastSeen.replace(/\d+ min/, `${minutesSince(riderFix?.at, nowMs)} min`) : rFirst}
          riderPaused={paused}
          showRider={showRider}
          toVenue={stage === "toVenue"}
          collected={step >= 2}
          padBottom={sheetVisible || Math.round(area * 0.55)}
          reduceMotion={reduceMotion}
        />
        {offlineBanner ? (
          <View style={{ position: "absolute", left: 12, right: 12, top: 10, zIndex: 21 }}>
            <Note tone="ink" icon="wifi-off">
              {offlineBanner}
            </Note>
          </View>
        ) : null}
        {area > 0 ? (
          <OrderSheet
            ref={sheetRef}
            areaHeight={area}
            fallbackShare={0.45}
            floor={tall ? Math.max(0, area - 100) : 0}
            bottomInset={bar ? ctaH : 0}
            contentKey={`${stage}|${handshake}|${noFix ? "n" : ""}|${paused ? "p" : ""}|${code ? "c" : ""}|${openRound ? `u${openRound.id}` : ""}|${roundNote ? "r" : ""}|${pickupRow ? (photoFresh ? "pf" : "p") : ""}`}
            reduceMotion={reduceMotion}
            onVisibleHeight={setSheetVisible}
            radius={24}
            gap={14}
          >
            {content}
          </OrderSheet>
        ) : null}
        {bar ? (
          <View style={{ position: "absolute", left: 0, right: 0, bottom: 0, zIndex: 25 }} onLayout={(e) => setCtaH(e.nativeEvent.layout.height)}>
            {bar}
          </View>
        ) : null}
        {toastView((bar ? ctaH : 0) + 10)}
      </View>
      {panels}
    </SafeAreaView>
  );
}

/** Whether the cache already holds this id as a food order (seeded at checkout, or read before). */
export function isCachedMerchantOrder(get: (key: readonly unknown[]) => MerchantOrderResponse | undefined, orderId: string): boolean {
  return get(foodOrderKey(orderId)) != null;
}
