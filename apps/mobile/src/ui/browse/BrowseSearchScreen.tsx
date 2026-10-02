import type { RestaurantListItem, ShopListItem } from "@lynia/shared";
import { tokens } from "@lynia/shared/tokens";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { ScrollView, Text, TextInput, View, useWindowDimensions } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { restaurantVenue, shopVenue } from "../../logic/browse";
import { useHomeLocation } from "../../logic/home-location";
import { formatMoney } from "../../logic/money";
import { loadRecentSearches, saveRecentSearches, withRecent } from "../../logic/recent-searches";
import { useNow } from "../../logic/use-now";
import { useReachable } from "../../net/use-reachable";
import { useServiceFlags } from "../../net/use-service-flags";
import { useBrowseSearch, useSearchPopular, type SearchItemHit, type SearchScope } from "../../query/use-search";
import { SendStickerV2 } from "../art/stickers";
import { Icon } from "../Icon";
import { Tappable } from "../Tappable";
import { B, fmt } from "./copy";
import { BrowseEmpty, IconButton, NARROW_MAX, OfflineNote, TABULAR, VenueImage } from "./kit";

/**
 * Search — Browse v2 X1–X4 (`packages/design/handoff/browse-v2`, ledger D-57). Home (`all`) searches every
 * switched-on section and groups RESTAURANTS · SHOPS · PHARMACY · DISHES & ITEMS, with a "Send a parcel"
 * row when the words sound like a parcel; Restaurants (`food`) searches its kitchens: PLACES + DISHES.
 * Shops and Pharmacy have their own scoped search (`ShopSearchScreen`, D-58). A hit opens its storefront —
 * shop items only browse until Order flow v2 (D-58). 300 ms debounce, two characters minimum (work order §3).
 */
export type { SearchScope };

/** Work order §3: words that sound like a parcel bring up the Send a parcel row (X2b). */
const PARCEL_WORDS = /parcel|document|send|deliver|keys|package/i;
const DEBOUNCE_MS = 300;
const MIN_CHARS = 2;
/** A group shows this many hits, and "See all n" opens the rest in place. */
const GROUP_PREVIEW = 3;

function useDebounced(value: string, ms: number): string {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

/** The name with the query marked in green-text. */
function Marked({ text, q, style }: { text: string; q: string; style: object }): React.ReactElement {
  const at = q ? text.toLowerCase().indexOf(q.toLowerCase()) : -1;
  return (
    <Text numberOfLines={1} style={style}>
      {at < 0 ? (
        text
      ) : (
        <>
          {text.slice(0, at)}
          <Text style={{ color: tokens.color.accentText }}>{text.slice(at, at + q.length)}</Text>
          {text.slice(at + q.length)}
        </>
      )}
    </Text>
  );
}

function GroupLabel({ label, count, expanded, onSeeAll }: { label: string; count?: number; expanded?: boolean; onSeeAll?: () => void }): React.ReactElement {
  return (
    <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingTop: 16, paddingHorizontal: 16, paddingBottom: 4 }}>
      <Text accessibilityRole="header" style={{ fontSize: 11.5, letterSpacing: 0.6, fontWeight: tokens.font.weight.bold, color: tokens.color.muted }}>
        {label}
      </Text>
      {onSeeAll && count != null && !expanded ? (
        <Tappable onPress={onSeeAll} accessibilityRole="button" accessibilityLabel={`${fmt(B.search.seeAll, { n: count })} ${label.toLowerCase()}`} style={{ minHeight: 44, marginVertical: -12, justifyContent: "center" }}>
          <Text style={{ fontSize: 13, fontWeight: tokens.font.weight.bold, color: tokens.color.accentText, ...TABULAR }}>{fmt(B.search.seeAll, { n: count })}</Text>
        </Tappable>
      ) : null}
    </View>
  );
}

