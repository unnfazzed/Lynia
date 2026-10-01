import { tokens } from "@lynia/shared/tokens";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useState } from "react";
import { InteractionManager, Platform, ScrollView, useWindowDimensions, View } from "react-native";
import { getMe } from "../../src/api/auth";
import { getActiveCustomerOrders, getActiveOrder, type OrderSnapshot } from "../../src/api/orders";
import { ACTIVE } from "../../src/logic/rider-job";
import { greetingFor } from "../../src/logic/greeting";
import { useHomeLocation } from "../../src/logic/home-location";
import { liveBarModel, popularNearYou } from "../../src/logic/home-feed";
import { loadRiderIdentity } from "../../src/logic/rider-identity";
import { useNow } from "../../src/logic/use-now";
import { useFeatureFlags } from "../../src/net/use-feature-flags";
import { invalidateIfStale, orderKey } from "../../src/query/client";
import { useNotificationsUnreadCount } from "../../src/query/use-notifications-unread";
import { useRestaurantListFeed } from "../../src/query/use-restaurants";
import { useForegroundRefetch } from "../../src/realtime/use-foreground-refetch";
import { enqueueBoot } from "../../src/telemetry/rum";
import { statusPillLabel } from "../../src/ui";
import { StatusBar } from "expo-status-bar";
import { H } from "../../src/ui/home/copy";
import {
  HomeTop,
  LiveOrderBar,
  NARROW_MAX,
  NoLocationCard,
  RailSkeleton,
  ServiceGrid,
  VenueCard,
  VenueRail,
  type ServiceId,
} from "../../src/ui/home/kit";
// Not from the ui barrel: LocationSheet reaches AddressSearch, which imports the barrel back (a
// `no-circular` violation the moment the barrel re-exports it) — the same rule ComposeMap /
// BottomSheet / MapPicker already follow.
import { LocationSheet } from "../../src/ui/home/LocationSheet";
import { SmBtn } from "../../src/ui/order/kit";
import { RIDER_COPY as R, RF } from "../../src/ui/rider/copy";
import { ServiceSoonSheet, type SoonService } from "../../src/ui/home/ServiceSoonSheet";
import { usePrewarmRoutes, type PrewarmRoute } from "../../src/boot/prewarm-routes";

const ACTIVE_ORDERS_KEY = ["activeCustomerOrders"] as const;

/**
 * PERF-SEND-01 (second half), generalised. expo-router evaluates a route's module graph on the FIRST
 * navigation to it — synchronously, inside the tap handler — which is why the first tap into a screen
 * is the slow one (docs/ANDROID-TAP-RESPONSIVENESS-RCA-2026-08-19.md §2.1). The launcher warms the
 * routes it can actually reach, from its own idle time:
 *
 *   - `send`      — the Send tile (the original PERF-SEND-01 case: 32 modules + react-native-maps);
 *   - `order`     — the parcel tracker behind every live-order pill (29 + maps + socket.io-client);
 *   - `foodOrder` — the food tracker behind the same pills, and the heaviest route in the customer
 *                   app (44 + maps + socket.io-client + expo-clipboard).
 *
 * Deliberately NOT `foodCheckout` (reached from the cart, which warms it itself) and never the rider
 * routes — see src/boot/prewarm-routes.ts on why warming is scoped per screen rather than global.
 */
const HOME_PREWARM: readonly PrewarmRoute[] = ["send", "order", "foodOrder"];

