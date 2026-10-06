import { tokens } from "@lynia/shared/tokens";
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { FlatList, Text, View, useWindowDimensions, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { anyFreeDelivery, browseCategories, browseList, browseRange, DEFAULT_FILTERS, restaurantVenue, type BrowseFilters, type VenueView } from "../../src/logic/browse";
import { deliverToLabel } from "../../src/logic/food-list";
import { useHomeLocation } from "../../src/logic/home-location";
import { useNow } from "../../src/logic/use-now";
import { useClaimOfflineBanner } from "../../src/net/offline-banner-owner";
import { useFeatureFlags } from "../../src/net/use-feature-flags";
import { useReachable } from "../../src/net/use-reachable";
import { useRestaurantListFeed } from "../../src/query/use-restaurants";
import { usePopularity } from "../../src/query/use-popularity";
import { rankedVenueMissing } from "../../src/logic/popularity";
import { EmptyState, emptyCopy } from "../../src/ui";
import { B, fmt } from "../../src/ui/browse/copy";

/** Empty states (handoff empty-states-v2, D-78). */
const E = emptyCopy.browse;
import {
  ClosedGroupHeader,
  CompactBar,
  FilterBar,
  ListHeader,
  ListHeading,
  ListSkeleton,
  NARROW_MAX,
  LIST_EMPTY_TOP,
  NoAddressRow,
  OfflineNote,
  RowSkeletons,
  ServiceEmpty,
  VenueCardFull,
  VenueRow,
} from "../../src/ui/browse/kit";
import { sortLabel, SortSheet } from "../../src/ui/browse/sheets";
// Not from the ui barrel: LocationSheet reaches AddressSearch, which imports the barrel back (a
// cycle) — the same direct import the customer home takes for the same reason.
import { LocationSheet } from "../../src/ui/home/LocationSheet";
import { useLocationAskSheet } from "../../src/ui/home/LocationAsk";
import { ServiceSoonSheet } from "../../src/ui/home/ServiceSoonSheet";

/**
 * Restaurants list — Browse v2 B1, B5–B12, B14 (`packages/design/handoff/browse-v2`, ledger D-57).
 * The mint header scrolls away; once it has, the white compact bar and the Sort / Free delivery bar
 * stick on top. Open venues by the chosen sort, then the "Closed now" group (closed venues are never
 * hidden). The first two results are full cards, the rest compact rows.
 */
type Entry = { key: string; kind: "full" | "row"; v: VenueView } | { key: string; kind: "closed" };

/** The first N results are full cards (BRIEF §6). */
const FULL_CARDS = 2;

export default function RestaurantListScreen(): React.ReactElement {
  const router = useRouter();
  const { restaurantsEnabled } = useFeatureFlags();
  const feed = useRestaurantListFeed(restaurantsEnabled);
  // D-72: "Recommended" is the popularity ranking (nearest-open until there's enough history to rank).
  const popularity = usePopularity("restaurants", restaurantsEnabled);
  const location = useHomeLocation();
  const now = useNow();
  const reachable = useReachable();
  const { width } = useWindowDimensions();
  const narrow = width < NARROW_MAX;

  const [filters, setFilters] = useState<BrowseFilters>(DEFAULT_FILTERS);
  const [sortOpen, setSortOpen] = useState(false);
  const [locationOpen, setLocationOpen] = useState(false);
  const [locationSearch, setLocationSearch] = useState(false);
  const [headerH, setHeaderH] = useState(0);
  const [collapsed, setCollapsed] = useState(false);

  const noAddress = location.source === "none" && !location.locating;
  const hasLocation = location.point != null;
  const area = location.area ?? location.label;

  // A distance sort chosen while a fix existed falls back to Recommended once it's gone (B5b).
  useEffect(() => {
    if (!hasLocation && (filters.sort === "nearest" || filters.sort === "lowest_fee")) setFilters((f) => ({ ...f, sort: "recommended" }));
  }, [hasLocation, filters.sort]);

  // A filter runs over the pages loaded so far; drain the rest while one is set so the list never
  // under-reports (B-O10) — and while the ranking names a venue not loaded yet, so it can lead (D-72).
  // The idle list keeps paging lazily on scroll.
  const narrowing =
    filters.category != null || filters.free || filters.sort !== "recommended" || rankedVenueMissing(popularity, feed.restaurants);
  useEffect(() => {
    if (narrowing && feed.hasMore && !feed.isLoadingMore) feed.loadMore();
  }, [narrowing, feed.hasMore, feed.isLoadingMore, feed.loadMore]);

  const venues = useMemo(() => (feed.restaurants ?? []).map((r) => restaurantVenue(r, location.point, now)), [feed.restaurants, location.point, now]);
  const categories = useMemo(() => browseCategories(venues), [venues]);
  const list = useMemo(() => browseList(venues, filters, popularity), [venues, filters, popularity]);
  const showFree = anyFreeDelivery(venues);
  const total = list.open.length + list.closed.length;
  const range = browseRange(list.open);

  const entries = useMemo<Entry[]>(() => {
    const out: Entry[] = [];
    const all = [...list.open, ...list.closed];
    all.forEach((v, i) => {
      if (i === list.open.length && list.closed.length > 0) out.push({ key: "closed-header", kind: "closed" });
      out.push({ key: v.id, kind: i < FULL_CARDS && v.open ? "full" : "row", v });
    });
    return out;
  }, [list]);

  const stale = feed.showingStale && (feed.isError || !reachable);
  useClaimOfflineBanner(stale);

  const openLocation = (search: boolean): void => {
    setLocationSearch(search);
    setLocationOpen(true);
  };
  // H5 "Use my current location" → the First Run v2 location ask (PC1–PC7, ledger D-81).
  const locationAsk = useLocationAskSheet(location, () => openLocation(true));
  const back = (): void => router.back();
  const search = (): void => router.push("/food/search");

  const header = (
    <ListHeader
      service="food"
      narrow={narrow}
      // The list picks the corridor to browse, so the street is qualified by its suburb (B1:
      // "12 Lanark Rd, Belgravia"), unlike Home's bare street.
      address={deliverToLabel(location.label, location.area)}
      noAddress={noAddress}
      onBack={back}
      onAddress={() => openLocation(false)}
      onSearch={search}
    />
  );
  const filterBar = (
    <FilterBar
      sortLabel={sortLabel(filters.sort)}
      category={filters.category}
      sortActive={filters.sort !== "recommended"}
      showFree={showFree}
      free={filters.free}
      onSort={() => setSortOpen(true)}
      onFree={() => setFilters((f) => ({ ...f, free: !f.free }))}
    />
  );
  const sheets = (
    <>
      <SortSheet
        visible={sortOpen}
        service="food"
        sort={filters.sort}
        category={filters.category}
        categories={categories}
        hasLocation={hasLocation}
        onSort={(s) => setFilters((f) => ({ ...f, sort: s }))}
        onCategory={(c) => setFilters((f) => ({ ...f, category: c }))}
        onClose={() => setSortOpen(false)}
      />
      <LocationSheet
        visible={locationOpen}
        denied={location.denied}
        currentLabel={location.label}
        focusSearch={locationSearch}
        onClose={() => setLocationOpen(false)}
        onUseCurrentLocation={locationAsk.start}
        onPick={location.setManualPlace}
      />
      {locationAsk.sheet}
    </>
  );

  // B13 — the service is switched off (a deep link arrived anyway): the header, dimmed, under the
  // notify-me sheet. Closing it goes back to Home. Reachable only from a live server `false`:
  // `restaurantsEnabled` fails open, so this is never a cold-start frame (MOB-BOOT-02).
  if (!restaurantsEnabled) {
    return (
      <View style={{ flex: 1, backgroundColor: tokens.color.bg }}>
        <View style={{ opacity: 0.55 }} pointerEvents="none">
          {header}
        </View>
        <ServiceSoonSheet visible service="food" onClose={() => router.replace("/(tabs)/home")} />
      </View>
    );
  }

  const hasData = feed.restaurants != null && feed.restaurants.length > 0;

  // B8 — first load: the real header, skeleton body.
  if (!hasData && feed.isFetching) {
    return (
      <View style={{ flex: 1, backgroundColor: tokens.color.bg }}>
        {header}
        <ListSkeleton />
        {sheets}
      </View>
    );
  }

  // B10b / B11 — the first load failed with nothing saved. Offline says so; otherwise "Couldn't load".
  if (!hasData && feed.isError) {
    const offline = !reachable;
    return (
      <View style={{ flex: 1, backgroundColor: tokens.color.bg }}>
        {header}
        {offline ? (
          <EmptyState icon="wifi-off" tone="info" title={E.offline.title} body={E.offline.body} secondary={{ label: E.offline.secondary, onPress: feed.refetch }} />
        ) : (
          <EmptyState icon="circle-alert" tone="error" title={E.error.title} body={E.error.body} primary={{ label: E.error.primary, icon: "refresh-cw", onPress: feed.refetch }} />
        )}
        {sheets}
      </View>
    );
  }

  // B9 — a successful load with nothing in this corridor.
  if (!hasData) {
    return (
      <View style={{ flex: 1, backgroundColor: tokens.color.bg }}>
        {header}
        <ServiceEmpty service="food" area={area} onChangeAddress={() => openLocation(true)} />
        {sheets}
      </View>
    );
  }

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>): void => {
    const next = headerH > 0 && e.nativeEvent.contentOffset.y >= headerH;
    if (next !== collapsed) setCollapsed(next);
  };

  // The count: "6 places" ("1 place" is drawn on B3a). Without a location there is no time range,
  // so the right-hand side reads "in Harare" — the tail of `summaryNoLoc`.
  const count = total === 1 ? "1 place" : fmt(B.list.count, { n: total });
  const right = hasLocation ? (range ? fmt(B.list.range, { a: range.a, b: range.b }) : null) : fmt(B.list.summaryNoLoc, { n: total }).replace(fmt(B.list.count, { n: total }), "").trim();

  return (
    <View style={{ flex: 1, backgroundColor: tokens.color.bg }}>
      <FlatList
        data={entries}
        keyExtractor={(e) => e.key}
        onScroll={onScroll}
        scrollEventThrottle={32}
        showsVerticalScrollIndicator={false}
        ListHeaderComponent={
          <View>
            <View onLayout={(e) => setHeaderH(e.nativeEvent.layout.height)}>{header}</View>
            {stale ? (
              <OfflineNote
                text={fmt(B.list.offline, {
                  t: feed.staleSavedAt ? new Date(feed.staleSavedAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit", hour12: false }) : "",
                })}
              />
            ) : null}
            {filterBar}
            {total > 0 ? <ListHeading count={count} range={right} /> : null}
            {!hasLocation && total > 0 ? <NoAddressRow onSet={() => void location.useCurrentLocation()} /> : null}
            {total === 0 ? (
              // B6 — the filters leave nothing; the way out is to clear them.
              <EmptyState
                icon="search"
                tone="info"
                title={E.noFilterMatch.title}
                body={E.noFilterMatch.body}
                offsetTop={LIST_EMPTY_TOP}
                secondary={{ label: E.noFilterMatch.secondary, onPress: () => setFilters(DEFAULT_FILTERS) }}
              />
            ) : null}
          </View>
        }
        renderItem={({ item }) => (
          <View style={{ paddingHorizontal: 16 }}>
            {item.kind === "closed" ? (
              <ClosedGroupHeader />
            ) : item.kind === "full" ? (
              <VenueCardFull v={item.v} onPress={() => router.push(`/food/${item.v.id}`)} />
            ) : (
              <VenueRow v={item.v} onPress={() => router.push(`/food/${item.v.id}`)} />
            )}
          </View>
        )}
        onEndReached={() => {
          if (feed.hasMore && !feed.isLoadingMore) feed.loadMore();
        }}
        onEndReachedThreshold={0.5}
        ListFooterComponent={
          feed.isLoadingMore ? (
            // B12a — loading more: two skeleton rows and "Loading more…".
            <View style={{ paddingHorizontal: 16 }}>
              <RowSkeletons count={2} />
              <Text style={{ textAlign: "center", padding: 4, fontSize: 12.5, color: tokens.color.muted }}>{B.list.more}</Text>
            </View>
          ) : total > 0 && !feed.hasMore ? (
            // B12b — the end of the list.
            <Text style={{ textAlign: "center", paddingVertical: 24, paddingHorizontal: 32, fontSize: 13, color: tokens.color.muted }}>
              {fmt(B.svc.food.end, { n: total, area })}
            </Text>
          ) : (
            <View style={{ height: 24 }} />
          )
        }
      />
      {collapsed ? (
        <View style={{ position: "absolute", top: 0, left: 0, right: 0, backgroundColor: tokens.color.bg }}>
          <CompactBar title={B.svc.food.title} onBack={back} onSearch={search} searchLabel={B.svc.food.search} />
          {filterBar}
        </View>
      ) : null}
      {sheets}
    </View>
  );
}
