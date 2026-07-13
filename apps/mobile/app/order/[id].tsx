import { ACTIVE_RIDE_STATUSES, CUSTOMER_CANCELLABLE_STATUSES, rankOffers, tokens } from "@lynia/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Linking, Pressable, ScrollView, Text, View } from "react-native";
import { ApiError } from "../../src/api/client";
import { isPendingCounter, noRidersOnline, shouldShowOffersError } from "../../src/logic/journey";
import { formatMoney } from "../../src/logic/money";
import { buildRebroadcastParams } from "../../src/logic/order-draft";
import { auctionHeaderText, formatClock, SORT_MODES, type SortMode, spokenRemaining, UNDELIVERED_REASON_LABEL } from "../../src/logic/order-labels";
import { orderLoadErrorKind, selectOrderShell } from "../../src/logic/order-tracking";
import { listOffers, selectOffer, type OfferRow } from "../../src/api/offers";
import { cancelOrder, getOrder, notifyWhenRiderOnline, type OrderSnapshot, rateOrder, rotateDeliveryCode } from "../../src/api/orders";
import { loadDeliveryCode, saveDeliveryCode } from "../../src/auth/session";
import { loadRiderIdentity, type RiderIdentity, saveRiderIdentity } from "../../src/logic/rider-identity";
import type { LastActive } from "../../src/logic/last-active";
import { clearLastActiveOrder, loadLastActiveOrder, saveLastActiveOrder } from "../../src/net/last-active-store";
import { offersKey, orderKey } from "../../src/query/client";
import { useForegroundRefetch } from "../../src/realtime/use-foreground-refetch";
import { useOrderSocket } from "../../src/realtime/use-order-socket";
import { Button, Card, Celebrate, EmptyState, ErrorText, haptic, Heading, Icon, OfflineBanner, orderStatusTone, RiderMini, Screen, SkeletonCard, SkeletonList, StatusPill, Sub, useToast } from "../../src/ui";
import { GetHelpControl, ReportControl, SosControl } from "../../src/ui/safety";
import { BidEntrance, CounterOfferCard } from "../../src/ui/order/CounterOfferCard";
import { LiveTrackingCard } from "../../src/ui/order/LiveTrackingCard";
import { PickupPhoto } from "../../src/ui/order/PickupPhoto";
import { ReceiptCard } from "../../src/ui/order/ReceiptCard";
import { RatingCard } from "../../src/ui/order/RatingCard";
import { useReduceMotion } from "../../src/ui/useReduceMotion";

const CUSTOMER_CANCELLABLE = new Set<string>(CUSTOMER_CANCELLABLE_STATUSES);
const ACTIVE = ACTIVE_RIDE_STATUSES as string[];
// Post-pickup cancels (parcel already on the bike) get a hand-back warning before we confirm — the
// customer keeps the right to cancel anytime (INTERFACE-AUDIT C3) but must understand they'll arrange
// getting the parcel back directly with the rider.
const POST_PICKUP_CANCEL = new Set<string>(["picked_up", "en_route_dropoff"]);

const URGENT_MS = 20_000;
// C2: after a rider bail the order flips to `cancelled` and the server pushes `order:rebroadcast` on the
// (now dead) order's room to move the customer to the fresh auction. Hold the socket open for this grace
// window past `cancelled` so that push can still land — bounded, so a genuinely terminal cancel doesn't
// keep the socket alive forever.
const CANCELLED_GRACE_MS = 20_000;

