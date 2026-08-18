import { tokens } from "@lynia/shared/tokens";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { InteractionManager, Pressable, ScrollView, Text, useWindowDimensions, View } from "react-native";
import { getMe } from "../../src/api/auth";
import { getActiveCustomerOrders, type OrderSnapshot } from "../../src/api/orders";
import { greetingFor, greetingLine } from "../../src/logic/greeting";
import { useHomeLocation } from "../../src/logic/home-location";
import { liveOrderPillModel, popularNearYou, riderShortName } from "../../src/logic/home-feed";
import { loadRiderIdentity } from "../../src/logic/rider-identity";
import { useNow } from "../../src/logic/use-now";
import { useFeatureFlags } from "../../src/net/use-feature-flags";
import { invalidateIfStale, orderKey } from "../../src/query/client";
import { useNotificationsUnreadCount } from "../../src/query/use-notifications-unread";
import { useRestaurantListFeed } from "../../src/query/use-restaurants";
import { useForegroundRefetch } from "../../src/realtime/use-foreground-refetch";
import { enqueueBoot } from "../../src/telemetry/rum";
import {
  AppScreen,
  getServiceTiles,
  HomeAddressRow,
  HomeHeader,
  LiveOrderCard,
  RestaurantCard,
  ServiceTiles,
  SkeletonRows,
  statusPillLabel,
} from "../../src/ui";
// Not from the ui barrel: LocationSheet reaches AddressSearch, which imports the barrel back (a
// `no-circular` violation the moment the barrel re-exports it) — the same rule ComposeMap /
// BottomSheet / MapPicker already follow.
import { LocationSheet } from "../../src/ui/home/LocationSheet";
import { ServiceSoonSheet } from "../../src/ui/home/ServiceSoonSheet";

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
 * The rider's display name per live order, for the tracker pill's "Tendai M. · on the way".
 *
 * The active-orders snapshot carries the rider's `profileId` and GPS but NOT their name, so the only
 * place the app knows it is the on-device identity cache the tracking screen writes
 * (`logic/rider-identity.ts`). That is a SINGLE slot keyed by one order id, so at most one running
 * job resolves to a name and the rest fall back to service copy — which `liveOrderPillModel` handles.
 * Best-effort and read-only; a store failure just means no name.
 */
function useRiderNames(orders: OrderSnapshot[]): Record<string, string | null> {
  const [names, setNames] = useState<Record<string, string | null>>({});
  useEffect(() => {
    let alive = true;
    for (const o of orders) {
      if (o.id in names) continue;
      void loadRiderIdentity(o.id)
        .then((identity) => {
          const name = identity ? riderShortName(identity.firstName, identity.lastName) : null;
          if (alive) setNames((prev) => (o.id in prev ? prev : { ...prev, [o.id]: name }));
        })
        .catch(() => {
          if (alive) setNames((prev) => (o.id in prev ? prev : { ...prev, [o.id]: null }));
        });
    }
    return () => {
      alive = false;
    };
  }, [orders, names]);
  return names;
}

/**
 * The third cold-start mark (`boot_home_paint`): the redirect→home segment was the one part of the
 * launch RUM never covered — `boot_home` fires at the redirect DECISION (app/index.tsx), so the
 * time from there to home actually being on glass was invisible (RCA §1.2). Enqueued from
 * `runAfterInteractions`, not the mount/layout effect itself: a layout effect runs before the
 * native frame is presented and would understate the customer-visible gap (review decision).
 * `enqueueBoot` is idempotent per process, so later remounts of home are no-ops, and on a warm
 * navigation back to home nothing fires at all.
 */
function useBootHomePaintMark(): void {
  useEffect(() => {
    const handle = InteractionManager.runAfterInteractions(() => enqueueBoot("boot_home_paint"));
    return () => handle.cancel();
  }, []);
}

