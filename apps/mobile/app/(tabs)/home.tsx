import { tokens } from "@lynia/shared/tokens";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useState } from "react";
import { InteractionManager, Pressable, ScrollView, Text, View } from "react-native";
import { getActiveCustomerOrders, type OrderSnapshot } from "../../src/api/orders";
import { loadDeliveryCode } from "../../src/auth/device-state";
import { liveOrderCardModel, restaurantCardStatus } from "../../src/logic/home-feed";
import { useNow } from "../../src/logic/use-now";
import { useFeatureFlags } from "../../src/net/use-feature-flags";
import { invalidateIfStale, orderKey } from "../../src/query/client";
import { useRestaurantListFeed } from "../../src/query/use-restaurants";
import { useForegroundRefetch } from "../../src/realtime/use-foreground-refetch";
import {
  AppScreen,
  BrandHeader,
  getServiceTiles,
  LiveOrderCard,
  RestaurantCard,
  ServiceTiles,
  SkeletonRows,
  statusPillLabel,
} from "../../src/ui";

const RESTAURANT_RAIL_LIMIT = 10;
const ACTIVE_ORDERS_KEY = ["activeCustomerOrders"] as const;

/**
 * PERF-SEND-01 (second half). expo-router loads route components lazily — `useScreens` passes
 * `getComponent={() => getQualifiedRouteComponent(route)}`, so a route's module graph is EVALUATED on
 * the first navigation to it, not at launch. `/send` is the heaviest route in the customer app by that
 * measure: 57 modules / ~140 KB of minified JS that no other screen pulls in (measured by diffing the
 * production Metro graph with and without `app/send.tsx` — 1,815 → 1,872 modules), 29 of them
 * `react-native-maps` + `expo-location`. All of it used to be evaluated synchronously inside the tap
 * handler, which is why the FIRST "Send" tap of a session is the slow one and later taps are not.
 *
 * Warming it from the launcher's idle time moves that evaluation off the tap path entirely. It is a
 * plain `require` inside `runAfterInteractions`, deliberately not a top-level import: Metro keeps the
 * module in the same single bundle either way, so what changes is only WHEN it is evaluated — a
 * top-level import here would drag all 57 modules back into the launch graph and re-open MOB-BOOT-03.
 * The graph is therefore evaluated once per process and every later mount is a module-cache hit, so
 * this needs no "already warmed" bookkeeping of its own. Best-effort by construction — a throw here
 * must never take down the launcher, and the route still loads on tap the way it always did.
 */
function usePrewarmSendRoute(): void {
  useEffect(() => {
    const handle = InteractionManager.runAfterInteractions(() => {
      try {
        require("../send");
      } catch {
        /* the tap path re-requires it and surfaces any real failure there */
      }
    });
    return () => handle.cancel();
  }, []);
}

/**
 * The customer's own delivery code per live PARCEL order, from the same per-order SecureStore the
 * tracking screen reads — the design's parcel home card leads its meta with it ("Delivery code
 * 4192 · $3.36"). Best-effort and read-only: an order whose code was never stored on THIS device
 * (or a store failure) just renders the fare alone.
 */