export default function OrderScreen(): React.ReactElement {
  const { id, rebroadcast: rebroadcastParam, fare: rebroadcastFare } = useLocalSearchParams<{ id: string; rebroadcast?: string; fare?: string }>();
  const orderId = typeof id === "string" ? id : "";
  // 3·b0: this auction was auto-created because the assigned rider bailed. The `rebroadcast=1` flag
  // (carried on the teleport from the dead order) tells us to reassure the customer with a "your rider
  // had to cancel — same price, no need to start over" card until the first fresh bid arrives.
  const [showRebroadcast, setShowRebroadcast] = useState(rebroadcastParam === "1");
  const qc = useQueryClient();
  const router = useRouter();
  const reduceMotion = useReduceMotion();
  const toast = useToast();
  const [deliveryCode, setDeliveryCode] = useState<string | null>(null);
  // The chosen rider's public identity (name/photo/rating), cached at selection so the tracking card can
  // show a face — the assigned-order snapshot only carries profileId + GPS, not the profile.
  const [riderIdentity, setRiderIdentity] = useState<RiderIdentity | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>("best");
  // A rolled-back optimistic select is a race outcome, not a user error — shown muted, not red.
  const [selectNotice, setSelectNotice] = useState<string | null>(null);
  // A bare spinner on the single highest-stakes tap in this journey reads as "frozen" on a slow link —
  // mirrors the rider-side "Still sending — hang on" treatment (offerSlow in rider/index.tsx).
  const [selectSlow, setSelectSlow] = useState(false);
  // Which offer is mid-select, so only ITS button spins (the rest just disable) — set in onPress,
  // cleared when the mutation settles.
  const [selectingId, setSelectingId] = useState<string | null>(null);
  // Counter-offers the customer has DECLINED (F-07): decline is client-side dismissal only — the bid
  // stays live server-side, so we just drop the prominent Accept/Decline treatment and the offer
  // reverts to a normal choosable bid at the countered price. One round, no counter-back.
  const [declinedCounterIds, setDeclinedCounterIds] = useState<Set<string>>(() => new Set());
  // Post-pickup cancel confirmation gate (the hand-back warning).
  const [cancelConfirm, setCancelConfirm] = useState(false);

  // Recover a previously-issued handover code across remount/relaunch (server keeps only the hash).
  useEffect(() => {
    let alive = true;
    void loadDeliveryCode(orderId).then((c) => {
      if (alive && c) setDeliveryCode(c);
    });
    return () => {
      alive = false;
    };
  }, [orderId]);

  // Recover the chosen rider's cached identity across remount/relaunch (it's only stored for the order it
  // belongs to, so a stale other-order identity never paints here).
  useEffect(() => {
    let alive = true;
    setRiderIdentity(null); // drop any prior order's identity when the id changes (rider-bail rebroadcast)
    void loadRiderIdentity(orderId).then((i) => {
      if (alive && i) setRiderIdentity(i);
    });
    return () => {
      alive = false;
    };
  }, [orderId]);

  // Load the last-known summary for this order (persisted below) so an OFFLINE COLD START can show it
  // instead of a bare "couldn't load" — only ever rendered in the fetch-error branch, never over live data.
  const [lastKnown, setLastKnown] = useState<LastActive | null>(null);
  useEffect(() => {
    let alive = true;
    void loadLastActiveOrder(orderId).then((la) => {
      if (alive) setLastKnown(la);
    });
    return () => {
      alive = false;
    };
  }, [orderId]);

  // Mirrors rider/job.tsx's jobPollFallback: while the order socket is connected, its `orderStatus`/
  // `offersChanged` handlers already invalidate this exact query live — polling on top of that burns a
  // redundant round-trip every 15s on metered data for the entire length of an auction or a delivery.
  // A ref (not state) so this reads the LATEST connection state inside refetchInterval's closure
  // without needing useOrderSocket declared before this query (its `expected` flag depends on the
  // order's own status, which this query is what fetches — a ref sidesteps that ordering cycle).
  const socketConnectedRef = useRef(false);
  const orderQ = useQuery({
    queryKey: orderKey(orderId),
    queryFn: () => getOrder(orderId),
    enabled: orderId !== "",
    // PERF: subscribe through the telemetry-stripped shell so a WS "position" push (which rewrites
    // rider.currentLat/lng/updatedAt in the cache every ~10s for a whole delivery) leaves this
    // component's selected data referentially unchanged — structural sharing hands back the previous
    // reference and this ~900-line screen doesn't re-render. The extracted LiveTrackingCard holds its
    // own observer on the SAME key with the complementary telemetry slice, so GPS ticks repaint only
    // the tracking card. Mutations/socket handlers read+write the RAW cache (getQueryData/
    // setQueryData), which `select` never touches — the position-race guard in use-order-socket and
    // the optimistic select flip are unaffected.
    select: selectOrderShell,
    refetchInterval: (q) => {
      const s = q.state.data?.status;
      // During the auction, poll every 15s REGARDLESS of socket health: `ridersNearby` is recomputed
      // server-side per fetch and no WS event fires when the nearby-rider count changes, so a
      // socket-connected gate would freeze the "no riders online nearby" empty state (and its inverse)
      // for the whole ~90s window. Mirrors the offers-list query, which polls unconditionally here.
      if (s === "open_for_offers") return 15_000;
      // For the active-delivery states WS pushes genuinely drive everything, so polling is only a slow
      // self-heal if the socket drops.
      if (socketConnectedRef.current) return false;
      if (s !== undefined && ACTIVE.includes(s)) return 15_000;
      return false;
    },
  });
  const status = orderQ.data?.status;
  const isActive = status !== undefined && ACTIVE.includes(status);

  // Persist a tiny last-known summary for offline cold-start recovery — ONCE per status transition (not
  // on every GPS tick, which would hammer SecureStore). Cleared on a terminal status so a finished order
  // never resurfaces as a stale "last known" card next time we're offline.
  const persistedStatus = useRef<string | null>(null);
  useEffect(() => {
    const d = orderQ.data;
    if (!d || d.status === persistedStatus.current) return;
    persistedStatus.current = d.status;
    // Persist from the RAW cache entry, not `d`: this screen subscribes through the telemetry-stripped
    // shell (selectOrderShell above), but the saved summary keeps the rider's last fix (toLastActive
    // projects it), so saving the shell would silently null the persisted position.
    const raw = qc.getQueryData<OrderSnapshot>(orderKey(orderId)) ?? d;
    if (ACTIVE.includes(d.status) || d.status === "open_for_offers") void saveLastActiveOrder(raw);
    else void clearLastActiveOrder(d.id);
  }, [orderQ.data, qc, orderId]);

  // C2: keep the socket subscribed through `cancelled` for a bounded grace window so a rider-bail
  // `order:rebroadcast` can still arrive and navigate the customer to the fresh auction (below).
  // `cancelledExpired` starts false and is only flipped true by the timer AFTER we've been cancelled
  // for the grace window — so entering `cancelled` keeps `socketExpected` true on the SAME render (no
  // one-render disconnect that could miss the push), and a genuinely terminal cancel still tears the
  // socket down once the window lapses.
  const [cancelledExpired, setCancelledExpired] = useState(false);
  useEffect(() => {
    if (status !== "cancelled") {
      setCancelledExpired(false);
      return;
    }
    const t = setTimeout(() => setCancelledExpired(true), CANCELLED_GRACE_MS);
    return () => clearTimeout(t);
  }, [status]);

  // Open the socket during the AUCTION too (not just once active): `offers:changed` streams new
  // bids in, and `order:status` reflects the assignment. Expose connection state for the UI.
  const socketExpected =
    isActive || status === "delivered" || status === "open_for_offers" || (status === "cancelled" && !cancelledExpired);
  // F-01: on a rider bail the server re-broadcasts a NEW order and pushes `order:rebroadcast` here;
  // move the customer to the fresh auction (replace, so the dead cancelled order isn't in the stack).
  const { connected } = useOrderSocket(socketExpected ? orderId : null, (newOrderId) => {
    // The assigned rider bailed and we auto-re-broadcast at the same price — without a word the customer
    // just gets teleported to a "finding riders" screen. Carry a `rebroadcast` flag (+ the agreed fare)
    // so the fresh auction opens with the 3·b0 reassurance card instead of a bare, unexplained restart.
    const snap = qc.getQueryData<OrderSnapshot>(orderKey(orderId));
    const carriedFare = snap?.agreedFare ?? snap?.proposedFare ?? "";
    const query = carriedFare ? `?rebroadcast=1&fare=${encodeURIComponent(carriedFare)}` : "?rebroadcast=1";
    router.replace(`/order/${newOrderId}${query}`);
  });
  // "Reconnecting" only reads truthfully after we've been live once — the initial connect window
  // would otherwise flash the banner on every mount.
  const wasConnected = React.useRef(false);
  if (connected) wasConnected.current = true;
  const connectionState: "live" | "reconnecting" = connected ? "live" : "reconnecting";
  // Keep the poll-gate ref (declared above orderQ) in sync every render.
  socketConnectedRef.current = connected;

  const offersQ = useQuery({
    queryKey: offersKey(orderId),
    queryFn: () => listOffers(orderId),
    enabled: status === "open_for_offers",
    // The `offers:changed` WS signal invalidates this instantly; poll is the 15s fallback.
    refetchInterval: status === "open_for_offers" ? 15_000 : false,
  });

  // Warm-resume: refetch the order (and, mid-auction, the offer list) the moment the app returns to
  // foreground. Without this, a status change, a new/withdrawn bid, or an acceptance that arrived
  // while backgrounded serves a stale cache for up to the 15s poll — the socket usually beats that,
  // but a reconnect can lag behind the OS reporting the app foregrounded. Mirrors rider/job.tsx's
  // warm-resume for the rider side.
  useForegroundRefetch(() => {
    void qc.invalidateQueries({ queryKey: orderKey(orderId) });
    if (status === "open_for_offers") void qc.invalidateQueries({ queryKey: offersKey(orderId) });
  });

  // Announce a newly-arrived bid for screen-reader users — the streaming list updates silently.
  const liveBidCount = offersQ.data?.length ?? 0;
  const prevBidCount = useRef(0);
  // Seed the baseline on the FIRST settled offers load, so opening an auction that already has bids
  // doesn't buzz/announce them as if they just arrived (0→N on mount). Only genuine later increases fire.
  const bidsSeeded = useRef(false);
  useEffect(() => {
    if (status !== "open_for_offers" || !offersQ.isSuccess) return;
    if (!bidsSeeded.current) {
      bidsSeeded.current = true;
      prevBidCount.current = liveBidCount;
      return;
    }
    if (liveBidCount > prevBidCount.current) {
      // A single attention buzz so a new bid registers even with the phone in a pocket / screen dark.
      haptic("notify");
      AccessibilityInfo.announceForAccessibility(
        liveBidCount === 1 ? "A rider is bidding on your order" : `${liveBidCount} riders bidding`,
      );
    }
    prevBidCount.current = liveBidCount;
  }, [liveBidCount, status, offersQ.isSuccess]);

  // 3·b0: the reassurance card gives way to the live auction the moment a fresh rider bids — from there
  // the customer is choosing again, and the "no need to start over" message has done its job.
  useEffect(() => {
    if (liveBidCount > 0) setShowRebroadcast(false);
  }, [liveBidCount]);

  // Warm success cue at the two moments that land emotionally: a rider is assigned (the auction paid
  // off) and the parcel is delivered. Fires only on a real transition, never on mount or a re-render.
  const prevStatus = useRef<string | undefined>(undefined);
  useEffect(() => {
    const prev = prevStatus.current;
    if (status && prev && status !== prev && (status === "assigned" || status === "delivered")) {
      haptic("success");
      // Name the transition — the offer list collapses into the tracking view, so a toast confirms what
      // just happened rather than leaving the change of layout unexplained. `delivered` used to get only
      // the silent haptic above, leaving the anxiety-peak "did it arrive?" moment with no on-screen
      // confirmation until the rating card's header quietly appeared underneath.
      if (status === "assigned") toast.show("You're matched — tracking your rider now.", "success");
      if (status === "delivered") toast.show("Delivered! Let your rider know how it went.", "success");
    }
    prevStatus.current = status;
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire on status transition only; toast is stable.
  }, [status]);

  // --- Auction countdown ---
  // Tick a 1s clock ONLY while open_for_offers with a known expiry. During a socket reconnect we
  // freeze the last value (we can't trust wall-clock drift vs. the server), so the ticker skips.
  const expiresAt = orderQ.data?.expiresAt ?? null;
  const [remainingMs, setRemainingMs] = useState<number | null>(null);
  // Only freeze once the socket has genuinely dropped AFTER being live — same gate as the
  // "reconnecting" banner. Freezing on the pre-first-connect window (plain !connected) would leave the
  // countdown static with no indication on a slow link until the WS finally connects.
  const frozen = wasConnected.current && !connected;
  useEffect(() => {
    if (status !== "open_for_offers" || expiresAt == null) {
      setRemainingMs(null);
      return;
    }
    const end = new Date(expiresAt).getTime();
    const compute = () => setRemainingMs(Math.max(0, end - Date.now()));
    compute();
    if (frozen) return; // hold the last value; don't advance a clock we can't trust
    const iv = setInterval(compute, 1000);
    return () => clearInterval(iv);
  }, [status, expiresAt, frozen]);

  // SR thresholds fire once each (not a per-second live region, which is unusable).
  const firedThresholds = useRef<Set<number>>(new Set());
  useEffect(() => {
    firedThresholds.current.clear();
    // A rider bail navigates to a NEW order id on the SAME screen instance (expo-router reuses it on a
    // param change), so reset the transition trackers — otherwise the new auction's bids don't buzz
    // until they exceed the previous order's stale count, and a status cue could carry over.
    prevBidCount.current = 0;
    bidsSeeded.current = false;
    prevStatus.current = undefined;
  }, [orderId]);
  useEffect(() => {
    if (remainingMs == null || status !== "open_for_offers") return;
    const fire = (key: number, msg: string) => {
      if (remainingMs <= key && !firedThresholds.current.has(key)) {
        firedThresholds.current.add(key);
        AccessibilityInfo.announceForAccessibility(msg);
      }
    };
    fire(60_000, "Offer window: 1 minute left");
    fire(30_000, "Offer window: 30 seconds left");
    fire(0, "Offer window closing");
    // JOURNEY-BUGS: at 0:00 the screen used to just sit on "Finding riders…" for up to the 15s poll
    // interval before the status transition (expired / a late bid landing) showed up. Nudge a refetch
    // right at the threshold instead of waiting out the poll.
    if (remainingMs <= 0 && !firedThresholds.current.has(-1)) {
      firedThresholds.current.add(-1);
      void orderQ.refetch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fire on remainingMs/status only; orderQ.refetch is stable.
  }, [remainingMs, status]);

  // Amber-urgency colour crossfade over the last 20s (instant under reduce-motion).
  const urgent = remainingMs != null && remainingMs <= URGENT_MS;
  const urgencyAnim = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    const to = urgent ? 1 : 0;
    if (reduceMotion) {
      urgencyAnim.setValue(to);
      return;
    }
    Animated.timing(urgencyAnim, { toValue: to, duration: 200, useNativeDriver: false }).start();
  }, [urgent, reduceMotion, urgencyAnim]);

  // Order the offers for display (D-d): best-match blends price + rating + ETA and marks the top pick;
  // the other modes are plain single-key sorts. Selection is unaffected — the customer still chooses.
  const orderedOffers = useMemo((): { offer: OfferRow; recommended: boolean }[] => {
    const offers = offersQ.data ?? [];
    if (offers.length === 0) return [];
    if (sortMode === "best") {
      const ranked = rankOffers(
        offers.map((o) => ({
          offeredFare: Number(o.offeredFare),
          ratingAvg: Number(o.rider.ratingAvg),
          ratingCount: o.rider.ratingCount,
          etaMinutes: o.etaMinutes,
        })),
      );
      return ranked.map((r) => ({ offer: offers[r.index]!, recommended: r.recommended }));
    }
    const sorted = [...offers];
    if (sortMode === "cheapest") sorted.sort((a, b) => Number(a.offeredFare) - Number(b.offeredFare));
    else if (sortMode === "fastest") sorted.sort((a, b) => a.etaMinutes - b.etaMinutes);
    else sorted.sort((a, b) => Number(b.rider.ratingAvg) - Number(a.rider.ratingAvg));
    return sorted.map((offer) => ({ offer, recommended: false }));
  }, [offersQ.data, sortMode]);

  const selectM = useMutation({
    mutationFn: (offerId: string) => selectOffer(orderId, offerId),
    // Partial optimism: flip to `assigned` so the offer list collapses the instant they tap — the
    // delivery code paints in onSuccess (it isn't in the cache). cancelQueries first so the poll
    // can't clobber the optimistic write; rollback + a muted notice if the rider was just taken.
    onMutate: async () => {
      setSelectNotice(null);
      await qc.cancelQueries({ queryKey: orderKey(orderId) });
      const prev = qc.getQueryData<OrderSnapshot>(orderKey(orderId));
      qc.setQueryData<OrderSnapshot>(orderKey(orderId), (o) => (o ? { ...o, status: "assigned" } : o));
      return { prev };
    },
    onSuccess: (res) => {
      setDeliveryCode(res.deliveryCode);
      void saveDeliveryCode(orderId, res.deliveryCode);
    },
    onError: (e, _v, ctx) => {
      if (ctx?.prev !== undefined) qc.setQueryData(orderKey(orderId), ctx.prev);
      // Only a 409 means the rider was raced away (a muted notice); any other failure is a real
      // error and flows to the red mutationError slot below instead.
      if (e instanceof ApiError && e.status === 409) {
        setSelectNotice("That rider was just taken — choose another.");
        AccessibilityInfo.announceForAccessibility("That rider was just taken — choose another.");
      }
    },
    onSettled: () => {
      setSelectingId(null);
      void qc.invalidateQueries({ queryKey: orderKey(orderId) });
    },
  });
  useEffect(() => {
    if (!selectM.isPending) {
      setSelectSlow(false);
      return;
    }
    const t = setTimeout(() => setSelectSlow(true), 4500);
    return () => clearTimeout(t);
  }, [selectM.isPending]);
  const rotateM = useMutation({
    mutationFn: () => rotateDeliveryCode(orderId),
    onSuccess: (res) => {
      setDeliveryCode(res.deliveryCode);
      void saveDeliveryCode(orderId, res.deliveryCode);
    },
  });
  // Identity-stable (v5's `mutate` is stable) so it never busts LiveTrackingCard's memo — and it
  // swallows the press event a bare `onPress={rotateM.mutate}` would pass as mutation variables.
  const reissueCode = useCallback(() => rotateM.mutate(), [rotateM.mutate]);
  const rateM = useMutation({
    mutationFn: (value: number) => rateOrder(orderId, { score: value }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: orderKey(orderId) });
      void qc.invalidateQueries({ queryKey: ["history"] }); // the just-rated trip now shows its ★ in history
    },
  });
  const cancelM = useMutation({
    mutationFn: () => cancelOrder(orderId),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: orderKey(orderId) });
      void qc.invalidateQueries({ queryKey: ["history"] }); // the Trips list must reflect the cancel, not the stale live status
    },
  });
  // 2·b1: "notify me when a rider's online" — registers a waiting-list entry keyed to the pickup so the
  // server pushes when a rider comes online nearby. Reads the pickup from the live snapshot at call time.
  const notifyM = useMutation({
    mutationFn: () => {
      const pickup = qc.getQueryData<OrderSnapshot>(orderKey(orderId))?.pickup.point;
      if (!pickup) throw new Error("No pickup on this order yet.");
      return notifyWhenRiderOnline(pickup);
    },
  });

  // A mutation error (e.g. "the network is slow, try again" after a select/rotate/rate/cancel/notify
  // timeout) can be stale the instant the status actually changes underneath it — the request often
  // DID succeed server-side; the refetch just landed after the client gave up waiting. Without this, the
  // red banner sits glued to the bottom of an already-correct tracking screen with no way to clear it
  // short of leaving the order (07-11 finding: "Choose this rider" timeout leaves a permanent false error).
  useEffect(() => {
    selectM.reset();
    rotateM.reset();
    rateM.reset();
    cancelM.reset();
    notifyM.reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset stale mutation errors on any real status transition; mutation refs are stable.
  }, [status]);

  if (orderQ.isLoading) {
    return (
      <Screen>
        <SkeletonList />
      </Screen>
    );
  }
  if (!orderQ.data) {
    // Only a real 404 is "not found"; a 403 is also permanent (party-only gate) but distinct; a
    // transient fetch error gets a retry, not a dead-end.
    const errorKind = orderLoadErrorKind(orderQ.error instanceof ApiError ? orderQ.error.status : undefined);
    const notFound = errorKind === "not_found";
    const forbidden = errorKind === "forbidden";
    // Offline cold-start: the fetch failed but we have this order's last-known summary. Show it (the
    // root offline banner already explains why it's stale) instead of a bare error — the live query
    // takes over the moment we reconnect. Never shown for a 404/403: neither is "offline".
    const showLastKnown = !notFound && !forbidden && lastKnown != null && lastKnown.id === orderId;
    if (showLastKnown) {
      return (
        <Screen>
          <ScrollView showsVerticalScrollIndicator={false}>
            <View style={{ flexDirection: "row", alignItems: "center", marginBottom: tokens.space.md }}>
              <Heading>Order {lastKnown.id.slice(0, 8)}</Heading>
              <View style={{ flex: 1 }} />
              <StatusPill status={lastKnown.status} tone={orderStatusTone(lastKnown.status)} />
            </View>
            <Card>
              <Text style={{ fontSize: 14, color: tokens.color.muted, marginBottom: tokens.space.xs, fontVariant: ["tabular-nums"] }}>
                Fare {formatMoney(lastKnown.fare)}
              </Text>
              <Text style={{ fontSize: tokens.font.size.body, color: tokens.color.ink }}>
                {lastKnown.pickupLandmark || "Pickup"} → {lastKnown.dropoffLandmark || "Drop-off"}
              </Text>
              <View style={{ height: tokens.space.sm }} />
              <Sub>Showing your last saved update — we&apos;ll refresh the moment you&apos;re back online.</Sub>
            </Card>
            <Button label="Retry now" onPress={() => void orderQ.refetch()} loading={orderQ.isFetching} />
            <Button label="Back home" variant="ghost" onPress={() => router.replace("/home")} />
          </ScrollView>
        </Screen>
      );
    }
    return (
      <Screen>
        <Heading>{notFound ? "Order not found" : forbidden ? "This order isn't available to you" : "Couldn't load this order"}</Heading>
        {notFound || forbidden ? null : <Button label="Retry" onPress={() => void orderQ.refetch()} />}
        <Button label="Back home" variant="ghost" onPress={() => router.replace("/home")} />
      </Screen>
    );
  }

  const order = orderQ.data;
  // Fix 1: is a RIDER viewing their own trip (vs. the customer)? Absent viewerRole (older API) defaults
  // to the historical customer view. Gates customer-voiced/customer-gated UI below (rating card, the
  // cancel-blame line, the counterparty-phone label) so a rider sees role-correct copy.
  const isRiderViewer = order.viewerRole === "rider";
  const fare = order.agreedFare ?? order.proposedFare;
  // A select 409 (rider raced away) is handled with its own muted notice, so it's excluded here;
  // any other select failure is a real error and joins the red slot.
  const selectRace = selectM.error instanceof ApiError && selectM.error.status === 409;
  const firstError = (selectRace ? null : selectM.error) ?? rotateM.error ?? rateM.error ?? cancelM.error ?? notifyM.error;
  const mutationError = firstError instanceof Error ? firstError.message : null;
  const bidCount = orderedOffers.length;
  // 2·b1: the server said there are no online riders nearby and no bid has landed — an honest "nobody
  // to ping right now" state, distinct from the calm "riders pinged, hang tight" wait. Non-terminal:
  // while open_for_offers the snapshot polls every 15s UNCONDITIONALLY (no WS event carries a
  // ridersNearby change, so the poll — not the socket — is what refreshes this count), and any landing
  // bid clears it.
  const noRiders = noRidersOnline(order.ridersNearby, bidCount, order.status === "open_for_offers");

  // Counter-offer (F-07): a `counter` bid ABOVE the customer's ask surfaces as Accept/Decline. A
  // declined one reverts to a normal choosable bid (its Accept treatment removed), so it drops out of
  // `isActiveCounter`. Never auto-charge above ask — Accept selects at the shown counter price.
  const ask = Number(order.proposedFare);
  const isActiveCounter = (o: OfferRow): boolean =>
    isPendingCounter(o.type, Number(o.offeredFare), ask, declinedCounterIds.has(o.id));
  const hasActiveCounter = orderedOffers.some(({ offer }) => isActiveCounter(offer));
  const chooseOffer = (offerId: string): void => {
    setSelectNotice(null); // a new attempt clears the stale "just taken" notice
    setSelectingId(offerId);
    // Cache the chosen rider's public identity so the tracking card can show their face + name (the
    // assigned-order snapshot won't carry it). Best-effort; the tracker degrades to no identity card.
    const chosen = offersQ.data?.find((o) => o.id === offerId);
    if (chosen) {
      const identity: RiderIdentity = {
        orderId,
        profileId: chosen.rider.profileId,
        firstName: chosen.rider.profile.firstName,
        lastName: chosen.rider.profile.lastName,
        photoUrl: chosen.rider.profile.photoUrl,
        ratingAvg: chosen.rider.ratingAvg,
        ratingCount: chosen.rider.ratingCount,
        tripsCount: chosen.rider.tripsCount,
      };
      setRiderIdentity(identity);
      void saveRiderIdentity(identity);
    }
    selectM.mutate(offerId);
  };

  // C5: the re-broadcast / "send another request" CTAs used to `router.replace("/home")`, dumping the
  // customer on a BLANK compose form and losing the whole order. Instead carry THIS order's route,
  // landmarks, line-items and price into the compose flow so home.tsx prefills them (params are strings,
  // so items ride as JSON). The customer lands on a filled form and just nudges the price and re-sends.
  const rebroadcast = (): void =>
    router.replace({
      pathname: "/home",
      params: buildRebroadcastParams({
        pickup: order.pickup,
        dropoff: order.dropoff,
        items: order.items,
        proposedFare: order.proposedFare,
      }),
    });

  return (
    <Screen>
      {/* A dropped socket surfaces as the standard top banner, not an inline strip in the card. */}
      {socketExpected && wasConnected.current && connectionState === "reconnecting" ? <OfflineBanner state="reconnecting" /> : null}
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: tokens.space.md }}>
          <Heading>Order {order.id.slice(0, 8)}</Heading>
          <View style={{ flex: 1 }} />
          <StatusPill status={order.status} tone={orderStatusTone(order.status)} />
        </View>

        {/* Hand-off code — only while the trip is live/deliverable (C6). On a terminal order
            (cancelled / undelivered / delivered / completed) the code is meaningless and, above
            "This order is cancelled." / "Parcel not delivered", actively misleading. */}
        {isActive ? (
          deliveryCode ? (
            <Card style={{ borderColor: tokens.color.accent }}>
              <Text style={{ fontSize: 14, color: tokens.color.muted }}>Give this code to the recipient — the rider enters it at hand-off:</Text>
              <Text style={{ fontSize: 28, fontWeight: "700", letterSpacing: 6, color: tokens.color.accentText, fontVariant: ["tabular-nums"] }}>{deliveryCode}</Text>
            </Card>
          ) : (
            // C7: assigned-or-later with no local code (e.g. a dropped select response). Don't show
            // nothing — prompt a re-issue via the existing rotate mutation instead of leaving the
            // customer with no code and no explanation.
            <Card style={{ borderColor: tokens.color.accent }}>
              <Text style={{ fontSize: 14, color: tokens.color.muted, marginBottom: tokens.space.sm }}>
                Your hand-off code isn&apos;t showing — tap to re-issue so you can give it to the recipient at hand-off.
              </Text>
              <Button label="Re-issue delivery code" onPress={() => rotateM.mutate()} loading={rotateM.isPending} />
            </Card>
          )
        ) : null}

        {order.status === "open_for_offers" ? (
          <View>
            {/* 3·b0: rider-bail reassurance. Shown only when this auction was auto-created by a bail
                (the `rebroadcast` flag) and no fresh bid has landed yet — explains the sudden restart
                and that the price is unchanged, so the customer doesn't think they lost their order. */}
            {showRebroadcast ? (
              <Card style={{ borderColor: tokens.color.line }}>
                <View style={{ flexDirection: "row", alignItems: "center", gap: tokens.space.sm, marginBottom: tokens.space.xs }}>
                  <Icon name="bike" size={18} color={tokens.color.muted} />
                  <Text style={{ fontSize: tokens.font.size.bodyLg, fontWeight: tokens.font.weight.bold, color: tokens.color.ink }}>Your rider had to cancel</Text>
                </View>
                <Text style={{ fontSize: 13, color: tokens.color.muted, lineHeight: 19 }}>
                  Sometimes a rider can&apos;t make it. We&apos;re finding you another rider at the same
                  price{rebroadcastFare ? <Text style={{ fontWeight: tokens.font.weight.bold, color: tokens.color.ink, fontVariant: ["tabular-nums"] }}> — {formatMoney(rebroadcastFare)}</Text> : null}. No need to start over.
                </Text>
              </Card>
            ) : null}
            {/* Live header: bid count the moment the first bid lands, else a "finding" state; a
                reconnecting hint when the auction socket is down and we're on the poll fallback.
                Right-aligned countdown shares the baseline — calm (muted) until the last 20s, then
                amber-urgency (danger, bold), with a paused dot when the socket is reconnecting. */}
            <View style={{ flexDirection: "row", alignItems: "baseline", marginBottom: tokens.space.lg }}>
              <Text style={{ flex: 1, fontSize: 14, color: tokens.color.muted }}>
                {auctionHeaderText({ remainingMs, bidCount, noRiders, reconnecting: connectionState === "reconnecting" })}
              </Text>
              {remainingMs != null ? (
                <Animated.Text
                  accessibilityLabel={spokenRemaining(remainingMs)}
                  style={{
                    fontSize: 14,
                    fontVariant: ["tabular-nums"],
                    fontWeight: urgent ? "700" : "400",
                    color: urgencyAnim.interpolate({
                      inputRange: [0, 1],
                      outputRange: [tokens.color.muted, tokens.color.danger],
                    }),
                  }}
                >
                  {formatClock(remainingMs)}
                  {frozen ? " ·" : ""}
                </Animated.Text>
              ) : null}
            </View>
            {urgent ? (
              // Pre-surface the recovery affordance BEFORE the dead-end — same destination as the
              // expired state's "Send another request". Ghost so it doesn't compete with "Choose".
              <Button label="Raise price & send again" variant="ghost" onPress={rebroadcast} />
            ) : null}
            {orderedOffers.length > 1 ? (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: tokens.space.sm, marginBottom: tokens.space.sm }}>
                {SORT_MODES.map((m) => {
                  const on = sortMode === m.key;
                  return (
                    <Pressable
                      key={m.key}
                      onPress={() => setSortMode(m.key)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: on }}
                      hitSlop={6}
                      style={{
                        minHeight: tokens.touchTargetMin,
                        justifyContent: "center",
                        paddingHorizontal: tokens.space.lg,
                        borderRadius: tokens.radius.pill,
                        borderWidth: 1,
                        // Selected = mint wash + green text (DS chip state) — the CTA fill stays
                        // reserved for the screen's one primary action.
                        borderColor: on ? tokens.color.accentText : tokens.color.line,
                        backgroundColor: on ? tokens.color.accentWash : tokens.color.bg,
                      }}
                    >
                      <Text style={{ fontSize: 12, fontWeight: "600", color: on ? tokens.color.accentText : tokens.color.muted }}>{m.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
            {orderedOffers.map(({ offer: o, recommended }, idx) => {
              if (isActiveCounter(o)) {
                return (
                  <BidEntrance key={o.id} animate={!reduceMotion}>
                    <CounterOfferCard
                      offer={o}
                      ask={ask}
                      onAccept={() => chooseOffer(o.id)}
                      onDecline={() => setDeclinedCounterIds((prev) => new Set(prev).add(o.id))}
                      loading={selectingId === o.id && selectM.isPending}
                      disabled={selectM.isPending}
                      slow={selectingId === o.id && selectSlow}
                    />
                  </BidEntrance>
                );
              }
              // One primary CTA on the list: the recommended card (or the first, if none is marked).
              // While a counter Accept is on screen it owns the one primary — normal bids go ghost.
              const primaryPick = !hasActiveCounter && (recommended || (!orderedOffers.some((x) => x.recommended) && idx === 0));
              return (
                <BidEntrance key={o.id} animate={!reduceMotion}>
                  <Card style={recommended ? { borderColor: tokens.color.highlight } : undefined}>
                    {recommended ? (
                      <Text style={{ fontSize: tokens.font.size.micro, fontWeight: tokens.font.weight.bold, color: tokens.color.highlightInk, letterSpacing: 0.5, marginBottom: 3 }}>
                        ★ RECOMMENDED
                      </Text>
                    ) : null}
                    {/* Face-first: the rider's photo (or an initials monogram) anchors the bid the way
                        inDrive/Uber front the person, not a row of text. */}
                    <RiderMini
                      profileId={o.rider.profileId}
                      firstName={o.rider.profile.firstName}
                      lastName={o.rider.profile.lastName}
                      photoUrl={o.rider.profile.photoUrl}
                      ratingAvg={o.rider.ratingAvg}
                      ratingCount={o.rider.ratingCount}
                      tripsCount={o.rider.tripsCount}
                      etaMinutes={o.etaMinutes}
                    />
                    <Text style={{ fontSize: tokens.font.size.price, fontWeight: tokens.font.weight.bold, marginVertical: 4, fontVariant: ["tabular-nums"] }}>{formatMoney(o.offeredFare)}</Text>
                    <Button
                      label={selectingId === o.id && selectSlow ? "Still choosing — hang on" : "Choose this rider"}
                      variant={primaryPick ? "primary" : "ghost"}
                      onPress={() => chooseOffer(o.id)}
                      loading={selectingId === o.id && selectM.isPending}
                      disabled={selectM.isPending}
                    />
                  </Card>
                </BidEntrance>
              );
            })}
            {selectNotice ? (
              <Text accessibilityLiveRegion="polite" style={{ color: tokens.color.muted, fontSize: 14, marginTop: tokens.space.xs }}>
                {selectNotice}
              </Text>
            ) : null}
            {orderedOffers.length === 0 ? (
              shouldShowOffersError(offersQ.isError, orderedOffers.length, order.status === "open_for_offers") ? (
                // Honest error: the offers fetch failed and there's nothing to show — don't paint the
                // calm "finding riders" working state over a dead fetch. Mirrors the rider board's
                // `openQ.isError` branch (wifi-off EmptyState + a Retry that refetches).
                <EmptyState icon="wifi-off" title="Couldn't load offers" message="Check your connection and try again.">
                  <Button label="Retry" onPress={() => void offersQ.refetch()} loading={offersQ.isFetching} />
                </EmptyState>
              ) : noRiders ? (
                // 2·b1: honest supply-empty. No online riders were nearby to ping — so the calm
                // "riders were pinged, hang tight" copy would be a lie. Non-terminal: the auction keeps
                // running (the header still counts down), the poll self-heals if a rider comes online,
                // and the nudge widens interest. "Notify me" registers a waiting-list entry so the
                // customer gets a push the moment a rider comes online near their pickup.
                <View style={{ marginTop: tokens.space.sm }}>
                  <EmptyState
                    icon="bike"
                    title="No riders online nearby right now"
                    message="Nobody's online near you this minute. We'll keep looking while the window's open — a rider may come on any moment. You can also nudge the price to widen interest."
                  >
                    {notifyM.isSuccess && notifyM.data?.queued ? (
                      <Text style={{ fontSize: 14, color: tokens.color.accentText, fontWeight: "600", textAlign: "center" }}>
                        We&apos;ll ping you when a rider&apos;s online near your pickup.
                      </Text>
                    ) : notifyM.isSuccess && !notifyM.data?.queued ? (
                      // The server accepted the request but couldn't queue a reminder (e.g. no waiting-list
                      // store). Be honest rather than silently re-render the plain button and invite an
                      // endless retry loop that can never register.
                      <Text style={{ fontSize: 14, color: tokens.color.muted, textAlign: "center" }}>
                        We can&apos;t take reminders right now — check back in a bit, or raise the price to widen interest.
                      </Text>
                    ) : (
                      <Button
                        label="Notify me when a rider's online"
                        variant="ghost"
                        onPress={() => notifyM.mutate()}
                        loading={notifyM.isPending}
                      />
                    )}
                    <Button label="Raise price & send again" variant="ghost" onPress={rebroadcast} />
                  </EmptyState>
                </View>
              ) : (
                // Live-but-empty: a "working" state (pulsing placeholder) distinct from the expired
                // dead-end, so streaming-into-empty reads as "finding", not "broken".
                <View style={{ marginTop: tokens.space.sm }}>
                  <SkeletonCard />
                  <Sub>No offers yet — riders nearby have been pinged. Hang tight.</Sub>
                </View>
              )
            ) : null}
          </View>
        ) : null}

        {isActive || order.status === "delivered" || order.status === "completed" ? (
          // The whole live section (ETA headline, map, hint, phone row, stepper) lives in a memoized
          // child with its own telemetry subscription — a GPS tick re-renders it and ONLY it (this
          // screen's `select: selectOrderShell` above never sees the position change). Every prop here
          // is referentially stable across ticks: the snapshot fields come off the shell (structural
          // sharing preserves them between status changes), riderIdentity is state, and reissueCode is
          // the stable callback above.
          <LiveTrackingCard
            orderId={orderId}
            status={order.status}
            isActive={isActive}
            fare={fare}
            pickup={order.pickup.point}
            dropoff={order.dropoff.point}
            events={order.events}
            counterpartyPhone={order.counterpartyPhone}
            viewerRole={order.viewerRole}
            riderIdentity={riderIdentity}
            connectionState={connectionState}
            onReissueCode={reissueCode}
            reissuing={rotateM.isPending}
          />
        ) : null}

        {/* §5c collection reassurance: the rider's photo of the parcel, taken at pickup. Self-hides
            when no photo was attached, so no status gating needed. */}
        <PickupPhoto url={order.pickupPhotoUrl} />

        {/* SOS on a live trip (R-16/F-13) — a deliberate danger control, highest value at the cash
            hand-off. Only while the trip is genuinely active. */}
        {isActive ? <SosControl orderId={orderId} /> : null}

        {/* Fix 1: rating is customer→rider and customer-gated server-side (rate() 403s a rider), so the
            card is hidden for a rider viewing their own delivered trip. */}
        {order.status === "delivered" && !isRiderViewer ? (
          <RatingCard saving={rateM.isPending} onRate={(n) => rateM.mutate(n)} />
        ) : null}

        {order.status === "completed" ? (
          <>
            <Card>
              <Celebrate />
              <Text style={{ fontSize: 16, fontWeight: "700", color: tokens.color.accentText, textAlign: "center", marginTop: tokens.space.sm }}>Delivered &amp; completed. Thank you!</Text>
            </Card>
            <ReceiptCard
              orderId={order.id}
              pickupLandmark={order.pickup.landmark}
              dropoffLandmark={order.dropoff.landmark}
              fare={fare}
              riderName={riderIdentity ? `${riderIdentity.firstName} ${riderIdentity.lastName}`.trim() : null}
              completedAt={
                order.events?.find((e) => e.status === "completed")?.createdAt ??
                order.events?.find((e) => e.status === "delivered")?.createdAt ??
                null
              }
            />
          </>
        ) : null}
        {order.status === "expired" ? (
          // The offers list stays cached from right before expiry (its query disables once the order
          // leaves open_for_offers, so React Query keeps the last-known data rather than clearing it).
          // A customer who watched bids come in shouldn't be told "no offers" — and "raise your price"
          // is actively wrong advice when riders WERE bidding; the real problem was picking in time.
          bidCount > 0 ? (
            <EmptyState icon="bike" title="Your choosing window closed" message="Riders did offer, but the window ended before you picked. Send again and they'll likely bid again at the same price.">
              <Button label="Send another request" onPress={rebroadcast} />
            </EmptyState>
          ) : (
            <EmptyState
              icon="bike"
              title="No riders took this price yet"
              message="Your window closed with no offers. Nudging the price up usually gets a rider fast."
            >
              <Button label="Send another request" onPress={rebroadcast} />
            </EmptyState>
          )
        ) : null}
        {order.status === "cancelled" ? (
          <Card>
            <Text style={{ fontSize: tokens.font.size.bodyLg, fontWeight: tokens.font.weight.bold, color: tokens.color.danger }}>
              {/* Fix 1: the blame line is written from the viewer's perspective. For the customer view a
                  rider cancel is "your rider"; for a rider viewing their own trip a customer cancel is
                  "your customer", and either side's own cancel reads as "you". */}
              {isRiderViewer
                ? order.cancelledBy === "customer"
                  ? "Your customer cancelled this delivery."
                  : order.cancelledBy === "rider"
                    ? "You cancelled this delivery."
                    : "This order is cancelled."
                : order.cancelledBy === "rider"
                  ? "Your rider cancelled this delivery."
                  : order.cancelledBy === "customer"
                    ? "You cancelled this order."
                    : "This order is cancelled."}
            </Text>
            {order.cancelReason ? (
              <Text style={{ fontSize: tokens.font.size.body, color: tokens.color.muted, lineHeight: 20, marginTop: tokens.space.sm }}>{order.cancelReason}</Text>
            ) : null}
            {/* F-01: the rider bailed but the job was auto re-sent to other riders at the same price.
                Point the customer forward to the fresh auction instead of dead-ending on the cancel. */}
            {order.rebroadcastedToId ? (
              <View style={{ marginTop: tokens.space.sm }}>
                <Text style={{ fontSize: tokens.font.size.body, color: tokens.color.muted, lineHeight: 20, marginBottom: tokens.space.sm }}>
                  We&apos;ve re-sent this request to other riders at the same price — no need to start over.
                </Text>
                <Button
                  label="Follow the new request"
                  onPress={() => {
                    const carried = fare ? `?rebroadcast=1&fare=${encodeURIComponent(fare)}` : "?rebroadcast=1";
                    router.replace(`/order/${order.rebroadcastedToId}${carried}`);
                  }}
                />
              </View>
            ) : null}
          </Card>
        ) : null}

        {/* Undeliverable terminal (F-02 / C6): the rider couldn't complete the hand-off. Reason +
            attempt count are shown verbatim; the call-rider action stays (phone is still revealed for
            `undelivered`, PHONE_REVEAL_STATUSES). Own-risk — no Lynia return obligation. */}
        {order.status === "undelivered" ? (
          <>
            <Card>
              <View style={{ flexDirection: "row", alignItems: "center", gap: tokens.space.sm, marginBottom: tokens.space.sm }}>
                <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: tokens.color.dangerWash, alignItems: "center", justifyContent: "center" }}>
                  <Icon name="circle-alert" size={18} color={tokens.color.danger} />
                </View>
                <Text style={{ fontSize: tokens.font.size.bodyLg, fontWeight: tokens.font.weight.bold, color: tokens.color.danger }}>Parcel not delivered</Text>
              </View>
              <Text style={{ fontSize: tokens.font.size.body, color: tokens.color.muted, lineHeight: 20, marginBottom: tokens.space.sm }}>
                Your rider couldn&apos;t complete this delivery. The parcel is still with your rider.
              </Text>
              <View style={{ flexDirection: "row", alignItems: "center", gap: tokens.space.sm, padding: tokens.space.sm, borderRadius: tokens.radius.input, backgroundColor: tokens.color.surface, marginBottom: tokens.space.sm }}>
                <Icon name="circle-alert" size={15} color={tokens.color.muted} />
                <Text style={{ flex: 1, fontSize: tokens.font.size.caption, color: tokens.color.ink, lineHeight: 18 }}>
                  <Text style={{ fontWeight: tokens.font.weight.bold }}>Reason recorded by your rider: </Text>
                  {UNDELIVERED_REASON_LABEL[order.undeliveredReason ?? ""] ?? "delivery not completed"}
                  {order.undeliveredAttempts != null ? ` · ${order.undeliveredAttempts} attempt${order.undeliveredAttempts === 1 ? "" : "s"}` : ""}
                </Text>
              </View>
              <View style={{ flexDirection: "row", gap: tokens.space.sm, padding: tokens.space.sm, borderRadius: tokens.radius.input, backgroundColor: tokens.color.surface, marginBottom: tokens.space.sm }}>
                <Icon name="triangle-alert" size={15} color={tokens.color.muted} />
                <Text style={{ flex: 1, fontSize: tokens.font.size.caption, color: tokens.color.muted, lineHeight: 18 }}>
                  Sending is at your own risk — arrange the parcel directly with your rider. LyniaGo isn&apos;t liable for non-delivery.
                </Text>
              </View>
              {order.counterpartyPhone ? (
                <Pressable
                  onPress={() => void Linking.openURL(`tel:${order.counterpartyPhone}`)}
                  accessibilityRole="button"
                  accessibilityLabel={isRiderViewer ? "Call sender" : "Call rider"}
                  style={{ minHeight: tokens.touchTargetMin, flexDirection: "row", alignItems: "center", gap: tokens.space.sm }}
                >
                  <Icon name="phone" size={16} color={tokens.color.accentText} />
                  <Text style={{ fontSize: tokens.font.size.body, fontWeight: tokens.font.weight.semibold, color: tokens.color.accentText }}>
                    {isRiderViewer ? "Call sender" : "Call rider"}{order.counterpartyPhone ? ` · ${order.counterpartyPhone}` : ""}
                  </Text>
                </Pressable>
              ) : null}
            </Card>
            <Button label="Send a new request" onPress={rebroadcast} />
          </>
        ) : null}

        {/* Cancel-anytime (C3). Post-pickup the parcel is on the bike, so a cancel gets a hand-back
            warning before it fires; pre-pickup cancels straight through. */}
        {CUSTOMER_CANCELLABLE.has(order.status) ? (
          cancelConfirm && POST_PICKUP_CANCEL.has(order.status) ? (
            <Card style={{ borderColor: tokens.color.danger }}>
              <Text style={{ fontSize: tokens.font.size.bodyLg, fontWeight: tokens.font.weight.bold, color: tokens.color.ink, marginBottom: tokens.space.xs }}>Cancel after pickup?</Text>
              <Text style={{ fontSize: tokens.font.size.body, color: tokens.color.muted, lineHeight: 20, marginBottom: tokens.space.sm }}>
                Your rider already has the parcel. If you cancel now, you&apos;ll arrange getting it back directly with them — LyniaGo can&apos;t recover it, and an agreed fare isn&apos;t refunded.
              </Text>
              <Button label="Yes, cancel this order" onPress={() => { setCancelConfirm(false); cancelM.mutate(); }} loading={cancelM.isPending} />
              <Button label="Keep my order" variant="ghost" onPress={() => setCancelConfirm(false)} />
            </Card>
          ) : (
            <Button
              label="Cancel order"
              variant="ghost"
              onPress={() => {
                if (POST_PICKUP_CANCEL.has(order.status)) setCancelConfirm(true);
                else cancelM.mutate();
              }}
              loading={cancelM.isPending}
            />
          )
        ) : null}
        {/* Order-level support — replaces the generic-help dead-end for an active or completed trip.
            Also available during the auction wait (open_for_offers/expired): the server-side `raise()`
            already accepts a report at any status, but the control was previously hidden during the
            single most anxious stretch of the journey — "is anyone going to take my price?" — forcing
            a worried customer off this screen and into the generic Help flow with no orderId context. */}
        {isActive ||
        order.status === "open_for_offers" ||
        order.status === "expired" ||
        order.status === "delivered" ||
        order.status === "completed" ||
        order.status === "undelivered" ? (
          <GetHelpControl orderId={orderId} />
        ) : null}
        {/* Report / block after a trip (customer → rider). Terminal states only. */}
        {order.status === "delivered" || order.status === "completed" || order.status === "undelivered" || order.status === "cancelled" ? (
          <ReportControl orderId={orderId} counterpartyNoun="rider" />
        ) : null}
        <Button label="Back home" variant="ghost" onPress={() => router.replace("/home")} />
        <ErrorText message={mutationError} />
        <View style={{ height: tokens.space.xxl }} />
      </ScrollView>
    </Screen>
  );
}
