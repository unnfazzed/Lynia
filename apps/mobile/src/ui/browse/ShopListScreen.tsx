import type { ShopService } from "@lynia/shared";
import { tokens } from "@lynia/shared/tokens";
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { FlatList, Text, View, useWindowDimensions, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { anyFreeDelivery, browseList, browseRange, DEFAULT_FILTERS, shopVenue, type BrowseFilters, type VenueView } from "../../logic/browse";
import { deliverToLabel } from "../../logic/food-list";
import { useHomeLocation } from "../../logic/home-location";
import { useNow } from "../../logic/use-now";
import { useClaimOfflineBanner } from "../../net/offline-banner-owner";
import { useReachable } from "../../net/use-reachable";
import { useServiceFlags } from "../../net/use-service-flags";
import { useShopListFeed } from "../../query/use-shops";
import { usePopularity } from "../../query/use-popularity";
import { rankedVenueMissing } from "../../logic/popularity";
// Not from the ui barrel: LocationSheet reaches AddressSearch, which imports the barrel back (a cycle).
import { LocationSheet } from "../home/LocationSheet";
import { ServiceSoonSheet } from "../home/ServiceSoonSheet";
import { B, fmt } from "./copy";
import {
  BrowseButton,
  BrowseEmpty,
  ClosedGroupHeader,
  CompactBar,
  FilterBar,
  ListHeader,
  ListHeading,
  ListSkeleton,
  NARROW_MAX,
  NoLocationCard,
  OfflineNote,
  RowSkeletons,
  ServiceEmpty,
  VenueCardFull,
  VenueRow,
} from "./kit";
import { sortLabel, SortSheet } from "./sheets";
import { OtcNotice } from "./store";

type Entry = { key: string; kind: "full" | "row"; v: VenueView } | { key: string; kind: "closed" };

/** The first N results are full cards (BRIEF §6). */
const FULL_CARDS = 2;
/** Shops' Sort-sheet dropdown is the fixed kind list (README §4: "All · Grocery · … · Other"). */
const SHOP_KINDS = B.kinds.slice(1);

/**
 * Shops list (B2, B3a/b) and Pharmacy list (B4) — Browse v2 (`packages/design/handoff/browse-v2`,
 * ledgers D-57 / D-58), the Restaurants list's template in the section's skin: the shop kind is the
 * Sort sheet's dropdown and a kind with no shops says so (B3b); Pharmacy has no dropdown and carries
 * the OTC notice under its header. Every other state (B5–B12) is the Restaurants one.
 */
export function ShopListScreen({ service }: { service: ShopService }): React.ReactElement {
  const router = useRouter();
  const flags = useServiceFlags();
  const enabled = service === "pharmacy" ? flags.pharmacyEnabled : flags.shopsEnabled;
  const feed = useShopListFeed(service, enabled);
  // D-72: "Recommended" is the popularity ranking (nearest-open until there's enough history to rank).
  const popularity = usePopularity(service, enabled);
  const location = useHomeLocation();
  const now = useNow();
  const reachable = useReachable();
  const { width } = useWindowDimensions();
  const narrow = width < NARROW_MAX;
  const s = B.svc[service];

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

  // A filter runs over the pages loaded so far; drain the rest while one is set (B-O10), and while the
  // ranking names a shop not loaded yet, so it can lead (D-72).
  const narrowing =
    filters.category != null || filters.free || filters.sort !== "recommended" || rankedVenueMissing(popularity, feed.shops);
  useEffect(() => {
    if (narrowing && feed.hasMore && !feed.isLoadingMore) feed.loadMore();
  }, [narrowing, feed.hasMore, feed.isLoadingMore, feed.loadMore]);

  const venues = useMemo(() => (feed.shops ?? []).map((r) => shopVenue(r, location.point, now)), [feed.shops, location.point, now]);
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
  const back = (): void => router.back();
  const search = (): void => router.push(`/${service}/search`);
  const open = (id: string): void => router.push(`/${service}/${id}`);

  const header = (
    <ListHeader
      service={service}
      narrow={narrow}
      address={deliverToLabel(location.label, location.area)}
      noAddress={noAddress}
      onBack={back}
      onAddress={() => openLocation(false)}
      onSearch={search}
    />
  );
  const otc = service === "pharmacy" ? <OtcNotice /> : null;
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
        service={service}
        sort={filters.sort}
        category={filters.category}
        categories={service === "shops" ? SHOP_KINDS : []}
        hasLocation={hasLocation}
        onSort={(v) => setFilters((f) => ({ ...f, sort: v }))}
        onCategory={(c) => setFilters((f) => ({ ...f, category: c }))}
        onClose={() => setSortOpen(false)}
      />
      <LocationSheet
        visible={locationOpen}
        denied={location.denied}
        currentLabel={location.label}
        focusSearch={locationSearch}
        onClose={() => setLocationOpen(false)}
        onUseCurrentLocation={location.useCurrentLocation}
        onPick={location.setManualPlace}
      />
    </>
  );

  // B13 — the section is switched off (a deep link arrived anyway): the header, dimmed, under the
  // notify-me sheet. Closing it goes back to Home. Only after a live server `false` (fails open).
  if (!enabled) {
    return (
      <View style={{ flex: 1, backgroundColor: tokens.color.bg }}>
        <View style={{ opacity: 0.55 }} pointerEvents="none">
          {header}
        </View>
        <ServiceSoonSheet visible service={service} onClose={() => router.replace("/(tabs)/home")} />
      </View>
    );
  }

  const hasData = feed.shops != null && feed.shops.length > 0;

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

  // B10b / B11 — the first load failed with nothing saved.
  if (!hasData && feed.isError) {
    const offline = !reachable;
    return (
      <View style={{ flex: 1, backgroundColor: tokens.color.bg }}>
        {header}
        <BrowseEmpty icon={offline ? "wifi-off" : "circle-alert"} title={offline ? B.list.offNone.t : s.err} body={offline ? B.list.offNone.s : B.list.errS}>
          <BrowseButton label={B.list.retry} variant="ghost" onPress={feed.refetch} />
        </BrowseEmpty>
        {sheets}
      </View>
    );
  }

  // B9b / B9c — a successful load with nothing in this corridor.
  if (!hasData) {
    return (
      <View style={{ flex: 1, backgroundColor: tokens.color.bg }}>
        {header}
        <ServiceEmpty service={service} area={area} onChangeAddress={() => openLocation(true)} onSendParcel={() => router.push("/send")} />
        {sheets}
      </View>
    );
  }

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>): void => {
    const next = headerH > 0 && e.nativeEvent.contentOffset.y >= headerH;
    if (next !== collapsed) setCollapsed(next);
  };

  const count = total === 1 ? "1 place" : fmt(B.list.count, { n: total });
  const right = hasLocation ? (range ? fmt(B.list.range, { a: range.a, b: range.b }) : null) : fmt(B.list.summaryNoLoc, { n: total }).replace(fmt(B.list.count, { n: total }), "").trim();
  const filterWords = [filters.category, filters.free ? B.list.free : null].filter(Boolean).join(" + ");
  // B3b — only the kind is narrowing and it has no shops: say so and offer All shops.
  const kindNone = total === 0 && filters.category != null && !filters.free;

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
            {otc}
            {filterBar}
            {total > 0 ? <ListHeading count={count} range={right} /> : null}
            {!hasLocation && total > 0 ? <NoLocationCard onUseLocation={() => void location.useCurrentLocation()} /> : null}
            {kindNone ? (
              <BrowseEmpty icon="store" title={fmt(B.list.kindNone.t, { kind: filters.category!.toLowerCase() })} body={fmt(B.list.kindNone.s, { kind: filters.category!.toLowerCase() })}>
                <BrowseButton label={B.list.kindNone.cta} variant="ghost" onPress={() => setFilters((f) => ({ ...f, category: null }))} />
              </BrowseEmpty>
            ) : total === 0 ? (
              // B6 — the filters leave nothing; the way out is to clear them.
              <BrowseEmpty icon="search" title={B.list.noMatch.t} body={fmt(B.list.noMatch.s, { f: filterWords, area })}>
                <BrowseButton label={B.list.noMatch.clear} variant="ghost" onPress={() => setFilters(DEFAULT_FILTERS)} />
              </BrowseEmpty>
            ) : null}
          </View>
        }
        renderItem={({ item }) => (
          <View style={{ paddingHorizontal: 16 }}>
            {item.kind === "closed" ? (
              <ClosedGroupHeader />
            ) : item.kind === "full" ? (
              <VenueCardFull v={item.v} onPress={() => open(item.v.id)} />
            ) : (
              <VenueRow v={item.v} onPress={() => open(item.v.id)} />
            )}
          </View>
        )}
        onEndReached={() => {
          if (feed.hasMore && !feed.isLoadingMore) feed.loadMore();
        }}
        onEndReachedThreshold={0.5}
        ListFooterComponent={
          feed.isLoadingMore ? (
            <View style={{ paddingHorizontal: 16 }}>
              <RowSkeletons count={2} />
              <Text style={{ textAlign: "center", padding: 4, fontSize: 12.5, color: tokens.color.muted }}>{B.list.more}</Text>
            </View>
          ) : total > 0 && !feed.hasMore ? (
            <Text style={{ textAlign: "center", paddingVertical: 24, paddingHorizontal: 32, fontSize: 13, color: tokens.color.muted }}>{fmt(s.end, { n: total, area })}</Text>
          ) : (
            <View style={{ height: 24 }} />
          )
        }
      />
      {collapsed ? (
        <View style={{ position: "absolute", top: 0, left: 0, right: 0, backgroundColor: tokens.color.bg }}>
          <CompactBar title={s.title} onBack={back} onSearch={search} searchLabel={s.search} />
          {filterBar}
        </View>
      ) : null}
      {sheets}
    </View>
  );
}
