import { ACTIVE_RIDE_STATUSES, CUSTOMER_CANCELLABLE_STATUSES, rankOffers, tokens } from "@lynia/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Pressable, ScrollView, Text, View } from "react-native";
import { ApiError } from "../../src/api/client";
import { listOffers, selectOffer, type OfferRow } from "../../src/api/offers";
import { cancelOrder, getOrder, type OrderSnapshot, rateOrder, rotateDeliveryCode } from "../../src/api/orders";
import { loadDeliveryCode, saveDeliveryCode } from "../../src/auth/session";
import { offersKey, orderKey } from "../../src/query/client";
import { useOrderSocket } from "../../src/realtime/use-order-socket";
import { Button, Card, EmptyState, ErrorText, Heading, Screen, SkeletonCard, SkeletonList, StatusPill, Stepper, Sub } from "../../src/ui";
import { LiveMap } from "../../src/ui/LiveMap";

const CUSTOMER_CANCELLABLE = new Set<string>(CUSTOMER_CANCELLABLE_STATUSES);
const ACTIVE = ACTIVE_RIDE_STATUSES as string[];

type SortMode = "best" | "cheapest" | "fastest" | "rated";
const SORT_MODES: { key: SortMode; label: string }[] = [
  { key: "best", label: "Best match" },
  { key: "cheapest", label: "Cheapest" },
  { key: "fastest", label: "Fastest" },
  { key: "rated", label: "Top rated" },
];

const URGENT_MS = 20_000;

/** mm:ss for the auction timer. */
function formatClock(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Spoken form for the timer's accessibilityLabel, e.g. "1 minute 20 seconds left". */
function spokenRemaining(ms: number): string {
  const total = Math.floor(ms / 1000);
  const m = Math.floor(total / 60);
  const s = total % 60;
  const parts: string[] = [];
  if (m > 0) parts.push(`${m} minute${m === 1 ? "" : "s"}`);
  parts.push(`${s} second${s === 1 ? "" : "s"}`);
  return `Offer window: ${parts.join(" ")} left`;
}

/** Live-auction: OS reduce-motion preference, so the bid entrance animation degrades to instant. */
function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let alive = true;
    void AccessibilityInfo.isReduceMotionEnabled().then((r) => {
      if (alive) setReduce(r);
    });
    const sub = AccessibilityInfo.addEventListener("reduceMotionChanged", setReduce);
    return () => {
      alive = false;
      sub.remove();
    };
  }, []);
  return reduce;
}

/**
 * A single bid, animated in. A newly-arrived offer mounts with a fresh key, so this runs its
 * slide+fade entrance exactly once — existing cards keep their key and don't re-animate on re-sort
 * or poll. Honors reduce-motion (renders at rest). useNativeDriver so it stays cheap on low-end
 * Android; we deliberately avoid animating border colour (JS-thread) to keep it smooth.
 */
