import { tokens } from "@lynia/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { getActiveCustomerOrders, type OrderHistoryRow, type OrderSnapshot } from "../../src/api/orders";
import { formatMoney } from "../../src/logic/money";
import { useFeatureFlags } from "../../src/net/use-feature-flags";
import { invalidateCustomerOrderHistory, useHistoryFeed } from "../../src/query/use-history-feed";
import { useForegroundRefetch } from "../../src/realtime/use-foreground-refetch";
import { ActiveOrderCheckFailedBanner, AppScreen, Button, Card, EmptyState, Icon, Money, SkeletonRows, statusPillLabel, useActiveOrderCheckGate } from "../../src/ui";

const ACTIVE_ORDERS_KEY = ["activeCustomerOrders"] as const;

// The rider-side subtitle used to hardcode "Delivered" for every trip regardless of outcome (fixed
// in the standalone /history screen) — same fix, independent copy per home-feed.ts's own convention
// of keeping small per-file label helpers rather than cross-importing them.
function riderOutcomeLabel(status: string): string {
  return status === "delivered" || status === "completed" ? "Delivered" : statusPillLabel(status);
}

function fmtDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}

// One row anatomy for both services (plan §5 A3 "one cross-service list"), matching
// `packages/design/explorations/restaurants/r-customer-a.jsx`'s `RC.orders`: an icon avatar keyed
// off `orderType`, the restaurant name for a food order (its pickup/dropoff are the kitchen/customer
// address, not a title a customer recognizes), the route for a parcel.
function OrderRow({ o, onPress }: { o: OrderHistoryRow; onPress: () => void }): React.ReactElement {
  const isFood = o.orderType === "merchant";
  const title = isFood ? o.merchantName || "Restaurant order" : `${o.pickup.landmark || "Pickup"} → ${o.dropoff.landmark || "Drop-off"}`;
  const outcome = o.role === "customer" ? "Sent" : riderOutcomeLabel(o.status);
  const fare = o.agreedFare ?? o.proposedFare;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`Open order ${title}`}
      style={({ pressed }) => ({
        flexDirection: "row",
        alignItems: "center",
        gap: tokens.space.sm,
        minHeight: tokens.touchTargetMin,
        paddingVertical: 11,
        borderBottomWidth: 1,
        borderBottomColor: tokens.color.line,
        backgroundColor: pressed ? tokens.color.accentWash : "transparent",
      })}
    >
      <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: tokens.color.surface, alignItems: "center", justifyContent: "center" }}>
        <Icon name={isFood ? "utensils" : "package"} size={16} color={tokens.color.muted} />
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 13.5, fontWeight: "600", color: tokens.color.ink }} numberOfLines={1}>
          {title}
        </Text>
        <Text style={{ fontSize: 12, color: tokens.color.muted, marginTop: 2 }} numberOfLines={1}>
          {fmtDate(o.createdAt)} · {outcome}
          {o.counterpartyName ? ` · ${o.counterpartyName}` : ""}
        </Text>
      </View>
      <Text style={{ fontSize: 13, fontWeight: "600", color: tokens.color.muted, fontVariant: ["tabular-nums"] }}>{formatMoney(fare)}</Text>
    </Pressable>
  );
}

// Kit RC.orders (r-customer-a.jsx:48-57): the pinned live order is a compact accent card — a round
// icon avatar keyed off `orderType`, the order's headline, its status line in accent-green, and the
// fare. Not the home tab's stepper LiveOrderCard: the mock draws no progress strip here.
function ActiveOrderCard({ o, onPress }: { o: OrderSnapshot; onPress: () => void }): React.ReactElement {
  const isFood = o.orderType === "merchant";
  // Kit RC.orders draws the RESTAURANT as a food job's headline ("Sadza Republic") — the snapshot
  // carries `merchantName` for exactly this; a parcel reads as its route (matching the EARLIER
  // OrderRow anatomy).
  const title = isFood ? o.merchantName || "Restaurant order" : `${o.pickup.landmark || "Pickup"} → ${o.dropoff.landmark || "Drop-off"}`;
  const fare = o.agreedFare ?? o.proposedFare;
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={`Open live order ${title}`} style={{ marginBottom: tokens.space.md }}>
      <Card accent style={{ padding: 12, marginBottom: 0 }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: tokens.color.accentWash, alignItems: "center", justifyContent: "center" }}>
            <Icon name={isFood ? "utensils" : "package"} size={17} color={tokens.color.accentText} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={{ fontSize: 13.5, fontWeight: "700", color: tokens.color.ink }}>
              {title}
            </Text>
            <Text numberOfLines={1} style={{ fontSize: 12, fontWeight: "600", color: tokens.color.accentText, marginTop: 1 }}>
              {statusPillLabel(o.status)}
            </Text>
          </View>
          <Money v={fare} size={14} />
        </View>
      </Card>
    </Pressable>
  );
}

/**
 * Orders tab (plan §5 A3) — absorbs `app/history/`'s content directly instead of bridging out to
 * it: one cross-service list, live order pinned on top. `app/history/index.tsx` itself is left
 * running unchanged (the rider Account tab still bridges to it, out of this lane's scope), so this
 * screen owns its own copy of the row anatomy rather than reaching into that route's internals.
 */