function Row({ children, onPress, label }: { children: React.ReactNode; onPress: () => void; label: string }): React.ReactElement {
  return (
    <Tappable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} style={{ flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 8, paddingHorizontal: 16, minHeight: 64 }}>
      {children}
    </Tappable>
  );
}

export function BrowseSearchScreen({ scope, initialQuery = "" }: { scope: SearchScope; initialQuery?: string }): React.ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const narrow = width < NARROW_MAX;
  const location = useHomeLocation();
  const now = useNow();
  const reachable = useReachable();
  const [query, setQuery] = useState(initialQuery);
  const [recent, setRecent] = useState<string[]>([]);
  const [open, setOpen] = useState<string | null>(null);
  const q = useDebounced(query.trim(), DEBOUNCE_MS);
  const active = q.length >= MIN_CHARS;

  useEffect(() => {
    let alive = true;
    void loadRecentSearches().then((r) => alive && setRecent(r));
    return () => {
      alive = false;
    };
  }, []);
  const remember = (term: string): void => {
    const next = withRecent(recent, term);
    setRecent(next);
    void saveRecentSearches(next);
  };
  const forget = (term: string | null): void => {
    const next = term == null ? [] : recent.filter((r) => r !== term);
    setRecent(next);
    void saveRecentSearches(next);
  };

  const sections = useServiceFlags();
  const results = useBrowseSearch(q, scope, sections, active);
  // X1's chips — Home only (a service search opens straight onto its field).
  const popular = useSearchPopular(scope === "all");

  const restaurants = results.data?.restaurants ?? [];
  const shops = results.data?.shops ?? [];
  const pharmacies = results.data?.pharmacies ?? [];
  const dishes = results.data?.items ?? [];
  const parcel = scope === "all" && PARCEL_WORDS.test(query);
  const total = restaurants.length + shops.length + pharmacies.length + dishes.length;
  const placeholder = scope === "all" ? (narrow ? B.search.home320 : B.search.home) : narrow ? B.svc.food.search320 : B.svc.food.search;

  const openVenue = (path: string): void => {
    remember(q);
    router.push(path as never);
  };

  const venueHit = (base: string) => (r: RestaurantListItem | ShopListItem): React.ReactElement => {
    const v = "shopKind" in r ? shopVenue(r, location.point, now) : restaurantVenue(r, location.point, now);
    const time = v.etaLow != null && v.etaHigh != null ? fmt(B.list.range, { a: v.etaLow, b: v.etaHigh }) : null;
    const fee = v.freeDelivery ? B.list.free : v.feeUsd != null ? `${formatMoney(v.feeUsd)} ${B.store.delivery}` : null;
    const km = v.km != null ? `${v.km.toFixed(1)} km` : null;
    const sub = [v.kind, time, fee, v.kind ? null : km].filter(Boolean).join(" · ");
    return (
      <Row key={r.id} onPress={() => openVenue(`${base}/${r.id}`)} label={r.name}>
        {/* No kind chip: it doesn't fit a 48px thumb (as ShopSearchScreen). */}
        <VenueImage photoUrl={r.coverPhotoUrl} name={r.name} kind={null} initialSize={18} style={{ width: 48, height: 48, borderRadius: 12 }} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Marked text={r.name} q={q} style={{ fontSize: 15, fontWeight: tokens.font.weight.bold, color: tokens.color.ink }} />
          {sub ? (
            <Text numberOfLines={1} style={{ fontSize: 12.5, color: tokens.color.muted, ...TABULAR }}>
              {sub}
            </Text>
          ) : null}
        </View>
        <Icon name="chevron-right" size={18} color={tokens.color.muted} />
      </Row>
    );
  };

  const dishHit = (d: SearchItemHit): React.ReactElement => (
    <Row key={`${d.path}:${d.dishId}`} onPress={() => openVenue(d.path)} label={`${d.name}, ${d.merchantName}, ${formatMoney(d.priceUsd)}`}>
      <VenueImage photoUrl={d.photoUrl} name={d.name} kind={null} initialSize={18} style={{ width: 48, height: 48, borderRadius: 12 }} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Marked text={d.name} q={q} style={{ fontSize: 15, fontWeight: tokens.font.weight.bold, color: tokens.color.ink }} />
        <Text numberOfLines={1} style={{ fontSize: 12.5, color: tokens.color.muted }}>
          {d.merchantName}
        </Text>
      </View>
      <Text style={{ fontSize: 14, fontWeight: tokens.font.weight.bold, color: tokens.color.ink, ...TABULAR }}>{formatMoney(d.priceUsd)}</Text>
    </Row>
  );

  const group = <T,>(key: string, label: string, list: T[], render: (x: T) => React.ReactElement): React.ReactElement | null => {
    if (list.length === 0) return null;
    const expanded = open === key;
    return (
      <View key={key}>
        <GroupLabel label={label} count={list.length} expanded={expanded || list.length <= GROUP_PREVIEW} onSeeAll={() => setOpen(key)} />
        {(expanded ? list : list.slice(0, GROUP_PREVIEW)).map(render)}
      </View>
    );
  };

  const recentList = (
    <View>
      {recent.length > 0 ? (
        <>
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", paddingTop: 16, paddingHorizontal: 16, paddingBottom: 4 }}>
            <Text accessibilityRole="header" style={{ fontSize: 11.5, letterSpacing: 0.6, fontWeight: tokens.font.weight.bold, color: tokens.color.muted }}>
              {B.search.recent.toUpperCase()}
            </Text>
            <Tappable onPress={() => forget(null)} accessibilityRole="button" accessibilityLabel={`${B.search.clear} ${B.search.recent.toLowerCase()}`} style={{ minHeight: 44, marginVertical: -12, justifyContent: "center" }}>
              <Text style={{ fontSize: 13, fontWeight: tokens.font.weight.bold, color: tokens.color.accentText }}>{B.search.clear}</Text>
            </Tappable>
          </View>
          {recent.map((r) => (
            <View key={r} style={{ flexDirection: "row", alignItems: "center", minHeight: 48, paddingLeft: 16, paddingRight: 6 }}>
              <Tappable onPress={() => setQuery(r)} accessibilityRole="button" accessibilityLabel={r} style={{ flex: 1, flexDirection: "row", alignItems: "center", gap: 12, minHeight: 48 }}>
                <Icon name="history" size={18} color={tokens.color.muted} />
                <Text style={{ fontSize: 15, color: tokens.color.ink }}>{r}</Text>
              </Tappable>
              <IconButton icon="x" size={16} label={`Remove ${r}`} onPress={() => forget(r)} />
            </View>
          ))}
        </>
      ) : null}
    </View>
  );

  const parcelRow = parcel ? (
    <Tappable
      onPress={() => router.push("/send")}
      accessibilityRole="button"
      accessibilityLabel={`${B.search.parcel.t}. ${B.search.parcel.s}`}
      style={{ flexDirection: "row", alignItems: "center", gap: 12, marginTop: 10, marginHorizontal: 16, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 16, backgroundColor: tokens.color.accentWash }}
    >
      <View style={{ width: 48, height: 48, borderRadius: 12, backgroundColor: tokens.color.tileSend, alignItems: "center", justifyContent: "center" }}>
        <SendStickerV2 width={38} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 15, fontWeight: tokens.font.weight.bold, color: tokens.color.ink }}>{B.search.parcel.t}</Text>
        <Text style={{ fontSize: 12.5, color: tokens.color.muted }}>{B.search.parcel.s}</Text>
      </View>
      <Icon name="chevron-right" size={18} color={tokens.color.accentText} />
    </Tappable>
  ) : null;

  let body: React.ReactNode;
  if (!active) {
    body = (
      <>
        {!reachable ? <OfflineNote text={B.search.offline.s} /> : null}
        {recentList}
        {scope === "all" && reachable && (popular.data?.terms.length ?? 0) > 0 ? (
          <View>
            <View style={{ paddingTop: 16, paddingHorizontal: 16, paddingBottom: 4 }}>
              <Text accessibilityRole="header" style={{ fontSize: 11.5, letterSpacing: 0.6, fontWeight: tokens.font.weight.bold, color: tokens.color.muted }}>
                {B.search.popular.toUpperCase()}
              </Text>
            </View>
            <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: 16 }}>
              {popular.data!.terms.map((t) => (
                <Tappable key={t} onPress={() => setQuery(t)} accessibilityRole="button" accessibilityLabel={t} style={{ minHeight: 44, justifyContent: "center" }}>
                  <View style={{ minHeight: 36, justifyContent: "center", paddingHorizontal: 14, borderRadius: tokens.radius.pill, borderWidth: 1, borderColor: tokens.color.line }}>
                    <Text style={{ fontSize: 13, fontWeight: tokens.font.weight.semibold, color: tokens.color.ink }}>{t}</Text>
                  </View>
                </Tappable>
              ))}
            </View>
          </View>
        ) : null}
        {parcelRow}
      </>
    );
  } else if (!reachable && !results.data) {
    // X4b — offline: search needs a connection; the recent searches still work.
    body = (
      <>
        <OfflineNote text={B.search.offline.s} />
        {recentList}
      </>
    );
  } else if (results.data && total === 0) {
    body = parcel ? (
      // X2b — parcel words and nothing to buy: the Send row leads.
      <>
        {parcelRow}
        <Text style={{ padding: 16, fontSize: 13, color: tokens.color.muted }}>{`No restaurants, shops or items match “${q}”.`}</Text>
      </>
    ) : (
      <BrowseEmpty title={fmt(B.search.none.t, { q })} body={B.search.none.s} />
    );
  } else if (results.data) {
    body =
      scope === "all" ? (
        <>
          {parcelRow}
          {group("food", B.search.groups.food, restaurants, venueHit("/food"))}
          {group("shops", B.search.groups.shops, shops, venueHit("/shops"))}
          {group("pharmacy", B.search.groups.pharmacy, pharmacies, venueHit("/pharmacy"))}
          {group("items", B.search.groups.items, dishes, dishHit)}
        </>
      ) : (
        <>
          {group("places", B.search.places, restaurants, venueHit("/food"))}
          {group("items", B.svc.food.itemsCap, dishes, dishHit)}
        </>
      );
  } else {
    body = null;
  }

  return (
    <View style={{ flex: 1, backgroundColor: tokens.color.bg, paddingTop: insets.top }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingTop: 4, paddingRight: 16, paddingBottom: 8, paddingLeft: 6 }}>
        <IconButton icon="chevron-left" size={22} label="Back" onPress={() => (router.canGoBack() ? router.back() : router.replace("/(tabs)/home"))} />
        <View style={{ flex: 1, minWidth: 0, minHeight: 48, borderRadius: 12, borderWidth: 1.5, borderColor: tokens.color.accent, flexDirection: "row", alignItems: "center", gap: 10, paddingLeft: 14, paddingRight: 4 }}>
          <Icon name="search" size={18} color={tokens.color.muted} />
          <TextInput
            autoFocus
            value={query}
            onChangeText={(t) => {
              setQuery(t);
              setOpen(null);
            }}
            onSubmitEditing={() => remember(query)}
            returnKeyType="search"
            placeholder={placeholder}
            placeholderTextColor={tokens.color.muted}
            accessibilityLabel={placeholder}
            style={{ flex: 1, minWidth: 0, fontSize: 15, color: tokens.color.ink, paddingVertical: 0 }}
          />
          {query ? <IconButton icon="x" size={18} label="Clear search" onPress={() => setQuery("")} /> : null}
        </View>
      </View>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 24 + insets.bottom }}>
        {body}
      </ScrollView>
    </View>
  );
}
