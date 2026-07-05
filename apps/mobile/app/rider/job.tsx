import { ACTIVE_RIDE_STATUSES, type AdvanceStatusRequest, tokens } from "@lynia/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useEffect, useRef, useState } from "react";
import { Linking, Pressable, ScrollView, Text, View } from "react-native";
import { ApiError } from "../../src/api/client";
import { collectedItemCount } from "../../src/logic/journey";
import { mapsDirectionsUrl } from "../../src/logic/maps";
import { advanceStatus, cancelOrder, confirmDelivery, confirmItems, getActiveOrder, type OrderSnapshot } from "../../src/api/orders";
import { useRiderJobSocket } from "../../src/realtime/use-rider-job-socket";
import { useRiderLocationStream } from "../../src/realtime/use-rider-location";
import { Button, Card, ErrorText, Field, Heading, Icon, Screen, SkeletonList, StatusPill, Stepper, Sub } from "../../src/ui";
import { LiveMap } from "../../src/ui/LiveMap";
import { GetHelpControl, ReportControl, SosControl } from "../../src/ui/safety";

const ACTIVE = ACTIVE_RIDE_STATUSES as string[];
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
  // Pickup item verification: which line-items the rider has ticked as physically collected. Indexes
  // into order.items; defaults to all ticked when the rider reaches the pickup-verification step.
  const [checkedItems, setCheckedItems] = useState<Set<number>>(() => new Set());

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
  useRiderJobSocket(
    order && ACTIVE.includes(order.status) ? orderId : null,
    (e) => {
      if (orderRef.current) setCancelledJob({ collected: e.collected, snapshot: orderRef.current });
    },
    () => setCustomerStale(true),
  );
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
      refresh();
    },
    onError: (e) => {
      // 403 = the 5-attempt lockout; the customer must re-issue the code. 401 = wrong code, retry.
      if (e instanceof ApiError && e.status === 403) {
        setError("Too many attempts — ask the customer to re-issue the delivery code.");
      } else {
        fail(e);
      }
      refresh();
    },
  });
  const cancelM = useMutation({ mutationFn: () => cancelOrder(orderId!), onSuccess: refresh, onError: fail });

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
      <ScrollView keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
        <View style={{ flexDirection: "row", alignItems: "center", marginBottom: tokens.space.md }}>
          <Heading>Your job</Heading>
          <View style={{ flex: 1 }} />
          <StatusPill status={order.status} />
        </View>

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
            <Button label="Confirm delivery" onPress={() => deliverM.mutate()} loading={deliverM.isPending} disabled={code.trim().length !== 6} />
          </Card>
        ) : null}

        {order.status === "delivered" ? (
          <Card>
            <Text style={{ fontWeight: "700", color: tokens.color.accentText }}>Delivered. Waiting for the customer to rate — you're free for the next job.</Text>
          </Card>
        ) : null}

        {/* SOS on a live run (R-16/F-13) — a deliberate danger control, highest value at the cash
            hand-off. Passes the rider's own live GPS when available. */}
        {isActive ? <SosControl orderId={order.id} lat={riderPoint?.lat} lng={riderPoint?.lng} /> : null}

        {isActive ? (
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
