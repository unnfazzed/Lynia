import { tokens } from "@lynia/shared/tokens";
import React, { useEffect, useMemo, useRef } from "react";
import { Animated, Easing, Text, View } from "react-native";
import MapView, { type LatLng, Marker, Polyline, type Region } from "react-native-maps";
import { PinView } from "../ComposeMap";
import { Icon } from "../Icon";
import type { MapPoint } from "../LiveMap";
import { GlidingMarker, MapGround, RINGS_AS_OVERLAY, useDeferredMapMount, useProjectedPoint } from "./map-perf";

/**
 * The order screen's full-bleed map (After Send handoff "Map", ledger D-53). It sits behind the sheet:
 * the pickup green dot and drop-off red square with their pills, the 5px accent route, and — once a
 * rider is matched — the new rider marker (34px ink disc + white bike + name pill; muted and dashed
 * "Last seen …" when GPS is paused or offline) with a dotted line to the pickup while heading there.
 * While finding, two accent rings pulse on the pickup (one static ring under reduce motion).
 *
 * The camera fits per stage with bottom padding equal to the sheet, so pins never hide under it, and
 * re-fits only when the framed SET changes (a stage change), never on a GPS tick. GPS fixes glide the
 * marker over 800ms (snap under reduce motion). No Expand / Recenter: the sheet does that job.
 *
 * Performance (customer review 2026-10-07, `map-perf.tsx`): the native map mounts one interaction after
 * the push (P12) — and with no stops yet it is the opening state's map too, so the same native view
 * survives the order arriving; the finding rings are a plain view over the map on native (P20); the
 * rider glides natively on Android (P37).
 */

/** Harare CBD — the initial region before the first fit. */
const HARARE: Region = { latitude: -17.8292, longitude: 31.0522, latitudeDelta: 0.06, longitudeDelta: 0.06 };
/** The rings' box (two 40 rings scaled to 3.2 fit in it). */
const RINGS_BOX = 132;

const toLatLng = (p: MapPoint): LatLng => ({ latitude: p.lat, longitude: p.lng });

export type MapFrame = "route" | "pickupRider" | "riderDrop";

function RiderMarkerView({ label, paused }: { label: string; paused: boolean }): React.ReactElement {
  return (
    <View style={{ alignItems: "center", gap: 3, padding: 4 }}>
      <View
        style={{
          width: 34,
          height: 34,
          borderRadius: 17,
          backgroundColor: paused ? tokens.color.muted : tokens.color.ink,
          opacity: paused ? 0.85 : 1,
          borderWidth: 3,
          borderColor: tokens.color.bg,
          alignItems: "center",
          justifyContent: "center",
          ...tokens.shadow.menu,
        }}
      >
        <Icon name="bike" size={17} color={tokens.color.onAccent} />
      </View>
      <View
        style={{
          backgroundColor: paused ? tokens.color.bg : tokens.color.ink,
          borderRadius: tokens.radius.pill,
          paddingHorizontal: 8,
          paddingVertical: 2,
          borderWidth: paused ? 1 : 0,
          borderStyle: "dashed",
          borderColor: tokens.color.muted,
          ...tokens.shadow.card,
        }}
      >
        <Text style={{ fontSize: 12, fontWeight: tokens.font.weight.semibold, color: paused ? tokens.color.muted : tokens.color.onAccent }}>{label}</Text>
      </View>
    </View>
  );
}

/** Two 40px accent rings scaling 0.5 → 3.2 and fading .7 → 0 over 2.4s, offset 1.2s. */
function FindingRings({ reduceMotion }: { reduceMotion: boolean }): React.ReactElement {
  const a = useRef(new Animated.Value(0)).current;
  const b = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduceMotion) return;
    const loop = (v: Animated.Value): Animated.CompositeAnimation =>
      Animated.loop(Animated.timing(v, { toValue: 1, duration: 2400, easing: Easing.out(Easing.quad), useNativeDriver: true }));
    const la = loop(a);
    la.start();
    const t = setTimeout(() => loop(b).start(), 1200);
    return () => {
      clearTimeout(t);
      la.stop();
      a.stopAnimation();
      b.stopAnimation();
    };
  }, [reduceMotion, a, b]);
  const ring = (v: Animated.Value | null): React.ReactElement => (
    <Animated.View
      style={{
        position: "absolute",
        width: 40,
        height: 40,
        borderRadius: 20,
        borderWidth: 2,
        borderColor: tokens.color.accent,
        opacity: v ? v.interpolate({ inputRange: [0, 1], outputRange: [0.7, 0] }) : 0.35,
        transform: [{ scale: v ? v.interpolate({ inputRange: [0, 1], outputRange: [0.5, 3.2] }) : 1.6 }],
      }}
    />
  );
  return (
    <View style={{ width: RINGS_BOX, height: RINGS_BOX, alignItems: "center", justifyContent: "center" }} pointerEvents="none">
      {reduceMotion ? ring(null) : (
        <>
          {ring(a)}
          {ring(b)}
        </>
      )}
    </View>
  );
}