/**
 * PERF-SEND-01, third half (deferred item D3, plan rev 2 "NOT in scope" → pulled forward by owner
 * instruction 2026-08-18): warm the ANDROID GOOGLE MAPS SDK itself from the launcher's idle time.
 * `usePrewarmRoutes` above already evaluates /send's JS module graph off the tap path, but the
 * native SDK's first-in-process initialisation (renderer setup, key authorization) still ran on the
 * UI thread at the first real MapView mount — right as /send's transition settles, which is the
 * remaining "screen arrives, then visibly finishes loading" beat. That init is process-global, so a
 * throwaway 1×1 invisible map mounted here pays it during idle and every later map is warm.
 *
 * Deliberately bounded on every axis:
 *  - **Android only, checked BEFORE anything is scheduled** — iOS renders Apple Maps (cheap init, no
 *    key), and the check-first shape also means jest (which runs as iOS) and iOS sessions schedule
 *    zero extra interactions.
 *  - **Lazy `require`, same as the route prewarm** — a top-level react-native-maps import here would
 *    drag its 29 modules back into the LAUNCH graph and re-open MOB-BOOT-03.
 *  - **Transient** — the 1×1 map unmounts the moment `onMapReady` fires (SDK initialised; the native
 *    view's memory is released) or at a hard cap, so a Go-class handset never carries a hidden live
 *    map. Best-effort: any throw leaves the launcher untouched and /send simply pays the init as
 *    it did before.
 */
const MAPS_SDK_PREWARM_CAP_MS = 15_000;

function MapsSdkPrewarm(): React.ReactElement | null {
  const [MapComp, setMapComp] = useState<React.ComponentType<{
    style?: object;
    pointerEvents?: "none";
    onMapReady?: () => void;
    liteMode?: boolean;
  }> | null>(null);
  const [done, setDone] = useState(false);
  useEffect(() => {
    if (Platform.OS !== "android") return; // nothing scheduled at all off-Android (incl. jest)
    const handle = InteractionManager.runAfterInteractions(() => {
      try {
        setMapComp(() => (require("react-native-maps") as { default: React.ComponentType<never> }).default as never);
      } catch {
        /* best-effort — /send pays the init on first mount, exactly as before */
      }
    });
    return () => handle.cancel();
  }, []);
  useEffect(() => {
    if (!MapComp || done) return;
    const t = setTimeout(() => setDone(true), MAPS_SDK_PREWARM_CAP_MS);
    return () => clearTimeout(t);
  }, [MapComp, done]);
  if (!MapComp || done) return null;
  return (
    <View pointerEvents="none" style={{ position: "absolute", width: 1, height: 1, opacity: 0, overflow: "hidden" }}>
      <MapComp style={{ width: 1, height: 1 }} onMapReady={() => setDone(true)} />
    </View>
  );
}

/**
 * The rider's first name per live order, for the live bar's "Tendai is on the way" (Calm Mint v2 H1).
 *
 * The active-orders snapshot carries the rider's `profileId` and GPS but NOT their name, so the only
 * place the app knows it is the on-device identity cache the tracking screen writes
 * (`logic/rider-identity.ts`). That is a SINGLE slot keyed by one order id, so at most one running
 * job resolves to a name and the rest fall back to the order's status — which `liveBarModel` handles.
 * Best-effort and read-only; a store failure just means no name.
 */
