import { ACTIVE_RIDE_STATUSES, type AdvanceStatusRequest, type MarkUndeliveredRequest, RIDER_CANCELLABLE_STATUSES, tokens } from "@lynia/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { Linking, Pressable, ScrollView, Text, View } from "react-native";
import { ApiError } from "../../src/api/client";
import { collectedItemCount } from "../../src/logic/journey";
import { mapsDirectionsUrl } from "../../src/logic/maps";
import { advanceStatus, cancelOrder, confirmDelivery, confirmItems, getActiveOrder, markUndelivered, rateSender, type OrderSnapshot } from "../../src/api/orders";
import { useRiderJobSocket } from "../../src/realtime/use-rider-job-socket";
import { useRiderLocationStream } from "../../src/realtime/use-rider-location";
import { Button, Card, ErrorText, Field, Heading, Icon, type IconName, Label, OfflineBanner, Screen, SkeletonList, StatusPill, Stepper, Sub } from "../../src/ui";
import { LiveMap } from "../../src/ui/LiveMap";
import { GetHelpControl, ReportControl, SosControl } from "../../src/ui/safety";

const ACTIVE = ACTIVE_RIDE_STATUSES as string[];
// A rider may cancel ONLY pre-pickup (assigned…en_route_pickup); once the parcel is collected the
// exits are deliver or mark-undelivered, never a cancel — same set the server enforces (4·b3).
const RIDER_CANCELLABLE = new Set<string>(RIDER_CANCELLABLE_STATUSES);
// A hand-off can only fail after the parcel is on the bike (4·b2). Reason chips per the mockup.
const CAN_MARK_UNDELIVERED = new Set<string>(["picked_up", "en_route_dropoff"]);
const UNDELIVERED_REASONS: { key: MarkUndeliveredRequest["reason"]; icon: IconName; label: string }[] = [
  { key: "unreachable", icon: "circle-alert", label: "Recipient unreachable" },
  { key: "refused", icon: "circle-alert", label: "Recipient refused" },
  { key: "wrong_address", icon: "map-pin", label: "Wrong address" },
  { key: "breakdown", icon: "bike", label: "Couldn't complete (breakdown)" },
];
const NEXT: Record<string, { to: AdvanceStatusRequest["to"]; label: string }> = {
  assigned: { to: "confirmed", label: "Confirm the job" },
  confirmed: { to: "en_route_pickup", label: "Head to pickup" },
  en_route_pickup: { to: "picked_up", label: "Mark parcel collected" },
  picked_up: { to: "en_route_dropoff", label: "Head to drop-off" },
};