export default function LauncherHomeScreen(): React.ReactElement {
  const router = useRouter();
  const qc = useQueryClient();
  const { restaurantsEnabled } = useFeatureFlags();
  const services = getServiceTiles(restaurantsEnabled);
  usePrewarmSendRoute();
  useBootHomePaintMark();

  // ── Header state: greeting (device clock), name (["me"]), unread bell dot, detected location ──
  const now = useNow();
  const greeting = greetingFor(now);
  // `["me"]` is the same key `useBootstrap` seeds at app root and `src/query/persist.ts` restores
  // across launches, so on a normal boot the greeting name is already in cache and this costs no
  // request (react-query's 30s staleTime + per-key dedupe with send.tsx / profile).
  const meQ = useQuery({ queryKey: ["me"], queryFn: getMe });
  const unreadCount = useNotificationsUnreadCount();
  const location = useHomeLocation();
  const [locationOpen, setLocationOpen] = useState(false);
  const [soonOpen, setSoonOpen] = useState(false);

  // Live-orders read, mirroring the old single-order query's rules: gated to poll only while this
  // screen is the visible route (PERF20-01's rule), refreshed on focus + app foreground so a status
  // change that happened elsewhere/backgrounded isn't stale on return. Now the LIST endpoint —
  // 8c draws one tracker pill per running job (food and parcels alike), so the single most-recent
  // row `mine/active-order` serves (kept for send.tsx's restore banner) is not enough.
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
  const riderNames = useRiderNames(activeOrders);
  // No failed-check banner here (owner instruction 2026-08-12): a background poll the customer never
  // triggered must not raise an error card over a working screen. A failed check simply shows no live
  // pill, and the 30s poll + refetchOnReconnect restore it the moment the link heals.
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

  // ── "Popular near you" (8c §4) — the nearest open venues from the same feed /food browses ──
  // Renders nothing with the flag off: the Restaurants tile is degraded to SOON, so a grid with
  // nowhere honest to link would be a dead end. A genuinely empty result renders nothing too — the
  // full browse screen owns that empty state, and a home grid has no room to explain it.
  const feed = useRestaurantListFeed(restaurantsEnabled);
  // Two columns inside 16px gutters with a 10px gap — measured rather than expressed as a
  // percentage so a lone odd card stays a half-width card instead of stretching across the row.
  const { width: viewportWidth } = useWindowDimensions();
  const venueCardWidth = Math.max(120, Math.floor((viewportWidth - 16 * 2 - 10) / 2));
  const venues = useMemo(
    () => popularNearYou(feed.restaurants ?? [], now, location.point),
    [feed.restaurants, now, location.point],
  );

  const onService = (id: string): void => {
    if (id === "express") router.push("/send");
    else if (id === "food" && restaurantsEnabled) router.push("/food");
    // Pharmacy — and Restaurants while the kill switch is off — open the notify-me sheet. A SOON
    // tile is never inert (8c §2).
    else setSoonOpen(true);
  };

  return (
    <AppScreen
      bg={tokens.color.accentWash}
      banner={
        <HomeHeader
          greeting={greetingLine(greeting.phrase, meQ.data?.firstName)}
          evening={greeting.evening}
          unread={unreadCount > 0}
          subRow={<HomeAddressRow address={location.label} onPress={() => setLocationOpen(true)} />}
          search={{ placeholder: "Search food, or send a parcel", onPress: () => router.push("/food/search") }}
          onBell={() => router.push("/notifications")}
        />
      }
    >
      <ScrollView
        style={{ backgroundColor: tokens.color.bg }}
        contentContainerStyle={{ paddingBottom: tokens.space.xl }}
        showsVerticalScrollIndicator={false}
      >
        <ServiceTiles services={services} onService={onService} />
        {activeOrdersQ.isLoading ? (
          // Genuine first load — a skeleton beats a blank gap between the tiles and the venues grid,
          // mirroring the Orders tab's own loading rule.
          <View style={{ paddingHorizontal: tokens.space.screen, paddingTop: tokens.space.md }}>
            <SkeletonRows count={1} />
          </View>
        ) : (
          // One pill per running job, newest first — a food order and a parcel running side by side
          // each keep their own pill. Nothing renders when nothing is running (8c §3).
          activeOrders.map((o) => {
            const pill = liveOrderPillModel(o, statusPillLabel(o.status), riderNames[o.id] ?? null);
            return (
              <LiveOrderCard
                key={o.id}
                icon={pill.icon}
                title={pill.title}
                step={pill.step}
                steps={pill.steps}
                etaMinutes={pill.etaMinutes}
                onPress={() => router.push(pill.route)}
              />
            );
          })
        )}
        {venues.length > 0 ? (
          <View>
            <View style={{ flexDirection: "row", alignItems: "baseline", paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8 }}>
              {/* `lineHeight` is Inter's own 16 x 1.21 — without it RN's default line box is 2px shorter
                  than the reference's and the whole section header sits 2px short. */}
              <Text style={{ flex: 1, fontSize: 16, lineHeight: 19.36, fontWeight: "700", color: tokens.color.ink }}>Popular near you</Text>
              <Pressable onPress={() => router.push("/food")} accessibilityRole="button" accessibilityLabel="See all restaurants">
                <Text style={{ fontSize: 12.5, fontWeight: "700", color: tokens.color.accentText }}>See all →</Text>
              </Pressable>
            </View>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 10, paddingHorizontal: 16 }}>
              {venues.map((v) => (
                <RestaurantCard
                  key={v.id}
                  name={v.name}
                  photoUrl={v.photoUrl}
                  rating={v.rating}
                  etaMinutes={v.etaMinutes}
                  deliveryFee={v.deliveryFee}
                  closed={v.closed}
                  width={venueCardWidth}
                  onPress={() => router.push(`/food/${v.id}`)}
                />
              ))}
            </View>
          </View>
        ) : null}
      </ScrollView>
      <LocationSheet
        visible={locationOpen}
        denied={location.denied}
        onClose={() => setLocationOpen(false)}
        onUseCurrentLocation={location.useCurrentLocation}
        onPick={location.setManualPlace}
      />
      <ServiceSoonSheet
        visible={soonOpen}
        serviceId="pharm"
        title="Pharmacy"
        body="Prescriptions and over-the-counter essentials, delivered by the same riders. We're signing up pharmacies now — we'll let you know the moment it's live."
        onClose={() => setSoonOpen(false)}
      />
    </AppScreen>
  );
}
