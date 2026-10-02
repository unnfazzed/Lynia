import { tokens } from "@lynia/shared/tokens";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { Easing, Text, View } from "react-native";
import MapView, { AnimatedRegion, type LatLng, Marker, MarkerAnimated, Polyline, type Region } from "react-native-maps";
import { RestaurantsSticker } from "../art/stickers";
import { Icon } from "../Icon";
import type { MapPoint } from "../LiveMap";
import { ALPHA } from "./kit";
import { O } from "./copy";

/**
 * The merchant order's full-bleed map (Order flow v2.1, ledger D-59; polish `K.map`). From the first
 * second: the ★VenuePin (48 disc in the tile colour, the service sticker, a 3px white ring, the menu
 * shadow and a name pill) and your red drop square ("You", ink pill, danger halo), joined by a dashed
 * muted route on a white casing. Rider found: the ink bike disc with the green glow and a dotted line to
 * the venue. Collected: a solid accent route, 6px on an 11px white casing. Re-fits only when the framed
 * set changes (never on a GPS tick); fixes glide over 800ms (snap under reduce motion).
 */

const C = tokens.color;
const HARARE: Region = { latitude: -17.8292, longitude: 31.0522, latitudeDelta: 0.06, longitudeDelta: 0.06 };
const RIDER_DELTA = { latitudeDelta: 0.01, longitudeDelta: 0.01 } as const;
const ll = (p: MapPoint): LatLng => ({ latitude: p.lat, longitude: p.lng });

function VenuePin({ name }: { name: string }): React.ReactElement {
  return (
    <View style={{ alignItems: "center", gap: 3, padding: 6 }}>
      <View style={{ width: 48, height: 48, borderRadius: 24, borderWidth: 3, borderColor: C.bg, backgroundColor: C.tileFood, alignItems: "center", justifyContent: "center", ...tokens.shadow.menu }}>
        <RestaurantsSticker width={30} />
      </View>
      <View style={{ backgroundColor: C.bg, borderRadius: tokens.radius.pill, paddingHorizontal: 9, paddingVertical: 3, ...tokens.shadow.card }}>
        <Text numberOfLines={1} style={{ fontSize: 12, fontWeight: "700", color: C.ink, maxWidth: 160 }}>{name}</Text>
      </View>
    </View>
  );
}

function DropPin(): React.ReactElement {
  return (
    <View style={{ alignItems: "center", gap: 3, padding: 6 }}>
      <View style={{ width: 34, height: 34, borderRadius: 8, backgroundColor: ALPHA.dropHalo, alignItems: "center", justifyContent: "center" }}>
        <View style={{ width: 22, height: 22, borderRadius: 4, backgroundColor: C.danger, borderWidth: 3, borderColor: C.bg, ...tokens.shadow.menu }} />
      </View>
      <View style={{ backgroundColor: C.ink, borderRadius: tokens.radius.pill, paddingHorizontal: 9, paddingVertical: 3 }}>
        <Text style={{ fontSize: 12, fontWeight: "700", color: C.onAccent }}>{O.c.you}</Text>
      </View>
    </View>
  );
}

function RiderPin({ label, paused }: { label: string; paused: boolean }): React.ReactElement {
  return (
    <View style={{ alignItems: "center", gap: 3, padding: 4 }}>
      <View style={{ width: 52, height: 52, borderRadius: 26, backgroundColor: paused ? "transparent" : ALPHA.accentGlow, alignItems: "center", justifyContent: "center" }}>
        <View style={{ width: 38, height: 38, borderRadius: 19, backgroundColor: paused ? C.muted : C.ink, borderWidth: 3, borderColor: C.bg, alignItems: "center", justifyContent: "center", ...tokens.shadow.menu }}>
          <Icon name="bike" size={18} color={C.onAccent} />
        </View>
      </View>
      <View style={{ backgroundColor: paused ? C.bg : C.ink, borderRadius: tokens.radius.pill, paddingHorizontal: 9, paddingVertical: 3, borderWidth: paused ? 1 : 0, borderStyle: "dashed", borderColor: C.muted }}>
        <Text style={{ fontSize: 12, fontWeight: "700", color: paused ? C.muted : C.onAccent }}>{label}</Text>
      </View>
    </View>
  );
}

