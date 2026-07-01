import { tokens } from "@lynia/shared";
import * as Location from "expo-location";
import React, { useRef, useState } from "react";
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
}

/** Harare CBD — the pilot corridor. The map opens here until a pin is set. */
const HARARE: Region = { latitude: -17.8292, longitude: 31.0522, latitudeDelta: 0.06, longitudeDelta: 0.06 };

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
  const height = props.height ?? 200;

  const initialRegion: Region = props.value
    ? { latitude: props.value.lat, longitude: props.value.lng, latitudeDelta: 0.02, longitudeDelta: 0.02 }
    : HARARE;

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
    props.onChange({ lat: c.latitude, lng: c.longitude });
    reverseGeocode(c);
  };

  const useMyLocation = async (): Promise<void> => {
    setLocating(true);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") return;
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const region: Region = {
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      };
      set(region);
      mapRef.current?.animateToRegion(region, 400);
    } catch {
      /* leave the pin where it is — the user can still tap to place one */
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
      <Text style={{ fontSize: 12, color: tokens.color.muted, marginTop: 4 }}>
        {props.value
          ? `Pinned: ${props.value.lat.toFixed(5)}, ${props.value.lng.toFixed(5)}`
          : "Tap the map to drop a pin, then drag it to adjust."}
      </Text>
    </View>
  );
}
