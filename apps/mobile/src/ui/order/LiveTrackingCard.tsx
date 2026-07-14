import { PRESENCE_ESCALATION_MS, tokens } from "@lynia/shared";
import { useQuery } from "@tanstack/react-query";
import React from "react";
import { Linking, Pressable, Text, View } from "react-native";
import { getOrder, type OrderEvent } from "../../api/orders";
import { etaHeadline, liveEta } from "../../logic/eta";
import { mapsPlaceUrl } from "../../logic/maps";
import { formatMoney } from "../../logic/money";
import { isRiderTrackingStale } from "../../logic/order-labels";
import { selectRiderTelemetry } from "../../logic/order-tracking";
import type { RiderIdentity } from "../../logic/rider-identity";
import { orderKey } from "../../query/client";
import { Button, Card, Icon, RiderMini, Stepper } from "../index";
import { LiveMap, type MapPoint } from "../LiveMap";

/**
 * The live tracking card (ETA headline, map, tracking hint, phone row, stepper) — extracted from
 * order/[id].tsx so a GPS-only cache update re-renders THIS card and nothing else.
 *
 * How the isolation works (see logic/order-tracking.ts): the parent screen subscribes to the order
 * snapshot through `selectOrderShell`, which strips the per-tick rider telemetry — so a WS "position"
 * push leaves the parent's selected data referentially unchanged and the parent doesn't re-render.
 * This card holds its OWN observer on the same query key with `selectRiderTelemetry`, the per-tick
 * slice, so it (and only it) repaints when the rider moves. Every prop below is referentially stable
 * across GPS ticks (the parent doesn't even render then), and `React.memo` keeps unrelated parent
 * state churn (cancel confirmations, select notices, countdown ticks) from re-rendering the map.
 */
