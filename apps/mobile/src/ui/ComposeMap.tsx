import { tokens } from "@lynia/shared/tokens";
import * as Location from "expo-location";
import React, { useCallback, useEffect, useRef, useState } from "react";
import { InteractionManager, Platform, Pressable, Text, View } from "react-native";
import MapView, {
  type LatLng,
  type MapPressEvent,
  Marker,
  type MarkerDragStartEndEvent,
  Polyline,
  type Region,
} from "react-native-maps";
import { landmarkFromAddress } from "../logic/geocode";
import { mapFallbackHint } from "../logic/map-fallback";
import { mapLoadSignal } from "../logic/map-load-signal";
import { isReachable } from "../net/reachability";
import { addBreadcrumb, captureException } from "../telemetry/sentry";
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
/**
 * The staged load-watch (RCA 2026-08-17 §3.1). On the program's own 600 ms-RTT design link, a full
 * Harare tile set legitimately takes longer than the old single 9 s deadline — so the failure card
 * was a false accusation in every slow-tile session (it showed, then self-cleared when tiles landed),
 * and each occurrence filed a Sentry event that polluted the real MOB-MAP-02 key-rejection signal.
 * Staging is UNIFORM by design: the "rejected-key signature" is not client-observable
 * (react-native-maps exposes no tile-progress event; `onMapReady` is local SDK init that fires in
 * ~1-2 s on any link; API reachability says nothing about Google's tile servers), so at 9 s the
 * screen only admits slowness — a passive line, no alert role, no Sentry — and the actionable card
 * + report wait for MAP_FAIL_TIMEOUT_MS. Trade-off, measured via the tags below: a genuine key
 * rejection sees Retry 13 s later than before, but a remount cannot repair a rejected key anyway,
 * while the early card wrongly accused every slow 2G session.
 */
const MAP_SLOW_TIMEOUT_MS = 9_000;
const MAP_FAIL_TIMEOUT_MS = 22_000;
/** Ceiling on failure reports per compose session — see the reporting effect. */
const MAX_MAP_FAILURE_REPORTS = 3;

/**
 * Bounded-cardinality elapsed bucket for the map telemetry (a Sentry TAG must never carry raw ms).
 * Half-open on the left edge of each range: [9 s, 15 s) → "9-15s", [15 s, 22 s) → "15-22s",
 * ≥22 s → ">=22s"; anything under the slow threshold is "<9s". Exported pure for the boundary tests.
 */
export function mapElapsedBucket(ms: number): "<9s" | "9-15s" | "15-22s" | ">=22s" {
  if (ms < MAP_SLOW_TIMEOUT_MS) return "<9s";
  if (ms < 15_000) return "9-15s";
  if (ms < MAP_FAIL_TIMEOUT_MS) return "15-22s";
  return ">=22s";
}


export type ActiveSlot = "pickup" | "drop";

/**
 * The handoff's pins (send-compose-v2 "Map"): pickup a 22px accent circle, drop-off a 20px danger square
 * (radius 3), each with a 3px white ring and the card shadow, and an optional white pill label under it.
 * Pickup = green dot, drop-off = red square is the app-wide visual language.
 */
function PinView({ kind, label }: { kind: ActiveSlot; label: string | null }): React.ReactElement {
  const pickup = kind === "pickup";
  return (
    <View style={{ alignItems: "center", gap: 3, padding: 4 }}>
      <View
        style={{
          width: pickup ? 22 : 20,
          height: pickup ? 22 : 20,
          borderRadius: pickup ? 11 : 3,
          backgroundColor: pickup ? tokens.color.accent : tokens.color.danger,
          borderWidth: 3,
          borderColor: tokens.color.bg,
          ...tokens.shadow.card,
        }}
      />
      {label ? (
        <View style={{ backgroundColor: tokens.color.bg, borderRadius: tokens.radius.pill, paddingHorizontal: 8, paddingVertical: 2, ...tokens.shadow.card }}>
          <Text style={{ fontSize: 12, fontWeight: tokens.font.weight.semibold, color: tokens.color.ink }}>{label}</Text>
        </View>
      ) : null}
    </View>
  );
}

