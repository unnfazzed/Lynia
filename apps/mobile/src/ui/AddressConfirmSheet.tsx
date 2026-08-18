import { tokens } from "@lynia/shared/tokens";
import React, { useCallback, useEffect, useState } from "react";
import { InteractionManager, KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, Text, View } from "react-native";
import MapView, { type LatLng, type MapPressEvent, Marker, type MarkerDragStartEndEvent, type Region } from "react-native-maps";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { ResolvedPlace } from "../api/places";
import type { AddressSlot } from "./MapHome";
import type { PickedPoint } from "./MapPicker";
import { Button, Field, Icon } from "./index";

/**
 * `addr_map_confirm` — the kit's drag-to-adjust confirm step (packages/design/ui_kits/mobile/app.js
 * `AddrConfirm`, gallery id `addr_map_confirm`). A search result gives you a rooftop, not a door: this
 * is where the customer nudges the pin to the actual gate and names the landmark that gets the rider
 * the last twenty metres.
 *
 * Two things make it worth a screen of its own rather than an inline nicety:
 *
 *  1. **The landmark is contract-required** (`Waypoint.landmark`, min 1) but the composer buries it in
 *     a collapsed "Landmarks & details" section — far enough away that the Broadcast button's
 *     "what's still missing" hint has to spell out where to find it. Asked for here, in context, right
 *     after the address it belongs to, it stops being a scavenger hunt.
 *  2. A Places result resolves to a building centroid. Without a visible adjust step the customer has
 *     no cue they may move it, and no signal that the exact point is what the rider navigates to.
 *
 * Scope: this fires on the SEARCH path only, mirroring the kit's own flow (search → confirm). Tapping
 * or dragging a pin directly on the compose map already shows its result immediately and stays
 * unchanged — adding a confirmation to a gesture that is itself the confirmation would only add a step.
 */

/** Zoom in close on confirm: the whole point is judging metres, not neighbourhoods. */
const CONFIRM_DELTA = 0.004;

