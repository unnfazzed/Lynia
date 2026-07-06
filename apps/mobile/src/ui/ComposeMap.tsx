import { tokens } from "@lynia/shared";
import * as Location from "expo-location";
import React, { useEffect, useRef, useState } from "react";
import { Pressable, Text, View } from "react-native";
import MapView, {
  type LatLng,
  type MapPressEvent,
  Marker,
  type MarkerDragStartEndEvent,
  Polyline,
  type Region,
} from "react-native-maps";
import type { PickedPoint } from "./MapPicker";
import { Icon } from "./index";

/**
 * The full-bleed compose map (customer-journey 1·1). A single map that carries BOTH addresses at once:
 * the pickup (green) and drop-off (red) markers plus the route line between them, so the customer sees
 * the whole trip. Tapping the map — or dragging a marker — sets whichever pin is ACTIVE (chosen by the
 * address rows above); the active marker is draggable and slightly larger, the other stays as a static
 * reference. Controlled: owns no coordinate state, only emits the chosen point for the active slot.
 *
 * Split from MapPicker (the compact single-pin picker still used elsewhere) so this can go edge-to-edge
 * behind the floating chrome without the picker's bordered box + caption.
 */
const HARARE: Region = { latitude: -17.8292, longitude: 31.0522, latitudeDelta: 0.06, longitudeDelta: 0.06 };
const LOCATE_TIMEOUT_MS = 9_000;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([p, new Promise<T>((_, reject) => setTimeout(() => reject(new Error("location-timeout")), ms))]);
}

function landmarkFrom(r: Location.LocationGeocodedAddress): string {
  return [r.name, r.street, r.district ?? r.city].filter(Boolean).join(", ").trim().slice(0, 120);
}

export type ActiveSlot = "pickup" | "drop";

