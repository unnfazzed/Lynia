import { tokens } from "@lynia/shared";
import React from "react";
import { Linking, Pressable, Text, View } from "react-native";
import type { OrderSnapshot } from "../../api/orders";
import { mapsDirectionsUrl } from "../../logic/maps";
import { formatMoney } from "../../logic/money";
import { Card, Icon, Stepper } from "../index";
import { LiveMap } from "../LiveMap";

// The job overview card — fare, contacts, line-items, sender's note, live map, route hand-off and
// the status stepper (extracted verbatim from app/rider/job.tsx).
export function JobDetailsCard({
  order,
  riderPoint,
  isActive,
}: {
  order: OrderSnapshot;
  riderPoint: { lat: number; lng: number } | null;
  isActive: boolean;
}): React.ReactElement {
  return (
    <Card>
      <Text style={{ fontSize: 14, color: tokens.color.muted, fontVariant: ["tabular-nums"] }}>Agreed fare {formatMoney(order.agreedFare ?? order.proposedFare)}</Text>
      {order.counterpartyPhone ? (
        <>
          <Text style={{ fontSize: 14, color: tokens.color.ink, marginTop: 4, fontVariant: ["tabular-nums"] }}>Customer phone: {order.counterpartyPhone}</Text>
          {/* The number is only ever revealed while the delivery is live — assigned through the
              hand-off (PHONE_REVEAL_STATUSES), NOT once the order is completed. A trust feature only
              matters if the rider can perceive it, so say so. */}
          <Text style={{ fontSize: 12, color: tokens.color.muted, marginTop: 2 }}>
            Shared only while this delivery is live — for their privacy.
          </Text>
          {/* One-tap dialer next to the visible number — a call beats copy/paste mid-delivery. */}
          <Pressable
            onPress={() => void Linking.openURL(`tel:${order.counterpartyPhone}`)}
            accessibilityRole="button"
            accessibilityLabel="Call customer"
            style={{ minHeight: tokens.touchTargetMin, flexDirection: "row", alignItems: "center", gap: tokens.space.sm }}
          >
            <Icon name="phone" size={16} color={tokens.color.accentText} />
            <Text style={{ fontSize: 14, fontWeight: "600", color: tokens.color.accentText }}>Call customer</Text>
          </Pressable>
        </>
      ) : null}
      {/* Waypoint contacts arrive only for the assigned rider inside the reveal window (§5d). */}
      {order.pickup.contactPhone ? (
        <Pressable
          onPress={() => void Linking.openURL(`tel:${order.pickup.contactPhone}`)}
          accessibilityRole="button"
          accessibilityLabel="Call pickup contact"
          style={{ minHeight: tokens.touchTargetMin, flexDirection: "row", alignItems: "center", gap: tokens.space.sm }}
        >
          <Icon name="phone" size={16} color={tokens.color.accentText} />
          <Text style={{ fontSize: 14, fontWeight: "600", color: tokens.color.accentText }}>Call pickup contact</Text>
        </Pressable>
      ) : null}
      {order.dropoff.contactPhone ? (
        <Pressable
          onPress={() => void Linking.openURL(`tel:${order.dropoff.contactPhone}`)}
          accessibilityRole="button"
          accessibilityLabel="Call drop-off contact"
          style={{ minHeight: tokens.touchTargetMin, flexDirection: "row", alignItems: "center", gap: tokens.space.sm }}
        >
          <Icon name="phone" size={16} color={tokens.color.accentText} />
          <Text style={{ fontSize: 14, fontWeight: "600", color: tokens.color.accentText }}>Call drop-off contact</Text>
        </Pressable>
      ) : null}
      {/* Line-items — the §5c "Items & note confirmed" step made real. Absent on orders
          created before the items column, so render nothing rather than a stub. */}
      {order.items && order.items.length > 0 ? (
        <View style={{ marginTop: tokens.space.sm }}>
          <Text style={{ fontSize: 12, fontWeight: "600", color: tokens.color.muted, marginBottom: 2 }}>Items</Text>
          {order.items.map((it, i) => (
            <Text key={i} style={{ fontSize: 14, color: tokens.color.ink, fontVariant: ["tabular-nums"] }}>
              {it.quantity}× {it.description}
            </Text>
          ))}
        </View>
      ) : null}
      {/* The sender's note ("ask for Rita at reception") — shown to the assigned rider only. */}
      {order.note ? (
        <View style={{ marginTop: tokens.space.sm }}>
          <Text style={{ fontSize: 12, fontWeight: "600", color: tokens.color.muted, marginBottom: 2 }}>Sender&apos;s note</Text>
          <Text style={{ fontSize: 14, color: tokens.color.ink, lineHeight: 20 }}>{order.note}</Text>
        </View>
      ) : null}
      <View style={{ height: tokens.space.sm }} />
      <LiveMap
        pickup={{ lat: order.pickup.point.lat, lng: order.pickup.point.lng }}
        dropoff={{ lat: order.dropoff.point.lat, lng: order.dropoff.point.lng }}
        rider={riderPoint}
      />
      {/* Maps-sync (§3·2): hand the rider turn-by-turn navigation for the pickup → drop-off leg in
          Google Maps. No Places key needed — a universal Maps URL. Shown while the run is active. */}
      {isActive ? (
        <>
          <Pressable
            onPress={() => void Linking.openURL(mapsDirectionsUrl(order.pickup.point, order.dropoff.point))}
            accessibilityRole="button"
            accessibilityLabel="Follow the route in Google Maps"
            style={{ minHeight: tokens.touchTargetMin, flexDirection: "row", alignItems: "center", gap: tokens.space.sm }}
          >
            <Icon name="navigation" size={16} color={tokens.color.accentText} />
            <Text style={{ fontSize: 14, fontWeight: "600", color: tokens.color.accentText }}>Follow route in Google Maps</Text>
          </Pressable>
          {/* The hand-off backgrounds this app; the foreground-service stream (use-rider-location)
              keeps the customer's map live meanwhile — say so, so the switch feels safe to make. */}
          <Text style={{ fontSize: 12, color: tokens.color.muted, marginTop: 2 }}>
            Your live location keeps sharing with the customer while you navigate.
          </Text>
        </>
      ) : null}
      <Stepper events={order.events} currentStatus={order.status} view="rider" />
    </Card>
  );
}
