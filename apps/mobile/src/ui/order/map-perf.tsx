import { tokens } from "@lynia/shared/tokens";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Easing, InteractionManager, Platform, View } from "react-native";
import { AnimatedRegion, type LatLng, type MapMarker, Marker, MarkerAnimated, type Point, type Region } from "react-native-maps";
import type { MapPoint } from "../LiveMap";

/**
 * Shared performance seams for the two order maps (`OrderMap`, `MerchantMap`). None of them changes
 * what is drawn; they change WHEN the native map is created and WHICH thread moves the rider.
 */

/** A GPS fix glides the rider marker over this long (snap under reduce motion). */
export const GLIDE_MS = 800;
const RIDER_DELTA = { latitudeDelta: 0.01, longitudeDelta: 0.01 } as const;
const toLatLng = (p: MapPoint): LatLng => ({ latitude: p.lat, longitude: p.lng });

/**
 * P12 (customer review 2026-10-07): the order screens are pushed routes, and their first commit used to
 * create a Google MapView inside the push animation (~100–300 ms of UI-thread work on a Go-class phone).
 * The native map now mounts one interaction late — ComposeMap's PERF-SEND-01 seam — over the map's own
 * ground colour, so the push animates first and the map follows a frame or two behind.
 */
export function useDeferredMapMount(): boolean {
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    const handle = InteractionManager.runAfterInteractions(() => setMounted(true));
    return () => handle.cancel();
  }, []);
  return mounted;
}

/** The pre-mount canvas: the map's ground colour with nothing drawn on it (ComposeMap's placeholder). */
export function MapGround(): React.ReactElement {
  return <View testID="map-ground" style={{ flex: 1, backgroundColor: tokens.color.surface }} />;
}

/** Android only: `animateMarkerToCoordinate` is an Android command in react-native-maps 1.20 (iOS and the web shim lack it). */
const nativeGlide = (): boolean => Platform.OS === "android";

/**
 * The rider marker, gliding to each new fix. P37: on Android the glide is the native marker animation
 * (`animateMarkerToCoordinate`, zero JS frames) instead of an `AnimatedRegion` timing that computed ~48
 * frames on the JS thread per fix; iOS and web keep the `AnimatedRegion` path. Appears with the first fix
 * and stays at the last one if the fix is lost. `markerKey` remounts it (the bitmap repaint for a new
 * label / paused look, `tracksViewChanges` being off); a remount starts at the latest fix.
 */
export function GlidingMarker({
  point,
  markerKey,
  anchor,
  reduceMotion,
  children,
}: {
  point: MapPoint | null;
  markerKey: string;
  anchor: { x: number; y: number };
  reduceMotion: boolean;
  children: React.ReactNode;
}): React.ReactElement | null {
  const lat = point?.lat;
  const lng = point?.lng;
  const last = useRef<LatLng | null>(null);
  const [seen, setSeen] = useState(false);
  const region = useRef<AnimatedRegion | null>(null);
  const marker = useRef<MapMarker | null>(null);
  const NATIVE_GLIDE = nativeGlide();

  useEffect(() => {
    if (lat == null || lng == null) return;
    const next: LatLng = { latitude: lat, longitude: lng };
    const first = last.current == null;
    last.current = next;
    if (first) {
      if (!NATIVE_GLIDE) region.current = new AnimatedRegion({ ...next, ...RIDER_DELTA } as Region);
      setSeen(true);
      return;
    }
    if (NATIVE_GLIDE) {
      if (!reduceMotion) marker.current?.animateMarkerToCoordinate(next, GLIDE_MS);
      return;
    }
    const r: Region = { ...next, ...RIDER_DELTA };
    if (reduceMotion) region.current?.setValue(r);
    else region.current?.timing({ ...r, duration: GLIDE_MS, easing: Easing.linear, useNativeDriver: false } as Parameters<AnimatedRegion["timing"]>[0]).start();
  }, [lat, lng, reduceMotion]);

  // The coordinate the native marker is MOUNTED at: the latest fix when it (re)mounts, then left alone so
  // the native glide owns the position. Under reduce motion every fix is a plain coordinate (a snap) —
  // read from this render's point: `last` only catches up in the effect, after the render.
  // eslint-disable-next-line react-hooks/exhaustive-deps -- re-read only on a remount (or leaving reduce motion)
  const glideFrom = useMemo(() => last.current, [markerKey, seen, reduceMotion]);
  const snapTo = useMemo<LatLng | null>(() => (lat != null && lng != null ? { latitude: lat, longitude: lng } : null), [lat, lng]);
  const mountedAt = reduceMotion ? (snapTo ?? glideFrom) : glideFrom;

  if (!seen) return null;
  if (NATIVE_GLIDE) {
    return mountedAt ? (
      <Marker key={markerKey} ref={marker} coordinate={mountedAt} anchor={anchor} tracksViewChanges={false}>
        {children}
      </Marker>
    ) : null;
  }
  return region.current ? (
    <MarkerAnimated key={markerKey} coordinate={region.current as unknown as LatLng} anchor={anchor} tracksViewChanges={false}>
      {children}
    </MarkerAnimated>
  ) : null;
}

/** Native maps only: on web the shim's markers are DOM nodes, so a ticking marker view costs nothing. */
export const RINGS_AS_OVERLAY = Platform.OS !== "web";

/**
 * P20: where the finding rings' centre sits on screen, for drawing them as a plain view OVER the map
 * (the mock draws them above the pins, `as-kit.jsx` AMap) instead of inside a `tracksViewChanges` marker,
 * which react-native-maps re-rasterised and re-uploaded about 25 times a second for the whole auction.
 * Returns the projected point (null until the map has projected it) and a `reproject` to call when the
 * camera moves.
 */
export function useProjectedPoint(
  map: React.RefObject<{ pointForCoordinate: (c: LatLng) => Promise<Point> } | null>,
  at: MapPoint | null,
  on: boolean,
): { point: Point | null; reproject: () => void } {
  const [point, setPoint] = useState<Point | null>(null);
  const lat = at?.lat;
  const lng = at?.lng;
  const seq = useRef(0);
  const reproject = useMemo(
    () => (): void => {
      if (!on || lat == null || lng == null || !map.current) return;
      const n = ++seq.current;
      map.current
        .pointForCoordinate(toLatLng({ lat, lng }))
        .then((p) => {
          if (n !== seq.current) return;
          setPoint((cur) => (cur && Math.abs(cur.x - p.x) < 0.5 && Math.abs(cur.y - p.y) < 0.5 ? cur : p));
        })
        .catch(() => undefined);
    },
    [map, on, lat, lng],
  );
  useEffect(() => {
    if (!on) setPoint(null);
    else reproject();
  }, [on, reproject]);
  return { point, reproject };
}
