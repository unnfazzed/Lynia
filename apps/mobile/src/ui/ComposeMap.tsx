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
import { placesEnabled } from "../config";
import { mapFallbackHint } from "../logic/map-fallback";
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
 *
 * B-O2: `React.memo` — this mounts a native MapView, the single most expensive thing on the compose
 * screen, so re-rendering it for every unrelated keystroke elsewhere in the form (item rows, note,
 * declared value) is real waste on Go-class hardware. Holds as long as the caller keeps
 * `pickup`/`drop`/the callback props referentially stable across those unrelated renders (send.tsx's
 * `pickupPoint`/`dropPoint` state and its already-`useCallback`'d reverse-geocode handlers do).
 */
const HARARE: Region = { latitude: -17.8292, longitude: 31.0522, latitudeDelta: 0.06, longitudeDelta: 0.06 };
const LOCATE_TIMEOUT_MS = 9_000;

function withTimeout<T>(p: Promise<T>, ms: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<T>((_, reject) => {
    timer = setTimeout(() => reject(new Error("location-timeout")), ms);
  });
  // Clear the timer on the winning path so a resolved fix doesn't leave a dangling 9s timeout.
  return Promise.race([p, timeout]).finally(() => clearTimeout(timer));
}

function landmarkFrom(r: Location.LocationGeocodedAddress): string {
  return [r.name, r.street, r.district ?? r.city].filter(Boolean).join(", ").trim().slice(0, 120);
}

export type ActiveSlot = "pickup" | "drop";

export const ComposeMap = React.memo(function ComposeMap(props: {
  pickup: PickedPoint | null;
  drop: PickedPoint | null;
  active: ActiveSlot;
  onChangePickup: (p: PickedPoint) => void;
  onChangeDrop: (p: PickedPoint) => void;
  onReverseGeocodePickup?: (landmark: string) => void;
  onReverseGeocodeDrop?: (landmark: string) => void;
  /**
   * Distance (px) from the top of the map to clear the floating brand/account chrome laid over it by
   * the parent. The kit (screens.jsx Home) stacks the "Use my location" pill and the "tap the map" hint
   * just BELOW that top row; with the compose sheet now covering the map's bottom, both must sit in the
   * visible top band rather than bottom-right (where the sheet would hide them).
   */
  topOffset?: number;
}): React.ReactElement {
  const topOffset = props.topOffset ?? tokens.space.md;
  const { pickup, drop, active } = props;
  const mapRef = useRef<MapView>(null);
  const [locating, setLocating] = useState(false);
  const [locateMsg, setLocateMsg] = useState<string | null>(null);
  // Map-load fallback (C1): if the map never signals ready within a few seconds — a missing Google Maps
  // key or blocked tiles leaves a blank grey box — surface a card pointing to the address search / the
  // required-landmark path, so addressing is never a silent dead end.
  const [mapReady, setMapReady] = useState(false);
  const [mapTimedOut, setMapTimedOut] = useState(false);
  useEffect(() => {
    if (mapReady) return;
    const t = setTimeout(() => setMapTimedOut(true), 6_000);
    return () => clearTimeout(t);
  }, [mapReady]);

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
      <MapView
        ref={mapRef}
        style={{ flex: 1 }}
        initialRegion={initialRegion}
        onMapReady={() => setMapReady(true)}
        onPress={(e: MapPressEvent) => setActive(e.nativeEvent.coordinate)}
      >
        {pickup ? (
          <Marker
            identifier="pickup"
            draggable={active === "pickup"}
            coordinate={{ latitude: pickup.lat, longitude: pickup.lng }}
            onDragEnd={(e: MarkerDragStartEndEvent) => setActive(e.nativeEvent.coordinate)}
            pinColor={tokens.color.accent}
            opacity={active === "pickup" ? 1 : 0.7}
          />
        ) : null}
        {drop ? (
          <Marker
            identifier="drop"
            draggable={active === "drop"}
            coordinate={{ latitude: drop.lat, longitude: drop.lng }}
            onDragEnd={(e: MarkerDragStartEndEvent) => setActive(e.nativeEvent.coordinate)}
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

      {/* Floating "use my location" (kit Home screens.jsx:166 — top-right, just below the account
          avatar). The kit offers this for BOTH roles (`AddrSearch`'s onUseLocation handles pickup and
          drop-off alike): a customer standing at the drop-off arranging a collection, or sending to where
          they already are, was previously left with no shortcut at all on that slot. Anchored top-right
          (not bottom) so the compose sheet over the map's lower half can't hide it. */}
      {(
        <Pressable
          onPress={() => void useMyLocation()}
          accessibilityRole="button"
          accessibilityLabel={active === "pickup" ? "Use my current location for pickup" : "Use my current location for drop-off"}
          style={({ pressed }) => ({
            position: "absolute",
            right: tokens.space.md,
            top: topOffset,
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
      )}

      {locateMsg ? (
        <View
          accessibilityRole="alert"
          accessibilityLiveRegion="polite"
          style={{ position: "absolute", left: tokens.space.md, right: tokens.space.md, bottom: 64, backgroundColor: tokens.color.bg, borderRadius: tokens.radius.input, padding: tokens.space.sm, ...tokens.shadow.card }}
        >
          <Text style={{ fontSize: tokens.font.size.caption, color: tokens.color.danger }}>{locateMsg}</Text>
        </View>
      ) : null}

      {/* Pin-discoverability hint: the full-bleed map dropped MapPicker's "tap to drop a pin" caption, so
          a first-time user has no cue the map itself is the input. Show it until the active slot has a pin.
          Styled as the kit's DARK pill (`screens.jsx` Home: ink fill, white label), not the muted-grey-on-
          white it had drifted to — with search absent on an unkeyed build this is the ONLY instruction on
          the screen, and it was rendering as the faintest thing on it. Copy names BOTH inputs when search
          is live, matching the kit's "Search an address, or tap the map to drop a pin." */}
      {mapReady && !activePoint ? (
        <View
          pointerEvents="none"
          style={{ position: "absolute", top: topOffset + 44, alignSelf: "center", maxWidth: "90%", backgroundColor: tokens.color.ink, borderRadius: tokens.radius.pill, paddingHorizontal: tokens.space.md, paddingVertical: tokens.space.sm, ...tokens.shadow.card }}
        >
          {/* Kit Home (screens.jsx:164): a centred dark pill, verbatim copy. The "search an address"
              half of the hint now lives on the AddressHint caption inside the sheet, so this map pill is
              just the pin instruction the mock draws. */}
          <Text style={{ fontSize: tokens.font.size.caption, fontWeight: tokens.font.weight.semibold, color: tokens.color.onAccent, textAlign: "center" }}>
            {`Tap the map to drop your ${active === "pickup" ? "pickup" : "drop-off"} pin`}
          </Text>
        </View>
      ) : null}

      {/* Map-load failure fallback (C1): the manual path (address search above + the required landmark
          field under "Add details") stays usable even when the tiles never render. */}
      {!mapReady && mapTimedOut ? (
        <View
          accessibilityRole="alert"
          style={{ position: "absolute", left: tokens.space.md, right: tokens.space.md, top: tokens.space.md, backgroundColor: tokens.color.bg, borderRadius: tokens.radius.input, padding: tokens.space.md, ...tokens.shadow.card }}
        >
          <Text style={{ fontSize: tokens.font.size.caption, fontWeight: "700", color: tokens.color.ink, marginBottom: 2 }}>Map didn&apos;t load</Text>
          <Text style={{ fontSize: tokens.font.size.caption, color: tokens.color.muted, lineHeight: 16 }}>
            {mapFallbackHint(placesEnabled(), active === "pickup")}
          </Text>
        </View>
      ) : null}
    </View>
  );
});
