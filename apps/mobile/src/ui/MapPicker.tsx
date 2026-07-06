import { tokens } from "@lynia/shared";
import * as Location from "expo-location";
import React, { useEffect, useRef, useState } from "react";
import { Text, View } from "react-native";
import MapView, {
  type LatLng,
  type MapPressEvent,
  Marker,
  type MarkerDragStartEndEvent,
  type Region,
} from "react-native-maps";
import { Button, Label } from "./index";

export interface PickedPoint {
  lat: number;
  lng: number;
  /** Google Places place_id when the point came from address search (§1·2). Absent for a pin-on-map
   *  point — and a subsequent tap/drag re-emits WITHOUT it, correctly invalidating a stale place. */
  placeId?: string;
}

/** Harare CBD — the pilot corridor. The map opens here until a pin is set. */
const HARARE: Region = { latitude: -17.8292, longitude: 31.0522, latitudeDelta: 0.06, longitudeDelta: 0.06 };

// GPS fix bound (C9): every REST call is capped at 15s, but `getCurrentPositionAsync` has no timeout of
// its own and a cold fix can hang forever. Race it against this and fall back to the tap-the-map hint.
const LOCATE_TIMEOUT_MS = 9_000;
/** Reject if `p` doesn't settle within `ms` — used to bound the GPS fix so "Locating…" can't hang. */
function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  return Promise.race([
    p,
    new Promise<T>((_, reject) => setTimeout(() => reject(new Error("location-timeout")), ms)),
  ]);
}

/**
 * Tap-to-pin location picker (DESIGN.md D-b: map-anchored). Tap the map to drop a pin, drag the pin to
 * fine-tune, or center on the device's GPS. Controlled: it owns no coordinate state, only emits the
 * chosen point so the parent keeps it in the order form. Needs the dev build + a Google Maps key on
 * Android (Apple Maps on iOS needs none) — see app.config.ts / PILOT-READINESS.
 */
/** Build a short landmark string from a reverse-geocode result — the most human parts, capped. */
function landmarkFrom(r: Location.LocationGeocodedAddress): string {
  return [r.name, r.street, r.district ?? r.city]
    .filter(Boolean)
    .join(", ")
    .trim()
    .slice(0, 120);
}

export function MapPicker(props: {
  label: string;
  value: PickedPoint | null;
  onChange: (p: PickedPoint) => void;
  /** Show a "use my location" button (pickup only — the recipient isn't standing at the drop-off). */
  showMyLocation?: boolean;
  /** Emitted (best-effort) once a pin is placed/moved and reverse-geocoding yields a landmark. */
  onReverseGeocode?: (landmark: string) => void;
  /** Map box height in px (default 200) so the create flow can render more compact pins. */
  height?: number;
}): React.ReactElement {
  const mapRef = useRef<MapView>(null);
  const [locating, setLocating] = useState(false);
  // C8/C9: a one-line reason shown when "Use my location" can't produce a fix (permission denied or a
  // timed-out GPS lookup) — otherwise the button just flickers "Locating…" and goes silent.
  const [locateMsg, setLocateMsg] = useState<string | null>(null);
  const height = props.height ?? 200;

  const initialRegion: Region = props.value
    ? { latitude: props.value.lat, longitude: props.value.lng, latitudeDelta: 0.02, longitudeDelta: 0.02 }
    : HARARE;

  // Recenter when the value jumps to a new place (address search sets a far-away point). `initialRegion`
  // only positions the map on mount, so without this the pin would land off-screen after a search. We
  // skip near-identical updates (a tap/drag lands on ~the same spot) so we don't fight the user's pin.
  const { value } = props;
  const centered = useRef<PickedPoint | null>(value ?? null);
  useEffect(() => {
    if (!value) return;
    const prev = centered.current;
    const moved = !prev || Math.abs(prev.lat - value.lat) > 1e-4 || Math.abs(prev.lng - value.lng) > 1e-4;
    if (!moved) return;
    centered.current = value;
    mapRef.current?.animateToRegion(
      { latitude: value.lat, longitude: value.lng, latitudeDelta: 0.02, longitudeDelta: 0.02 },
      400,
    );
  }, [value]);

  // Best-effort reverse geocode on final placement only (not per drag frame). Geocoding can fail
  // offline — on failure we do nothing and leave the field as the user left it.
  const { onReverseGeocode } = props;
  const reverseGeocode = (c: LatLng): void => {
    if (!onReverseGeocode) return;
    void (async () => {
      try {
        const results = await Location.reverseGeocodeAsync({ latitude: c.latitude, longitude: c.longitude });
        const first = results[0];
        if (!first) return;
        const landmark = landmarkFrom(first);
        if (landmark) onReverseGeocode(landmark);
      } catch {
        /* offline / no geocoder — leave the field untouched */
      }
    })();
  };

  const set = (c: LatLng): void => {
    setLocateMsg(null); // a placed pin resolves the "couldn't locate" hint
    props.onChange({ lat: c.latitude, lng: c.longitude });
    reverseGeocode(c);
  };

  const useMyLocation = async (): Promise<void> => {
    setLocating(true);
    setLocateMsg(null);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        // C8: don't fail silently — point the user at the map / Settings.
        setLocateMsg("Location is off — tap the map to drop your pin, or turn on location in Settings.");
        return;
      }
      // C9: bound the fix so "Locating…" can't hang; a timeout falls through to the catch below.
      const loc = await withTimeout(
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced }),
        LOCATE_TIMEOUT_MS,
      );
      const region: Region = {
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      };
      set(region);
      mapRef.current?.animateToRegion(region, 400);
    } catch {
      // Denied-after-prompt, no GPS, or the timeout — leave any existing pin and point them at the map.
      setLocateMsg("Couldn't get your location — tap the map to drop your pin.");
    } finally {
      setLocating(false);
    }
  };

  return (
    <View style={{ marginBottom: tokens.space.md }}>
      <Label>{props.label}</Label>
      <View
        style={{
          height,
          borderRadius: tokens.radius.input,
          overflow: "hidden",
          borderWidth: 1,
          borderColor: tokens.color.line,
        }}
      >
        <MapView
          ref={mapRef}
          style={{ flex: 1 }}
          initialRegion={initialRegion}
          onPress={(e: MapPressEvent) => set(e.nativeEvent.coordinate)}
        >
          {props.value ? (
            <Marker
              draggable
              coordinate={{ latitude: props.value.lat, longitude: props.value.lng }}
              onDragEnd={(e: MarkerDragStartEndEvent) => set(e.nativeEvent.coordinate)}
              pinColor={tokens.color.accent}
            />
          ) : null}
        </MapView>
      </View>
      {props.showMyLocation ? (
        <Button
          label={locating ? "Locating…" : "Use my location"}
          variant="ghost"
          onPress={() => void useMyLocation()}
          loading={locating}
        />
      ) : null}
      {locateMsg ? (
        <Text style={{ fontSize: tokens.font.size.caption, color: tokens.color.danger, marginTop: tokens.space.xs }}>{locateMsg}</Text>
      ) : null}
      <Text style={{ fontSize: tokens.font.size.caption, color: tokens.color.muted, marginTop: tokens.space.xs }}>
        {props.value
          ? `Pinned: ${props.value.lat.toFixed(5)}, ${props.value.lng.toFixed(5)}`
          : "Tap the map to drop a pin, then drag it to adjust."}
      </Text>
    </View>
  );
}