function useDeliveryCodes(orders: OrderSnapshot[]): Record<string, string | null> {
  const [codes, setCodes] = useState<Record<string, string | null>>({});
  useEffect(() => {
    let alive = true;
    for (const o of orders) {
      if (o.orderType === "merchant" || o.id in codes) continue;
      void loadDeliveryCode(o.id)
        .then((code) => {
          if (alive) setCodes((prev) => (o.id in prev ? prev : { ...prev, [o.id]: code }));
        })
        .catch(() => {
          if (alive) setCodes((prev) => (o.id in prev ? prev : { ...prev, [o.id]: null }));
        });
    }
    return () => {
      alive = false;
    };
  }, [orders, codes]);
  return codes;
}

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
  usePrewarmSendRoute();

  // Live-orders read, mirroring the old single-order query's rules: gated to poll only while this
  // screen is the visible route (PERF20-01's rule), refreshed on focus + app foreground so a status
  // change that happened elsewhere/backgrounded isn't stale on return. Now the LIST endpoint —
  // RC.home draws one LiveOrderCard per running job (food and parcels alike), so the single
  // most-recent row `mine/active-order` serves (kept for send.tsx's restore banner) is not enough.
  // A-O15: focus/foreground use `invalidateIfStale`, not a raw `invalidateQueries` — a customer
  // lingering on/returning to Home shouldn't pay a round trip for data `useBootstrap` (or the last
  // 30s poll) already seeded fresh; a genuinely stale entry still refetches immediately.
  const [homeFocused, setHomeFocused] = useState(true);
  useFocusEffect(
    useCallback(() => {
      setHomeFocused(true);
      invalidateIfStale(qc, ACTIVE_ORDERS_KEY);
      return () => setHomeFocused(false);
    }, [qc]),
  );
  const activeOrdersQ = useQuery({
    queryKey: ACTIVE_ORDERS_KEY,
    queryFn: getActiveCustomerOrders,
    refetchInterval: homeFocused ? 30_000 : false,
  });
  useForegroundRefetch(() => {
    invalidateIfStale(qc, ACTIVE_ORDERS_KEY);
  });
  const activeOrders = activeOrdersQ.data ?? [];
  const deliveryCodes = useDeliveryCodes(activeOrders);
  // No failed-check banner here (owner instruction 2026-08-12): a background poll the customer never
  // triggered must not raise an error card over a working screen. A failed check simply shows no live
  // card, and the 30s poll + refetchOnReconnect restore it the moment the link heals.
  // Only seed orderKey(id) while THIS screen is the visible route. When home is blurred beneath
  // /order/[id] (the customer is looking at the live tracking screen), use-order-socket.ts owns that
  // same cache entry and merges live position/status pushes into it with an anti-rollback guard
  // (lastPositionRef/reconcileAfterRefetch) — a raw full-object setQueryData from here, triggered by
  // an unrelated foreground/focus refetch of activeOrdersQ, would blindly replace that entry and could
  // roll the rider's pin backward on the map. Gating on homeFocused means this write only ever seeds
  // the cache for a subsequent navigation TO /order/[id], never clobbers it while already there.
  // Parcels only: the food tracker reads its own `MerchantOrderResponse`-shaped cache (use-food-order),
  // which this generic snapshot must not be written into.
  useEffect(() => {
    if (!homeFocused) return;
    for (const o of activeOrders) {
      if (o.orderType !== "merchant") qc.setQueryData<OrderSnapshot>(orderKey(o.id), o);
    }
  }, [homeFocused, activeOrders, qc]);

  const onService = (id: string): void => {
    if (id === "express") router.push("/send");
    // Food tile only renders live when restaurantsEnabled (getServiceTiles), so this branch is only
    // reachable with the flag on — D1 shipped the browse route it pushes to.
    else if (id === "food") router.push("/food");
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
        {activeOrdersQ.isLoading ? (
          // Genuine first load — a skeleton beats a blank gap between the tiles and the restaurants
          // rail, mirroring the Orders tab's own loading rule.
          <View style={{ paddingHorizontal: tokens.space.screen, paddingTop: tokens.space.sm }}>
            <SkeletonRows count={2} />
          </View>
        ) : activeOrders.length > 0 ? (
          // One card per running job, newest first, stacked in the design AppHome's 8px-gap grid —
          // a food order and a parcel running side-by-side each keep their own card (RC.home).
          <View style={{ paddingHorizontal: tokens.space.screen, paddingTop: tokens.space.sm, gap: tokens.space.sm }}>
            {activeOrders.map((o) => {
              const card = liveOrderCardModel(o, statusPillLabel(o.status), deliveryCodes[o.id] ?? null);
              return (
                <LiveOrderCard
                  key={o.id}
                  icon={card.icon}
                  title={card.title}
                  meta={card.meta}
                  step={card.step}
                  steps={card.steps}
                  onPress={() => router.push(card.route)}
                />
              );
            })}
          </View>
        ) : null}
        {/* No order-again / send-again rail here — the design AppHome is explicit ("the live cards
            are the only thing above the venues"; owner decision 2026-08-12 resolving the conflict
            with home.prompt.md's ReorderRail spec). Reordering lives on the trip-history screen. */}
        <RestaurantsRail />
      </ScrollView>
    </AppScreen>
  );
}
