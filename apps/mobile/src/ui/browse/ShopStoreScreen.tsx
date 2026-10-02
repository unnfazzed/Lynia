import type { RestaurantMenuDish, ShopService } from "@lynia/shared";
import { tokens } from "@lynia/shared/tokens";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useMemo, useRef, useState } from "react";
import { ScrollView, Text, TextInput, View, useWindowDimensions, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { categoryServedNow, shopVenue, windowLaterToday, type VenueView } from "../../logic/browse";
import { useHomeLocation } from "../../logic/home-location";
import { useNow } from "../../logic/use-now";
import { useShopCatalogue } from "../../query/use-shops";
import { Icon } from "../Icon";
import { B, fmt } from "./copy";
import { BrowseButton, BrowseEmpty, CompactBar, IconButton, NARROW_MAX, TABULAR } from "./kit";
import { ItemSheet } from "./sheets";
import {
  ClosedStrip,
  InfoStrip,
  OpenLine,
  OtcNotice,
  PharmacyRow,
  SectionHeading,
  ShopGrid,
  ShopTile,
  StoreCover,
  StoreLogo,
  StoreSkeleton,
  StoreTabs,
  StoreTitle,
  type StoreItem,
} from "./store";

/** The compact bar is 56 high; the tabs under it 48 (+1 hairline). */
const BAR_H = 56;
const TABS_H = 49;

interface Section {
  key: string;
  title: string;
  window: string | null;
  note: string | null;
  items: StoreItem[];
}

function storeItem(d: RestaurantMenuDish, served: boolean): StoreItem {
  return { id: d.id, name: d.name, description: d.description, priceUsd: d.priceUsd, photoUrl: d.photoUrl, unavailable: d.outOfStock || !served, outOfStock: d.outOfStock };
}

/** "Closed · opens 10:00" / "Closed · opens tomorrow 09:00" (a later weekday names the day). */
function closedLabel(v: VenueView): string {
  if (!v.opens) return B.list.closedNow;
  if (v.opens.dayOffset === 1) return fmt(B.store.closedTmr, { t: v.opens.time });
  return fmt(B.store.closed, { t: v.opens.dayOffset === 0 ? v.opens.time : `${v.opens.day} ${v.opens.time}` });
}

/**
 * Shop storefront (S3) and Pharmacy storefront (S4) — Browse v2 (`packages/design/handoff/browse-v2`,
 * ledgers D-57 / D-58). The Restaurants storefront's header (cover, logo, name, open line, info strip,
 * closed strip) over sticky scroll-spy tabs; the body is a 2-column item grid for a shop and item rows
 * for a pharmacy, which also carries the OTC notice. Search inside the shop is S12.
 *
 * BROWSE ONLY until the Order flow v2 handoff (ledger D-58, owner decision 2026-10-01): no +, no
 * stepper, no cart bar, no "Start a new cart?" and no Remind me; a tile opens the item sheet with the
 * photo, name, price and description. The closing-soon strip ("order by …") is left out with them.
 */
export function ShopStoreScreen({ service }: { service: ShopService }): React.ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const narrow = width < NARROW_MAX;
  const { id } = useLocalSearchParams<{ id: string }>();
  const { catalogue, isLoading, isError, isFetching, refetch } = useShopCatalogue(id, true);
  const location = useHomeLocation();
  const now = useNow();
  const s = B.svc[service];

  const [openItem, setOpenItem] = useState<StoreItem | null>(null);
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState(false);
  const [active, setActive] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const tabsY = useRef(0);
  const sectionY = useRef<number[]>([]);

  const name = catalogue?.shop.name ?? "";
  const v = useMemo(() => (catalogue ? shopVenue(catalogue.shop, location.point, now) : null), [catalogue, location.point, now]);
  const open = v?.open ?? false;

  const sections = useMemo<Section[]>(() => {
    if (!catalogue) return [];
    return catalogue.categories
      .map((c) => {
        const served = categoryServedNow(c.availableFrom, c.availableTo, now);
        const windowed = !served && c.availableFrom && c.availableTo;
        return {
          key: c.id,
          title: c.name,
          window: windowed ? fmt(B.store.window, { a: c.availableFrom!, b: c.availableTo! }) : null,
          note: windowed ? fmt(B.store.windowNote, { a: windowLaterToday(c.availableFrom!, now) ? c.availableFrom! : `${c.availableFrom!} tomorrow` }) : null,
          items: c.dishes.map((d) => storeItem(d, served)),
        };
      })
      .filter((c) => c.items.length > 0);
  }, [catalogue, now]);

  const renderItems = (items: StoreItem[], highlight?: string): React.ReactElement =>
    service === "pharmacy" ? (
      <View>
        {items.map((it) => (
          <PharmacyRow key={it.id} item={it} highlight={highlight} onOpen={() => setOpenItem(it)} />
        ))}
      </View>
    ) : (
      <ShopGrid items={items} renderTile={(it) => <ShopTile item={it} onOpen={() => setOpenItem(it)} />} />
    );

  const itemSheet = (
    <ItemSheet
      item={openItem}
      service={service}
      browseOnly
      closedAt={null}
      remindOn={false}
      remindBusy={false}
      onRemind={() => undefined}
      onAdd={() => undefined}
      onClose={() => setOpenItem(null)}
    />
  );

  // ── Loading / error (S13a / S13b) ────────────────────────────────────────────────────────────
  if (isLoading && !catalogue) return <StoreSkeleton />;
  if (!catalogue || !v) {
    return (
      <View style={{ flex: 1, backgroundColor: tokens.color.bg, paddingTop: insets.top }}>
        <View style={{ paddingHorizontal: 6 }}>
          <IconButton icon="chevron-left" size={22} label="Back" onPress={() => router.back()} />
        </View>
        {isError ? (
          <BrowseEmpty icon="circle-alert" title={fmt(B.store.errT, { place: s.place })} body={B.list.errS}>
            <BrowseButton label={B.list.retry} variant="ghost" disabled={isFetching} onPress={refetch} />
          </BrowseEmpty>
        ) : null}
      </View>
    );
  }

  const empty = sections.length === 0;

  // ── S12 — search inside the shop ─────────────────────────────────────────────────────────────
  if (searching) {
    const q = query.trim();
    const seen = new Set<string>();
    const hits =
      q.length < 2
        ? []
        : sections
            .flatMap((x) => x.items)
            .filter((it) => {
              if (seen.has(it.id)) return false;
              seen.add(it.id);
              return it.name.toLowerCase().includes(q.toLowerCase()) || (it.description ?? "").toLowerCase().includes(q.toLowerCase());
            });
    return (
      <View style={{ flex: 1, backgroundColor: tokens.color.bg, paddingTop: insets.top }}>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingTop: 4, paddingRight: 16, paddingBottom: 8, paddingLeft: 6 }}>
          <IconButton
            icon="chevron-left"
            size={22}
            label="Back"
            onPress={() => {
              setSearching(false);
              setQuery("");
            }}
          />
          <View style={{ flex: 1, minWidth: 0, minHeight: 48, borderRadius: 12, borderWidth: 1.5, borderColor: tokens.color.accent, flexDirection: "row", alignItems: "center", gap: 10, paddingLeft: 14, paddingRight: 4 }}>
            <Icon name="search" size={18} color={tokens.color.muted} />
            <TextInput
              autoFocus
              value={query}
              onChangeText={setQuery}
              placeholder={fmt(B.store.searchIn, { v: name })}
              placeholderTextColor={tokens.color.muted}
              accessibilityLabel={fmt(B.store.searchIn, { v: name })}
              style={{ flex: 1, minWidth: 0, fontSize: 15, color: tokens.color.ink, paddingVertical: 0 }}
            />
            {query ? <IconButton icon="x" size={18} label="Clear" onPress={() => setQuery("")} /> : null}
          </View>
        </View>
        {q.length >= 2 && hits.length === 0 ? (
          <BrowseEmpty title={fmt(B.store.noHits.t, { q, v: name })} body={fmt(B.store.noHits.s, { noun: s.noun })}>
            <BrowseButton label={fmt(B.store.noHits.cta, { noun: s.noun })} variant="ghost" onPress={() => router.push(`/${service}/search`)} />
          </BrowseEmpty>
        ) : (
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: 24 }}>
            {hits.length > 0 ? (
              <Text style={{ paddingTop: 16, paddingHorizontal: 16, paddingBottom: 4, fontSize: 11.5, letterSpacing: 0.6, fontWeight: tokens.font.weight.bold, color: tokens.color.muted, ...TABULAR }}>
                {`${hits.length} ${(hits.length === 1 ? s.item : s.items).toUpperCase()}`}
              </Text>
            ) : null}
            {renderItems(hits, q)}
          </ScrollView>
        )}
        {itemSheet}
      </View>
    );
  }

  const tabNames = sections.map((x) => x.title);
  const topBar = insets.top + BAR_H;

  const onScroll = (e: NativeSyntheticEvent<NativeScrollEvent>): void => {
    const y = e.nativeEvent.contentOffset.y;
    const next = tabsY.current > 0 && y >= tabsY.current - topBar;
    if (next !== collapsed) setCollapsed(next);
    // Scroll-spy: the last section whose heading has reached the bottom of the sticky bars.
    const line = y + topBar + TABS_H + 1;
    let idx = 0;
    sectionY.current.forEach((sy, i) => {
      if (sy <= line) idx = i;
    });
    if (idx !== active) setActive(idx);
  };
  const jump = (i: number): void => {
    setActive(i);
    const y = sectionY.current[i];
    if (y != null) scrollRef.current?.scrollTo({ y: Math.max(0, y - topBar - TABS_H), animated: true });
  };

  return (
    <View style={{ flex: 1, backgroundColor: tokens.color.bg }}>
      <ScrollView ref={scrollRef} onScroll={onScroll} scrollEventThrottle={32} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 24 + insets.bottom }}>
        <StoreCover service={service} photoUrl={v.photoUrl} narrow={narrow} onBack={() => router.back()} onSearch={() => setSearching(true)} searchLabel={fmt(B.store.searchIn, { v: name })} />
        <StoreLogo logoUrl={v.logoUrl} name={name} kind={v.kind} />
        <StoreTitle name={name} sub={v.sub} />
        {open ? <OpenLine v={v} service={service} /> : null}
        <InfoStrip v={v} />
        {!open ? <ClosedStrip label={closedLabel(v)} /> : null}
        {service === "pharmacy" ? <OtcNotice marginTop={10} /> : null}
        {empty ? (
          // S13c — the shop has no items yet.
          <BrowseEmpty icon="inbox" title={B.store.emptyT} body={fmt(B.store.emptyS, { v: name })} />
        ) : (
          <>
            <View
              style={{ marginTop: 16 }}
              onLayout={(e) => {
                tabsY.current = e.nativeEvent.layout.y;
              }}
            >
              <StoreTabs names={tabNames} active={active} onPick={jump} />
            </View>
            {sections.map((x, i) => (
              <View
                key={x.key}
                onLayout={(e) => {
                  sectionY.current[i] = e.nativeEvent.layout.y;
                }}
              >
                <SectionHeading title={x.title} window={x.window} note={x.note} />
                {renderItems(x.items)}
              </View>
            ))}
          </>
        )}
      </ScrollView>
      {collapsed ? (
        <View style={{ position: "absolute", top: 0, left: 0, right: 0 }}>
          <CompactBar title={name} onBack={() => router.back()} onSearch={() => setSearching(true)} searchLabel={fmt(B.store.searchIn, { v: name })} />
          <StoreTabs names={tabNames} active={active} onPick={jump} />
        </View>
      ) : null}
      {itemSheet}
    </View>
  );
}