function BidEntrance({ animate, children }: { animate: boolean; children: React.ReactNode }): React.ReactElement {
  const v = useRef(new Animated.Value(animate ? 0 : 1)).current;
  useEffect(() => {
    if (animate) Animated.timing(v, { toValue: 1, duration: 220, useNativeDriver: true }).start();
  }, [animate, v]);
  return (
    <Animated.View
      style={{
        opacity: v,
        transform: [{ translateY: v.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
      }}
    >
      {children}
    </Animated.View>
  );
}

export default function OrderScreen(): React.ReactElement {
  const { id } = useLocalSearchParams<{ id: string }>();
  const orderId = typeof id === "string" ? id : "";
  const qc = useQueryClient();
  const router = useRouter();
  const reduceMotion = useReduceMotion();
  const [deliveryCode, setDeliveryCode] = useState<string | null>(null);
  const [score, setScore] = useState(5);
  const [sortMode, setSortMode] = useState<SortMode>("best");
  // A rolled-back optimistic select is a race outcome, not a user error — shown muted, not red.
  const [selectNotice, setSelectNotice] = useState<string | null>(null);

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

  const orderQ = useQuery({
    queryKey: orderKey(orderId),
    queryFn: () => getOrder(orderId),
    enabled: orderId !== "",
    refetchInterval: (q) => {
      const s = q.state.data?.status;
      // WS pushes now drive the live states; polling is only a slow self-heal if the socket drops.
      if (s === "open_for_offers") return 15_000;
      if (s !== undefined && ACTIVE.includes(s)) return 15_000;
      return false;
    },
  });
  const status = orderQ.data?.status;
  const isActive = status !== undefined && ACTIVE.includes(status);

  // Open the socket during the AUCTION too (not just once active): `offers:changed` streams new
  // bids in, and `order:status` reflects the assignment. Expose connection state for the UI.
  const socketExpected = isActive || status === "delivered" || status === "open_for_offers";
  const { connected } = useOrderSocket(socketExpected ? orderId : null);
  const connectionState: "live" | "reconnecting" = connected ? "live" : "reconnecting";

  const offersQ = useQuery({
    queryKey: offersKey(orderId),
    queryFn: () => listOffers(orderId),
    enabled: status === "open_for_offers",
    // The `offers:changed` WS signal invalidates this instantly; poll is the 15s fallback.
    refetchInterval: status === "open_for_offers" ? 15_000 : false,
  });

  // Announce a newly-arrived bid for screen-reader users — the streaming list updates silently.
  const liveBidCount = offersQ.data?.length ?? 0;
  const prevBidCount = useRef(0);
  useEffect(() => {
    if (liveBidCount > prevBidCount.current && status === "open_for_offers") {
      AccessibilityInfo.announceForAccessibility(
        liveBidCount === 1 ? "A rider is bidding on your order" : `${liveBidCount} riders bidding`,
      );
    }
    prevBidCount.current = liveBidCount;
  }, [liveBidCount, status]);

  // --- Auction countdown ---
  // Tick a 1s clock ONLY while open_for_offers with a known expiry. During a socket reconnect we
  // freeze the last value (we can't trust wall-clock drift vs. the server), so the ticker skips.
  const expiresAt = orderQ.data?.expiresAt ?? null;
  const [remainingMs, setRemainingMs] = useState<number | null>(null);
  const frozen = connectionState === "reconnecting";
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
    onError: (_e, _v, ctx) => {
      if (ctx?.prev !== undefined) qc.setQueryData(orderKey(orderId), ctx.prev);
      setSelectNotice("That rider was just taken — choose another.");
      AccessibilityInfo.announceForAccessibility("That rider was just taken — choose another.");
    },
    onSettled: () => void qc.invalidateQueries({ queryKey: orderKey(orderId) }),
  });
  const rotateM = useMutation({
    mutationFn: () => rotateDeliveryCode(orderId),
    onSuccess: (res) => {
      setDeliveryCode(res.deliveryCode);
      void saveDeliveryCode(orderId, res.deliveryCode);
    },
  });
  const rateM = useMutation({
    mutationFn: () => rateOrder(orderId, { score }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: orderKey(orderId) });
      void qc.invalidateQueries({ queryKey: ["history"] }); // the just-rated trip now shows its ★ in history
    },
  });
  const cancelM = useMutation({
    mutationFn: () => cancelOrder(orderId),
    onSuccess: () => void qc.invalidateQueries({ queryKey: orderKey(orderId) }),
  });

  if (orderQ.isLoading) {
    return (
      <Screen>
        <SkeletonList />
      </Screen>
    );
  }
  if (!orderQ.data) {
    // Only a real 404 is "not found"; a transient fetch error gets a retry, not a dead-end.
    const notFound = orderQ.error instanceof ApiError && orderQ.error.status === 404;
    return (
      <Screen>
        <Heading>{notFound ? "Order not found" : "Couldn't load this order"}</Heading>
        {notFound ? null : <Button label="Retry" onPress={() => void orderQ.refetch()} />}
        <Button label="Back home" variant="ghost" onPress={() => router.replace("/home")} />
      </Screen>
    );
  }

  const order = orderQ.data;
  const fare = order.agreedFare ?? order.proposedFare;
  // selectM is handled with its own muted notice (a rolled-back race), so it's excluded here.
  const firstError = rotateM.error ?? rateM.error ?? cancelM.error;
  const mutationError = firstError instanceof Error ? firstError.message : null;
  const riderPoint =
    order.rider != null && order.rider.currentLat != null && order.rider.currentLng != null
      ? { lat: order.rider.currentLat, lng: order.rider.currentLng }
      : null;
  const bidCount = orderedOffers.length;
  const trackingHint =
    connectionState === "reconnecting"
      ? "Live paused — reconnecting…"
      : riderPoint
        ? "Rider is on the move — the gold pin updates live."
        : "Waiting for the rider's GPS…";

  return (
    <Screen>
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: tokens.space.md }}>
          <Heading>Order {order.id.slice(0, 8)}</Heading>
          <View style={{ flex: 1 }} />
          <StatusPill status={order.status} />
        </View>

        {deliveryCode ? (
          <Card style={{ borderColor: tokens.color.accent }}>
            <Text style={{ fontSize: 13, color: tokens.color.muted }}>Give this code to the recipient — the rider enters it at hand-off:</Text>
            <Text style={{ fontSize: 32, fontWeight: "800", letterSpacing: 6, color: tokens.color.accent }}>{deliveryCode}</Text>
          </Card>
        ) : null}

        {order.status === "open_for_offers" ? (
          <View>
            {/* Live header: bid count the moment the first bid lands, else a "finding" state; a
                reconnecting hint when the auction socket is down and we're on the poll fallback.
                Right-aligned countdown shares the baseline — calm (muted) until the last 20s, then
                amber-urgency (danger, bold), with a paused dot when the socket is reconnecting. */}
            <View style={{ flexDirection: "row", alignItems: "baseline", marginBottom: tokens.space.lg }}>
              <Text style={{ flex: 1, fontSize: 14, color: tokens.color.muted }}>
                {bidCount > 0
                  ? `${bidCount} ${bidCount === 1 ? "rider" : "riders"} bidding${connectionState === "reconnecting" ? " · reconnecting…" : ""}`
                  : `Finding riders near you…${connectionState === "reconnecting" ? " reconnecting…" : ""}`}
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
              <Button label="Nudge price & re-broadcast" variant="ghost" onPress={() => router.replace("/home")} />
            ) : null}
            {orderedOffers.length > 1 ? (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: tokens.space.sm }}>
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
                        paddingHorizontal: 14,
                        borderRadius: tokens.radius.pill,
                        borderWidth: 1,
                        borderColor: on ? tokens.color.accent : tokens.color.line,
                        backgroundColor: on ? tokens.color.accent : tokens.color.bg,
                      }}
                    >
                      <Text style={{ fontSize: 12, fontWeight: "700", color: on ? tokens.color.onAccent : tokens.color.muted }}>{m.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
            ) : null}
            {orderedOffers.map(({ offer: o, recommended }) => (
              <BidEntrance key={o.id} animate={!reduceMotion}>
                <Card style={recommended ? { borderColor: tokens.color.highlight } : undefined}>
                  {recommended ? (
                    <Text style={{ fontSize: 10, fontWeight: "800", color: tokens.color.highlight, letterSpacing: 0.5, marginBottom: 3 }}>
                      ★ RECOMMENDED
                    </Text>
                  ) : null}
                  <Text style={{ fontSize: 16, fontWeight: "700", color: tokens.color.ink }}>
                    {o.rider.profile.firstName} {o.rider.profile.lastName}
                  </Text>
                  <Text style={{ fontSize: 13, color: tokens.color.muted }}>
                    ★ {o.rider.ratingCount > 0 ? Number(o.rider.ratingAvg).toFixed(1) : "new"} · {o.rider.tripsCount} trips · ETA {o.etaMinutes} min
                  </Text>
                  <Text style={{ fontSize: 20, fontWeight: "800", marginVertical: 4 }}>${o.offeredFare}</Text>
                  <Button label="Choose this rider" onPress={() => selectM.mutate(o.id)} loading={selectM.isPending} />
                </Card>
              </BidEntrance>
            ))}
            {selectNotice ? (
              <Text accessibilityLiveRegion="polite" style={{ color: tokens.color.muted, fontSize: 13, marginTop: tokens.space.xs }}>
                {selectNotice}
              </Text>
            ) : null}
            {orderedOffers.length === 0 ? (
              // Live-but-empty: a "working" state (pulsing placeholder) distinct from the expired
              // dead-end, so streaming-into-empty reads as "finding", not "broken".
              <View style={{ marginTop: tokens.space.sm }}>
                <SkeletonCard />
                <Sub>No offers yet — riders nearby have been pinged. Hang tight.</Sub>
              </View>
            ) : null}
          </View>
        ) : null}

        {isActive || order.status === "delivered" || order.status === "completed" ? (
          <Card>
            <Text style={{ fontSize: 13, color: tokens.color.muted, marginBottom: tokens.space.sm }}>Agreed fare ${fare}</Text>
            <LiveMap
              pickup={{ lat: order.pickup.point.lat, lng: order.pickup.point.lng }}
              dropoff={{ lat: order.dropoff.point.lat, lng: order.dropoff.point.lng }}
              rider={riderPoint}
              connectionState={isActive ? connectionState : "live"}
            />
            {order.rider ? (
              <Text style={{ fontSize: 13, color: tokens.color.muted }}>{trackingHint}</Text>
            ) : null}
            {order.counterpartyPhone ? (
              <Text style={{ fontSize: 14, color: tokens.color.ink, marginTop: 4 }}>Rider phone: {order.counterpartyPhone}</Text>
            ) : null}
            <View style={{ height: tokens.space.md }} />
            <Stepper events={order.events} currentStatus={order.status} view="customer" />
            {isActive ? (
              <Button label="Re-issue delivery code" variant="ghost" onPress={() => rotateM.mutate()} loading={rotateM.isPending} />
            ) : null}
          </Card>
        ) : null}

        {order.status === "delivered" ? (
          <Card>
            <Text style={{ fontSize: 16, fontWeight: "700", marginBottom: tokens.space.sm }}>Rate your rider</Text>
            <View style={{ flexDirection: "row", gap: 4, marginBottom: tokens.space.sm }}>
              {[1, 2, 3, 4, 5].map((n) => (
                <Pressable
                  key={n}
                  onPress={() => setScore(n)}
                  accessibilityRole="button"
                  accessibilityLabel={`${n} star${n === 1 ? "" : "s"}`}
                  accessibilityState={{ selected: n <= score }}
                  hitSlop={8}
                  style={{ minWidth: tokens.touchTargetMin, minHeight: tokens.touchTargetMin, alignItems: "center", justifyContent: "center" }}
                >
                  <Text style={{ fontSize: 28, color: n <= score ? tokens.color.highlight : tokens.color.line }}>★</Text>
                </Pressable>
              ))}
            </View>
            <Button label="Submit rating" onPress={() => rateM.mutate()} loading={rateM.isPending} />
          </Card>
        ) : null}

        {order.status === "completed" ? (
          <Card>
            <Text style={{ fontSize: 16, fontWeight: "700", color: tokens.color.accent }}>Delivered &amp; completed. Thank you!</Text>
          </Card>
        ) : null}
        {order.status === "expired" ? (
          <EmptyState
            icon="🛵"
            title="No riders took this price yet"
            message="Your window closed with no offers. Nudging the price up usually gets a rider fast."
          >
            <Button label="Send another request" onPress={() => router.replace("/home")} />
          </EmptyState>
        ) : null}
        {order.status === "cancelled" ? (
          <Card>
            <Text style={{ fontSize: 16, fontWeight: "700", color: tokens.color.danger }}>This order is cancelled.</Text>
          </Card>
        ) : null}

        {CUSTOMER_CANCELLABLE.has(order.status) ? (
          <Button label="Cancel order" variant="ghost" onPress={() => cancelM.mutate()} loading={cancelM.isPending} />
        ) : null}
        <Button label="Back home" variant="ghost" onPress={() => router.replace("/home")} />
        <ErrorText message={mutationError} />
        <View style={{ height: tokens.space.xxl }} />
      </ScrollView>
    </Screen>
  );
}