export const OrderMap = React.memo(function OrderMap(props: {
  /** Null while the order is opening (v2 2.1–2.3): the same map, no pins yet. */
  pickup: MapPoint | null;
  dropoff: MapPoint | null;
  rider: MapPoint | null;
  riderLabel: string;
  riderPaused: boolean;
  /** Show the rider marker (matched onward). */
  showRider: boolean;
  /** Dotted line rider → pickup (heading to pickup). */
  toPickupLine: boolean;
  rings: boolean;
  dim: boolean;
  frame: MapFrame;
  /** Bottom fit padding — the sheet's visible height. */
  padBottom: number;
  reduceMotion: boolean;
}): React.ReactElement {
  const mapRef = useRef<MapView>(null);
  const mapMounted = useDeferredMapMount();
  const { rider, reduceMotion, pickup, dropoff } = props;

  // The framed set per stage. The rider joins it only when the stage asks for it; the fit runs when the
  // frame, the stops or the sheet padding change — a later GPS tick never re-frames the camera.
  const haveRider = rider != null;
  const fitKey = `${props.frame}|${pickup?.lat},${pickup?.lng}|${dropoff?.lat},${dropoff?.lng}|${Math.round(props.padBottom)}|${haveRider}|${mapMounted}`;
  const riderRef = useRef(rider);
  riderRef.current = rider;
  useEffect(() => {
    if (!pickup || !dropoff) return;
    const r = riderRef.current;
    const pts: MapPoint[] = props.frame === "pickupRider" && r ? [pickup, r] : props.frame === "riderDrop" && r ? [r, dropoff] : [pickup, dropoff];
    mapRef.current?.fitToCoordinates(pts.map(toLatLng), {
      edgePadding: { top: 56, right: 48, bottom: props.padBottom + 24, left: 48 },
      animated: !reduceMotion,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fitKey is the deliberate trigger (see above).
  }, [fitKey, reduceMotion]);

  const route = useMemo(() => (pickup && dropoff ? [toLatLng(pickup), toLatLng(dropoff)] : null), [pickup, dropoff]);
  const ringsOverlay = RINGS_AS_OVERLAY && props.rings && pickup != null;
  const projected = useProjectedPoint(mapRef, pickup, ringsOverlay && mapMounted);

  return (
    <View style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      {!mapMounted ? <MapGround /> : null}
      {mapMounted ? (
        <MapView
          ref={mapRef}
          style={{ flex: 1 }}
          initialRegion={HARARE}
          toolbarEnabled={false}
          showsCompass={false}
          onRegionChange={ringsOverlay ? projected.reproject : undefined}
          onRegionChangeComplete={ringsOverlay ? projected.reproject : undefined}
        >
          {route ? <Polyline coordinates={route} strokeColor={tokens.color.accent} strokeWidth={5} lineCap="round" /> : null}
          {props.rings && pickup && !RINGS_AS_OVERLAY ? (
            <Marker key={`rings-${reduceMotion ? "s" : "a"}`} coordinate={toLatLng(pickup)} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={!reduceMotion}>
              <FindingRings reduceMotion={reduceMotion} />
            </Marker>
          ) : null}
          {pickup ? (
            <Marker coordinate={toLatLng(pickup)} anchor={{ x: 0.5, y: 0.25 }} tracksViewChanges={false}>
              <PinView kind="pickup" label="Pickup" />
            </Marker>
          ) : null}
          {dropoff ? (
            <Marker coordinate={toLatLng(dropoff)} anchor={{ x: 0.5, y: 0.25 }} tracksViewChanges={false}>
              <PinView kind="drop" label="Drop-off" />
            </Marker>
          ) : null}
          {props.showRider && props.toPickupLine && rider && pickup ? (
            <Polyline coordinates={[toLatLng(rider), toLatLng(pickup)]} strokeColor={tokens.color.ink} strokeWidth={3} lineDashPattern={[2, 6]} lineCap="round" />
          ) : null}
          {props.showRider ? (
            <GlidingMarker
              point={rider}
              // Remount on a label / paused change: tracksViewChanges is off, so a new key repaints the bitmap.
              markerKey={`rider-${props.riderPaused ? "p" : "l"}-${props.riderLabel}`}
              anchor={{ x: 0.5, y: 0.3 }}
              reduceMotion={reduceMotion}
            >
              <RiderMarkerView label={props.riderLabel} paused={props.riderPaused} />
            </GlidingMarker>
          ) : null}
        </MapView>
      ) : null}
      {ringsOverlay && projected.point ? (
        <View
          testID="finding-rings"
          pointerEvents="none"
          style={{ position: "absolute", left: projected.point.x - RINGS_BOX / 2, top: projected.point.y - RINGS_BOX / 2 }}
        >
          <FindingRings key={reduceMotion ? "s" : "a"} reduceMotion={reduceMotion} />
        </View>
      ) : null}
      {props.dim ? <View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, backgroundColor: "rgba(255,255,255,0.45)" }} /> : null}
    </View>
  );
});
