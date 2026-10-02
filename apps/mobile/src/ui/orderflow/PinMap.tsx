import { tokens } from "@lynia/shared/tokens";
import * as Location from "expo-location";
import React, { useEffect, useRef } from "react";
import { View } from "react-native";
import MapView, { type Region } from "react-native-maps";
import { landmarkFromAddress } from "../../logic/geocode";
import { withTimeout } from "../../util";

/**
 * R3a's map (Order flow v2, D-59): a 200px r12 map with the red drop square fixed at its centre —
 * "Drag the map to put the pin on your gate". The point under the square is the drop; when the map
 * settles it is emitted, then named by a best-effort reverse geocode (offline leaves the name alone).
 */
const HARARE = { latitude: -17.8292, longitude: 31.0522 };
const DELTA = 0.012;
const GEOCODE_TIMEOUT_MS = 9_000;

export function PinMap({
  value,
  onMove,
  onName,
}: {
  value: { lat: number; lng: number } | null;
  onMove: (p: { lat: number; lng: number }) => void;
  onName: (p: { lat: number; lng: number }, name: string) => void;
}): React.ReactElement {
  const ref = useRef<MapView>(null);
  // The last point this map emitted or was moved to — a parent echo of it must not re-animate.
  const last = useRef(value);

  useEffect(() => {
    if (!value) return;
    const prev = last.current;
    if (prev && Math.abs(prev.lat - value.lat) < 1e-5 && Math.abs(prev.lng - value.lng) < 1e-5) return;
    last.current = value;
    ref.current?.animateToRegion({ latitude: value.lat, longitude: value.lng, latitudeDelta: DELTA, longitudeDelta: DELTA }, 300);
  }, [value]);

  const settle = (r: Region): void => {
    const p = { lat: r.latitude, lng: r.longitude };
    const prev = last.current;
    if (prev && Math.abs(prev.lat - p.lat) < 1e-5 && Math.abs(prev.lng - p.lng) < 1e-5) return;
    last.current = p;
    onMove(p);
    void withTimeout(Location.reverseGeocodeAsync({ latitude: p.lat, longitude: p.lng }), GEOCODE_TIMEOUT_MS)
      .then((res) => {
        const name = res[0] ? landmarkFromAddress(res[0]) : "";
        if (name) onName(p, name);
      })
      .catch(() => undefined);
  };

  const start = value ?? { lat: HARARE.latitude, lng: HARARE.longitude };
  return (
    <View style={{ height: 200, borderRadius: 12, overflow: "hidden", backgroundColor: tokens.color.surface }}>
      <MapView
        ref={ref}
        style={{ flex: 1 }}
        initialRegion={{ latitude: start.lat, longitude: start.lng, latitudeDelta: DELTA, longitudeDelta: DELTA }}
        onRegionChangeComplete={settle}
        toolbarEnabled={false}
        accessibilityLabel="Map. Drag it to put the pin on your gate."
      />
      <View
        pointerEvents="none"
        style={{ position: "absolute", left: "50%", top: "46%", width: 34, height: 34, marginLeft: -17, marginTop: -17, borderRadius: 10, backgroundColor: tokens.color.dangerWash, alignItems: "center", justifyContent: "center" }}
      >
        <View style={{ width: 22, height: 22, borderRadius: 4, backgroundColor: tokens.color.danger }} />
      </View>
    </View>
  );
}