export const LiveTrackingCard = React.memo(function LiveTrackingCard(props: {
  orderId: string;
  /** The order's current status — drives the ETA leg (to pickup vs. to drop-off) and the stepper. */
  status: string;
  /** True while the trip is genuinely live (ACTIVE_RIDE_STATUSES) — staleness/ETA only apply then. */
  isActive: boolean;
  /** Display fare (agreedFare ?? proposedFare), already resolved by the parent. */
  fare: string;
  pickup: MapPoint;
  dropoff: MapPoint;
  events: OrderEvent[];
  counterpartyPhone: string | null;
  /** Who's viewing — for a rider viewer the counterparty phone is the SENDER's, so the label flips. */
  viewerRole?: "customer" | "rider";
  /** The chosen rider's cached identity (face/name/rating) — the snapshot doesn't carry it. */
  riderIdentity: RiderIdentity | null;
  /** The order socket's health — mutes the map pin while reconnecting on a live trip. */
  connectionState: "live" | "reconnecting";
  /** Re-issue the delivery code (the parent's rotate mutation) — only rendered while active. */
  onReissueCode: () => void;
  reissuing: boolean;
  /** Fix 2: bumped by the parent when a rider-presence-stale WS event fires. Its only job is to change
   *  a prop so this memoized card re-renders and re-runs the render-time staleness check the instant
   *  GPS ticks stop — otherwise nothing re-evaluates `isRiderTrackingStale` once the ticks that drive
   *  this card's re-renders are exactly what have gone silent. */
  staleTick?: number;
}): React.ReactElement {
  const { orderId, status, isActive, connectionState } = props;
  const isRiderViewer = props.viewerRole === "rider";

  // Fix 2 (belt-and-suspenders): the WS presence-stale event can itself be missed on a flaky link, and
  // staleness is otherwise only recomputed on a new GPS tick — the very thing that has stopped. While
  // the trip is active, re-render every 30s so `isRiderTrackingStale` (a render-time `Date.now()` check)
  // re-evaluates even with no WS event and no new tick ever arriving. Cleaned up on unmount / going
  // inactive.
  const [, forceStaleCheck] = React.useState(0);
  React.useEffect(() => {
    if (!isActive) return;
    const iv = setInterval(() => forceStaleCheck((n) => n + 1), 30_000);
    return () => clearInterval(iv);
  }, [isActive]);

  // The per-tick subscription. The parent screen's observer owns the fetching policy (socket-gated
  // poll fallback, foreground refetch), so this observer exists purely to SUBSCRIBE to the telemetry
  // slice of the shared cache entry — `refetchOnMount: false` keeps mounting the card from doubling
  // the round-trip on a metered link for data the parent just fetched.
  const telemetry = useQuery({
    queryKey: orderKey(orderId),
    queryFn: () => getOrder(orderId),
    select: selectRiderTelemetry,
    refetchOnMount: false,
  }).data;

  const riderPoint = telemetry != null && telemetry.lat != null && telemetry.lng != null ? { lat: telemetry.lat, lng: telemetry.lng } : null;
  // C4: a rider fix is only "live" while it's fresh. Past PRESENCE_ESCALATION_MS with no new fix the
  // rider's GPS has gone dark — mute the pin (below, via LiveMap's reconnecting treatment) and stop
  // claiming it "updates live," escalating instead to a "call your rider" warning.
  const riderUpdatedAt = telemetry?.updatedAt ?? null;
  const assignedAt = props.events.find((e) => e.status === "assigned")?.createdAt ?? null;
  const riderStale = isRiderTrackingStale({ isActive, riderUpdatedAt, assignedAt, nowMs: Date.now(), escalationMs: PRESENCE_ESCALATION_MS });
  // Fix 1c: the "your rider's location looks paused — call them" copy is written for the CUSTOMER
  // watching their rider. To a rider viewing their own job it's nonsense (they can't "call" themselves,
  // and their own location isn't "paused" from their seat) — suppress that specific hint for a rider
  // viewer and fall back to the neutral on-the-move / waiting copy.
  const trackingHint = riderStale && !isRiderViewer
    ? "Your rider's location looks paused — call them to check in."
    : !riderPoint
      ? "Waiting for the rider's GPS…"
      : "Rider is on the move — the gold pin updates live.";
  // Live "arriving in ~N min" headline — the glanceable number modern trackers lead with. Suppressed
  // when the rider's GPS has gone stale (we won't claim a fresh ETA off a dark position) or before the
  // first fix; the prose `trackingHint` covers those.
  const eta = isActive && !riderStale ? liveEta({ status, rider: riderPoint, pickup: props.pickup, dropoff: props.dropoff }) : null;

  return (
    <Card>
      {/* Who's coming: the chosen rider's face + name + rating, cached from the offer they were
          picked from (the assigned-order snapshot doesn't carry it). The trust anchor for tracking. */}
      {props.riderIdentity ? (
        <View style={{ marginBottom: tokens.space.sm }}>
          <RiderMini
            profileId={props.riderIdentity.profileId || props.riderIdentity.orderId}
            firstName={props.riderIdentity.firstName}
            lastName={props.riderIdentity.lastName}
            photoUrl={props.riderIdentity.photoUrl}
            ratingAvg={props.riderIdentity.ratingAvg}
            ratingCount={props.riderIdentity.ratingCount}
            tripsCount={props.riderIdentity.tripsCount}
          />
        </View>
      ) : null}
      {eta ? (
        // The big glanceable ETA — leads the tracking card, styled as the screen's live headline.
        <View accessibilityRole="text" style={{ flexDirection: "row", alignItems: "center", gap: tokens.space.sm, marginBottom: tokens.space.xs }}>
          <Icon name="bike" size={20} color={tokens.color.accentText} />
          <Text style={{ fontSize: tokens.font.size.title, fontWeight: tokens.font.weight.bold, color: tokens.color.ink }}>{etaHeadline(eta)}</Text>
        </View>
      ) : null}
      <Text style={{ fontSize: 14, color: tokens.color.muted, marginBottom: tokens.space.sm, fontVariant: ["tabular-nums"] }}>Agreed fare {formatMoney(props.fare)}</Text>
      <LiveMap
        pickup={{ lat: props.pickup.lat, lng: props.pickup.lng }}
        dropoff={{ lat: props.dropoff.lat, lng: props.dropoff.lng }}
        rider={riderPoint}
        // C4: a stale rider fix mutes the pin just like a reconnecting socket does — a dark GPS
        // must not render as a full-opacity "live" position.
        connectionState={riderStale ? "reconnecting" : isActive ? connectionState : "live"}
      />
      {telemetry?.hasRider ? (
        <Text style={{ fontSize: 14, color: tokens.color.muted }}>{trackingHint}</Text>
      ) : null}
      {/* Maps-sync (§3·2): open the drop-off location in Google Maps so the customer can follow
          along. No Places key needed — a universal Maps URL built from the stored drop-off point. */}
      <Pressable
        onPress={() => void Linking.openURL(mapsPlaceUrl(props.dropoff))}
        accessibilityRole="button"
        accessibilityLabel="Open the drop-off in Google Maps"
        style={{ minHeight: tokens.touchTargetMin, flexDirection: "row", alignItems: "center", gap: tokens.space.sm }}
      >
        <Icon name="navigation" size={16} color={tokens.color.accentText} />
        <Text style={{ fontSize: 14, fontWeight: "600", color: tokens.color.accentText }}>Open drop-off in Maps</Text>
      </Pressable>
      {props.counterpartyPhone ? (
        <>
          <Text style={{ fontSize: 14, color: tokens.color.ink, marginTop: 4, fontVariant: ["tabular-nums"] }}>
            {props.viewerRole === "rider" ? "Sender phone" : "Rider phone"}: {props.counterpartyPhone}
          </Text>
          {/* The number is only ever revealed while the delivery is live — assigned through the
              hand-off (PHONE_REVEAL_STATUSES), NOT once the order is completed. A trust feature only
              matters if the customer can perceive it, so say so. */}
          <Text style={{ fontSize: 12, color: tokens.color.muted, marginTop: 2 }}>
            Shared only while your delivery is live — for your privacy.
          </Text>
          {/* One-tap dialer next to the visible number — a call beats copy/paste mid-delivery. */}
          <Pressable
            onPress={() => void Linking.openURL(`tel:${props.counterpartyPhone}`)}
            accessibilityRole="button"
            accessibilityLabel={props.viewerRole === "rider" ? "Call sender" : "Call rider"}
            style={{ minHeight: tokens.touchTargetMin, flexDirection: "row", alignItems: "center", gap: tokens.space.sm }}
          >
            <Icon name="phone" size={16} color={tokens.color.accentText} />
            <Text style={{ fontSize: 14, fontWeight: "600", color: tokens.color.accentText }}>{props.viewerRole === "rider" ? "Call sender" : "Call rider"}</Text>
          </Pressable>
        </>
      ) : null}
      <View style={{ height: tokens.space.md }} />
      <Stepper events={props.events} currentStatus={status} view="customer" />
      {isActive ? (
        <Button label="Re-issue delivery code" variant="ghost" onPress={props.onReissueCode} loading={props.reissuing} />
      ) : null}
    </Card>
  );
});