export function AddressConfirmSheet(props: {
  /** The resolved place to confirm; `null` keeps the sheet closed. */
  place: ResolvedPlace | null;
  slot: AddressSlot;
  /** Landmark already typed for this slot, if any — an edited value is the customer's and wins. */
  initialLandmark?: string;
  onConfirm: (point: PickedPoint, landmark: string) => void;
  onCancel: () => void;
}): React.ReactElement | null {
  const { place, slot } = props;
  const insets = useSafeAreaInsets();
  const isPickup = slot === "pickup";

  // Local working copy: the customer may drag before confirming, and may back out — neither should
  // touch the composer's state until they commit.
  const [point, setPoint] = useState<LatLng | null>(null);
  const [landmark, setLandmark] = useState("");

  // Re-seed whenever a new place opens the sheet. Keyed on the place identity, not on every render,
  // so a drag isn't stomped by the parent re-rendering underneath.
  useEffect(() => {
    if (!place) return;
    setPoint({ latitude: place.lat, longitude: place.lng });
    setLandmark(props.initialLandmark?.trim() ? props.initialLandmark : place.landmark);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-seed on a NEW place only.
  }, [place?.placeId, place?.lat, place?.lng]);

  // PERF-SEND-01's deferral, applied to the confirm step (RCA 2026-08-17 §4.2, deferred-item D4):
  // this Modal used to inflate its native MapView in the same commit as the slide-in animation, so
  // "tap a suggestion" paid the map surface before the sheet — the landmark field and Confirm, the
  // parts the customer actually came for — was even on screen. The map now mounts one interaction
  // after the modal opens: the sheet is interactive from its first frame, the surface-coloured canvas
  // reads as the map loading, and confirm/landmark never depended on tiles at all (the working point
  // is state, not a map read). Reset per place so a re-opened sheet defers again rather than paying
  // the mount inside the open animation.
  const [mapMounted, setMapMounted] = useState(false);
  useEffect(() => {
    if (!place) {
      setMapMounted(false);
      return;
    }
    const handle = InteractionManager.runAfterInteractions(() => setMapMounted(true));
    return () => handle.cancel();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- re-defer per NEW place, like the re-seed above.
  }, [place?.placeId, place?.lat, place?.lng]);

  const confirm = useCallback((): void => {
    if (!place || !point) return;
    // The placeId only describes the ORIGINAL resolved point. Once the customer drags the pin the
    // coordinates are theirs, not Google's, so drop it — the same invalidation the compose map applies
    // when a pin is moved after a search. Keeping it would deep-link the rider to the wrong door.
    const moved = point.latitude !== place.lat || point.longitude !== place.lng;
    setPoint(null);
    props.onConfirm(
      { lat: point.latitude, lng: point.longitude, ...(moved ? {} : { placeId: place.placeId }) },
      landmark.trim() || place.landmark,
    );
  }, [place, point, landmark, props]);

  if (!place || !point) return null;

  const region: Region = {
    latitude: place.lat,
    longitude: place.lng,
    latitudeDelta: CONFIRM_DELTA,
    longitudeDelta: CONFIRM_DELTA,
  };
  const { primary, secondary } = splitLandmark(place.landmark);
  const accent = isPickup ? tokens.color.accent : tokens.color.danger;

  return (
    <Modal visible animationType="slide" onRequestClose={props.onCancel} transparent={false}>
      <View style={{ flex: 1, backgroundColor: tokens.color.bg }}>
        <View style={{ flex: 1 }}>
          {/* Pre-mount canvas (same convention as ComposeMap's deferral): the map's ground colour,
              nothing drawn — the tiles fade in over it a beat later, so the deferral reads as the map
              loading rather than a missing element. The sheet below is fully usable meanwhile. */}
          {!mapMounted ? <View style={{ flex: 1, backgroundColor: tokens.color.surface }} /> : null}
          {mapMounted ? (
          <MapView
            style={{ flex: 1 }}
            initialRegion={region}
            onPress={(e: MapPressEvent) => setPoint(e.nativeEvent.coordinate)}
          >
            <Marker
              identifier="confirm"
              draggable
              coordinate={point}
              onDragEnd={(e: MarkerDragStartEndEvent) => setPoint(e.nativeEvent.coordinate)}
              pinColor={accent}
            />
          </MapView>
          ) : null}

          {/* Dismiss — a full-bleed map with no way out is a trap. The kit draws a back ARROW here
              because its confirm is a routed screen; this is a modal over the composer, so a close
              control is the truthful affordance (and the icon set carries no left-pointing glyph —
              adding one would cost bundle bytes the size budget watches, for a worse fit). */}
          <Pressable
            onPress={props.onCancel}
            accessibilityRole="button"
            accessibilityLabel="Close without setting this address"
            style={({ pressed }) => ({
              position: "absolute",
              top: insets.top + tokens.space.sm,
              left: tokens.space.md,
              width: 40,
              height: 40,
              borderRadius: 20,
              alignItems: "center",
              justifyContent: "center",
              backgroundColor: tokens.color.bg,
              opacity: pressed ? 0.7 : 1,
              ...tokens.shadow.card,
            })}
          >
            <Icon name="x" size={18} color={tokens.color.ink} />
          </Pressable>

          {/* "Drag to adjust" — the kit's dark pill. This is the only cue that the pin is movable. */}
          <View
            pointerEvents="none"
            style={{
              position: "absolute",
              top: insets.top + tokens.space.sm,
              left: 0,
              right: 0,
              alignItems: "center",
            }}
          >
            <View style={{ backgroundColor: tokens.color.ink, borderRadius: tokens.radius.pill, paddingHorizontal: tokens.space.md, paddingVertical: 6 }}>
              <Text style={{ fontSize: 12, fontWeight: tokens.font.weight.semibold, color: tokens.color.onAccent }}>
                Drag the pin to adjust
              </Text>
            </View>
          </View>
        </View>

        <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
          <View
            style={{
              backgroundColor: tokens.color.bg,
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              paddingHorizontal: tokens.space.screen,
              paddingTop: tokens.space.md,
              paddingBottom: tokens.space.lg + insets.bottom,
              ...tokens.shadow.sheet,
            }}
          >
            <View style={{ width: 36, height: 4, borderRadius: 999, backgroundColor: tokens.color.line, alignSelf: "center", marginBottom: tokens.space.md }} />

            <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 300 }} showsVerticalScrollIndicator={false}>
              <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10, marginBottom: tokens.space.sm }}>
                <Icon name="map-pin" size={20} color={accent} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontSize: 16, fontWeight: tokens.font.weight.bold, color: tokens.color.ink }}>{primary}</Text>
                  {secondary ? <Text style={{ fontSize: 13, color: tokens.color.muted }}>{secondary}</Text> : null}
                </View>
              </View>

              <View
                style={{
                  flexDirection: "row",
                  alignItems: "center",
                  gap: 7,
                  paddingHorizontal: 10,
                  paddingVertical: 8,
                  borderRadius: tokens.radius.input,
                  backgroundColor: tokens.color.accentWash,
                  marginBottom: tokens.space.md,
                }}
              >
                <Icon name="check" size={15} color={tokens.color.accentText} />
                <Text style={{ flex: 1, fontSize: 12, fontWeight: tokens.font.weight.semibold, color: tokens.color.accentText, lineHeight: 17 }}>
                  Exact point set — your rider navigates to this pin.
                </Text>
              </View>

              <Field
                label="Landmark / building, floor"
                value={landmark}
                onChangeText={setLandmark}
                placeholder="Blue gate opposite the pharmacy"
                maxLength={120}
                hint="What the rider looks for on arrival."
              />
            </ScrollView>

            <Button label={isPickup ? "Confirm pickup" : "Confirm drop-off"} onPress={confirm} disabled={landmark.trim().length === 0} />
          </View>
        </KeyboardAvoidingView>
      </View>
    </Modal>
  );
}

/** "Name, area, city" → a bold primary line + a muted secondary. Mirrors AddressSearch's row split. */
function splitLandmark(value: string): { primary: string; secondary: string } {
  const i = value.indexOf(", ");
  if (i < 0) return { primary: value, secondary: "" };
  return { primary: value.slice(0, i), secondary: value.slice(i + 2) };
}
