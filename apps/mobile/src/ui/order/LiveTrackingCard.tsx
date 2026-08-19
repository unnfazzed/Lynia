import { formatPhoneLocal, PRESENCE_ESCALATION_MS } from "@lynia/shared";
import { Tappable } from "../Tappable";
import { tokens } from "@lynia/shared/tokens";
import { useQuery } from "@tanstack/react-query";
import React from "react";
import { Linking, Pressable, Text, View } from "react-native";
import { getOrder, type OrderEvent } from "../../api/orders";
import { etaHeadline, liveEta } from "../../logic/eta";
import { mapsDirectionsUrl, mapsPlaceUrl } from "../../logic/maps";
import { formatMoney } from "../../logic/money";
import { isRiderTrackingStale } from "../../logic/order-labels";
import { selectRiderTelemetry } from "../../logic/order-tracking";
import type { RiderIdentity } from "../../logic/rider-identity";
import { orderKey } from "../../query/client";
import { Card, Icon, RiderMini, Stepper } from "../index";
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
  /** Re-issue the delivery code (the parent's rotate mutation) — only rendered while active. Unused
   *  for a food job (jobType="food"): D4 owns the doorstep code (masked-until-handshake, R-09), this
   *  card never offers a reissue for one. Optional so a food caller doesn't need to pass a no-op. */
  onReissueCode?: () => void;
  reissuing?: boolean | "queued";
  /** Fix 2: bumped by the parent when a rider-presence-stale WS event fires. Its only job is to change
   *  a prop so this memoized card re-renders and re-runs the render-time staleness check the instant
   *  GPS ticks stop — otherwise nothing re-evaluates `isRiderTrackingStale` once the ticks that drive
   *  this card's re-renders are exactly what have gone silent. */
  staleTick?: number;
  /** D3 (Lane D, food tracking): re-labels the Stepper to the food step set and swaps the money row's
   *  label ("Agreed fare" doesn't fit a food order's goods+delivery total, D-08). Default "parcel" —
   *  every existing call site is unaffected. */
  jobType?: "parcel" | "food";
  feeLabel?: string;
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

  // Parcel tracking (LJ.track_active / LJ.track_code) leads with a single muted "Agreed fare · rider"
  // line then a compact CallRow, per the mock (screens.jsx:301-314) — the mock draws no RiderMini face,
  // no ETA headline and no prose "on the move" hint on the tracking card, so those are parcel-suppressed
  // below. Food (jobType="food") keeps its existing richer body untouched. The rider's display name is
  // recovered from the cached RiderIdentity (SecureStore); absent in the parity harness, so it degrades
  // to fare-only + a phone-only CallRow honestly rather than being faked.
  const riderName = props.riderIdentity ? `${props.riderIdentity.firstName} ${props.riderIdentity.lastName}`.trim() : "";
  const isFood = props.jobType === "food";

  return (
    <Card>
      {/* Who's coming: the chosen rider's face + name + rating (food tracking only). The parcel mock
          carries rider identity in the "Agreed fare · Tendai M." line + the CallRow below, not a face
          card — so RiderMini is parcel-suppressed (food passes riderIdentity=null anyway). */}
      {isFood && props.riderIdentity ? (
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
          {/* #671 (RC.track_secured): plate chip · vehicle · KYC badge under the rider mini. The
              plate is the ink chip the mock draws ("AEE 4471"); vehicle + verified badge only render
              when present, so a rider with no vehicle_info / unverified KYC degrades cleanly. */}
          {props.riderIdentity.plate || props.riderIdentity.vehicleInfo || props.riderIdentity.kycVerified ? (
            <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
              {props.riderIdentity.plate ? (
                <Text
                  style={{
                    fontSize: 13,
                    fontWeight: "800",
                    letterSpacing: 0.6,
                    color: tokens.color.onAccent,
                    backgroundColor: tokens.color.ink,
                    borderRadius: 6,
                    paddingHorizontal: 8,
                    paddingVertical: 2,
                    fontVariant: ["tabular-nums"],
                  }}
                >
                  {props.riderIdentity.plate}
                </Text>
              ) : null}
              {props.riderIdentity.vehicleInfo ? (
                <Text style={{ fontSize: 12.5, color: tokens.color.muted }}>{props.riderIdentity.vehicleInfo}</Text>
              ) : null}
              {props.riderIdentity.kycVerified ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>
                  <Icon name="circle-check" size={13} color={tokens.color.accentText} />
                  <Text style={{ fontSize: 12, fontWeight: "700", color: tokens.color.accentText }}>Verified</Text>
                </View>
              ) : null}
            </View>
          ) : null}
        </View>
      ) : null}
      {isFood && eta ? (
        // The big glanceable ETA — leads the tracking card, styled as the screen's live headline.
        <View accessibilityRole="text" style={{ flexDirection: "row", alignItems: "center", gap: tokens.space.sm, marginBottom: tokens.space.xs }}>
          <Icon name="bike" size={20} color={tokens.color.accentText} />
          <Text style={{ fontSize: tokens.font.size.title, fontWeight: tokens.font.weight.bold, color: tokens.color.ink }}>{etaHeadline(eta)}</Text>
        </View>
      ) : null}
      {/* Kit LJ.track_active (screens.jsx:307): fare + rider name on one muted line. The rider name is
          appended only for parcel and only when the cached identity is present (falls back to fare-only
          in the parity harness, where SecureStore is inert — honest, not faked). */}
      <Text style={{ fontSize: 14, color: tokens.color.muted, marginBottom: tokens.space.sm, fontVariant: ["tabular-nums"] }}>
        {props.feeLabel ?? "Agreed fare"} {formatMoney(props.fare)}{!isFood && riderName ? ` · ${riderName}` : ""}
      </Text>
      {/* Kit CallRow (screens.jsx:47-59): a compact surface row — label / name / phone with a 44px
          round green call button — placed ABOVE the map, per the parcel tracking mock. Parcel only;
          food keeps its own phone row lower down (unchanged). */}
      {!isFood && props.counterpartyPhone ? (
        <Tappable
          onPress={() => void Linking.openURL(`tel:${props.counterpartyPhone}`)}
          accessibilityRole="button"
          accessibilityLabel={isRiderViewer ? "Call sender" : "Call rider"}
          style={{
            flexDirection: "row",
            alignItems: "center",
            gap: tokens.space.sm,
            paddingVertical: tokens.space.sm,
            paddingHorizontal: 10,
            backgroundColor: tokens.color.surface,
            borderRadius: tokens.radius.input,
            minHeight: tokens.touchTargetMin,
            marginBottom: tokens.space.sm,
          }}
        >
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontSize: 11, fontWeight: "600", color: tokens.color.muted }}>{isRiderViewer ? "Sender" : "Your rider"}</Text>
            {riderName ? <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: "600", color: tokens.color.ink }}>{riderName}</Text> : null}
            <Text style={{ fontSize: 13, color: tokens.color.muted, fontVariant: ["tabular-nums"] }}>{formatPhoneLocal(props.counterpartyPhone)}</Text>
          </View>
          <View style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: tokens.color.accent, alignItems: "center", justifyContent: "center" }}>
            <Icon name="phone" size={18} color={tokens.color.onAccent} />
          </View>
        </Tappable>
      ) : null}
      <LiveMap
        pickup={{ lat: props.pickup.lat, lng: props.pickup.lng }}
        dropoff={{ lat: props.dropoff.lat, lng: props.dropoff.lng }}
        rider={riderPoint}
        // C4: a stale rider fix mutes the pin just like a reconnecting socket does — a dark GPS
        // must not render as a full-opacity "live" position.
        connectionState={riderStale ? "reconnecting" : isActive ? connectionState : "live"}
      />
      {/* The parcel tracking mock draws no prose hint on the moving state — so parcel shows the line
          ONLY when the rider's GPS has gone stale (the paused-state warning, a safety cue), and food
          keeps the full on-the-move / waiting hint it always had. */}
      {telemetry?.hasRider && (isFood || (riderStale && !isRiderViewer)) ? (
        <Text style={{ fontSize: 14, color: tokens.color.muted }}>{trackingHint}</Text>
      ) : null}
      {/* Maps-sync (§3·2). The kit's customer row is route-sync, not a place pin: "Follow route in
          Google Maps · Same live route your rider is navigating" (ui_kits/mobile/app.js GMapsRow).
          This shipped as `mapsPlaceUrl(dropoff)` — a lone pin on the destination — which answers
          "where is it going" but not the question a waiting customer actually has, which is "what
          route is my rider on". Same leg the rider's own hand-off opens, so both sides see one route.
          No Places key needed — a universal Maps URL. A place pin is still the right shape once the
          trip is over, so the swap is gated on the run being live. */}
      {/* Kit GMapsRow (screens.jsx:95-107): a bordered row, not a bare link — an accent-wash icon
          circle, an ink title over a muted sub, and a trailing arrow that says it leaves the app. */}
      <Pressable
        onPress={() => void Linking.openURL(isActive ? mapsDirectionsUrl(props.pickup, props.dropoff) : mapsPlaceUrl(props.dropoff))}
        accessibilityRole="button"
        accessibilityLabel={isActive ? "Follow the route in Google Maps" : "Open the drop-off in Google Maps"}
        style={({ pressed }) => ({
          minHeight: tokens.touchTargetMin,
          flexDirection: "row",
          alignItems: "center",
          gap: tokens.space.sm,
          marginTop: tokens.space.sm,
          paddingHorizontal: tokens.space.md,
          paddingVertical: 10,
          borderWidth: 1,
          borderColor: tokens.color.line,
          borderRadius: tokens.radius.input,
          backgroundColor: pressed ? tokens.color.accentWash : tokens.color.bg,
        })}
      >
        <View style={{ width: 30, height: 30, borderRadius: 15, alignItems: "center", justifyContent: "center", backgroundColor: tokens.color.accentWash }}>
          <Icon name="navigation" size={16} color={tokens.color.accentText} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontSize: 13.5, fontWeight: "600", color: tokens.color.ink }}>
            {isActive ? "Follow route in Google Maps" : "Open drop-off in Maps"}
          </Text>
          {isActive ? (
            <Text style={{ fontSize: 11.5, color: tokens.color.muted }}>Same live route your rider is navigating</Text>
          ) : null}
        </View>
        <Icon name="arrow-right" size={16} color={tokens.color.muted} />
      </Pressable>
      {isFood && props.counterpartyPhone ? (
        <>
          <Text style={{ fontSize: 14, color: tokens.color.ink, marginTop: 4, fontVariant: ["tabular-nums"] }}>
            {props.viewerRole === "rider" ? "Sender phone" : "Rider phone"}: {formatPhoneLocal(props.counterpartyPhone)}
          </Text>
          {/* The number is only ever revealed while the delivery is live — assigned through the
              hand-off (PHONE_REVEAL_STATUSES), NOT once the order is completed. A trust feature only
              matters if the customer can perceive it, so say so. */}
          <Text style={{ fontSize: 12, color: tokens.color.muted, marginTop: 2 }}>
            Shared only while your delivery is live — for your privacy.
          </Text>
          {/* One-tap dialer next to the visible number — a call beats copy/paste mid-delivery. */}
          <Tappable
            onPress={() => void Linking.openURL(`tel:${props.counterpartyPhone}`)}
            accessibilityRole="button"
            accessibilityLabel={props.viewerRole === "rider" ? "Call sender" : "Call rider"}
            style={{ minHeight: tokens.touchTargetMin, flexDirection: "row", alignItems: "center", gap: tokens.space.sm }}
          >
            <Icon name="phone" size={16} color={tokens.color.accentText} />
            <Text style={{ fontSize: 14, fontWeight: "600", color: tokens.color.accentText }}>{props.viewerRole === "rider" ? "Call sender" : "Call rider"}</Text>
          </Tappable>
        </>
      ) : null}
      <View style={{ height: tokens.space.md }} />
      {/* UX-2026-07-15: the shared order screen's rider-viewer gating (07-14 Fix #1) only covered the
          TOP-level delivery-code card and the Cancel/rebroadcast/report controls — this card's OWN,
          separate reissue button and the stepper's copy were a second, missed instance of the same gap.
          A rider viewing their own job must never see customer-voiced milestone copy or a control that
          403s ("Not your order") against their own delivery. */}
      <Stepper events={props.events} currentStatus={status} view={isRiderViewer ? "rider" : "customer"} jobType={props.jobType} />
    </Card>
  );
});