export function ComposeMap(props: {
  pickup: PickedPoint | null;
  drop: PickedPoint | null;
  active: ActiveSlot;
  onChangePickup: (p: PickedPoint) => void;
  onChangeDrop: (p: PickedPoint) => void;
  onReverseGeocodePickup?: (landmark: string) => void;
  onReverseGeocodeDrop?: (landmark: string) => void;
}): React.ReactElement {
  const { pickup, drop, active } = props;
  const mapRef = useRef<MapView>(null);
  const [locating, setLocating] = useState(false);
  const [locateMsg, setLocateMsg] = useState<string | null>(null);

  const activePoint = active === "pickup" ? pickup : drop;
  const setActive = (c: LatLng): void => {
    setLocateMsg(null);
    const point: PickedPoint = { lat: c.latitude, lng: c.longitude };
    if (active === "pickup") props.onChangePickup(point);
    else props.onChangeDrop(point);
    reverseGeocode(c);
  };

  const reverseGeocode = (c: LatLng): void => {
    const cb = active === "pickup" ? props.onReverseGeocodePickup : props.onReverseGeocodeDrop;
    if (!cb) return;
    void (async () => {
      try {
        const results = await Location.reverseGeocodeAsync({ latitude: c.latitude, longitude: c.longitude });
        const first = results[0];
        if (!first) return;
        const landmark = landmarkFrom(first);
        if (landmark) cb(landmark);
      } catch {
        /* offline / no geocoder — leave the field untouched */
      }
    })();
  };

  // Keep the camera useful: frame BOTH pins once both exist, else centre the one that's set. Runs when
  // either point moves or the active slot changes (so switching slots recentres on the pin you're editing).
  const key = `${pickup?.lat},${pickup?.lng}|${drop?.lat},${drop?.lng}|${active}`;
  const lastKey = useRef<string>("");
  useEffect(() => {
    if (key === lastKey.current) return;
    lastKey.current = key;
    const map = mapRef.current;
    if (!map) return;
    if (pickup && drop) {
      map.fitToCoordinates(
        [
          { latitude: pickup.lat, longitude: pickup.lng },
          { latitude: drop.lat, longitude: drop.lng },
        ],
        { edgePadding: { top: 120, right: 80, bottom: 120, left: 80 }, animated: true },
      );
    } else if (activePoint) {
      map.animateToRegion(
        { latitude: activePoint.lat, longitude: activePoint.lng, latitudeDelta: 0.02, longitudeDelta: 0.02 },
        400,
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on a stable string of the coords + active slot.
  }, [key]);

  const useMyLocation = async (): Promise<void> => {
    setLocating(true);
    setLocateMsg(null);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setLocateMsg("Location is off — tap the map to drop your pin, or turn it on in Settings.");
        return;
      }
      const loc = await withTimeout(
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
        LOCATE_TIMEOUT_MS,
      );
      const c: LatLng = { latitude: loc.coords.latitude, longitude: loc.coords.longitude };
      setActive(c);
      mapRef.current?.animateToRegion({ ...c, latitudeDelta: 0.02, longitudeDelta: 0.02 }, 400);
    } catch {
      setLocateMsg("Couldn't get your location — tap the map to drop your pin.");
    } finally {
      setLocating(false);
    }
  };

  const initialRegion: Region = pickup
    ? { latitude: pickup.lat, longitude: pickup.lng, latitudeDelta: 0.04, longitudeDelta: 0.04 }
    : HARARE;

  return (
    <View style={{ flex: 1 }}>
      <MapView ref={mapRef} style={{ flex: 1 }} initialRegion={initialRegion} onPress={(e: MapPressEvent) => setActive(e.nativeEvent.coordinate)}>
        {pickup ? (
          <Marker
            identifier="pickup"
            draggable={active === "pickup"}
            coordinate={{ latitude: pickup.lat, longitude: pickup.lng }}
            onDragEnd={(e: MarkerDragStartEndEvent) => props.onChangePickup({ lat: e.nativeEvent.coordinate.latitude, lng: e.nativeEvent.coordinate.longitude })}
            pinColor={tokens.color.accent}
            opacity={active === "pickup" ? 1 : 0.7}
          />
        ) : null}
        {drop ? (
          <Marker
            identifier="drop"
            draggable={active === "drop"}
            coordinate={{ latitude: drop.lat, longitude: drop.lng }}
            onDragEnd={(e: MarkerDragStartEndEvent) => props.onChangeDrop({ lat: e.nativeEvent.coordinate.latitude, lng: e.nativeEvent.coordinate.longitude })}
            pinColor={tokens.color.danger}
            opacity={active === "drop" ? 1 : 0.7}
          />
        ) : null}
        {pickup && drop ? (
          <Polyline
            coordinates={[
              { latitude: pickup.lat, longitude: pickup.lng },
              { latitude: drop.lat, longitude: drop.lng },
            ]}
            strokeColor={tokens.color.accentText}
            strokeWidth={3}
          />
        ) : null}
      </MapView>

      {/* Floating "use my location" — only meaningful for the pickup (the recipient isn't standing at
          the drop-off). Bottom-right, clear of the address chrome up top. */}
      {active === "pickup" ? (
        <Pressable
          onPress={() => void useMyLocation()}
          accessibilityRole="button"
          accessibilityLabel="Use my current location for pickup"
          style={({ pressed }) => ({
            position: "absolute",
            right: tokens.space.md,
            bottom: tokens.space.md,
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            backgroundColor: tokens.color.bg,
            borderRadius: tokens.radius.pill,
            paddingHorizontal: 12,
            paddingVertical: 8,
            opacity: pressed ? 0.7 : 1,
            ...tokens.shadow.card,
          })}
        >
          <Icon name="navigation" size={16} color={tokens.color.accentText} />
          <Text style={{ fontSize: 12, fontWeight: "700", color: tokens.color.accentText }}>{locating ? "Locating…" : "Use my location"}</Text>
        </Pressable>
      ) : null}

      {locateMsg ? (
        <View style={{ position: "absolute", left: tokens.space.md, right: tokens.space.md, bottom: 64, backgroundColor: tokens.color.bg, borderRadius: tokens.radius.input, padding: tokens.space.sm, ...tokens.shadow.card }}>
          <Text style={{ fontSize: tokens.font.size.caption, color: tokens.color.danger }}>{locateMsg}</Text>
        </View>
      ) : null}
    </View>
  );
}
