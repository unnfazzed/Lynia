import { tokens } from "@lynia/shared";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { AccessibilityInfo, Modal, Pressable, Text, View } from "react-native";
import MapView, { AnimatedRegion, type LatLng, Marker, MarkerAnimated, type Region } from "react-native-maps";

export interface MapPoint {
  lat: number;
  lng: number;
}

/** Harare CBD — fallback region before the map fits to the order's points. */
const HARARE: Region = { latitude: -17.8292, longitude: 31.0522, latitudeDelta: 0.06, longitudeDelta: 0.06 };
/** Deltas the animated rider region keeps — the marker only tracks lat/lng, so these are inert but required. */
const RIDER_DELTA = { latitudeDelta: 0.01, longitudeDelta: 0.01 } as const;
const GLIDE_MS = 900;

const toLatLng = (p: MapPoint): LatLng => ({ latitude: p.lat, longitude: p.lng });

/** Shared style for the pill controls (recenter / expand / close) so they read as one family. */
const controlStyle = (pressed: boolean) =>
  ({
    flexDirection: "row",
    alignItems: "center",
    minWidth: tokens.touchTargetMin,
    minHeight: tokens.touchTargetMin,
    paddingHorizontal: tokens.space.md,
    paddingVertical: tokens.space.sm,
    backgroundColor: tokens.color.bg,
    borderWidth: 1,
    borderColor: tokens.color.line,
    borderRadius: tokens.radius.pill,
    opacity: pressed ? 0.85 : 1,
  }) as const;

/**
 * Read-only tracking map: pickup, drop-off, and (when GPS is flowing) the rider's live position.
 *
 * Smoothness (the core UX win): the camera fits the trip ONCE — on mount and when pickup/dropoff
 * change — so a rider GPS fix no longer re-frames/pans the map out from under the user. The rider
 * marker instead *glides* between fixes via an AnimatedRegion (native driver isn't supported for
 * region animation, so `useNativeDriver: false`). Reduce-motion snaps instead of gliding. A
 * bottom-right "Recenter" control re-fits pickup/dropoff/rider on demand. When reconnecting, the
 * rider marker de-saturates so a stale position reads as "paused, not gone". A top-right "Expand"
 * control opens the same map fullscreen in a Modal.
 *
 * Needs the dev build + a Google Maps key on Android (Apple Maps on iOS); same gating as MapPicker.
 */
