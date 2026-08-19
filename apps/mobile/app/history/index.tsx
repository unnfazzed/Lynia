import { tokens } from "@lynia/shared/tokens";
import { useRouter } from "expo-router";
import React from "react";
import { FlatList, Pressable, Text, View } from "react-native";
import type { OrderHistoryRow } from "../../src/api/orders";
import { buildRebroadcastParams } from "../../src/logic/order-draft";
import { formatMoney } from "../../src/logic/money";
import { useHistoryFeed } from "../../src/query/use-history-feed";
import { AppBar, Button, Card, EmptyState, Icon, orderStatusTone, Screen, SkeletonRows, StatusPill, statusPillLabel, Tappable } from "../../src/ui";

// The rider-side subtitle used to hardcode "Delivered" for every trip regardless of outcome, so a
// bailed-on or undelivered job read "Delivered" right next to a StatusPill saying otherwise on the
// same row. Route it through the same status labels the pill already uses.
function riderOutcomeLabel(status: string): string {
  return status === "delivered" || status === "completed" ? "Delivered" : statusPillLabel(status);
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

function Row({ o, onPress, onReorder }: { o: OrderHistoryRow; onPress: () => void; onReorder?: () => void }): React.ReactElement {
  const fare = o.agreedFare ?? o.proposedFare;
  return (
    <Card>
      <Tappable onPress={onPress} accessibilityRole="button" accessibilityLabel={`Open trip ${o.pickup.landmark || "pickup"} to ${o.dropoff.landmark || "drop-off"}`}>
        <View style={{ flexDirection: "row", alignItems: "center" }}>
          <View style={{ flex: 1, paddingRight: tokens.space.sm }}>
            <Text style={{ fontSize: 14, fontWeight: "600", color: tokens.color.ink }} numberOfLines={1}>
              {o.pickup.landmark || "Pickup"} → {o.dropoff.landmark || "Drop-off"}
            </Text>
            <Text style={{ fontSize: 12, color: tokens.color.muted, marginTop: 2, fontVariant: ["tabular-nums"] }}>
              {fmtDate(o.createdAt)} · {o.role === "customer" ? "Sent" : riderOutcomeLabel(o.status)}
              {o.counterpartyName ? ` · ${o.counterpartyName}` : ""}
              {o.rating ? ` · ★ ${o.rating.score}` : ""}
            </Text>
          </View>
          <View style={{ alignItems: "flex-end" }}>
            <Text style={{ fontSize: 15, fontWeight: "700", color: tokens.color.ink, fontVariant: ["tabular-nums"] }}>{formatMoney(fare)}</Text>
            <View style={{ height: 4 }} />
            <StatusPill status={o.status} tone={orderStatusTone(o.status)} />
          </View>
        </View>
      </Tappable>
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
  // Shared warm-paint feed (load + persist + offline-paused rule live in one place).
  const { rows, showingStale, isFetching, isError, hasLiveData, refetch } = useHistoryFeed();

  const reorder = (o: OrderHistoryRow): void => {
    router.push({
      pathname: "/send",
      params: buildRebroadcastParams({ pickup: o.pickup, dropoff: o.dropoff, itemDesc: o.itemDesc, proposedFare: o.proposedFare, note: o.note }),
    });
  };

  // A customer can re-send any parcel they sent — offer the shortcut on their own trips.
  const canReorder = (o: OrderHistoryRow): boolean => o.role === "customer";

  return (
    <Screen>
      {/* Kit AppBar (pushed-screen header) — title + sub live in the bar; no in-body Heading. */}
      <AppBar title="Your trips" sub="Every parcel you've sent or delivered" onBack={() => router.back()} />
      {rows && rows.length > 0 ? (
        // B-O1: was a ScrollView + `.map()` over the full (server-capped 50-row) history — FlatList
        // windows the concurrently-mounted rows to what's on-screen, matching the food-catalog
        // precedent (B-T3/LC-B07), for the Go-class scroll-smoothness win rather than a memory one.
        <FlatList
          data={rows}
          keyExtractor={(o) => o.id}
          renderItem={({ item }) => (
            <Row o={item} onPress={() => router.push(`/order/${item.id}`)} onReorder={canReorder(item) ? () => reorder(item) : undefined} />
          )}
          showsVerticalScrollIndicator={false}
          // Painting the cached list because live data is absent — set the "may be stale" expectation,
          // and keep a Retry when the live fetch actually errored (it won't self-heal without a
          // reconnect event, so the manual retry must survive even while we show cached rows).
          ListHeaderComponent={
            showingStale ? (
              <View style={{ marginBottom: tokens.space.sm }}>
                <Text style={{ fontSize: tokens.font.size.body, color: tokens.color.muted, marginBottom: tokens.space.sm }}>
                  Showing your last saved trips — we&apos;ll refresh when you&apos;re back online.
                </Text>
                {isError ? <Button label="Retry" variant="ghost" onPress={refetch} loading={isFetching} /> : null}
              </View>
            ) : null
          }
          ListFooterComponent={<View style={{ height: tokens.space.xxl }} />}
        />
      ) : isFetching ? (
        // A genuine first load is in flight — skeleton (NOT shown for the offline paused state below).
        <SkeletonRows />
      ) : hasLiveData ? (
        // Live data arrived and it's empty — a genuine "no trips".
        <EmptyState icon="package" title="No trips yet" message="Your sent and delivered parcels will show up here.">
          {/* push, not replace: keep this screen beneath so back returns here (and the tab shell
              stays reachable), instead of swapping the pushed screen out of the stack. */}
          <Button label="Send a parcel" onPress={() => router.push("/send")} />
        </EmptyState>
      ) : (
        // No data and NOT fetching — an errored fetch or the offline paused state with no cache. Offer a
        // retry rather than an endless skeleton or a misleading "No trips yet".
        <EmptyState icon="wifi-off" title="Couldn't load your trips" message="Check your connection and try again.">
          <Button label="Retry" onPress={refetch} loading={isFetching} />
        </EmptyState>
      )}
    </Screen>
  );
}
