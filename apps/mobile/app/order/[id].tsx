import { ACTIVE_RIDE_STATUSES, CUSTOMER_CANCELLABLE_STATUSES, rankOffers, tokens } from "@lynia/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { AccessibilityInfo, Animated, Linking, Pressable, ScrollView, Text, View } from "react-native";
import { ApiError } from "../../src/api/client";
import { isPendingCounter } from "../../src/logic/journey";
import { listOffers, selectOffer, type OfferRow } from "../../src/api/offers";
import { cancelOrder, getOrder, type OrderSnapshot, rateOrder, rotateDeliveryCode } from "../../src/api/orders";
import { loadDeliveryCode, saveDeliveryCode } from "../../src/auth/session";
import { offersKey, orderKey } from "../../src/query/client";
import { useOrderSocket } from "../../src/realtime/use-order-socket";
import { Button, Card, EmptyState, ErrorText, Heading, Icon, OfflineBanner, Screen, SkeletonCard, SkeletonList, StatusPill, Stepper, Sub } from "../../src/ui";
import { LiveMap } from "../../src/ui/LiveMap";

const CUSTOMER_CANCELLABLE = new Set<string>(CUSTOMER_CANCELLABLE_STATUSES);
const ACTIVE = ACTIVE_RIDE_STATUSES as string[];
// Post-pickup cancels (parcel already on the bike) get a hand-back warning before we confirm — the
// customer keeps the right to cancel anytime (INTERFACE-AUDIT C3) but must understand they'll arrange
// getting the parcel back directly with the rider.
const POST_PICKUP_CANCEL = new Set<string>(["picked_up", "en_route_dropoff"]);

// A rider's `undelivered` reason code → the verbatim line shown on the customer's terminal card. The
// stored code is authoritative; this only makes it readable (mirrors new-flows.html "recipient
// unreachable · N attempts").
const UNDELIVERED_REASON_LABEL: Record<string, string> = {
  unreachable: "recipient unreachable",
  refused: "recipient refused delivery",
  wrong_address: "address was wrong",
  breakdown: "rider breakdown",
};

type SortMode = "best" | "cheapest" | "fastest" | "rated";
const SORT_MODES: { key: SortMode; label: string }[] = [
  { key: "best", label: "Best match" },
  { key: "cheapest", label: "Cheapest" },
  { key: "fastest", label: "Fastest" },
  { key: "rated", label: "Top rated" },
];

