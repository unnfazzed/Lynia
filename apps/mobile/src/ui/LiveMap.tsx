import { tokens } from "@lynia/shared";
import React, { useEffect, useRef } from "react";
import { View } from "react-native";
import MapView, { type LatLng, Marker, type Region } from "react-native-maps";

export interface MapPoint {
  lat: number;
  lng: number;
}

/** Harare CBD — fallback region before the map fits to the order's points. */
const HARARE: Region = { latitude: -17.8292, longitude: 31.0522, latitudeDelta: 0.06, longitudeDelta: 0.06 };

const toLatLng = (p: MapPoint): LatLng => ({ latitude: p.lat, longitude: p.lng });

/**
 * Read-only tracking map: pickup, drop-off, and (when GPS is flowing) the rider's live position. Refits
 * to the visible points whenever the rider moves, so the whole trip stays in frame. Needs the dev build
 * + a Google Maps key on Android (Apple Maps on iOS); same gating as the pickup MapPicker.
 */
export function LiveMap(props: { pickup: MapPoint; dropoff: MapPoint; rider: MapPoint | null }): React.ReactElement {
  const mapRef = useRef<MapView>(null);

  useEffect(() => {
    const coords: LatLng[] = [
      toLatLng(props.pickup),
      toLatLng(props.dropoff),
      ...(props.rider ? [toLatLng(props.rider)] : []),
    ];
    mapRef.current?.fitToCoordinates(coords, {
      edgePadding: { top: 48, right: 48, bottom: 48, left: 48 },
      animated: true,
    });
  }, [props.pickup.lat, props.pickup.lng, props.dropoff.lat, props.dropoff.lng, props.rider?.lat, props.rider?.lng]);

  return (
    <View
      style={{
        height: 200,
        borderRadius: tokens.radius.input,
        overflow: "hidden",
        borderWidth: 1,
        borderColor: tokens.color.line,
        marginBottom: tokens.space.sm,
      }}
    >
      <MapView ref={mapRef} style={{ flex: 1 }} initialRegion={HARARE}>
        <Marker coordinate={toLatLng(props.pickup)} title="Pickup" pinColor={tokens.color.accent} />
        <Marker coordinate={toLatLng(props.dropoff)} title="Drop-off" pinColor={tokens.color.danger} />
        {props.rider ? <Marker coordinate={toLatLng(props.rider)} title="Rider" pinColor={tokens.color.highlight} /> : null}
      </MapView>
    </View>
  );
}
