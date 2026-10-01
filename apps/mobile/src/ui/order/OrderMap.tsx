import { tokens } from "@lynia/shared/tokens";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Animated, Easing, Text, View } from "react-native";
import MapView, { AnimatedRegion, type LatLng, Marker, MarkerAnimated, Polyline, type Region } from "react-native-maps";
import { PinView } from "../ComposeMap";
import { Icon } from "../Icon";
import type { MapPoint } from "../LiveMap";

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
 */

/** Harare CBD — the initial region before the first fit. */
const HARARE: Region = { latitude: -17.8292, longitude: 31.0522, latitudeDelta: 0.06, longitudeDelta: 0.06 };
const RIDER_DELTA = { latitudeDelta: 0.01, longitudeDelta: 0.01 } as const;
const GLIDE_MS = 800;

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
    <View style={{ width: 132, height: 132, alignItems: "center", justifyContent: "center" }} pointerEvents="none">
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
  pickup: MapPoint;
  dropoff: MapPoint;
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
  const riderRegion = useRef<AnimatedRegion | null>(null);
  const [hasRider, setHasRider] = useState(false);
  const { rider, reduceMotion } = props;
  const riderLat = rider?.lat;
  const riderLng = rider?.lng;

  useEffect(() => {
    if (riderLat == null || riderLng == null) return;
    const next: Region = { latitude: riderLat, longitude: riderLng, ...RIDER_DELTA };
    if (!riderRegion.current) {
      riderRegion.current = new AnimatedRegion(next);
      setHasRider(true);
      return;
    }
    if (reduceMotion) riderRegion.current.setValue(next);
    else
      riderRegion.current
        .timing({ ...next, duration: GLIDE_MS, easing: Easing.linear, useNativeDriver: false } as Parameters<AnimatedRegion["timing"]>[0])
        .start();
  }, [riderLat, riderLng, reduceMotion]);

  // The framed set per stage. The rider joins it only when the stage asks for it; the fit runs when the
  // frame, the stops or the sheet padding change — a later GPS tick never re-frames the camera.
  const haveRider = rider != null;
  const fitKey = `${props.frame}|${props.pickup.lat},${props.pickup.lng}|${props.dropoff.lat},${props.dropoff.lng}|${Math.round(props.padBottom)}|${haveRider}`;
  const riderRef = useRef(rider);
  riderRef.current = rider;
  useEffect(() => {
    const r = riderRef.current;
    const pts: MapPoint[] =
      props.frame === "pickupRider" && r ? [props.pickup, r] : props.frame === "riderDrop" && r ? [r, props.dropoff] : [props.pickup, props.dropoff];
    mapRef.current?.fitToCoordinates(pts.map(toLatLng), {
      edgePadding: { top: 56, right: 48, bottom: props.padBottom + 24, left: 48 },
      animated: !reduceMotion,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps -- fitKey is the deliberate trigger (see above).
  }, [fitKey, reduceMotion]);

  const route = useMemo(() => [toLatLng(props.pickup), toLatLng(props.dropoff)], [props.pickup, props.dropoff]);

  return (
    <View style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <MapView ref={mapRef} style={{ flex: 1 }} initialRegion={HARARE} toolbarEnabled={false} showsCompass={false}>
        <Polyline coordinates={route} strokeColor={tokens.color.accent} strokeWidth={5} lineCap="round" />
        {props.rings ? (
          <Marker key={`rings-${reduceMotion ? "s" : "a"}`} coordinate={toLatLng(props.pickup)} anchor={{ x: 0.5, y: 0.5 }} tracksViewChanges={!reduceMotion}>
            <FindingRings reduceMotion={reduceMotion} />
          </Marker>
        ) : null}
        <Marker coordinate={toLatLng(props.pickup)} anchor={{ x: 0.5, y: 0.25 }} tracksViewChanges={false}>
          <PinView kind="pickup" label="Pickup" />
        </Marker>
        <Marker coordinate={toLatLng(props.dropoff)} anchor={{ x: 0.5, y: 0.25 }} tracksViewChanges={false}>
          <PinView kind="drop" label="Drop-off" />
        </Marker>
        {props.showRider && props.toPickupLine && rider ? (
          <Polyline coordinates={[toLatLng(rider), toLatLng(props.pickup)]} strokeColor={tokens.color.ink} strokeWidth={3} lineDashPattern={[2, 6]} lineCap="round" />
        ) : null}
        {props.showRider && hasRider && riderRegion.current ? (
          <MarkerAnimated
            // Remount on a label / paused change: tracksViewChanges is off, so a new key repaints the bitmap.
            key={`rider-${props.riderPaused ? "p" : "l"}-${props.riderLabel}`}
            coordinate={riderRegion.current as unknown as LatLng}
            anchor={{ x: 0.5, y: 0.3 }}
            tracksViewChanges={false}
          >
            <RiderMarkerView label={props.riderLabel} paused={props.riderPaused} />
          </MarkerAnimated>
        ) : null}
      </MapView>
      {props.dim ? <View pointerEvents="none" style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0, backgroundColor: "rgba(255,255,255,0.45)" }} /> : null}
    </View>
  );
});

/** The map with no pins — while an order is opening or failed to load (v2 2.1–2.3). */
export function BlankMap(): React.ReactElement {
  return (
    <View style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <MapView style={{ flex: 1 }} initialRegion={HARARE} toolbarEnabled={false} showsCompass={false} />
    </View>
  );
}

