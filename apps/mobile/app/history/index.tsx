import { tokens } from "@lynia/shared";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React from "react";
import { ActivityIndicator, Pressable, ScrollView, Text, View } from "react-native";
import { getHistory, type OrderHistoryRow } from "../../src/api/orders";
import { Button, Card, EmptyState, Heading, Screen, StatusPill, Sub } from "../../src/ui";

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function Row({ o, onPress }: { o: OrderHistoryRow; onPress: () => void }): React.ReactElement {
  const fare = o.agreedFare ?? o.proposedFare;
  return (
    <Pressable onPress={onPress}>
      <Card>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <View style={{ flex: 1, paddingRight: tokens.space.sm }}>
            <Text style={{ fontSize: 14, fontWeight: "700", color: tokens.color.ink }} numberOfLines={1}>
              {o.pickup.landmark || "Pickup"} → {o.dropoff.landmark || "Drop-off"}
            </Text>
            <Text style={{ fontSize: 12, color: tokens.color.muted, marginTop: 2 }}>
              {fmtDate(o.createdAt)} · {o.role === "customer" ? "Sent" : "Delivered"}
              {o.counterpartyName ? ` · ${o.counterpartyName}` : ""}
              {o.rating ? ` · ★ ${o.rating.score}` : ""}
            </Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={{ fontSize: 15, fontWeight: "800", color: tokens.color.ink }}>${fare}</Text>
            <View style={{ height: 4 }} />
            <StatusPill status={o.status} />
          </View>
        </View>
      </Card>
    </Pressable>
  );
}

export default function HistoryScreen(): React.ReactElement {
  const router = useRouter();
  const historyQ = useQuery({ queryKey: ["history"], queryFn: getHistory });

  return (
    <Screen>
      <Heading>Your trips</Heading>
      <Sub>Every parcel you've sent or delivered.</Sub>
      {historyQ.isLoading ? (
        <ActivityIndicator />
      ) : (historyQ.data ?? []).length === 0 ? (
        <EmptyState icon="📦" title="No trips yet" message="Your sent and delivered parcels will show up here.">
          <Button label="Send a parcel" onPress={() => router.replace("/home")} />
        </EmptyState>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false}>
          {(historyQ.data ?? []).map((o) => (
            <Row key={o.id} o={o} onPress={() => router.push(`/order/${o.id}`)} />
          ))}
          <View style={{ height: tokens.space.xxl }} />
        </ScrollView>
      )}
      <Button label="Back" variant="ghost" onPress={() => router.back()} />
    </Screen>
  );
}
