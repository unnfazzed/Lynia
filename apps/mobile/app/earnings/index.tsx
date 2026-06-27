import { tokens } from "@lynia/shared";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React from "react";
import { ActivityIndicator, ScrollView, Text, View } from "react-native";
import { getHistory } from "../../src/api/orders";
import { Button, Card, EmptyState, Heading, Screen, Sub } from "../../src/ui";

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

export default function EarningsScreen(): React.ReactElement {
  const router = useRouter();
  const q = useQuery({ queryKey: ["history"], queryFn: getHistory });
  // Earnings = the agreed fare on deliveries I completed as the rider. A record of work, not a balance.
  const trips = (q.data ?? []).filter((o) => o.role === "rider" && o.status === "completed");
  const total = trips.reduce((sum, o) => sum + (Number(o.agreedFare ?? o.proposedFare) || 0), 0);

  return (
    <Screen>
      <Heading>Earnings</Heading>
      <Sub>What you've agreed and delivered.</Sub>

      {q.isLoading ? (
        <ActivityIndicator />
      ) : trips.length === 0 ? (
        <EmptyState icon="💵" title="No earnings yet" message="Completed deliveries and their agreed fares show up here.">
          <Button label="Find work" onPress={() => router.replace("/rider")} />
        </EmptyState>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false}>
          <Card style={{ backgroundColor: tokens.color.accent, borderColor: tokens.color.accent }}>
            <Text style={{ color: "#fff", fontSize: 12, fontWeight: "600", opacity: 0.9 }}>Agreed &amp; delivered · total</Text>
            <Text style={{ color: "#fff", fontSize: 30, fontWeight: "800", marginTop: 2 }}>${total.toFixed(2)}</Text>
            <Text style={{ color: "#fff", fontSize: 12, opacity: 0.9, marginTop: 2 }}>
              {trips.length} completed {trips.length === 1 ? "trip" : "trips"}
            </Text>
          </Card>

          {trips.map((o) => (
            <Card key={o.id}>
              <View style={{ flexDirection: "row", alignItems: "center" }}>
                <View style={{ flex: 1, paddingRight: tokens.space.sm }}>
                  <Text style={{ fontSize: 14, fontWeight: "700", color: tokens.color.ink }} numberOfLines={1}>
                    {o.pickup.landmark || "Pickup"} → {o.dropoff.landmark || "Drop-off"}
                  </Text>
                  <Text style={{ fontSize: 12, color: tokens.color.muted, marginTop: 2 }}>{fmtDate(o.createdAt)}</Text>
                </View>
                <Text style={{ fontSize: 15, fontWeight: "800", color: tokens.color.ink }}>${o.agreedFare ?? o.proposedFare}</Text>
              </View>
            </Card>
          ))}

          {/* §6: the pilot earns no revenue and settles no money — this is a work log, not a payout balance. */}
          <Card style={{ backgroundColor: "#FFFCF2", borderColor: "#F2B70566" }}>
            <Text style={{ fontSize: 12, color: "#6B5600", lineHeight: 17 }}>
              A record of work done — not a payout balance. The pilot takes no commission; payment is cash, outside the app.
              When the revenue model is set, settlement status will appear here.
            </Text>
          </Card>
          <View style={{ height: tokens.space.xxl }} />
        </ScrollView>
      )}
      <Button label="Back" variant="ghost" onPress={() => router.back()} />
    </Screen>
  );
}