export function LiveMap(props: {
  pickup: MapPoint;
  dropoff: MapPoint;
  rider: MapPoint | null;
  connectionState?: "live" | "reconnecting";
  /** Inline map height in px (default 240). The fullscreen Modal always fills the screen. */
  height?: number;
}): React.ReactElement {
  const mapRef = useRef<MapView>(null);
  const expandedMapRef = useRef<MapView>(null);
  const connectionState = props.connectionState ?? "live";
  const height = props.height ?? 240;

  const [expanded, setExpanded] = useState(false);

  // Lazily created from the first rider fix — before that there's nothing to animate.
  const riderRegion = useRef<AnimatedRegion | null>(null);
  const [hasRider, setHasRider] = useState(false);

  // Reduce-motion: read once; when on, snap the marker to each fix instead of gliding.
  const [reduceMotion, setReduceMotion] = useState(false);
  useEffect(() => {
    let cancelled = false;
    void AccessibilityInfo.isReduceMotionEnabled().then((on) => {
      if (!cancelled) setReduceMotion(on);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const fitRef = useCallback(
    (ref: React.RefObject<MapView>): void => {
      const coords: LatLng[] = [
        toLatLng(props.pickup),
        toLatLng(props.dropoff),
        ...(props.rider ? [toLatLng(props.rider)] : []),
      ];
      ref.current?.fitToCoordinates(coords, {
        edgePadding: { top: 48, right: 48, bottom: 48, left: 48 },
        animated: true,
      });
      // eslint-disable-next-line react-hooks/exhaustive-deps -- fit is intentionally rider-agnostic; see below.
    },
    [props.pickup.lat, props.pickup.lng, props.dropoff.lat, props.dropoff.lng],
  );

  const fitTrip = useCallback((): void => fitRef(mapRef), [fitRef]);
  const fitExpanded = useCallback((): void => fitRef(expandedMapRef), [fitRef]);

  // Fit ONCE on mount and when pickup/dropoff change. Rider coords are deliberately NOT deps — a GPS
  // fix must not re-frame the map ("camera fights the user"). The Recenter button reframes on demand.
  useEffect(() => {
    fitTrip();
  }, [fitTrip]);

  // Glide (or snap) the rider marker to each new fix.
  const { rider } = props;
  const riderLat = rider?.lat;
  const riderLng = rider?.lng;
  useEffect(() => {
    if (riderLat == null || riderLng == null) return;
    const next: Region = { latitude: riderLat, longitude: riderLng, ...RIDER_DELTA };
    if (!riderRegion.current) {
      riderRegion.current = new AnimatedRegion(next);
      setHasRider(true);
      return; // first fix positions the marker; nothing to animate from
    }
    if (reduceMotion) {
      riderRegion.current.setValue(next);
    } else {
      // AnimatedRegion.timing animates the region fields directly; the `toValue` the shared
      // TimingAnimationConfig type demands is unused at runtime, hence the cast.
      riderRegion.current
        .timing({ ...next, duration: GLIDE_MS, useNativeDriver: false } as Parameters<AnimatedRegion["timing"]>[0])
        .start();
    }
  }, [riderLat, riderLng, reduceMotion]);

  const riderMuted = connectionState === "reconnecting";

  // The markers are identical in both the inline and fullscreen maps.
  const markers = (
    <>
      <Marker coordinate={toLatLng(props.pickup)} title="Pickup" pinColor={tokens.color.accent} />
      <Marker coordinate={toLatLng(props.dropoff)} title="Drop-off" pinColor={tokens.color.danger} />
      {hasRider && riderRegion.current ? (
        <MarkerAnimated
          coordinate={riderRegion.current as unknown as LatLng}
          title="Rider"
          pinColor={tokens.color.highlight}
          opacity={riderMuted ? 0.5 : 1}
        />
      ) : null}
    </>
  );

  const openExpanded = (): void => setExpanded(true);
  const closeExpanded = (): void => {
    setExpanded(false);
    // Re-fit the inline map so it frames the trip again after the modal closes.
    requestAnimationFrame(fitTrip);
  };

  return (
    <View
      style={{
        height,
        borderRadius: tokens.radius.input,
        overflow: "hidden",
        borderWidth: 1,
        borderColor: tokens.color.line,
        marginBottom: tokens.space.sm,
      }}
    >
      <MapView ref={mapRef} style={{ flex: 1 }} initialRegion={HARARE}>
        {markers}
      </MapView>

      <Pressable
        onPress={openExpanded}
        accessibilityRole="button"
        accessibilityLabel="Expand map to fullscreen"
        style={({ pressed }) => ({
          position: "absolute",
          right: tokens.space.sm,
          top: tokens.space.sm,
          ...controlStyle(pressed),
        })}
      >
        <Text style={{ fontSize: 14 }}>⤢</Text>
        <Text style={{ marginLeft: 6, fontSize: 13, fontWeight: "700", color: tokens.color.ink }}>Expand</Text>
      </Pressable>

      <Pressable
        onPress={fitTrip}
        accessibilityRole="button"
        accessibilityLabel="Recenter map on the trip"
        style={({ pressed }) => ({
          position: "absolute",
          right: tokens.space.sm,
          bottom: tokens.space.sm,
          ...controlStyle(pressed),
        })}
      >
        <Text style={{ fontSize: 14 }}>◎</Text>
        <Text style={{ marginLeft: 6, fontSize: 13, fontWeight: "700", color: tokens.color.ink }}>Recenter</Text>
      </Pressable>

      <Modal
        visible={expanded}
        animationType={reduceMotion ? "none" : "slide"}
        onRequestClose={closeExpanded}
        // Re-fit once the fullscreen map has mounted and laid out.
        onShow={() => requestAnimationFrame(fitExpanded)}
      >
        <View style={{ flex: 1, backgroundColor: tokens.color.bg }}>
          <MapView ref={expandedMapRef} style={{ flex: 1 }} initialRegion={HARARE}>
            {markers}
          </MapView>

          <Pressable
            onPress={closeExpanded}
            accessibilityRole="button"
            accessibilityLabel="Close fullscreen map"
            style={({ pressed }) => ({
              position: "absolute",
              right: tokens.space.lg,
              top: tokens.space.xxl,
              ...controlStyle(pressed),
            })}
          >
            <Text style={{ fontSize: 14 }}>✕</Text>
            <Text style={{ marginLeft: 6, fontSize: 13, fontWeight: "700", color: tokens.color.ink }}>Close</Text>
          </Pressable>

          <Pressable
            onPress={fitExpanded}
            accessibilityRole="button"
            accessibilityLabel="Recenter map on the trip"
            style={({ pressed }) => ({
              position: "absolute",
              right: tokens.space.lg,
              bottom: tokens.space.xxl,
              ...controlStyle(pressed),
            })}
          >
            <Text style={{ fontSize: 14 }}>◎</Text>
            <Text style={{ marginLeft: 6, fontSize: 13, fontWeight: "700", color: tokens.color.ink }}>Recenter</Text>
          </Pressable>
        </View>
      </Modal>
    </View>
  );
}