export default function RiderJob(): React.ReactElement {
  const router = useRouter();
  const qc = useQueryClient();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  // 4·b2: the "can't deliver" reason picker is a gated sheet — opening it names the mockup's four
  // reasons; confirming marks the parcel undeliverable (terminal, own-risk hand-back).
  const [undeliverOpen, setUndeliverOpen] = useState(false);
  const [undeliverReason, setUndeliverReason] = useState<MarkUndeliveredRequest["reason"]>("unreachable");
  // Wrong-code attempts-left (4·b1): the server's 401 message carries the remaining count; show it
  // inline on the code field rather than as a generic red error.
  const [codeError, setCodeError] = useState<string | null>(null);
  // Rider-bail confirm (4·b3): pre-pickup cancel opens a confirm card with an optional reason and a
  // reliability-score warning, rather than firing on one tap (the strike + cooldown are real).
  const [cancelOpen, setCancelOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState("");
  // Pickup item verification: which line-items the rider has ticked as physically collected. Indexes
  // into order.items; defaults to all ticked when the rider reaches the pickup-verification step.
  const [checkedItems, setCheckedItems] = useState<Set<number>>(() => new Set());
  // Rate-the-sender (4·7): an OPTIONAL post-delivery star. Simple tap-then-submit (no undo window) —
  // it's recorded-only and doesn't gate anything, so there's nothing to race back.
  const [senderScore, setSenderScore] = useState(0);

  const jobQ = useQuery({ queryKey: ["activeJob"], queryFn: getActiveOrder, refetchInterval: 6000 });
  const order = jobQ.data ?? null;
  const orderId = order?.id ?? null;
  const items = order?.items ?? [];

  // Stream GPS only while the ride is genuinely active — stops on delivered AND cancelled/completed
  // (don't blocklist a single terminal state, or a cancelled job keeps broadcasting the rider's GPS).
  useRiderLocationStream(order && ACTIVE.includes(order.status) ? orderId : null);

  // The customer can cancel anytime (C3). When `job:cancelled` arrives we FREEZE the last-known
  // snapshot into a terminal, because a cancelled order immediately drops out of /orders/mine/active
  // (so a refetch would blank the sender contact needed for a post-pickup hand-back).
  const [cancelledJob, setCancelledJob] = useState<{ collected: boolean; snapshot: OrderSnapshot } | null>(null);
  // C5: the customer's app has gone dark on this active job — surface a soft "may be offline" warning
  // so the rider knows the customer might not be seeing live position/status. Cleared on the next
  // status change (the flow progressing implies things are moving again).
  const [customerStale, setCustomerStale] = useState(false);
  const orderRef = useRef<OrderSnapshot | null>(order);
  orderRef.current = order;
  const { connected: jobSocketConnected } = useRiderJobSocket(
    order && ACTIVE.includes(order.status) ? orderId : null,
    (e) => {
      if (orderRef.current) setCancelledJob({ collected: e.collected, snapshot: orderRef.current });
    },
    () => setCustomerStale(true),
  );
  // 4·b4: only read "reconnecting" after we've been live once (avoid a connect-window flash on mount).
  const wasJobConnected = useRef(false);
  if (jobSocketConnected) wasJobConnected.current = true;
  // A status advance means the ride is moving again — drop a stale customer-presence warning.
  useEffect(() => {
    setCustomerStale(false);
  }, [order?.status]);

  const refresh = (): void => void qc.invalidateQueries({ queryKey: ["activeJob"] });
  const fail = (e: unknown): void => setError(e instanceof ApiError ? e.message : "Something went wrong.");

  // Optimistic advance: the trip step is a frequent, near-always-succeeds tap, so paint the next
  // step instantly and reconcile in the background. cancelQueries first so the 6s poller can't
  // clobber the optimistic write mid-flight; rollback to the snapshot on error (onSettled always
  // re-syncs from the server).
  const advanceM = useMutation({
    mutationFn: (to: AdvanceStatusRequest["to"]) => advanceStatus(orderId!, to),
    onMutate: async (to) => {
      await qc.cancelQueries({ queryKey: ["activeJob"] });
      const prev = qc.getQueryData<OrderSnapshot | null>(["activeJob"]);
      qc.setQueryData<OrderSnapshot | null>(["activeJob"], (o) => (o ? { ...o, status: to } : o));
      return { prev };
    },
    onError: (e, _to, ctx) => {
      // Restore the snapshot (incl. a legitimate null), but never write `undefined` back over the cache.
      if (ctx?.prev !== undefined) qc.setQueryData(["activeJob"], ctx.prev);
      fail(e);
    },
    onSettled: refresh,
  });
  const deliverM = useMutation({
    mutationFn: () => confirmDelivery(orderId!, code.trim()),
    onSuccess: () => {
      setCode("");
      setCodeError(null);
      refresh();
    },
    onError: (e) => {
      // 403 = the 5-attempt lockout; the customer must re-issue the code. 401 = wrong code — the
      // server's message carries "N attempts left" (4·b1), shown inline on the field, not as a
      // page-level red error.
      if (e instanceof ApiError && e.status === 403) {
        setCodeError("Too many attempts — ask the customer to re-issue the delivery code.");
      } else if (e instanceof ApiError && e.status === 401) {
        setCodeError(e.message);
      } else {
        fail(e);
      }
      refresh();
    },
  });
  const cancelM = useMutation({
    mutationFn: () => cancelOrder(orderId!, cancelReason.trim() ? { reason: cancelReason.trim() } : {}),
    onSuccess: () => {
      setCancelOpen(false);
      setCancelReason("");
      refresh();
    },
    onError: fail,
  });
  const undeliverM = useMutation({
    mutationFn: () => markUndelivered(orderId!, { reason: undeliverReason }),
    onSuccess: () => {
      setUndeliverOpen(false);
      refresh();
    },
    onError: fail,
  });
  const senderRateM = useMutation({
    mutationFn: (value: number) => rateSender(orderId!, { score: value }),
    onError: fail,
  });

  // Default every item ticked when the rider enters the pickup-verification step — they untick only
  // what's missing. Keyed on primitives so a 6s poll (new object identity, same data) doesn't reset
  // the rider's manual ticks mid-verification.
  useEffect(() => {
    if (order?.status === "en_route_pickup" && items.length > 0) {
      setCheckedItems(new Set(items.map((_, i) => i)));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seed once per order/step, not per poll.
  }, [order?.id, order?.status, items.length]);

  const toggleItem = (i: number): void => {
    setCheckedItems((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });
  };
  // Confirm the ticked items, then advance to picked_up. The confirmation POST is best-effort
  // (TODO(api): route pending) so it never blocks the collect; the advance is gated on ≥1 tick.
  const confirmAndCollect = (): void => {
    if (!orderId || checkedItems.size === 0) return;
    const confirmedIndexes = [...checkedItems].sort((a, b) => a - b);
    void confirmItems(orderId, { confirmedIndexes }).catch(() => undefined);
    advanceM.mutate("picked_up");
  };

  // Terminal: the customer cancelled. Rendered from the frozen snapshot so the hand-back path keeps
  // the sender contact even after the order leaves the active-job feed.
  if (cancelledJob) {
    const snap = cancelledJob.snapshot;
    const senderPhone = snap.counterpartyPhone ?? snap.pickup.contactPhone ?? null;
    return (
      <Screen>
        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: tokens.space.md }}>
            <Heading>Your job</Heading>
            <View style={{ flex: 1 }} />
            <StatusPill status="cancelled" tone="offline" dot />
          </View>
          <Card>
            <View style={{ flexDirection: "row", alignItems: "center", gap: tokens.space.sm, marginBottom: tokens.space.sm }}>
              <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: tokens.color.dangerWash, alignItems: "center", justifyContent: "center" }}>
                <Icon name="circle-alert" size={18} color={tokens.color.danger} />
              </View>
              <Text style={{ fontSize: tokens.font.size.bodyLg, fontWeight: tokens.font.weight.bold, color: tokens.color.danger }}>The customer cancelled</Text>
            </View>
            {cancelledJob.collected ? (
              <>
                <Text style={{ fontSize: tokens.font.size.body, color: tokens.color.muted, lineHeight: 20, marginBottom: tokens.space.sm }}>
                  This job has ended. You still have the parcel — arrange the hand-back directly with the sender. This doesn&apos;t affect your reliability score.
                </Text>
                {senderPhone ? (
                  <Pressable
                    onPress={() => void Linking.openURL(`tel:${senderPhone}`)}
                    accessibilityRole="button"
                    accessibilityLabel="Call sender"
                    style={{ minHeight: tokens.touchTargetMin, flexDirection: "row", alignItems: "center", gap: tokens.space.sm }}
                  >
                    <Icon name="phone" size={16} color={tokens.color.accentText} />
                    <Text style={{ fontSize: tokens.font.size.body, fontWeight: tokens.font.weight.semibold, color: tokens.color.accentText }}>Call sender · {senderPhone}</Text>
                  </Pressable>
                ) : null}
              </>
            ) : (
              <Text style={{ fontSize: tokens.font.size.body, color: tokens.color.muted, lineHeight: 20 }}>
                Cancelled before pickup — you&apos;re simply free. No parcel, straight back to the board.
              </Text>
            )}
          </Card>
          <Button label="Back to board" onPress={() => router.replace("/rider")} />
        </ScrollView>
      </Screen>
    );
  }

  if (jobQ.isLoading) {
    return (
      <Screen>
        <SkeletonList />
      </Screen>
    );
  }
  if (!order) {
    return (
      <Screen>
        <Heading>No active job</Heading>
        <Sub>Accept an order to start a delivery.</Sub>
        <Button label="Back" onPress={() => router.replace("/rider")} />
      </Screen>
    );
  }

  const next = NEXT[order.status];
  const isActive = ACTIVE.includes(order.status);
  // Total quantity across the ticked items — the collect CTA counts pieces, not rows ("Confirm 3
  // items collected" for a 1× + 2× selection).
  const collectedCount = collectedItemCount(items, checkedItems);
  const riderPoint =
    order.rider != null && order.rider.currentLat != null && order.rider.currentLng != null
      ? { lat: order.rider.currentLat, lng: order.rider.currentLng }
      : null;

  return (
    <Screen>
      {/* 4·b4: socket dropped mid-job — a muted "live paused" banner, never a red alarm. The job is
          saved locally and syncs on reconnect; the rider keeps riding. */}
      {isActive && wasJobConnected.current && !jobSocketConnected ? <OfflineBanner state="reconnecting" /> : null}
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: tokens.space.md }}>
          <Heading>Your job</Heading>
          <View style={{ flex: 1 }} />
          <StatusPill status={order.status} tone={isActive && !jobSocketConnected && wasJobConnected.current ? "reconnecting" : undefined} />
        </View>

        {isActive && wasJobConnected.current && !jobSocketConnected ? (
          <Card style={{ backgroundColor: tokens.color.surface, borderColor: "transparent" }}>
            <Text style={{ fontSize: tokens.font.size.body, color: tokens.color.muted, lineHeight: 20 }}>
              Live paused — reconnecting. Your job is saved; keep riding and it&apos;ll sync when you&apos;re back on.
            </Text>
          </Card>
        ) : null}

        {/* C5: the customer's app went dark — they may not be seeing your live updates. Soft, muted
            warning (a state, not an alarm); it clears itself on the next status change. */}
        {isActive && customerStale ? (
          <View
            accessibilityRole="alert"
            accessibilityLiveRegion="polite"
            style={{ flexDirection: "row", alignItems: "center", gap: tokens.space.sm, padding: tokens.space.sm, borderRadius: tokens.radius.input, backgroundColor: tokens.color.surface, borderWidth: 1, borderColor: tokens.color.line, marginBottom: tokens.space.sm }}
          >
            <Icon name="triangle-alert" size={15} color={tokens.color.muted} />
            <Text style={{ flex: 1, fontSize: tokens.font.size.caption, color: tokens.color.muted, lineHeight: 18 }}>
              The customer&apos;s app looks offline — they may not be seeing live updates. Call them if you need to reach the sender.
            </Text>
          </View>
        ) : null}

        <Card>
          <Text style={{ fontSize: 14, color: tokens.color.muted, fontVariant: ["tabular-nums"] }}>Agreed fare ${order.agreedFare ?? order.proposedFare}</Text>
          {order.counterpartyPhone ? (
            <>
              <Text style={{ fontSize: 14, color: tokens.color.ink, marginTop: 4, fontVariant: ["tabular-nums"] }}>Customer phone: {order.counterpartyPhone}</Text>
              {/* One-tap dialer next to the visible number — a call beats copy/paste mid-delivery. */}
              <Pressable
                onPress={() => void Linking.openURL(`tel:${order.counterpartyPhone}`)}
                accessibilityRole="button"
                accessibilityLabel="Call customer"
                style={{ minHeight: tokens.touchTargetMin, flexDirection: "row", alignItems: "center", gap: tokens.space.sm }}
              >
                <Icon name="phone" size={16} color={tokens.color.accentText} />
                <Text style={{ fontSize: 14, fontWeight: "600", color: tokens.color.accentText }}>Call customer</Text>
              </Pressable>
            </>
          ) : null}
          {/* Waypoint contacts arrive only for the assigned rider inside the reveal window (§5d). */}
          {order.pickup.contactPhone ? (
            <Pressable
              onPress={() => void Linking.openURL(`tel:${order.pickup.contactPhone}`)}
              accessibilityRole="button"
              accessibilityLabel="Call pickup contact"
              style={{ minHeight: tokens.touchTargetMin, flexDirection: "row", alignItems: "center", gap: tokens.space.sm }}
            >
              <Icon name="phone" size={16} color={tokens.color.accentText} />
              <Text style={{ fontSize: 14, fontWeight: "600", color: tokens.color.accentText }}>Call pickup contact</Text>
            </Pressable>
          ) : null}
          {order.dropoff.contactPhone ? (
            <Pressable
              onPress={() => void Linking.openURL(`tel:${order.dropoff.contactPhone}`)}
              accessibilityRole="button"
              accessibilityLabel="Call drop-off contact"
              style={{ minHeight: tokens.touchTargetMin, flexDirection: "row", alignItems: "center", gap: tokens.space.sm }}
            >
              <Icon name="phone" size={16} color={tokens.color.accentText} />
              <Text style={{ fontSize: 14, fontWeight: "600", color: tokens.color.accentText }}>Call drop-off contact</Text>
            </Pressable>
          ) : null}
          {/* Line-items — the §5c "Items & note confirmed" step made real. Absent on orders
              created before the items column, so render nothing rather than a stub. */}
          {order.items && order.items.length > 0 ? (
            <View style={{ marginTop: tokens.space.sm }}>
              <Text style={{ fontSize: 12, fontWeight: "600", color: tokens.color.muted, marginBottom: 2 }}>Items</Text>
              {order.items.map((it, i) => (
                <Text key={i} style={{ fontSize: 14, color: tokens.color.ink, fontVariant: ["tabular-nums"] }}>
                  {it.quantity}× {it.description}
                </Text>
              ))}
            </View>
          ) : null}
          {/* The sender's note ("ask for Rita at reception") — shown to the assigned rider only. */}
          {order.note ? (
            <View style={{ marginTop: tokens.space.sm }}>
              <Text style={{ fontSize: 12, fontWeight: "600", color: tokens.color.muted, marginBottom: 2 }}>Sender&apos;s note</Text>
              <Text style={{ fontSize: 14, color: tokens.color.ink, lineHeight: 20 }}>{order.note}</Text>
            </View>
          ) : null}
          <View style={{ height: tokens.space.sm }} />
          <LiveMap
            pickup={{ lat: order.pickup.point.lat, lng: order.pickup.point.lng }}
            dropoff={{ lat: order.dropoff.point.lat, lng: order.dropoff.point.lng }}
            rider={riderPoint}
          />
          {/* Maps-sync (§3·2): hand the rider turn-by-turn navigation for the pickup → drop-off leg in
              Google Maps. No Places key needed — a universal Maps URL. Shown while the run is active. */}
          {isActive ? (
            <Pressable
              onPress={() => void Linking.openURL(mapsDirectionsUrl(order.pickup.point, order.dropoff.point))}
              accessibilityRole="button"
              accessibilityLabel="Follow the route in Google Maps"
              style={{ minHeight: tokens.touchTargetMin, flexDirection: "row", alignItems: "center", gap: tokens.space.sm }}
            >
              <Icon name="navigation" size={16} color={tokens.color.accentText} />
              <Text style={{ fontSize: 14, fontWeight: "600", color: tokens.color.accentText }}>Follow route in Google Maps</Text>
            </Pressable>
          ) : null}
          <Stepper events={order.events} currentStatus={order.status} view="rider" />
        </Card>

        {/* Pickup item verification — between "arrived at pickup" and "collected", the rider ticks the
            sender's items against what's physically in hand. The collect CTA counts them and confirms.
            Legacy orders with no line-items fall back to the plain advance button. */}
        {order.status === "en_route_pickup" && items.length > 0 ? (
          <Card style={{ borderColor: tokens.color.accent }}>
            <Text style={{ fontSize: tokens.font.size.bodyLg, fontWeight: tokens.font.weight.bold, color: tokens.color.ink, marginBottom: 2 }}>Confirm pickup</Text>
            <Sub>Tick each item against the sender&apos;s list before you ride off.</Sub>
            <View style={{ gap: tokens.space.sm }}>
              {items.map((it, i) => {
                const on = checkedItems.has(i);
                return (
                  <Pressable
                    key={i}
                    onPress={() => toggleItem(i)}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: on }}
                    accessibilityLabel={`${it.quantity} ${it.description}`}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: tokens.space.md,
                      minHeight: tokens.touchTargetMin,
                      paddingHorizontal: tokens.space.md,
                      paddingVertical: tokens.space.sm,
                      borderRadius: tokens.radius.input,
                      backgroundColor: on ? tokens.color.accentWash : tokens.color.surface,
                      borderWidth: 1,
                      borderColor: on ? "transparent" : tokens.color.line,
                    }}
                  >
                    <View
                      style={{
                        width: 24,
                        height: 24,
                        borderRadius: 7,
                        // Bright accent as a non-text fill (the tick box); white check glyph on it.
                        backgroundColor: on ? tokens.color.accent : tokens.color.bg,
                        borderWidth: on ? 0 : 1.5,
                        borderColor: tokens.color.line,
                        alignItems: "center",
                        justifyContent: "center",
                      }}
                    >
                      {on ? <Icon name="check" size={15} color={tokens.color.onAccent} /> : null}
                    </View>
                    <Text style={{ flex: 1, fontSize: tokens.font.size.body, fontWeight: tokens.font.weight.semibold, color: tokens.color.ink }}>{it.description}</Text>
                    <Text style={{ fontSize: tokens.font.size.body, fontWeight: tokens.font.weight.bold, color: tokens.color.muted, fontVariant: ["tabular-nums"] }}>{it.quantity}×</Text>
                  </Pressable>
                );
              })}
            </View>
            <View style={{ flexDirection: "row", gap: tokens.space.sm, padding: tokens.space.sm, borderRadius: tokens.radius.input, backgroundColor: tokens.color.surface, marginTop: tokens.space.sm }}>
              <Icon name="triangle-alert" size={15} color={tokens.color.muted} />
              <Text style={{ flex: 1, fontSize: tokens.font.size.caption, color: tokens.color.muted, lineHeight: 18 }}>
                Only confirm what you actually have. The recipient still verifies delivery with the 6-digit code.
              </Text>
            </View>
            <Button
              label={`Confirm ${collectedCount} item${collectedCount === 1 ? "" : "s"} collected`}
              onPress={confirmAndCollect}
              loading={advanceM.isPending}
              disabled={checkedItems.size === 0}
            />
          </Card>
        ) : next ? (
          <Button label={next.label} onPress={() => advanceM.mutate(next.to)} loading={advanceM.isPending} />
        ) : null}

        {order.status === "en_route_dropoff" ? (
          <Card style={codeError ? { borderColor: tokens.color.danger } : undefined}>
            <Text style={{ fontWeight: "700", marginBottom: tokens.space.sm }}>Confirm hand-off</Text>
            <Sub>Ask the recipient for the 6-digit delivery code.</Sub>
            <Field
              label="Delivery code"
              value={code}
              onChangeText={(t) => {
                setCode(t);
                if (codeError) setCodeError(null);
              }}
              keyboardType="number-pad"
              maxLength={6}
            />
            {codeError ? <ErrorText message={codeError} /> : null}
            <Button label="Confirm delivery" onPress={() => deliverM.mutate()} loading={deliverM.isPending} disabled={code.trim().length !== 6} />
          </Card>
        ) : null}

        {order.status === "delivered" ? (
          <Card>
            <Text style={{ fontWeight: "700", color: tokens.color.accentText }}>Delivered. Waiting for the customer to rate — you're free for the next job.</Text>
          </Card>
        ) : null}

        {/* Rate the sender (4·7) — OPTIONAL, recorded-only. A star arms the submit immediately; once
            saved we swap to a thank-you so the rider can't double-rate the same drop. */}
        {order.status === "delivered" ? (
          <Card>
            {senderRateM.isSuccess ? (
              <Text style={{ fontSize: 14, color: tokens.color.muted }}>Thanks for the feedback.</Text>
            ) : (
              <>
                <Text style={{ fontSize: 16, fontWeight: "700", marginBottom: 2 }}>Rate the sender</Text>
                <Sub>Optional — a no-show or cash problem here protects other riders.</Sub>
                <View style={{ flexDirection: "row", gap: 4 }}>
                  {[1, 2, 3, 4, 5].map((n) => (
                    <Pressable
                      key={n}
                      onPress={() => {
                        setSenderScore(n);
                        senderRateM.mutate(n);
                      }}
                      disabled={senderRateM.isPending}
                      accessibilityRole="button"
                      accessibilityLabel={`Rate the sender ${n} star${n === 1 ? "" : "s"}`}
                      accessibilityState={{ selected: n <= senderScore }}
                      hitSlop={12}
                      style={{ minWidth: tokens.touchTargetMin, minHeight: tokens.touchTargetMin, alignItems: "center", justifyContent: "center" }}
                    >
                      <Text style={{ fontSize: 28, color: n <= senderScore ? tokens.color.highlight : tokens.color.line }}>★</Text>
                    </Pressable>
                  ))}
                </View>
                {senderRateM.isPending ? <Text style={{ fontSize: 14, color: tokens.color.muted }}>Saving your feedback…</Text> : null}
              </>
            )}
          </Card>
        ) : null}

        {/* SOS on a live run (R-16/F-13) — a deliberate danger control, highest value at the cash
            hand-off. Passes the rider's own live GPS when available. */}
        {isActive ? <SosControl orderId={order.id} lat={riderPoint?.lat} lng={riderPoint?.lng} /> : null}

        {/* Cancel is pre-pickup ONLY (4·b3) — the server rejects it once the parcel is collected, so
            the affordance must disappear then rather than offer a tap that 409s. A confirm card with
            an optional reason + the reliability-score warning, never a one-tap bail. */}
        {RIDER_CANCELLABLE.has(order.status) ? (
          cancelOpen ? (
            <Card style={{ borderColor: tokens.color.danger }}>
              <Text style={{ fontSize: tokens.font.size.bodyLg, fontWeight: tokens.font.weight.bold, color: tokens.color.ink, marginBottom: 2 }}>Cancel this job?</Text>
              <Sub>The customer&apos;s order is re-broadcast at the same price so another rider can take it. You can only cancel before pickup.</Sub>
              <Field label="Reason (optional)" value={cancelReason} onChangeText={setCancelReason} placeholder="Bike trouble" maxLength={280} />
              <View style={{ flexDirection: "row", gap: tokens.space.sm, padding: tokens.space.sm, borderRadius: tokens.radius.input, backgroundColor: tokens.color.highlightWash, borderWidth: 1, borderColor: tokens.color.highlightBorder, marginBottom: tokens.space.sm }}>
                <Icon name="triangle-alert" size={16} color={tokens.color.highlightInk} />
                <Text style={{ flex: 1, fontSize: tokens.font.size.caption, color: tokens.color.highlightInk, lineHeight: 18 }}>
                  Cancelling an accepted job affects your reliability score. Too many cancels can pause your account.
                </Text>
              </View>
              <Button label="Confirm cancellation" onPress={() => cancelM.mutate()} loading={cancelM.isPending} />
              <Button label="Keep job" variant="ghost" onPress={() => { setCancelOpen(false); setCancelReason(""); }} />
            </Card>
          ) : (
            <Button label="Cancel job" variant="ghost" onPress={() => setCancelOpen(true)} />
          )
        ) : null}

        {/* Post-pickup the only failure exit is "can't deliver" → terminal undelivered (4·b2). The
            reason picker is a gated sheet so it can't fire on a stray tap. */}
        {CAN_MARK_UNDELIVERED.has(order.status) ? (
          undeliverOpen ? (
            <Card style={{ borderColor: tokens.color.danger }}>
              <Text style={{ fontSize: tokens.font.size.bodyLg, fontWeight: tokens.font.weight.bold, color: tokens.color.ink, marginBottom: 2 }}>Can&apos;t deliver this parcel?</Text>
              <Sub>Pick the reason — it&apos;s shown to the customer. The parcel stays with you; arrange the hand-back directly, settled off-platform.</Sub>
              <Label>Reason</Label>
              <View style={{ gap: tokens.space.sm }}>
                {UNDELIVERED_REASONS.map((r) => {
                  const on = undeliverReason === r.key;
                  return (
                    <Pressable
                      key={r.key}
                      onPress={() => setUndeliverReason(r.key)}
                      accessibilityRole="radio"
                      accessibilityState={{ selected: on }}
                      accessibilityLabel={r.label}
                      style={{
                        flexDirection: "row",
                        alignItems: "center",
                        gap: tokens.space.sm,
                        minHeight: tokens.touchTargetMin,
                        paddingHorizontal: tokens.space.md,
                        borderRadius: tokens.radius.input,
                        backgroundColor: on ? tokens.color.accentWash : tokens.color.surface,
                      }}
                    >
                      <Icon name={on ? "check" : r.icon} size={16} color={on ? tokens.color.accentText : tokens.color.muted} />
                      <Text style={{ flex: 1, fontSize: tokens.font.size.body, fontWeight: tokens.font.weight.semibold, color: on ? tokens.color.accentText : tokens.color.ink }}>{r.label}</Text>
                    </Pressable>
                  );
                })}
              </View>
              <View style={{ height: tokens.space.sm }} />
              <Button label="Mark undeliverable" onPress={() => undeliverM.mutate()} loading={undeliverM.isPending} />
              <Button label="Keep trying" variant="ghost" onPress={() => setUndeliverOpen(false)} />
            </Card>
          ) : (
            <Button label="Can't deliver?" variant="ghost" onPress={() => setUndeliverOpen(true)} />
          )
        ) : null}

        {/* Order-level support (active) + report/block after the trip (rider → sender). */}
        {isActive || order.status === "delivered" ? <GetHelpControl orderId={order.id} /> : null}
        {order.status === "delivered" ? <ReportControl orderId={order.id} counterpartyNoun="sender" /> : null}
        <Button label="Back" variant="ghost" onPress={() => router.replace("/rider")} />
        <ErrorText message={error} />
        <View style={{ height: tokens.space.xxl }} />
      </ScrollView>
    </Screen>
  );
}
