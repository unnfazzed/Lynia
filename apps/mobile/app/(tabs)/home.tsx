import { tokens } from "@lynia/shared";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { getActiveCustomerOrder, type OrderSnapshot } from "../../src/api/orders";
import {
  liveOrderCardCopy,
  liveOrderStepIndex,
  LIVE_ORDER_STEP_COUNT,
  type ReorderRailItem,
  reorderRailItems,
  restaurantCardStatus,
} from "../../src/logic/home-feed";
import { buildRebroadcastParams } from "../../src/logic/order-draft";
import { useNow } from "../../src/logic/use-now";
import { useFeatureFlags } from "../../src/net/use-feature-flags";
import { invalidateIfStale, orderKey } from "../../src/query/client";
import { invalidateCustomerOrderHistory, useHistoryFeed } from "../../src/query/use-history-feed";
import { useRestaurantListFeed } from "../../src/query/use-restaurants";
import { useForegroundRefetch } from "../../src/realtime/use-foreground-refetch";
import {
  ActiveOrderCheckFailedBanner,
  AppScreen,
  BrandHeader,
  getServiceTiles,
  LiveOrderCard,
  ReorderRail,
  RestaurantCard,
  ServiceTiles,
  SkeletonRows,
  statusPillLabel,
  useActiveOrderCheckGate,
} from "../../src/ui";

const RESTAURANT_RAIL_LIMIT = 10;
const ACTIVE_ORDER_KEY = ["activeCustomerOrder"] as const;

/**
 * "Restaurants near you" (plan §5 A2), live data from the Lane C1 customer read API (already
 * shipped, same feed D1's browse list consumes). Renders nothing with the flag off — `ServiceTiles`
 * already degrades the Food tile to "Soon", so a rail with nowhere honest to link would be a dead
 * end. A genuinely empty result (no restaurants onboarded yet) also renders nothing: the full browse
 * screen (`/food`) owns that empty state, and a launcher rail has no room to explain it.
 */
function RestaurantsRail(): React.ReactElement | null {
  const router = useRouter();
  const { restaurantsEnabled } = useFeatureFlags();
  const feed = useRestaurantListFeed(restaurantsEnabled);
  // LC-B06: was `useMemo(() => new Date(), [feed.restaurants])`, mirroring D1's food/index.tsx — but
  // that mirrored the same bug: structural sharing on a no-change refetch keeps `feed.restaurants`'
  // reference stable, so `now` stayed pinned at first render and the rail's open/closing-soon status
  // never advanced for the life of the screen.
  const now = useNow();

  if (!restaurantsEnabled) return null;

  const restaurants = (feed.restaurants ?? []).slice(0, RESTAURANT_RAIL_LIMIT);
  const loading = restaurants.length === 0 && feed.isFetching;
  if (restaurants.length === 0 && !loading) return null;

  return (
    <View>
      <View
        style={{
          flexDirection: "row",
          alignItems: "baseline",
          paddingHorizontal: tokens.space.screen,
          paddingTop: tokens.space.md,
          paddingBottom: 6,
        }}
      >
        <Text style={{ flex: 1, fontSize: 16, fontWeight: "700", color: tokens.color.ink }}>Restaurants near you</Text>
        {restaurants.length > 0 ? (
          <Pressable onPress={() => router.push("/food")} accessibilityRole="button" accessibilityLabel="See all restaurants">
            <Text style={{ fontSize: 12.5, fontWeight: "700", color: tokens.color.accentText }}>See all →</Text>
          </Pressable>
        ) : null}
      </View>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 10, paddingHorizontal: tokens.space.screen, paddingBottom: tokens.space.md }}
      >
        {loading
          ? [0, 1, 2].map((i) => (
              <View
                key={i}
                accessibilityLabel="Loading"
                accessibilityState={{ busy: true }}
                style={{ width: 172, height: 130, borderRadius: tokens.radius.card, backgroundColor: tokens.color.surface }}
              />
            ))
          : restaurants.map((r) => {
              const status = restaurantCardStatus(r.hours, now);
              return (
                <RestaurantCard
                  key={r.id}
                  restaurant={r}
                  closed={status.closed}
                  note={status.note}
                  onPress={() => router.push(`/food/${r.id}`)}
                />
              );
            })}
      </ScrollView>
    </View>
  );
}

