import { tokens } from "@lynia/shared/tokens";
import * as Location from "expo-location";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { InteractionManager, Pressable, Text, View } from "react-native";
import MapView, {
  type LatLng,
  type MapPressEvent,
  Marker,
  type MarkerDragStartEndEvent,
  Polyline,
  type Region,
} from "react-native-maps";
import { mapFallbackHint } from "../logic/map-fallback";
import { captureException } from "../telemetry/sentry";
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
/** How long tiles get to render before the screen admits the map didn't load. See the state below. */
const MAP_LOAD_TIMEOUT_MS = 9_000;

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
  // Map-load fallback (C1 / kit `LJ.map_failed`). The signal here is `onMapLoaded` — "the map finished
  // rendering all tiles" — NOT `onMapReady`.
  //
  // That distinction is the whole fix. `onMapReady` fires when the native view has a `GoogleMap`
  // object, which it does even when the Maps SDK rejects the API key: an unrestricted-package /
  // wrong-SHA-1 / billing-disabled key produces an authorization failure whose only symptom is that
  // tiles never draw. Keyed on `onMapReady`, this fallback therefore stayed silent through exactly the
  // failure that was reported — a blank grey canvas under a "tap the map to drop your pin" hint, with
  // the pin tap doing nothing and no explanation on screen. `onMapLoaded` is Android-supported
  // (react-native-maps 1.18 `MapView.d.ts`) and does not fire in that state.
  const [mapReady, setMapReady] = useState(false);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapTimedOut, setMapTimedOut] = useState(false);
  // PERF-SEND-01: the native MapView is mounted ONE INTERACTION LATE, not in the screen's first commit.
  //
  // `/send` is a pushed route, so its first commit runs inside React Navigation's push transition —
  // and that commit used to inflate a Google `MapView`, which initialises the Maps SDK on the UI
  // thread. The whole screen (sheet, address rows, item/phone/price fields, CTA) was therefore held
  // behind the single most expensive mount in the app: tapping "Send" sat on the launcher for a beat,
  // then landed on a janky transition. Nothing on the critical path needs the map to exist — the
  // composer's own controls are all inside the sheet — so the map now mounts after the transition
  // settles and the form is interactive from the first frame. `runAfterInteractions` (the same
  // deferral seam analytics.tsx uses) fires as soon as the push animation completes, so on a warm
  // screen the map is only a frame or two behind and the customer never sees the placeholder linger.
  const [mapMounted, setMapMounted] = useState(false);
  useEffect(() => {
    const handle = InteractionManager.runAfterInteractions(() => setMapMounted(true));
    return () => handle.cancel();
  }, []);
  // Remount nonce for "Retry the map" — bumping it gives MapView a new key, which is the only way to
  // re-attempt the native map's own initialisation (a transient tile/auth failure is otherwise
  // permanent for the life of the screen, and this screen lives for a whole compose session).
  const [mapNonce, setMapNonce] = useState(0);
  useEffect(() => {
    // The clock starts when the MAP does, not when the screen does — the deferral above must not eat
    // into the tile budget and turn a merely slow map into a "didn't load" card.
    if (!mapMounted || mapLoaded) return;
    // Longer than the old 6s: tiles on a constrained link are legitimately slow, and the card now
    // clears itself the moment they arrive, so erring late costs nothing while erring early would
    // accuse a working map. Both `mapLoaded` and `mapNonce` are inputs so a retry restarts the clock.
    const t = setTimeout(() => setMapTimedOut(true), MAP_LOAD_TIMEOUT_MS);
    return () => clearTimeout(t);
  }, [mapMounted, mapLoaded, mapNonce]);
  // Report it once per mount. A blank map is invisible to every existing signal — the previous
  // occurrence had to be diagnosed from a user's description — so this is the difference between
  // "somebody said the map was blank" and a dated, versioned event with a device attached.
  const reported = useRef(false);
  const mapFailed = !mapLoaded && mapTimedOut;
  useEffect(() => {
    if (!mapFailed || reported.current) return;
    reported.current = true;
    captureException(new Error(`compose-map-not-loaded (onMapReady=${mapReady})`));
  }, [mapFailed, mapReady]);

  const retryMap = useCallback((): void => {
    setMapReady(false);
    setMapLoaded(false);
    setMapTimedOut(false);
    setMapNonce((n) => n + 1);
  }, []);

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
    // Null-check BEFORE burning the key, and re-run when the deferred map arrives: a re-broadcast
    // prefills both pins at mount, which is exactly when `mapRef` is still empty. Marking that pass as
    // "done" would leave the framing permanently unapplied and the customer looking at a two-pin route
    // framed on whatever `initialRegion` happened to be.
    const map = mapRef.current;
    if (!map) return;
    if (key === lastKey.current) return;
    lastKey.current = key;
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
  }, [key, mapMounted]);

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
      {/* The pre-mount canvas (see `mapMounted`). The map's ground colour, nothing drawn on it: this is
          the same neutral field the tiles themselves fade in over, so the deferral reads as the map
          loading rather than as a missing element. It carries no copy — a hint here would contradict
          the `mapLoaded`-gated pin hint that takes this space a moment later. */}
      {!mapMounted ? <View style={{ flex: 1, backgroundColor: tokens.color.surface }} /> : null}
      {mapMounted ? (
      <MapView
        // `key` is the retry mechanism: a new nonce unmounts the failed native map and mounts a fresh
        // one. `lastKey` (the camera-framing guard below) is deliberately NOT reset with it — the
        // remounted map takes its camera from `initialRegion`, which already honours the current pins.
        key={mapNonce}
        ref={mapRef}
        style={{ flex: 1 }}
        initialRegion={initialRegion}
        onMapReady={() => setMapReady(true)}
        onMapLoaded={() => setMapLoaded(true)}
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
      ) : null}

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
          white it had drifted to — it was rendering as the faintest thing on the screen while being the
          instruction the composer turns on.

          Gated on `mapLoaded`, not `mapReady`: inviting someone to tap a canvas that never drew a tile is
          the exact dead end this file's fallback exists to replace, and the failure card takes this slot
          in that state. */}
      {mapLoaded && !activePoint ? (
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

      {/* Map-load failure fallback, adopting the kit's `LJ.map_failed` card (screens-shipped.jsx
          `ComposerState variant="mapfail"`): the muted circular map-pin badge, the title, the
          "you can still send" line, and the "Retry the map" pill it draws. The mock's own copy claims
          search is the way out; `mapFallbackHint` derives the sentence from the affordances actually
          on screen instead, because "search" and "use my location" are each conditionally present.
          Still PENDING in tools/parity/parity-status.mjs — this adopts the card's copy and its retry
          affordance, not the full screen structure (the mock also drops the locate pill in this state,
          which here is the one control that still sets a pin). */}
      {mapFailed ? (
        <View
          accessibilityRole="alert"
          style={{ position: "absolute", left: tokens.space.md, right: tokens.space.md, top: topOffset + 44, backgroundColor: tokens.color.bg, borderRadius: tokens.radius.card, padding: tokens.space.md, alignItems: "center", ...tokens.shadow.card }}
        >
          <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: tokens.color.surface, alignItems: "center", justifyContent: "center", marginBottom: 10 }}>
            <Icon name="map-pin" size={24} color={tokens.color.muted} />
          </View>
          <Text style={{ fontSize: 15, fontWeight: "700", color: tokens.color.ink, textAlign: "center" }}>The map didn&apos;t load</Text>
          <Text style={{ fontSize: tokens.font.size.caption, color: tokens.color.muted, lineHeight: 18, textAlign: "center", marginTop: 4 }}>
            {mapFallbackHint(active === "pickup")}
          </Text>
          <Pressable
            onPress={retryMap}
            accessibilityRole="button"
            accessibilityLabel="Retry loading the map"
            style={({ pressed }) => ({
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              marginTop: 10,
              minHeight: 40,
              paddingHorizontal: tokens.space.md,
              borderRadius: tokens.radius.pill,
              borderWidth: 1,
              borderColor: tokens.color.line,
              opacity: pressed ? 0.6 : 1,
            })}
          >
            <Icon name="refresh-cw" size={14} color={tokens.color.accentText} />
            <Text style={{ fontSize: 13, fontWeight: "700", color: tokens.color.accentText }}>Retry the map</Text>
          </Pressable>
        </View>
      ) : null}
    </View>
  );
});