export default function OrdersTabScreen(): React.ReactElement {
  const router = useRouter();
  const qc = useQueryClient();
  const { restaurantsEnabled } = useFeatureFlags();

  // Mirrors `(tabs)/home.tsx`'s own live-orders query: focus-gated polling, same
  // `["activeCustomerOrders"]` cache entry both screens share. The LIST endpoint — one pinned card
  // per running job (a food order and a parcel running side-by-side both pin), matching home's
  // one-card-per-job rule; `send.tsx`'s restore banner keeps its own single-order key.
  const [focused, setFocused] = useState(true);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      void qc.invalidateQueries({ queryKey: ACTIVE_ORDERS_KEY });
      return () => setFocused(false);
    }, [qc]),
  );
  const activeOrdersQ = useQuery({
    queryKey: ACTIVE_ORDERS_KEY,
    queryFn: getActiveCustomerOrders,
    refetchInterval: focused ? 30_000 : false,
  });
  const activeOrders = activeOrdersQ.data ?? [];
  // UX-2026-08-05: only surface a failed check when the device holds evidence an order may actually
  // be in flight — see useActiveOrderCheckGate's rationale.
  const activeOrderCheckFailed = useActiveOrderCheckGate({
    isError: activeOrdersQ.isError,
    isSuccess: activeOrdersQ.isSuccess,
    data: activeOrders[0] ?? null,
  });

  const { rows, showingStale, isFetching, isError, hasLiveData, refetch } = useHistoryFeed();
  useForegroundRefetch(() => {
    void qc.invalidateQueries({ queryKey: ACTIVE_ORDERS_KEY });
    invalidateCustomerOrderHistory(qc);
  });

  // Live orders also appear in the same history feed (their status hasn't reached a terminal one
  // yet) — excluded from "earlier" so they aren't shown twice.
  const liveIds = new Set(activeOrders.map((o) => o.id));
  const earlier = (rows ?? []).filter((r) => !liveIds.has(r.id));

  return (
    <AppScreen>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: tokens.space.screen, paddingBottom: tokens.space.xl }}
        showsVerticalScrollIndicator={false}
      >
        {/* Kit RC.orders: the screen title is 19px/700, not the 24px shared Heading. */}
        <Text style={{ fontSize: 19, fontWeight: "700", color: tokens.color.ink, marginBottom: 10 }}>Your orders</Text>

        {activeOrders.length > 0 ? (
          activeOrders.map((o) => (
            <ActiveOrderCard
              key={o.id}
              o={o}
              // A food job opens the food live tracker (its screen reads the MerchantOrderResponse
              // feed); a parcel opens the generic tracking screen.
              onPress={() => router.push(o.orderType === "merchant" ? `/food/order/${o.id}` : `/order/${o.id}`)}
            />
          ))
        ) : activeOrderCheckFailed ? (
          // UX20-01's rule, applied to this call site too: a customer with a genuine live order who
          // hits an error on this exact check must see a way back to it, not just the earlier list —
          // evidence-gated (UX-2026-08-05) so an inconsequential flaky-link failure stays quiet.
          <View style={{ marginBottom: tokens.space.md }}>
            <ActiveOrderCheckFailedBanner onRetry={() => void activeOrdersQ.refetch()} retrying={activeOrdersQ.isFetching} />
          </View>
        ) : null}

        {earlier.length > 0 ? (
          <>
            <Text style={{ fontSize: 12, fontWeight: "700", color: tokens.color.muted, marginBottom: 6 }}>EARLIER</Text>
            {/* Painting the cached list because live data is absent — same stale/retry rule
                `app/history/index.tsx` uses (offline-paused vs a genuine fetch error). */}
            {showingStale ? (
              <View style={{ marginBottom: tokens.space.sm }}>
                <Text style={{ fontSize: tokens.font.size.body, color: tokens.color.muted, marginBottom: tokens.space.sm }}>
                  Showing your last saved orders — we&apos;ll refresh when you&apos;re back online.
                </Text>
                {isError ? <Button label="Retry" variant="ghost" onPress={refetch} loading={isFetching} /> : null}
              </View>
            ) : null}
            {earlier.map((o) => (
              <OrderRow key={o.id} o={o} onPress={() => router.push(`/order/${o.id}`)} />
            ))}
          </>
        ) : rows === null && isFetching ? (
          // A genuine first load is in flight — skeleton (NOT shown for the offline paused state below).
          <SkeletonRows />
        ) : hasLiveData ? (
          // Live data arrived with no earlier orders. With a live order already pinned above, that's
          // an unremarkable "nothing before this one yet" — not the true empty state.
          activeOrders.length > 0 ? null : (
            // Kit R0·b1 `orders_empty` (r-customer-a.jsx:565): the empty state sits inside a Card (the
            // owner-decided empty-state wrapper), not bare on the page.
            <Card style={{ paddingTop: 10, paddingRight: 16, paddingBottom: 18, paddingLeft: 16, marginTop: 24 }}>
              <EmptyState
                icon="receipt"
                title="Nothing here yet"
                message="Parcels and food orders both land on this screen — you'll be able to reorder from here in one tap."
              >
                {restaurantsEnabled ? <Button label="Find food near you" onPress={() => router.push("/food")} /> : null}
                {/* push, not replace: from a tab root, router.replace('/send') swaps out the whole
                    (tabs) group — the tab bar vanishes and Android back exits the app from a screen
                    that draws no back. push keeps the tab shell beneath so back returns to Orders. */}
                <Button label="Send a parcel" variant={restaurantsEnabled ? "ghost" : "primary"} onPress={() => router.push("/send")} />
              </EmptyState>
            </Card>
          )
        ) : (
          // No data and NOT fetching — an errored fetch or the offline paused state with no cache.
          <EmptyState icon="wifi-off" title="Couldn't load your orders" message="Check your connection and try again.">
            <Button label="Retry" onPress={refetch} loading={isFetching} />
          </EmptyState>
        )}
      </ScrollView>
    </AppScreen>
  );
}