function useRiderFirstNames(orders: OrderSnapshot[]): Record<string, string | null> {
  const [names, setNames] = useState<Record<string, string | null>>({});
  useEffect(() => {
    let alive = true;
    for (const o of orders) {
      if (o.id in names) continue;
      void loadRiderIdentity(o.id)
        .then((identity) => {
          const first = identity?.firstName?.trim() || null;
          if (alive) setNames((prev) => (o.id in prev ? prev : { ...prev, [o.id]: first }));
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

/** "Popular restaurants" carries up to this many cards; the rail scrolls (2.2 show at 360px). */
const RAIL_LIMIT = 8;
/** README §2 rules: a rail with fewer than this many items is hidden. */
const RAIL_MIN = 2;

/**
 * The customer Home — Calm Mint v2 (`packages/design/handoff/calm-mint-v2-2026-10`, H1–H6; ledger
 * docs/DESIGN-DEVIATIONS.md D-55, which replaces the 8c home): the address-first mint header, four
 * service tiles, "Popular restaurants" and "Popular shops" rails, and ONE floating live-order bar.
 *
 * Data the handoff marks NEEDS BACKEND renders nothing until it exists (its work order §8): the
 * "Free delivery" tag (no venue flag yet) and the shops rail (no customer shop list yet). Shops and
 * Pharmacy are drawn live with no SOON chip; until their verticals exist their tiles open the
 * notify-me sheet the handoff draws for Shops, so no tile is ever inert (D-55).
 */
export default function LauncherHomeScreen(): React.ReactElement {
  const router = useRouter();
  const qc = useQueryClient();
  const { restaurantsEnabled } = useFeatureFlags();
  usePrewarmRoutes(HOME_PREWARM);
  useBootHomePaintMark();
  const { width } = useWindowDimensions();
  const narrow = width < NARROW_MAX;

  // ── Header state: greeting (device clock), name (["me"]), unread bell dot, detected location ──
  const now = useNow();
  const greeting = greetingFor(now);
  // `["me"]` is the same key `useBootstrap` seeds at app root and `src/query/persist.ts` restores
  // across launches, so on a normal boot the greeting name is already in cache and this costs no
  // request (react-query's 30s staleTime + per-key dedupe with send.tsx / profile).
  const meQ = useQuery({ queryKey: ["me"], queryFn: getMe });
  const firstName = (meQ.data?.firstName ?? "").trim().split(/\s+/)[0] || null;
  const unreadCount = useNotificationsUnreadCount();
  const location = useHomeLocation();
  const noAddress = location.source === "none" && !location.locating;
  const [locationOpen, setLocationOpen] = useState(false);
  const [locationSearch, setLocationSearch] = useState(false);
  const [soon, setSoon] = useState<SoonService | null>(null);

  // Live-orders read: polled only while this screen is the visible route (PERF20-01's rule),
  // refreshed on focus + app foreground so a status change that happened elsewhere isn't stale on
  // return. A-O15: focus/foreground use `invalidateIfStale`, not a raw `invalidateQueries`.
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
  // Array.isArray, not `?? []`: a malformed 200 body is a truthy non-array that `?? []` lets
  // straight through into `.map()` below (CF-04 — confirmed live; same query as orders.tsx).
  const activeOrders = Array.isArray(activeOrdersQ.data) ? activeOrdersQ.data : [];
  const riderNames = useRiderFirstNames(activeOrders);
  // No failed-check banner here (owner instruction 2026-08-12): a background poll the customer never
  // triggered must not raise an error card over a working screen. A failed check simply shows no bar.
  // Only seed orderKey(id) while THIS screen is the visible route: when home is blurred beneath
  // /order/[id], use-order-socket.ts owns that cache entry and merges live pushes into it with an
  // anti-rollback guard, so a raw setQueryData from here could roll the rider's pin backward.
  // Parcels only: the food tracker reads its own `MerchantOrderResponse`-shaped cache.
  useEffect(() => {
    if (!homeFocused) return;
    for (const o of activeOrders) {
      if (o.orderType !== "merchant") qc.setQueryData<OrderSnapshot>(orderKey(o.id), o);
    }
  }, [homeFocused, activeOrders, qc]);
  const bar = liveBarModel(activeOrders, statusPillLabel, (id) => riderNames[id] ?? null);

  // ── Rider v2 C5 (ledger D-54): a rider who switched to the customer side mid-job keeps the job — Home
  // carries a live-job bar that returns to it. Only read for a verified rider; nothing renders otherwise.
  const isRider = meQ.data?.rider?.kycStatus === "verified";
  const riderJobQ = useQuery({ queryKey: ["activeJob"], queryFn: getActiveOrder, enabled: isRider, refetchInterval: homeFocused && isRider ? 30_000 : false });
  const riderJob = isRider && riderJobQ.data && ACTIVE.includes(riderJobQ.data.status) ? riderJobQ.data : null;
  const riderJobStage = riderJob
    ? ["assigned", "confirmed", "en_route_pickup"].includes(riderJob.status)
      ? riderJob.orderType === "merchant"
        ? R.tToKitchen
        : R.tToPickup
      : R.tToDrop
    : null;

  // ── "Popular restaurants" — the nearest open venues from the same feed /food browses ──
  // NEEDS BACKEND (handoff §5): a real popularity ranking; until then "popular" is nearest-open.
  const feed = useRestaurantListFeed(restaurantsEnabled);
  const venues = useMemo(
    () => (restaurantsEnabled ? popularNearYou(feed.restaurants ?? [], now, location.point, RAIL_LIMIT) : []),
    [restaurantsEnabled, feed.restaurants, now, location.point],
  );
  const firstLoad = restaurantsEnabled && feed.restaurants == null && feed.isFetching;
  const showRestaurants = venues.length >= RAIL_MIN;

  const onTile = (id: ServiceId): void => {
    if (id === "send") router.push("/send");
    else if (id === "food" && restaurantsEnabled) router.push("/food");
    else setSoon(id === "food" ? "food" : id);
  };
  const openLocation = (search: boolean): void => {
    setLocationSearch(search);
    setLocationOpen(true);
  };

  return (
    // A plain root, not AppScreen: the mint header owns the top inset itself (it paints behind the
    // status bar, README §2.2), so no SafeAreaView may add a second one above it.
    <View style={{ flex: 1, backgroundColor: tokens.color.bg }}>
      <StatusBar style="dark" />
      <ScrollView
        style={{ backgroundColor: tokens.color.bg }}
        contentContainerStyle={{ paddingBottom: bar ? 96 : 24 }}
        showsVerticalScrollIndicator={false}
      >
        <HomeTop
          narrow={narrow}
          address={location.label}
          noAddress={noAddress}
          phrase={greeting.phrase}
          firstName={firstName}
          unread={unreadCount > 0}
          onAddress={() => openLocation(false)}
          onBell={() => router.push("/notifications")}
          onSearch={() => router.push("/food/search")}
        />
        {riderJob && riderJobStage ? (
          // Rider v2 C5 (D-54): a rider in customer view mid-job — the way back to the job.
          <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
            <SmBtn kind="fill" icon="package" label={RF.swJobBar(riderJobStage)} onPress={() => router.push(riderJob.orderType === "merchant" ? "/rider/food-job" : "/rider/job")} />
          </View>
        ) : null}
        <ServiceGrid narrow={narrow} onTile={onTile} />
        {noAddress ? (
          <NoLocationCard title={H.noLocTitle} onUseLocation={() => void location.useCurrentLocation()} onTypeAddress={() => openLocation(true)} />
        ) : firstLoad ? (
          <View>
            <RailSkeleton />
            <RailSkeleton />
          </View>
        ) : showRestaurants ? (
          <VenueRail title={H.popularRestaurants} sub={H.popularRestaurantsSub} sticker="food" onSeeAll={() => router.push("/food")}>
            {venues.map((v) => (
              <VenueCard
                key={v.id}
                name={v.name}
                photoUrl={v.photoUrl}
                rating={v.rating}
                etaMinutes={v.etaMinutes}
                deliveryFee={v.deliveryFee}
                closed={v.closed}
                onPress={() => router.push(`/food/${v.id}`)}
              />
            ))}
          </VenueRail>
        ) : (
          // README §2 rules: both rails empty → the H6 card, titled "Nothing delivers here yet".
          <NoLocationCard title={H.nothingHere} onUseLocation={() => void location.useCurrentLocation()} onTypeAddress={() => openLocation(true)} />
        )}
      </ScrollView>
      {bar ? (
        <LiveOrderBar
          icon={bar.icon}
          title={bar.title}
          sub={bar.sub}
          more={bar.more}
          step={bar.step}
          steps={bar.steps}
          etaMinutes={bar.etaMinutes}
          onPress={() => router.push(bar.route as never)}
        />
      ) : null}
      {/* D3: throwaway 1×1 map that pays the Android Maps SDK's first-in-process init during launcher
          idle, then unmounts — see MapsSdkPrewarm's header. Renders null off-Android and after warm. */}
      <MapsSdkPrewarm />
      <LocationSheet
        visible={locationOpen}
        denied={location.denied}
        currentLabel={location.label}
        focusSearch={locationSearch}
        onClose={() => setLocationOpen(false)}
        onUseCurrentLocation={location.useCurrentLocation}
        onPick={location.setManualPlace}
      />
      <ServiceSoonSheet visible={soon != null} service={soon ?? "shops"} onClose={() => setSoon(null)} />
    </View>
  );
}