const URGENT_MS = 20_000;
// Rating-on-tap undo window (D3): how long a tapped rating stays cancellable before it commits.
const RATE_UNDO_MS = 4_000;

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
  // Rating-on-tap (D3): a star tap arms the submit; a short undo window lets the customer change or
  // cancel before it commits (rating is terminal server-side → completed, so we hold, not un-rate).
  const [ratePending, setRatePending] = useState(false);
  const rateTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [sortMode, setSortMode] = useState<SortMode>("best");
  // A rolled-back optimistic select is a race outcome, not a user error — shown muted, not red.
  const [selectNotice, setSelectNotice] = useState<string | null>(null);
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
  // "Reconnecting" only reads truthfully after we've been live once — the initial connect window
  // would otherwise flash the banner on every mount.
  const wasConnected = React.useRef(false);
  if (connected) wasConnected.current = true;
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
  const rotateM = useMutation({
    mutationFn: () => rotateDeliveryCode(orderId),
    onSuccess: (res) => {
      setDeliveryCode(res.deliveryCode);
      void saveDeliveryCode(orderId, res.deliveryCode);
    },
  });
  const rateM = useMutation({
    mutationFn: (value: number) => rateOrder(orderId, { score: value }),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: orderKey(orderId) });
      void qc.invalidateQueries({ queryKey: ["history"] }); // the just-rated trip now shows its ★ in history
    },
  });
  const cancelM = useMutation({
    mutationFn: () => cancelOrder(orderId),
    onSuccess: () => void qc.invalidateQueries({ queryKey: orderKey(orderId) }),
  });

  // Rating-on-tap handlers (D3). Tapping a star sets the score and (re)arms a short commit window;
  // Undo cancels it. The window is cleared on unmount so a pending submit can't fire after teardown.
  useEffect(() => () => { if (rateTimer.current) clearTimeout(rateTimer.current); }, []);
  function tapStar(n: number) {
    setScore(n);
    if (rateTimer.current) clearTimeout(rateTimer.current);
    setRatePending(true);
    rateTimer.current = setTimeout(() => {
      rateTimer.current = null;
      setRatePending(false);
      rateM.mutate(n);
    }, RATE_UNDO_MS);
    AccessibilityInfo.announceForAccessibility(`${n} star${n === 1 ? "" : "s"} — submitting, tap Undo to change`);
  }
  function undoRate() {
    if (rateTimer.current) clearTimeout(rateTimer.current);
    rateTimer.current = null;
    setRatePending(false);
    AccessibilityInfo.announceForAccessibility("Rating cancelled");
  }

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
  // A select 409 (rider raced away) is handled with its own muted notice, so it's excluded here;
  // any other select failure is a real error and joins the red slot.
  const selectRace = selectM.error instanceof ApiError && selectM.error.status === 409;
  const firstError = (selectRace ? null : selectM.error) ?? rotateM.error ?? rateM.error ?? cancelM.error;
  const mutationError = firstError instanceof Error ? firstError.message : null;
  const riderPoint =
    order.rider != null && order.rider.currentLat != null && order.rider.currentLng != null
      ? { lat: order.rider.currentLat, lng: order.rider.currentLng }
      : null;
  const bidCount = orderedOffers.length;
  const trackingHint = riderPoint ? "Rider is on the move — the gold pin updates live." : "Waiting for the rider's GPS…";

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
    selectM.mutate(offerId);
  };

  return (
    <Screen>
      {/* A dropped socket surfaces as the standard top banner, not an inline strip in the card. */}
      {socketExpected && wasConnected.current && connectionState === "reconnecting" ? <OfflineBanner state="reconnecting" /> : null}
      <ScrollView showsVerticalScrollIndicator={false}>
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: tokens.space.md }}>
          <Heading>Order {order.id.slice(0, 8)}</Heading>
          <View style={{ flex: 1 }} />
          <StatusPill status={order.status} />
        </View>

        {deliveryCode ? (
          <Card style={{ borderColor: tokens.color.accent }}>
            <Text style={{ fontSize: 14, color: tokens.color.muted }}>Give this code to the recipient — the rider enters it at hand-off:</Text>
            <Text style={{ fontSize: 28, fontWeight: "700", letterSpacing: 6, color: tokens.color.accentText, fontVariant: ["tabular-nums"] }}>{deliveryCode}</Text>
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
                    <Text style={{ fontSize: tokens.font.size.bodyLg, fontWeight: tokens.font.weight.bold, color: tokens.color.ink }}>
                      {o.rider.profile.firstName} {o.rider.profile.lastName}
                    </Text>
                    <Text style={{ fontSize: tokens.font.size.body, color: tokens.color.muted, fontVariant: ["tabular-nums"] }}>
                      ★ {o.rider.ratingCount > 0 ? Number(o.rider.ratingAvg).toFixed(1) : "new"} · {o.rider.tripsCount} trips · ETA {o.etaMinutes} min
                    </Text>
                    <Text style={{ fontSize: tokens.font.size.price, fontWeight: tokens.font.weight.bold, marginVertical: 4, fontVariant: ["tabular-nums"] }}>${o.offeredFare}</Text>
                    <Button
                      label="Choose this rider"
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
            <Text style={{ fontSize: 14, color: tokens.color.muted, marginBottom: tokens.space.sm, fontVariant: ["tabular-nums"] }}>Agreed fare ${fare}</Text>
            <LiveMap
              pickup={{ lat: order.pickup.point.lat, lng: order.pickup.point.lng }}
              dropoff={{ lat: order.dropoff.point.lat, lng: order.dropoff.point.lng }}
              rider={riderPoint}
              connectionState={isActive ? connectionState : "live"}
            />
            {order.rider ? (
              <Text style={{ fontSize: 14, color: tokens.color.muted }}>{trackingHint}</Text>
            ) : null}
            {order.counterpartyPhone ? (
              <>
                <Text style={{ fontSize: 14, color: tokens.color.ink, marginTop: 4, fontVariant: ["tabular-nums"] }}>
                  Rider phone: {order.counterpartyPhone}
                </Text>
                {/* One-tap dialer next to the visible number — a call beats copy/paste mid-delivery. */}
                <Pressable
                  onPress={() => void Linking.openURL(`tel:${order.counterpartyPhone}`)}
                  accessibilityRole="button"
                  accessibilityLabel="Call rider"
                  style={{ minHeight: tokens.touchTargetMin, flexDirection: "row", alignItems: "center", gap: tokens.space.sm }}
                >
                  <Icon name="phone" size={16} color={tokens.color.accentText} />
                  <Text style={{ fontSize: 14, fontWeight: "600", color: tokens.color.accentText }}>Call rider</Text>
                </Pressable>
              </>
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
                  onPress={() => tapStar(n)}
                  disabled={rateM.isPending}
                  accessibilityRole="button"
                  accessibilityLabel={`Rate ${n} star${n === 1 ? "" : "s"}`}
                  accessibilityState={{ selected: n <= score }}
                  hitSlop={12}
                  style={{ minWidth: tokens.touchTargetMin, minHeight: tokens.touchTargetMin, alignItems: "center", justifyContent: "center" }}
                >
                  <Text style={{ fontSize: 28, color: n <= score ? tokens.color.highlight : tokens.color.line }}>★</Text>
                </Pressable>
              ))}
            </View>
            {ratePending ? (
              // Tap-to-rate is armed: submitting shortly, still cancellable.
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}>
                <Text style={{ fontSize: 14, color: tokens.color.muted, fontVariant: ["tabular-nums"] }}>Submitting {score}★…</Text>
                <Button label="Undo" variant="ghost" onPress={undoRate} />
              </View>
            ) : rateM.isPending ? (
              <Text style={{ fontSize: 14, color: tokens.color.muted }}>Saving your rating…</Text>
            ) : (
              <Text style={{ fontSize: 14, color: tokens.color.muted }}>Tap a star to rate</Text>
            )}
          </Card>
        ) : null}

        {order.status === "completed" ? (
          <Card>
            <Text style={{ fontSize: 16, fontWeight: "700", color: tokens.color.accentText }}>Delivered &amp; completed. Thank you!</Text>
          </Card>
        ) : null}
        {order.status === "expired" ? (
          <EmptyState
            icon="bike"
            title="No riders took this price yet"
            message="Your window closed with no offers. Nudging the price up usually gets a rider fast."
          >
            <Button label="Send another request" onPress={() => router.replace("/home")} />
          </EmptyState>
        ) : null}
        {order.status === "cancelled" ? (
          <Card>
            <Text style={{ fontSize: tokens.font.size.bodyLg, fontWeight: tokens.font.weight.bold, color: tokens.color.danger }}>This order is cancelled.</Text>
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
                  Sending is at your own risk — arrange the parcel directly with your rider. Lynia isn&apos;t liable for non-delivery.
                </Text>
              </View>
              {order.counterpartyPhone ? (
                <Pressable
                  onPress={() => void Linking.openURL(`tel:${order.counterpartyPhone}`)}
                  accessibilityRole="button"
                  accessibilityLabel="Call rider"
                  style={{ minHeight: tokens.touchTargetMin, flexDirection: "row", alignItems: "center", gap: tokens.space.sm }}
                >
                  <Icon name="phone" size={16} color={tokens.color.accentText} />
                  <Text style={{ fontSize: tokens.font.size.body, fontWeight: tokens.font.weight.semibold, color: tokens.color.accentText }}>
                    Call rider{order.counterpartyPhone ? ` · ${order.counterpartyPhone}` : ""}
                  </Text>
                </Pressable>
              ) : null}
            </Card>
            <Button label="Send a new request" onPress={() => router.replace("/home")} />
          </>
        ) : null}

        {/* Cancel-anytime (C3). Post-pickup the parcel is on the bike, so a cancel gets a hand-back
            warning before it fires; pre-pickup cancels straight through. */}
        {CUSTOMER_CANCELLABLE.has(order.status) ? (
          cancelConfirm && POST_PICKUP_CANCEL.has(order.status) ? (
            <Card style={{ borderColor: tokens.color.danger }}>
              <Text style={{ fontSize: tokens.font.size.bodyLg, fontWeight: tokens.font.weight.bold, color: tokens.color.ink, marginBottom: tokens.space.xs }}>Cancel after pickup?</Text>
              <Text style={{ fontSize: tokens.font.size.body, color: tokens.color.muted, lineHeight: 20, marginBottom: tokens.space.sm }}>
                Your rider already has the parcel. If you cancel now, you&apos;ll arrange getting it back directly with them — Lynia can&apos;t recover it, and an agreed fare isn&apos;t refunded.
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
        <Button label="Back home" variant="ghost" onPress={() => router.replace("/home")} />
        <ErrorText message={mutationError} />
        <View style={{ height: tokens.space.xxl }} />
      </ScrollView>
    </Screen>
  );
}

/**
 * F-07 counter-offer card. A rider bidding ABOVE the ask surfaces as ask-vs-counter (+delta) with an
 * Accept (assigns at the counter price) and a Decline. Decline is client-side dismissal only — the
 * bid stays live server-side and reverts to a normal choosable card at the countered price (one round,
 * no counter-back). Never shows an auto-charge above the customer's price.
 */
function CounterOfferCard({
  offer,
  ask,
  onAccept,
  onDecline,
  loading,
  disabled,
}: {
  offer: OfferRow;
  ask: number;
  onAccept: () => void;
  onDecline: () => void;
  loading: boolean;
  disabled: boolean;
}): React.ReactElement {
  const counter = Number(offer.offeredFare);
  const delta = counter - ask;
  const name = `${offer.rider.profile.firstName} ${offer.rider.profile.lastName}`;
  return (
    <Card style={{ borderColor: tokens.color.accent }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: tokens.space.sm, marginBottom: tokens.space.sm }}>
        <View style={{ width: 42, height: 42, borderRadius: 21, backgroundColor: tokens.color.accentWash, alignItems: "center", justifyContent: "center" }}>
          <Icon name="user" size={20} color={tokens.color.accentText} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontSize: tokens.font.size.bodyLg, fontWeight: tokens.font.weight.bold, color: tokens.color.ink }}>{name}</Text>
          <Text style={{ fontSize: tokens.font.size.caption, color: tokens.color.muted, fontVariant: ["tabular-nums"] }}>
            ★ {offer.rider.ratingCount > 0 ? Number(offer.rider.ratingAvg).toFixed(1) : "new"} · {offer.rider.tripsCount} trips · ETA {offer.etaMinutes} min
          </Text>
        </View>
      </View>
      <View style={{ flexDirection: "row", alignItems: "stretch", gap: tokens.space.sm, marginBottom: tokens.space.sm }}>
        <View style={{ flex: 1, backgroundColor: tokens.color.surface, borderRadius: tokens.radius.input, padding: tokens.space.sm }}>
          <Text style={{ fontSize: tokens.font.size.micro, fontWeight: tokens.font.weight.bold, letterSpacing: 0.4, color: tokens.color.muted }}>YOUR PRICE</Text>
          <Text style={{ fontSize: tokens.font.size.price, fontWeight: tokens.font.weight.bold, color: tokens.color.ink, fontVariant: ["tabular-nums"] }}>${ask.toFixed(2)}</Text>
        </View>
        <View style={{ alignItems: "center", justifyContent: "center" }}>
          <Icon name="arrow-right" size={16} color={tokens.color.muted} />
        </View>
        <View style={{ flex: 1, backgroundColor: tokens.color.accentWash, borderRadius: tokens.radius.input, padding: tokens.space.sm }}>
          <Text style={{ fontSize: tokens.font.size.micro, fontWeight: tokens.font.weight.bold, letterSpacing: 0.4, color: tokens.color.accentText }}>THEIR OFFER</Text>
          <View style={{ flexDirection: "row", alignItems: "baseline", gap: 6 }}>
            <Text style={{ fontSize: tokens.font.size.price, fontWeight: tokens.font.weight.bold, color: tokens.color.accentText, fontVariant: ["tabular-nums"] }}>${counter.toFixed(2)}</Text>
            <Text style={{ fontSize: tokens.font.size.caption, fontWeight: tokens.font.weight.bold, color: tokens.color.highlightInk, fontVariant: ["tabular-nums"] }}>+${delta.toFixed(2)}</Text>
          </View>
        </View>
      </View>
      <Button label={`Accept $${counter.toFixed(2)}`} onPress={onAccept} loading={loading} disabled={disabled} />
      <Button label="Decline" variant="ghost" onPress={onDecline} disabled={disabled} />
      <Text style={{ fontSize: tokens.font.size.caption, color: tokens.color.muted, textAlign: "center", marginTop: 2 }}>
        Declining keeps {offer.rider.profile.firstName} in your list at ${counter.toFixed(2)} — one counter round, no counter-back.
      </Text>
    </Card>
  );
}
