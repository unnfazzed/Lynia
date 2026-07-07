import { tokens } from "@lynia/shared";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { getHistory, type OrderHistoryRow } from "../../src/api/orders";
import { buildRebroadcastParams } from "../../src/logic/order-draft";
import { formatMoney } from "../../src/logic/money";
import { loadHistorySnapshot, saveHistorySnapshot } from "../../src/net/history-store";
import { Button, Card, EmptyState, Heading, Icon, Screen, SkeletonRows, StatusPill, Sub } from "../../src/ui";

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function Row({ o, onPress, onReorder }: { o: OrderHistoryRow; onPress: () => void; onReorder?: () => void }): React.ReactElement {
  const fare = o.agreedFare ?? o.proposedFare;
  return (
    <Card>
      <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`Open trip ${o.pickup.landmark || "pickup"} to ${o.dropoff.landmark || "drop-off"}`}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <View style={{ flex: 1, paddingRight: tokens.space.sm }}>
            <Text style={{ fontSize: 14, fontWeight: "700", color: tokens.color.ink }} numberOfLines={1}>
              {o.pickup.landmark || "Pickup"} → {o.dropoff.landmark || "Drop-off"}
            </Text>
            <Text style={{ fontSize: 12, color: tokens.color.muted, marginTop: 2, fontVariant: ["tabular-nums"] }}>
              {fmtDate(o.createdAt)} · {o.role === "customer" ? "Sent" : "Delivered"}
              {o.counterpartyName ? ` · ${o.counterpartyName}` : ""}
              {o.rating ? ` · ★ ${o.rating.score}` : ""}
            </Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={{ fontSize: 16, fontWeight: "700", color: tokens.color.ink, fontVariant: ["tabular-nums"] }}>{formatMoney(fare)}</Text>
            <View style={{ height: 4 }} />
            <StatusPill status={o.status} />
          </View>
        </View>
      </Pressable>
      {/* Reorder (customer trips only): one tap re-opens the compose form prefilled with this trip's
          route, item and price — the "order again" shortcut every delivery app leans on for repeat runs. */}
      {onReorder ? (
        <Pressable
          onPress={onReorder}
          accessibilityRole="button"
          accessibilityLabel="Send this parcel again"
          style={({ pressed }) => ({
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "center",
            gap: tokens.space.sm,
            minHeight: tokens.touchTargetMin,
            marginTop: tokens.space.sm,
            borderRadius: tokens.radius.button,
            borderWidth: 1,
            borderColor: tokens.color.line,
            backgroundColor: pressed ? tokens.color.accentWash : "transparent",
          })}
        >
          <Icon name="package" size={16} color={tokens.color.accentText} />
          <Text style={{ fontSize: 14, fontWeight: "700", color: tokens.color.accentText }}>Send again</Text>
        </Pressable>
      ) : null}
    </Card>
  );
}

export default function HistoryScreen(): React.ReactElement {
  const router = useRouter();
  const historyQ = useQuery({ queryKey: ["history"], queryFn: getHistory });

  // Warm paint: the last-known trips list, loaded from SecureStore on mount, so a cold start renders
  // instantly (esp. offline) instead of a skeleton/error. The live fetch replaces it the moment it lands.
  const [cached, setCached] = useState<OrderHistoryRow[] | null>(null);
  useEffect(() => {
    void loadHistorySnapshot().then(setCached);
  }, []);
  // Persist each successful fetch so the NEXT cold start has something to paint.
  useEffect(() => {
    if (historyQ.data) void saveHistorySnapshot(historyQ.data);
  }, [historyQ.data]);

  const reorder = (o: OrderHistoryRow): void => {
    router.push({
      pathname: "/home",
      params: buildRebroadcastParams({ pickup: o.pickup, dropoff: o.dropoff, itemDesc: o.itemDesc, proposedFare: o.proposedFare }),
    });
  };

  // Live data wins; fall back to the cached snapshot while loading or when the fetch failed offline.
  const rows = historyQ.data ?? (historyQ.isLoading || historyQ.isError ? cached : null);
  // A customer can re-send any parcel they sent — offer the shortcut on their own trips.
  const canReorder = (o: OrderHistoryRow): boolean => o.role === "customer";

  return (
    <Screen>
      <Heading>Your trips</Heading>
      <Sub>Every parcel you&apos;ve sent or delivered.</Sub>
      {rows && rows.length > 0 ? (
        <ScrollView showsVerticalScrollIndicator={false}>
          {/* When we're painting the cached list because the live fetch failed, say so — the root
              offline banner explains why, this just sets expectations that it may be stale. */}
          {!historyQ.data && historyQ.isError ? (
            <Sub>Showing your last saved trips — we&apos;ll refresh when you&apos;re back online.</Sub>
          ) : null}
          {rows.map((o) => (
            <Row key={o.id} o={o} onPress={() => router.push(`/order/${o.id}`)} onReorder={canReorder(o) ? () => reorder(o) : undefined} />
          ))}
          <View style={{ height: tokens.space.xxl }} />
        </ScrollView>
      ) : historyQ.isLoading ? (
        <SkeletonRows />
      ) : historyQ.isError ? (
        <EmptyState icon="wifi-off" title="Couldn't load your trips" message="Check your connection and try again.">
          <Button label="Retry" onPress={() => void historyQ.refetch()} loading={historyQ.isFetching} />
        </EmptyState>
      ) : (
        <EmptyState icon="package" title="No trips yet" message="Your sent and delivered parcels will show up here.">
          <Button label="Send a parcel" onPress={() => router.replace("/home")} />
        </EmptyState>
      )}
      <Button label="Back" variant="ghost" onPress={() => router.back()} />
    </Screen>
  );
}