export const MerchantMap = React.memo(function MerchantMap(props: {
  venue: MapPoint | null;
  venueName: string;
  dropoff: MapPoint | null;
  rider: MapPoint | null;
  riderLabel: string;
  riderPaused: boolean;
  /** Draw the rider marker (a rider holds the job). */
  showRider: boolean;
  /** The dotted rider → venue line (heading to the venue). */
  toVenue: boolean;
  /** Solid accent route (collected) vs the dashed muted one. */
  collected: boolean;
  padBottom: number;
  reduceMotion: boolean;
}): React.ReactElement {
  const mapRef = useRef<MapView>(null);
  const riderRegion = useRef<AnimatedRegion | null>(null);
  const [hasRider, setHasRider] = useState(false);
  const { rider, reduceMotion, venue, dropoff } = props;

  useEffect(() => {
    if (!rider) return;
    const next: Region = { latitude: rider.lat, longitude: rider.lng, ...RIDER_DELTA };
    if (!riderRegion.current) {
      riderRegion.current = new AnimatedRegion(next);
      setHasRider(true);
      return;
    }
    if (reduceMotion) riderRegion.current.setValue(next);
    else riderRegion.current.timing({ ...next, duration: 800, easing: Easing.linear, useNativeDriver: false } as Parameters<AnimatedRegion["timing"]>[0]).start();
  }, [rider?.lat, rider?.lng, reduceMotion]); // eslint-disable-line react-hooks/exhaustive-deps -- glide on a new fix only

  const haveRider = props.showRider && rider != null;
  const fitKey = `${venue?.lat},${venue?.lng}|${dropoff?.lat},${dropoff?.lng}|${haveRider}|${props.collected}|${Math.round(props.padBottom)}`;
  const riderRef = useRef(rider);
  riderRef.current = rider;
  useEffect(() => {
    const pts: MapPoint[] = [venue, dropoff, haveRider ? riderRef.current : null].filter((p): p is MapPoint => p != null);
    if (pts.length < 2) return;
    mapRef.current?.fitToCoordinates(pts.map(ll), { edgePadding: { top: 64, right: 56, bottom: props.padBottom + 28, left: 56 }, animated: !reduceMotion });
  }, [fitKey]); // eslint-disable-line react-hooks/exhaustive-deps -- fitKey is the deliberate trigger

  const route = useMemo(() => (venue && dropoff ? [ll(venue), ll(dropoff)] : null), [venue, dropoff]);

  return (
    <View style={{ position: "absolute", left: 0, right: 0, top: 0, bottom: 0 }} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <MapView ref={mapRef} style={{ flex: 1 }} initialRegion={HARARE} toolbarEnabled={false} showsCompass={false}>
        {route ? <Polyline coordinates={route} strokeColor={C.bg} strokeWidth={props.collected ? 11 : 8} lineCap="round" /> : null}
        {route ? (
          props.collected ? (
            <Polyline coordinates={route} strokeColor={C.accent} strokeWidth={6} lineCap="round" />
          ) : (
            <Polyline coordinates={route} strokeColor={C.muted} strokeWidth={3} lineDashPattern={[7, 7]} lineCap="round" />
          )
        ) : null}
        {props.toVenue && haveRider && venue && rider ? (
          <Polyline coordinates={[ll(rider), ll(venue)]} strokeColor={C.ink} strokeWidth={3.5} lineDashPattern={[1, 7]} lineCap="round" />
        ) : null}
        {venue ? (
          <Marker coordinate={ll(venue)} anchor={{ x: 0.5, y: 0.3 }} tracksViewChanges={false}>
            <VenuePin name={props.venueName} />
          </Marker>
        ) : null}
        {dropoff ? (
          <Marker coordinate={ll(dropoff)} anchor={{ x: 0.5, y: 0.3 }} tracksViewChanges={false}>
            <DropPin />
          </Marker>
        ) : null}
        {haveRider && hasRider && riderRegion.current ? (
          <MarkerAnimated key={`rider-${props.riderPaused ? "p" : "l"}-${props.riderLabel}`} coordinate={riderRegion.current as unknown as LatLng} anchor={{ x: 0.5, y: 0.3 }} tracksViewChanges={false}>
            <RiderPin label={props.riderLabel} paused={props.riderPaused} />
          </MarkerAnimated>
        ) : null}
      </MapView>
    </View>
  );
});