export const ComposeMap = React.memo(function ComposeMap(props: {
  pickup: PickedPoint | null;
  drop: PickedPoint | null;
  active: ActiveSlot;
  onChangePickup: (p: PickedPoint) => void;
  onChangeDrop: (p: PickedPoint) => void;
  onReverseGeocodePickup?: (landmark: string) => void;
  onReverseGeocodeDrop?: (landmark: string) => void;
  /** Px from the map's top to clear the floating address card — the slow/failed cards and the hint sit below it. */
  topOffset?: number;
  /** Px from the map's bottom to clear the pinned CTA bar — the "Use my location" / distance pills sit above it. */
  bottomOffset?: number;
  /** The dark map hint pill (handoff: "Or tap the map to set your drop-off"); null hides it. */
  hint?: string | null;
  /** White "Pickup" / "Drop-off" pill labels under the pins (hidden while an address row is being edited). */
  labels?: boolean;
  /** The dark distance pill bottom-left once both pins are set ("3.1 km"); null hides it. */
  distanceLabel?: string | null;
  /** "Use my location" pill bottom-right; omitted hides it (e.g. while an address row is being edited). */
  onUseMyLocation?: () => void;
  locating?: boolean;
  /** Padding for framing both pins — must clear the address card and the CTA bar. */
  edgePadding?: { top: number; right: number; bottom: number; left: number };
}): React.ReactElement {
  const topOffset = props.topOffset ?? tokens.space.md;
  const bottomOffset = props.bottomOffset ?? tokens.space.md;
  const { pickup, drop, active } = props;
  const labels = props.labels ?? true;
  const mapRef = useRef<MapView>(null);
  // Map-load fallback (C1 / kit `LJ.map_failed`). On Android the signal is `onMapLoaded` — "the map
  // finished rendering all tiles" — NOT `onMapReady`.
  //
  // That distinction is the whole fix. `onMapReady` fires when the native view has a `GoogleMap`
  // object, which it does even when the Maps SDK rejects the API key: an unrestricted-package /
  // wrong-SHA-1 / billing-disabled key produces an authorization failure whose only symptom is that
  // tiles never draw. Keyed on `onMapReady`, this fallback therefore stayed silent through exactly the
  // failure that was reported — a blank grey canvas under a "tap the map to drop your pin" hint, with
  // the pin tap doing nothing and no explanation on screen.
  //
  // WHICH event that is, though, is platform-dependent: `onMapLoaded` is `@platform iOS: Google Maps
  // only`, and this app renders Apple Maps on iOS, so requiring it there fired the card on every
  // session over a working map. `mapLoadSignal` picks the event the running platform actually emits —
  // see the full reasoning in `src/logic/map-load-signal.ts`.
  const [mapReady, setMapReady] = useState(false);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [mapTimedOut, setMapTimedOut] = useState(false);
  const loadSignal = mapLoadSignal();
  // A real `onMapLoaded` is honoured on every platform (it is the stronger proof, and would start
  // arriving on iOS the day this app adopts `PROVIDER_GOOGLE`); `onMapReady` only stands in for it
  // where the platform never emits it.
  const considerLoaded = mapLoaded || (loadSignal === "onMapReady" && mapReady);
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
  // The 9 s "taking a while" stage — see the staged-load-watch comment on the constants. Passive by
  // construction: it renders a muted line, carries no alert role, and reports nothing.
  const [mapSlow, setMapSlow] = useState(false);
  // Remount nonce for "Retry the map" — bumping it gives MapView a new key, which is the only way to
  // re-attempt the native map's own initialisation (a transient tile/auth failure is otherwise
  // permanent for the life of the screen, and this screen lives for a whole compose session).
  const [mapNonce, setMapNonce] = useState(0);
  // When THIS attempt's clock started — set as the timers arm, read for the recovery breadcrumb's
  // elapsed bucket and the failure report's raw-ms extra. A ref: nothing renders off it.
  const attemptStartedAt = useRef(Date.now());
  useEffect(() => {
    // The clocks start when the MAP does, not when the screen does — the deferral above must not eat
    // into the tile budget and turn a merely slow map into a "didn't load" card.
    if (!mapMounted || considerLoaded) return;
    attemptStartedAt.current = Date.now();
    // Two stages, one attempt: the passive admission at 9 s, the actionable card at 22 s. The card
    // still clears itself the moment tiles arrive, so erring late costs nothing while erring early
    // would accuse a working map. `considerLoaded` and `mapNonce` are inputs so a retry restarts both.
    const slow = setTimeout(() => setMapSlow(true), MAP_SLOW_TIMEOUT_MS);
    const fail = setTimeout(() => setMapTimedOut(true), MAP_FAIL_TIMEOUT_MS);
    return () => {
      clearTimeout(slow);
      clearTimeout(fail);
    };
  }, [mapMounted, considerLoaded, mapNonce]);
  // Recovery trail: tiles arriving AFTER the screen admitted slowness is the datum that separates
  // "slow link" from "never loads" in the field — the failure event alone can't (it fires at a fixed
  // elapsed by construction). A breadcrumb, not an event: it costs nothing unless something else is
  // reported, and it rides along on any later failure with the bucketed elapsed attached.
  const wasSlowRef = useRef(false);
  wasSlowRef.current = mapSlow || mapTimedOut;
  useEffect(() => {
    if (!considerLoaded || !wasSlowRef.current) return;
    addBreadcrumb("compose-map-recovered", {
      elapsed_bucket: mapElapsedBucket(Date.now() - attemptStartedAt.current),
      attempt: mapNonce + 1,
    });
    setMapSlow(false);
    setMapTimedOut(false);
  }, [considerLoaded, mapNonce]);
  // Report it. A blank map is invisible to every existing signal — the previous occurrence had to be
  // diagnosed from a user's description — so this is the difference between "somebody said the map was
  // blank" and a dated, versioned event with a device attached.
  //
  // Reported once per ATTEMPT rather than once per mount, because "I pressed Retry four times and it
  // never came back" and "it failed once" are different bugs and the old counter could not tell them
  // apart: `retryMap` never cleared the flag, so every retry after the first was silent and the retry
  // pill's effectiveness was unmeasurable. Capped, because this app targets metered 2G/3G and an
  // unbounded loop of retries must not turn into an unbounded loop of uploads.
  const reportedAttempts = useRef<Set<number>>(new Set());
  const mapFailed = !considerLoaded && mapTimedOut;
  useEffect(() => {
    if (!mapFailed) return;
    if (reportedAttempts.current.has(mapNonce)) return;
    if (reportedAttempts.current.size >= MAX_MAP_FAILURE_REPORTS) return;
    reportedAttempts.current.add(mapNonce);
    // The message is CONSTANT and the varying parts are tags. Sentry fingerprints on the message, so
    // the old `compose-map-not-loaded (onMapReady=${mapReady})` split one failure across an issue per
    // value and hid the fields worth filtering on inside a string. In particular `map_load_signal`
    // separates the two causes that produced an identical event: an Android build whose Maps key was
    // rejected (`onMapLoaded`, tiles never drew) from an iOS session where the required event is simply
    // never emitted (`onMapReady` — the false positive this change removes). `map_reachable` records
    // whether the LYNIA API round-trips at report time — not proof about Google's tile servers, but it
    // separates fully-offline sessions from online-with-dead-tiles ones. Elapsed rides as a BOUNDED
    // bucket in the tag (cardinality) with the raw ms in `extra`; on this one-shot report it reads
    // ">=22s" by construction — the interesting elapsed values live on the `compose-map-recovered`
    // breadcrumb, which is what separates late-tiles sessions from never-tiles ones.
    const elapsedMs = Date.now() - attemptStartedAt.current;
    captureException(new Error("compose-map-not-loaded"), {
      tags: {
        map_platform: Platform.OS,
        map_load_signal: loadSignal,
        map_ready: String(mapReady),
        map_attempt: String(mapNonce + 1),
        map_reachable: String(isReachable()),
        map_elapsed_bucket: mapElapsedBucket(elapsedMs),
      },
      extra: { map_elapsed_ms: elapsedMs },
    });
  }, [mapFailed, mapReady, mapNonce, loadSignal]);

  const retryMap = useCallback((): void => {
    // Breadcrumb, not an event: this is the ONE place in the app that tears down and rebuilds a native
    // view by changing its `key`, and on the old architecture that runs through the Paper
    // child-management path. An unhandled `com.facebook.infer.annotation.Assertions` AssertionError was
    // reported from this app with no message and no context, and a native crash carries no JS state on
    // its own — so if a remount preceded the next one, this is what will say so, at zero upload cost
    // when nothing is reported. See docs/SENTRY-TRIAGE-2026-08-17.md §2.
    addBreadcrumb("compose-map-retry", { attempt: mapNonce + 1 });
    setMapReady(false);
    setMapLoaded(false);
    setMapSlow(false);
    setMapTimedOut(false);
    setMapNonce((n) => n + 1);
  }, [mapNonce]);

  const activePoint = active === "pickup" ? pickup : drop;
  const setActive = (c: LatLng): void => {
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
        const landmark = landmarkFromAddress(first);
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
        { edgePadding: props.edgePadding ?? { top: 120, right: 80, bottom: 120, left: 80 }, animated: true },
      );
    } else if (activePoint) {
      map.animateToRegion(
        { latitude: activePoint.lat, longitude: activePoint.lng, latitudeDelta: 0.02, longitudeDelta: 0.02 },
        400,
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyed on a stable string of the coords + active slot.
  }, [key, mapMounted]);

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
            // Remounted when the label toggles: `tracksViewChanges` is off (a custom marker view repaints
            // every frame otherwise), so a new key is how the label change reaches the native bitmap.
            key={`pickup-${labels ? "l" : "n"}`}
            identifier="pickup"
            draggable={active === "pickup"}
            coordinate={{ latitude: pickup.lat, longitude: pickup.lng }}
            onDragEnd={(e: MarkerDragStartEndEvent) => setActive(e.nativeEvent.coordinate)}
            anchor={{ x: 0.5, y: labels ? 0.25 : 0.5 }}
            tracksViewChanges={false}
          >
            <PinView kind="pickup" label={labels ? "Pickup" : null} />
          </Marker>
        ) : null}
        {drop ? (
          <Marker
            key={`drop-${labels ? "l" : "n"}`}
            identifier="drop"
            draggable={active === "drop"}
            coordinate={{ latitude: drop.lat, longitude: drop.lng }}
            onDragEnd={(e: MarkerDragStartEndEvent) => setActive(e.nativeEvent.coordinate)}
            anchor={{ x: 0.5, y: labels ? 0.25 : 0.5 }}
            tracksViewChanges={false}
          >
            <PinView kind="drop" label={labels ? "Drop-off" : null} />
          </Marker>
        ) : null}
        {pickup && drop ? (
          <Polyline
            coordinates={[
              { latitude: pickup.lat, longitude: pickup.lng },
              { latitude: drop.lat, longitude: drop.lng },
            ]}
            strokeColor={tokens.color.accent}
            strokeWidth={5}
            lineCap="round"
          />
        ) : null}
      </MapView>
      ) : null}

      {/* Handoff (send-compose-v2) map pills: "Use my location" bottom-right and, once both pins are set,
          the dark distance pill bottom-left — both 12px above the pinned CTA bar. */}
      {props.onUseMyLocation ? (
        <Pressable
          onPress={props.onUseMyLocation}
          accessibilityRole="button"
          accessibilityLabel={active === "pickup" ? "Use my current location for pickup" : "Use my current location for drop-off"}
          style={({ pressed }) => ({
            position: "absolute",
            right: 12,
            bottom: bottomOffset,
            height: tokens.touchTargetMin,
            flexDirection: "row",
            alignItems: "center",
            gap: 6,
            backgroundColor: tokens.color.bg,
            borderRadius: tokens.radius.pill,
            paddingHorizontal: 14,
            opacity: pressed ? 0.7 : 1,
            ...tokens.shadow.card,
          })}
        >
          <Icon name="navigation" size={16} color={tokens.color.accentText} />
          <Text style={{ fontSize: 13, fontWeight: tokens.font.weight.semibold, color: tokens.color.accentText }}>
            {props.locating ? "Locating…" : "Use my location"}
          </Text>
        </Pressable>
      ) : null}
      {props.distanceLabel ? (
        <View
          pointerEvents="none"
          style={{
            position: "absolute",
            left: 12,
            bottom: bottomOffset,
            height: tokens.touchTargetMin,
            justifyContent: "center",
            backgroundColor: tokens.color.ink,
            borderRadius: tokens.radius.pill,
            paddingHorizontal: 14,
            ...tokens.shadow.card,
          }}
        >
          <Text style={{ fontSize: 13, fontWeight: tokens.font.weight.semibold, color: tokens.color.onAccent, fontVariant: ["tabular-nums"] }}>
            {props.distanceLabel}
          </Text>
        </View>
      ) : null}

      {/* The map is the input, so it says so — but only over a map that actually drew (see the load
          signal above): inviting a tap on a canvas with no tiles is the dead end the failure card replaces. */}
      {considerLoaded && props.hint ? (
        <View
          pointerEvents="none"
          style={{ position: "absolute", top: topOffset + 12, alignSelf: "center", maxWidth: "90%", backgroundColor: tokens.color.ink, borderRadius: tokens.radius.pill, paddingHorizontal: 12, paddingVertical: 6 }}
        >
          <Text style={{ fontSize: 12, fontWeight: tokens.font.weight.semibold, color: tokens.color.onAccent, textAlign: "center" }}>{props.hint}</Text>
        </View>
      ) : null}

      {/* The 9 s stage: a passive admission that tiles are slow — deliberately NOT the failure card
          (no alert role, no retry, no Sentry) because on the target 2G/3G link this state is usually
          just a link being a link, and the old card here accused every slow session (RCA §3.1). It
          gives way to the failure card at 22 s, or clears with the tiles. */}
      {mapSlow && !mapFailed && !considerLoaded ? (
        <View
          pointerEvents="none"
          style={{ position: "absolute", top: topOffset + 12, alignSelf: "center", maxWidth: "90%", backgroundColor: tokens.color.bg, borderRadius: tokens.radius.pill, paddingHorizontal: tokens.space.md, paddingVertical: tokens.space.sm, ...tokens.shadow.card }}
        >
          <Text style={{ fontSize: tokens.font.size.caption, color: tokens.color.muted, textAlign: "center" }}>
            The map is taking a while — you can search the address above meanwhile.
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
          style={{ position: "absolute", left: tokens.space.md, right: tokens.space.md, top: topOffset + 12, backgroundColor: tokens.color.bg, borderRadius: tokens.radius.card, padding: tokens.space.md, alignItems: "center", ...tokens.shadow.card }}
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