export default function LauncherHomeScreen(): React.ReactElement {
  const router = useRouter();
  const qc = useQueryClient();
  const { restaurantsEnabled } = useFeatureFlags();
  const services = getServiceTiles(restaurantsEnabled);

  // Restore path, mirroring `send.tsx`'s own ActiveOrderBanner query: gated to poll only while this
  // screen is the visible route (PERF20-01's rule), refreshed on focus + app foreground so a status
  // change that happened elsewhere/backgrounded isn't stale on return. Same `["activeCustomerOrder"]`
  // key `send.tsx` reads, so the two screens share one cache entry instead of double-fetching.
  // A-O15: focus/foreground use `invalidateIfStale`, not a raw `invalidateQueries` — a customer
  // lingering on/returning to Home shouldn't pay a round trip for data `useBootstrap` (or the last
  // 30s poll) already seeded fresh; a genuinely stale entry still refetches immediately.
  const [homeFocused, setHomeFocused] = useState(true);
  useFocusEffect(
    useCallback(() => {
      setHomeFocused(true);
      invalidateIfStale(qc, ACTIVE_ORDER_KEY);
      return () => setHomeFocused(false);
    }, [qc]),
  );
  const activeOrderQ = useQuery({
    queryKey: ACTIVE_ORDER_KEY,
    queryFn: getActiveCustomerOrder,
    refetchInterval: homeFocused ? 30_000 : false,
  });
  const historyFeed = useHistoryFeed();
  useForegroundRefetch(() => {
    invalidateIfStale(qc, ACTIVE_ORDER_KEY);
    invalidateCustomerOrderHistory(qc);
  });
  const activeOrder = activeOrderQ.data ?? null;
  // UX-2026-08-05: only surface a failed check when the device holds evidence an order may actually
  // be in flight — see useActiveOrderCheckGate's rationale.
  const activeOrderCheckFailed = useActiveOrderCheckGate(activeOrderQ);
  // Only seed orderKey(id) while THIS screen is the visible route. When home is blurred beneath
  // /order/[id] (the customer is looking at the live tracking screen), use-order-socket.ts owns that
  // same cache entry and merges live position/status pushes into it with an anti-rollback guard
  // (lastPositionRef/reconcileAfterRefetch) — a raw full-object setQueryData from here, triggered by
  // an unrelated foreground/focus refetch of activeOrderQ, would blindly replace that entry and could
  // roll the rider's pin backward on the map. Gating on homeFocused means this write only ever seeds
  // the cache for a subsequent navigation TO /order/[id], never clobbers it while already there.
  useEffect(() => {
    if (homeFocused && activeOrder) qc.setQueryData<OrderSnapshot>(orderKey(activeOrder.id), activeOrder);
  }, [homeFocused, activeOrder, qc]);

  const onService = (id: string): void => {
    if (id === "express") router.push("/send");
    // Food tile only renders live when restaurantsEnabled (getServiceTiles), so this branch is only
    // reachable with the flag on — D1 shipped the browse route it pushes to.
    else if (id === "food") router.push("/food");
  };

  const onReorder = (item: ReorderRailItem): void => {
    const row = (historyFeed.rows ?? []).find((r) => r.id === item.id);
    if (!row) return;
    router.push({
      pathname: "/send",
      params: buildRebroadcastParams({ pickup: row.pickup, dropoff: row.dropoff, itemDesc: row.itemDesc, proposedFare: row.proposedFare, note: row.note }),
    });
  };

  return (
    <AppScreen
      dark
      banner={
        <BrandHeader
          address="Harare"
          onAddress={() => router.push("/send")}
          onSearch={() => router.push("/send")}
          onBell={() => router.push("/notifications")}
          onProfile={() => router.push("/account")}
        />
      }
    >
      <ScrollView contentContainerStyle={{ paddingTop: 8, paddingBottom: tokens.space.xl }} showsVerticalScrollIndicator={false}>
        <View style={{ paddingHorizontal: 10 }}>
          <ServiceTiles services={services} onService={onService} />
        </View>
        {activeOrderQ.isLoading || (historyFeed.rows === null && historyFeed.isFetching) ? (
          // Genuine first load (BOTH feeds this screen paints from) — a skeleton beats a blank gap
          // between the tiles and the restaurants rail, mirroring the Orders tab's own loading rule.
          <View style={{ paddingHorizontal: tokens.space.screen, paddingTop: tokens.space.sm }}>
            <SkeletonRows count={2} />
          </View>
        ) : activeOrder ? (
          <View style={{ paddingHorizontal: tokens.space.screen, paddingTop: tokens.space.sm }}>
            <LiveOrderCard
              {...liveOrderCardCopy(activeOrder, statusPillLabel(activeOrder.status))}
              step={liveOrderStepIndex(activeOrder.status)}
              steps={LIVE_ORDER_STEP_COUNT}
              onPress={() => router.push(`/order/${activeOrder.id}`)}
            />
          </View>
        ) : activeOrderCheckFailed ? (
          // UX20-01's rule, applied to this call site too: a customer with a genuine live order who
          // hits an error on this exact check must see a way back to it, not a silently-empty rail —
          // evidence-gated (UX-2026-08-05) so an inconsequential flaky-link failure stays quiet.
          <View style={{ paddingHorizontal: tokens.space.screen, paddingTop: tokens.space.sm }}>
            <ActiveOrderCheckFailedBanner onRetry={() => void activeOrderQ.refetch()} retrying={activeOrderQ.isFetching} />
          </View>
        ) : (
          <ReorderRail items={reorderRailItems(historyFeed.rows ?? [])} onItem={onReorder} />
        )}
        <RestaurantsRail />
      </ScrollView>
    </AppScreen>
  );
}
