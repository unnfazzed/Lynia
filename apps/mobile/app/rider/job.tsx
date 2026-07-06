import { ACTIVE_RIDE_STATUSES, type AdvanceStatusRequest, RIDER_CANCELLABLE_STATUSES, UndeliveredReason, tokens } from "@lynia/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { AppState, Linking, Pressable, ScrollView, Text, View } from "react-native";
import { ApiError } from "../../src/api/client";
import { collectedItemCount } from "../../src/logic/journey";
import { mapsDirectionsUrl } from "../../src/logic/maps";
import { advanceStatus, cancelOrder, confirmDelivery, confirmItems, getActiveOrder, markUndelivered, rateSender, type OrderSnapshot } from "../../src/api/orders";
import { acknowledgeHandback, loadAcknowledgedHandbacks } from "../../src/auth/session";
import { useRiderJobSocket } from "../../src/realtime/use-rider-job-socket";
import { useRiderLocationStream } from "../../src/realtime/use-rider-location";
import { Button, Card, ErrorText, Field, Heading, Icon, type IconName, OfflineBanner, Screen, SkeletonList, StatusPill, Stepper, Sub } from "../../src/ui";
import { LiveMap } from "../../src/ui/LiveMap";
import { GetHelpControl, ReportControl, SosControl } from "../../src/ui/safety";

const ACTIVE = ACTIVE_RIDE_STATUSES as string[];
// R2: the rider may only cancel pre-pickup — the server rejects a cancel once the parcel is collected,
// so the button must hide there (post-pickup, "Can't complete delivery" is the exit, not Cancel).
const RIDER_CANCELLABLE = RIDER_CANCELLABLE_STATUSES as string[];
const NEXT: Record<string, { to: AdvanceStatusRequest["to"]; label: string }> = {
  assigned: { to: "confirmed", label: "Confirm the job" },
  confirmed: { to: "en_route_pickup", label: "Head to pickup" },
  en_route_pickup: { to: "picked_up", label: "Mark parcel collected" },
  picked_up: { to: "en_route_dropoff", label: "Head to drop-off" },
};

// Delivery-OTP cap (R9). Mirrors the server's DELIVERY_OTP_MAX_ATTEMPTS: the server enforces the lock;
// the client counts wrong tries to show attempts-remaining and disable the field at the cap.
const DELIVERY_OTP_MAX_ATTEMPTS = 5;

// The post-pickup "can't complete delivery" reasons (R1) — the shared UndeliveredReason enum paired
// with rider-facing copy + an icon, mirroring the "Couldn't deliver" mockup (rider-screens.jsx).
const UNDELIVERED_OPTIONS: { reason: UndeliveredReason; label: string; icon: IconName }[] = [
  { reason: UndeliveredReason.UNREACHABLE, label: "Recipient unreachable", icon: "phone" },
  { reason: UndeliveredReason.REFUSED, label: "Recipient refused", icon: "circle-alert" },
  { reason: UndeliveredReason.WRONG_ADDRESS, label: "Wrong address", icon: "map-pin" },
  { reason: UndeliveredReason.BREAKDOWN, label: "Couldn't complete (breakdown)", icon: "bike" },
];
const UNDELIVERED_LABEL = Object.fromEntries(UNDELIVERED_OPTIONS.map((o) => [o.reason, o.label])) as Record<UndeliveredReason, string>;

