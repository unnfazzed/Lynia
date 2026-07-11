import { tokens } from "@lynia/shared";
import { useRouter } from "expo-router";
import React from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { formatMoney } from "../../src/logic/money";
import { useHistoryFeed } from "../../src/query/use-history-feed";
import { Button, Card, EmptyState, Heading, Screen, SkeletonList, Sub } from "../../src/ui";

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" }) + " · " + d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
}

export default function EarningsScreen(): React.ReactElement {
  const router = useRouter();
  // Shared warm-paint feed (same on-device snapshot as the trips list; load+persist+paused rule shared).
  const { rows, showingStale, isFetching, isError, refetch } = useHistoryFeed();
  // Earnings = the agreed fare on deliveries I've delivered as the rider — the fare is fixed at
  // hand-off and doesn't change based on the customer's rating, so a `delivered` trip (rated or not,
  // up to the 6h auto-close window) counts here just like `completed`. Excluding it used to make a
  // just-finished job briefly disappear from Earnings entirely — invisible here, yet visible right
  // away on Trip history for the same order — right when a rider is most likely to check.
  const trips = (rows ?? []).filter((o) => o.role === "rider" && (o.status === "completed" || o.status === "delivered"));
  const total = trips.reduce((sum, o) => sum + (Number(o.agreedFare ?? o.proposedFare) || 0), 0);

  return (
    <Screen>
      <Heading>Earnings</Heading>
      <Sub>What you've agreed and delivered.</Sub>

      {showingStale ? (
        <View style={{ marginBottom: tokens.space.sm }}>
          <Text style={{ fontSize: tokens.font.size.body, color: tokens.color.muted, marginBottom: tokens.space.sm }}>
            Showing your last saved earnings — we&apos;ll refresh when you&apos;re back online.
          </Text>
          {isError ? <Button label="Retry" variant="ghost" onPress={refetch} loading={isFetching} /> : null}
        </View>
      ) : null}

      {rows == null ? (
        isFetching ? (
          // A genuine first load is in flight.
          <SkeletonList />
        ) : (
          // No data and NOT fetching — an errored fetch or the offline paused state with no cache. Offer
          // a retry rather than an endless skeleton.
          <EmptyState icon="wifi-off" title="Couldn't load your earnings" message="Check your connection and try again.">
            <Button label="Retry" onPress={refetch} loading={isFetching} />
          </EmptyState>
        )
      ) : trips.length === 0 ? (
        // 5·2 zero-state: the $0.00 hero card + a warm "your first fare starts here", not a bare empty
        // ledger — the earnings surface should still feel like a record waiting to fill.
        <View>
          <Card style={{ backgroundColor: tokens.color.cta, borderColor: tokens.color.cta }}>
            <Text style={{ color: tokens.color.onAccent, fontSize: 12, fontWeight: "600", opacity: 0.9 }}>Agreed &amp; delivered · total</Text>
            <Text style={{ color: tokens.color.onAccent, fontSize: 28, fontWeight: "700", marginTop: 2, fontVariant: ["tabular-nums"] }}>$0.00</Text>
            <Text style={{ color: tokens.color.onAccent, fontSize: 12, opacity: 0.9, marginTop: 2 }}>No trips yet</Text>
          </Card>
          <EmptyState icon="banknote" title="Your first fare starts here" message="Go online and make an offer — every delivery you complete shows up here as a record of your work.">
            <Button label="Go online" onPress={() => router.replace("/rider")} />
          </EmptyState>
        </View>
      ) : (
        <ScrollView showsVerticalScrollIndicator={false}>
          <Card style={{ backgroundColor: tokens.color.cta, borderColor: tokens.color.cta }}>
            <Text style={{ color: tokens.color.onAccent, fontSize: 12, fontWeight: "600", opacity: 0.9 }}>Agreed &amp; delivered · total</Text>
            <Text style={{ color: tokens.color.onAccent, fontSize: 28, fontWeight: "700", marginTop: 2, fontVariant: ["tabular-nums"] }}>${total.toFixed(2)}</Text>
            <Text style={{ color: tokens.color.onAccent, fontSize: 12, opacity: 0.9, marginTop: 2, fontVariant: ["tabular-nums"] }}>
              {trips.length} delivered {trips.length === 1 ? "trip" : "trips"}
            </Text>
          </Card>

          {trips.map((o) => (
            <Card key={o.id}>
              <Pressable
                onPress={() => router.push(`/order/${o.id}`)}
                accessibilityRole="button"
                accessibilityLabel={`Open trip ${o.pickup.landmark || "pickup"} to ${o.dropoff.landmark || "drop-off"}`}
              >
                <View style={{ flexDirection: "row", alignItems: "center" }}>
                  <View style={{ flex: 1, paddingRight: tokens.space.sm }}>
                    <Text style={{ fontSize: 14, fontWeight: "700", color: tokens.color.ink }} numberOfLines={1}>
                      {o.pickup.landmark || "Pickup"} → {o.dropoff.landmark || "Drop-off"}
                    </Text>
                    <Text style={{ fontSize: 12, color: tokens.color.muted, marginTop: 2 }}>
                      {fmtDate(o.createdAt)}
                      {o.status === "delivered" ? " · Awaiting rating" : ""}
                    </Text>
                  </View>
                  <Text style={{ fontSize: 16, fontWeight: "700", color: tokens.color.ink, fontVariant: ["tabular-nums"] }}>{formatMoney(o.agreedFare ?? o.proposedFare)}</Text>
                </View>
              </Pressable>
            </Card>
          ))}

          {/* §6 decided: rider commission = % of the amount paid per ride, deducted from a pre-funded
              commission account (prepaid per-ride model). 0% for the launch period — riders keep the full
              fare for now. Copy tracks COMMISSION.ratePct in @lynia/shared. */}
          <Card style={{ backgroundColor: tokens.color.highlightWash, borderColor: tokens.color.highlightBorder }}>
            <Text style={{ fontSize: 12, color: tokens.color.highlightInk, lineHeight: 18 }}>
              A record of work done — not a payout balance. You keep the full agreed fare during the launch period
              (0% commission for the first few months); payment is cash, outside the app. Later, a small commission —
              a percentage of each delivery — will be deducted per ride from a commission account you top up in
              advance. When that goes live, a per-ride commission line and your account balance will appear here.
            </Text>
          </Card>
          <View style={{ height: tokens.space.xxl }} />
        </ScrollView>
      )}
      <Button label="Back" variant="ghost" onPress={() => router.back()} />
    </Screen>
  );
}
