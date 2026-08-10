import { tokens } from "@lynia/shared";
import React, { useState } from "react";
import { Linking, Pressable, Text, View } from "react-native";
import type { OrderSnapshot } from "../../api/orders";
import { mapsDirectionsUrl, mapsPlaceUrl } from "../../logic/maps";
import { formatMoney } from "../../logic/money";
import { Button, Icon } from "../index";
import { LiveMap } from "../LiveMap";
import { Money } from "../Money";

/** Kit `PayTag` — the CASH/WALLET chip on the nav sheet header. */
function PayTag({ method }: { method: "cash" | "wallet" }): React.ReactElement {
  const cash = method === "cash";
  return (
    <View
      style={{
        paddingHorizontal: 10,
        paddingVertical: 4,
        borderRadius: tokens.radius.pill,
        backgroundColor: cash ? tokens.color.highlightWash : tokens.color.accentWash,
      }}
    >
      <Text style={{ fontSize: 11, fontWeight: tokens.font.weight.bold, letterSpacing: 0.4, color: cash ? tokens.color.highlightInk : tokens.color.accentText }}>
        {cash ? "CASH" : "WALLET"}
      </Text>
    </View>
  );
}

/**
 * Map-first navigation leg for the rider food journey — the kit's `RR.nav_rest` ("R2·1 — navigate to
 * the restaurant") and `RR.nav_cust` ("R3·1 — ride to the customer. Amount to collect is pinned in
 * view the whole way"): a full-bleed live map with a bottom sheet carrying the destination, a call
 * control, the Maps hand-off, and — on the customer leg of a cash order — the collect-at-the-door
 * amount in the highlight wash.
 *
 * One divergence from the kit, by necessity: the kit's demo chrome advances between screens, so the
 * nav tiles carry no arrival action. A real app needs one — the primary CTA below the kit rows flips
 * back to the working job screen (pay/collect at the counter, handshake/code at the door). Arrival is
 * LOCAL UI state, not a server transition: the order status only moves at the counter and door
 * confirms, so a mistaken tap costs nothing.
 */
export function FoodNavLeg({
  leg,
  order,
  riderPoint,
  paymentMethod,
  collectAmount,
  arrivedLabel,
  onArrived,
  children,
}: {
  leg: "restaurant" | "customer";
  order: OrderSnapshot;
  riderPoint: { lat: number; lng: number } | null;
  paymentMethod: "cash" | "wallet";
  /** Cash to collect at the door — the customer leg's pinned highlight row. Null hides it. */
  collectAmount?: number | null;
  arrivedLabel: string;
  onArrived: () => void;
  /** Overlay slot — the SOS control stays pinned on every live-job map. */
  children?: React.ReactNode;
}): React.ReactElement {
  const [mapHeight, setMapHeight] = useState(0);
  const toRestaurant = leg === "restaurant";
  const destination = toRestaurant ? order.pickup.point : order.dropoff.point;
  const title = (toRestaurant ? order.pickup.landmark : order.dropoff.landmark) || (toRestaurant ? "The restaurant" : "The drop-off");
  const sub = toRestaurant
    ? paymentMethod === "cash"
      ? "Cash order — the counter settles before the food travels"
      : "Nothing to pay here"
    : order.note || null;
  const phone = toRestaurant ? order.pickup.contactPhone : (order.counterpartyPhone ?? order.dropoff.contactPhone);
  const openMaps = (): void => {
    void Linking.openURL(riderPoint ? mapsDirectionsUrl(riderPoint, destination) : mapsPlaceUrl(destination));
  };

  return (
    <View style={{ flex: 1 }} onLayout={(e) => setMapHeight(Math.max(0, Math.round(e.nativeEvent.layout.height)))}>
      {mapHeight > 0 ? (
        <LiveMap
          pickup={{ lat: order.pickup.point.lat, lng: order.pickup.point.lng }}
          dropoff={{ lat: order.dropoff.point.lat, lng: order.dropoff.point.lng }}
          rider={riderPoint}
          height={mapHeight}
        />
      ) : null}
      {/* Overlay slot — floats the pinned SOS pill over the map, clear of the sheet. */}
      {children ? <View style={{ position: "absolute", top: 8, left: 0, right: 0, alignItems: "center" }}>{children}</View> : null}
      <View
        style={{
          position: "absolute",
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: tokens.color.bg,
          borderTopLeftRadius: 18,
          borderTopRightRadius: 18,
          paddingTop: 12,
          paddingHorizontal: tokens.space.screen,
          paddingBottom: 14,
          shadowColor: "#14181B",
          shadowOffset: { width: 0, height: -6 },
          shadowOpacity: 0.16,
          shadowRadius: 22,
          elevation: 12,
        }}
      >
        <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: tokens.color.line, alignSelf: "center", marginBottom: 10 }} />
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 10 }}>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={{ fontSize: 15.5, fontWeight: tokens.font.weight.bold, color: tokens.color.ink }}>
              {title}
            </Text>
            {sub ? (
              <Text numberOfLines={2} style={{ fontSize: 12, color: tokens.color.muted, marginTop: 1 }}>
                {sub}
              </Text>
            ) : null}
          </View>
          {toRestaurant ? <PayTag method={paymentMethod} /> : null}
          {phone ? (
            <Pressable
              onPress={() => void Linking.openURL(`tel:${phone}`)}
              accessibilityRole="button"
              accessibilityLabel={toRestaurant ? "Call the restaurant" : "Call the customer"}
              style={{
                width: 44,
                height: 44,
                borderRadius: 22,
                flexShrink: 0,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: toRestaurant ? tokens.color.bg : tokens.color.accent,
                borderWidth: toRestaurant ? 1 : 0,
                borderColor: tokens.color.line,
              }}
            >
              <Icon name="phone" size={17} color={toRestaurant ? tokens.color.accentText : tokens.color.onAccent} />
            </Pressable>
          ) : null}
        </View>
        {collectAmount != null ? (
          <View
            style={{
              flexDirection: "row",
              alignItems: "center",
              gap: 10,
              paddingVertical: 10,
              paddingHorizontal: 12,
              backgroundColor: tokens.color.highlightWash,
              borderRadius: 12,
              marginBottom: 10,
            }}
            accessibilityLabel={`Collect ${formatMoney(collectAmount)} at the door`}
          >
            <Icon name="banknote" size={17} color={tokens.color.highlightInk} />
            <Text style={{ flex: 1, fontSize: 12.5, fontWeight: tokens.font.weight.bold, color: tokens.color.highlightInk }}>Collect at the door</Text>
            <Money v={collectAmount} size={19} color={tokens.color.highlightInk} />
          </View>
        ) : null}
        <Button label="Open in Maps" variant="ghost" onPress={openMaps} />
        <Button label={arrivedLabel} onPress={onArrived} />
      </View>
    </View>
  );
}