export default function RiderJob(): React.ReactElement {
  const router = useRouter();
  const qc = useQueryClient();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  // Pickup item verification: which line-items the rider has ticked as physically collected. Indexes
  // into order.items; defaults to all ticked when the rider reaches the pickup-verification step.
  const [checkedItems, setCheckedItems] = useState<Set<number>>(() => new Set());
  // R1: the post-pickup "can't complete delivery" reason picker + the frozen terminal once it commits.
  const [undelivering, setUndelivering] = useState(false);
  const [undeliveredDone, setUndeliveredDone] = useState<UndeliveredReason | null>(null);
  // R9: count wrong delivery-code tries to show attempts-remaining and lock the field at the cap.
  const [otpTries, setOtpTries] = useState(0);
  // Rate-the-sender (4·7): an OPTIONAL post-delivery star, recorded-only — tap-then-submit, no undo.
  const [senderScore, setSenderScore] = useState(0);
  // R8 follow-up: order ids the rider has already handed back (tapped "Back to board" on). A cancelled
  // order stays reopenable for 24h, so without this its snapshot keeps re-showing the hand-back prompt
  // on every reopen. Loaded once from the device; a fresh WS cancel is never suppressed (only reopens).
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

  // Warm-resume: refetch the active job the moment the app returns to foreground. Without this, a job
  // the customer cancelled while we were backgrounded serves its stale (still-live) cache for up to the
  // 6s poll — briefly re-exposing advance/OTP controls on a dead order — before flipping to the R8
  // hand-back. Invalidating on resume makes the terminal appear immediately.
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => {
      if (s === "active") void qc.invalidateQueries({ queryKey: ["activeJob"] });
    });
    return () => sub.remove();
  }, [qc]);

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
      setOtpTries(0);
      refresh();
    },
    onError: (e) => {
      // 403 = the 5-attempt lockout; the customer must re-issue the code. 401 = a wrong code — count it
      // so the rider sees how many tries remain and the field locks at the cap instead of hammering a
      // dead endpoint. Anything else is an unexpected failure.
      if (e instanceof ApiError && e.status === 403) {
        setOtpTries(DELIVERY_OTP_MAX_ATTEMPTS);
        setError("Too many attempts — ask the customer to re-issue the delivery code.");
      } else if (e instanceof ApiError && e.status === 401) {
        setOtpTries((n) => n + 1);
        setError(null);
      } else {
        fail(e);
      }
      refresh();
    },
  });
  const cancelM = useMutation({ mutationFn: () => cancelOrder(orderId!), onSuccess: refresh, onError: fail });
  // 4·7: optional, recorded-only rate-the-sender. Doesn't change status or gate anything.
  const senderRateM = useMutation({
    mutationFn: (score: number) => rateSender(orderId!, { score }),
    onError: fail,
  });
  // R1: record a failed hand-off. On success we freeze a terminal (the order leaves the active feed).
  const undeliverM = useMutation({
    mutationFn: (reason: UndeliveredReason) => markUndelivered(orderId!, reason),
    onSuccess: (_res, reason) => {
      setUndelivering(false);
      setUndeliveredDone(reason);
    },
    onError: (e) => {
      setUndelivering(false);
      fail(e);
      refresh();
    },
  });
  // Reset the per-order UI counters whenever the active job changes.
  useEffect(() => {
    setOtpTries(0);
    setUndelivering(false);
  }, [orderId]);

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

  // Terminal: the customer cancelled. Rendered from the frozen WS snapshot (keeps the sender contact
  // after the order leaves the active feed), OR — R8 — from a fetched cancelled order when the rider
  // reopens after missing the `job:cancelled` push while backgrounded. activeForRider only surfaces a
  // cancelled order this rider had COLLECTED, so `collected` is true on that reopen path.
  const handback =
    cancelledJob ??
    (order && order.status === "cancelled" && !ackedHandbacks.has(order.id) ? { collected: true, snapshot: order } : null);
  if (handback) {
    const snap = handback.snapshot;
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
            {handback.collected ? (
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
          {/* Record that this parcel was handed back so the 24h reopen window doesn't re-prompt the
              rider on their next visit — then drop back to the board. */}
          <Button
            label="Back to board"
            onPress={() => {
              void acknowledgeHandback(snap.id);
              router.replace("/rider");
            }}
          />
        </ScrollView>
      </Screen>
    );
  }

  // Terminal: the rider recorded a failed hand-off (R1). Frozen locally — an `undelivered` order leaves
  // the active-job feed, so a refetch would drop to "No active job" with no acknowledgement.
  if (undeliveredDone) {
    return (
      <Screen>
        <ScrollView showsVerticalScrollIndicator={false}>
          <View style={{ flexDirection: "row", alignItems: "center", marginBottom: tokens.space.md }}>
            <Heading>Your job</Heading>
            <View style={{ flex: 1 }} />
            <StatusPill status="undelivered" tone="offline" dot />
          </View>
          <Card>
            <Text style={{ fontSize: tokens.font.size.bodyLg, fontWeight: tokens.font.weight.bold, color: tokens.color.ink, marginBottom: tokens.space.sm }}>
              Marked as not delivered
            </Text>
            <Text style={{ fontSize: tokens.font.size.body, color: tokens.color.muted, lineHeight: 20 }}>
              Recorded as &ldquo;{UNDELIVERED_LABEL[undeliveredDone]}&rdquo;. The customer has been told. You&apos;re free for the next job.
            </Text>
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
  // No live job — either genuinely nothing, or an already-acknowledged hand-back whose cancelled
  // snapshot still lingers in the 24h reopen window (handback resolved to null above). Either way
  // there's nothing to act on, so show the calm empty terminal rather than the collect/deliver flow.
  if (!order || order.status === "cancelled") {
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
  const otpLocked = otpTries >= DELIVERY_OTP_MAX_ATTEMPTS;
  const attemptsLeft = Math.max(0, DELIVERY_OTP_MAX_ATTEMPTS - otpTries);
  const canUndeliver = order.status === "picked_up" || order.status === "en_route_dropoff";
  // Total quantity across the ticked items — the collect CTA counts pieces, not rows ("Confirm 3
  // items collected" for a 1× + 2× selection).
  const collectedCount = collectedItemCount(items, checkedItems);
  const riderPoint =
    order.rider != null && order.rider.currentLat != null && order.rider.currentLng != null
      ? { lat: order.rider.currentLat, lng: order.rider.currentLng }
      : null;

  const jobReconnecting = isActive && wasJobConnected.current && !jobSocketConnected;

  return (
    <Screen>
      {/* 4·b4: socket dropped mid-job — a muted "live paused" banner, never a red alarm. The job is
          saved locally and syncs on reconnect; the rider keeps riding. */}
      {jobReconnecting ? <OfflineBanner state="reconnecting" /> : null}
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: tokens.space.md }}>
          <Heading>Your job</Heading>
          <View style={{ flex: 1 }} />
          <StatusPill status={order.status} tone={jobReconnecting ? "reconnecting" : undefined} />
        </View>

        {jobReconnecting ? (
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
          <Card>
            <Text style={{ fontWeight: "700", marginBottom: tokens.space.sm }}>Confirm hand-off</Text>
            <Sub>Ask the recipient for the 6-digit delivery code.</Sub>
            <Field label="Delivery code" value={code} onChangeText={setCode} keyboardType="number-pad" maxLength={6} />
            {/* R9: show how many tries remain, and once locked stop inviting more taps into a dead endpoint. */}
            {otpLocked ? (
              <Text style={{ fontSize: tokens.font.size.caption, color: tokens.color.danger, marginTop: 4, lineHeight: 18 }}>
                Too many attempts. Ask the customer to re-issue the code, then enter the new one.
              </Text>
            ) : otpTries > 0 ? (
              <Text style={{ fontSize: tokens.font.size.caption, color: tokens.color.muted, marginTop: 4 }}>
                That code didn&apos;t match — {attemptsLeft} attempt{attemptsLeft === 1 ? "" : "s"} left.
              </Text>
            ) : null}
            <Button
              label="Confirm delivery"
              onPress={() => deliverM.mutate()}
              loading={deliverM.isPending}
              disabled={otpLocked || code.trim().length !== 6}
            />
          </Card>
        ) : null}

        {/* R1: post-pickup, the rider needs a way to record a hand-off that can't happen — otherwise a
            refused / unreachable / wrong-address / breakdown job is a dead end. Opens a reason picker
            that commits the terminal `undelivered` state and frees the rider for the next job. */}
        {canUndeliver ? (
          undelivering ? (
            <Card style={{ borderColor: tokens.color.line }}>
              <Text style={{ fontWeight: "700", marginBottom: 2 }}>Can&apos;t complete this delivery?</Text>
              <Sub>Pick the reason — this ends the job, so only use it if the hand-off truly can&apos;t happen.</Sub>
              <View style={{ gap: tokens.space.sm, marginTop: tokens.space.sm }}>
                {UNDELIVERED_OPTIONS.map((o) => (
                  <Pressable
                    key={o.reason}
                    onPress={() => undeliverM.mutate(o.reason)}
                    disabled={undeliverM.isPending}
                    accessibilityRole="button"
                    accessibilityLabel={o.label}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: tokens.space.md,
                      minHeight: tokens.touchTargetMin,
                      paddingHorizontal: tokens.space.md,
                      paddingVertical: tokens.space.sm,
                      borderRadius: tokens.radius.input,
                      borderWidth: 1,
                      borderColor: tokens.color.line,
                      backgroundColor: tokens.color.surface,
                      opacity: undeliverM.isPending ? 0.6 : 1,
                    }}
                  >
                    <Icon name={o.icon} size={16} color={tokens.color.muted} />
                    <Text style={{ flex: 1, fontSize: tokens.font.size.body, color: tokens.color.ink }}>{o.label}</Text>
                  </Pressable>
                ))}
              </View>
              <Button label="Never mind" variant="ghost" onPress={() => setUndelivering(false)} disabled={undeliverM.isPending} />
            </Card>
          ) : (
            <Button label="Can't complete delivery" variant="ghost" onPress={() => setUndelivering(true)} />
          )
        ) : null}

        {order.status === "delivered" ? (
          <>
            <Card>
              <Text style={{ fontWeight: "700", color: tokens.color.accentText }}>Delivered. Waiting for the customer to rate — you're free for the next job.</Text>
            </Card>
            {/* Rate the sender (4·7) — OPTIONAL, recorded-only ("a no-show or cash problem here
                protects other riders"). Tap a star to submit; swaps to a thank-you on success. */}
            <Card>
              <Text style={{ fontWeight: "700", marginBottom: 2 }}>Rate the sender</Text>
              <Sub>Optional — a no-show or cash problem here protects other riders.</Sub>
              {senderRateM.isSuccess ? (
                <Text style={{ fontSize: 14, color: tokens.color.accentText, fontWeight: "600" }}>Thanks for the feedback.</Text>
              ) : (
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
                      hitSlop={8}
                      style={{ minWidth: tokens.touchTargetMin, minHeight: tokens.touchTargetMin, alignItems: "center", justifyContent: "center" }}
                    >
                      <Text style={{ fontSize: 30, color: n <= senderScore ? tokens.color.highlight : tokens.color.line }}>★</Text>
                    </Pressable>
                  ))}
                </View>
              )}
            </Card>
          </>
        ) : null}

        {/* SOS on a live run (R-16/F-13) — a deliberate danger control, highest value at the cash
            hand-off. Passes the rider's own live GPS when available. */}
        {isActive ? <SosControl orderId={order.id} lat={riderPoint?.lat} lng={riderPoint?.lng} /> : null}

        {RIDER_CANCELLABLE.includes(order.status) ? (
          <Button label="Cancel job" variant="ghost" onPress={() => cancelM.mutate()} loading={cancelM.isPending} />
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
