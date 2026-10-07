import type { RestaurantMenuDish, ShopService } from "@lynia/shared";
import { RESTAURANTS_PRICING } from "@lynia/shared/restaurants-order";
import { tokens } from "@lynia/shared/tokens";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, Text, TextInput, View, useWindowDimensions, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useFoodCart } from "../../food/cart-context";
import { categoryServedNow, shopVenue, windowLaterToday, type VenueView } from "../../logic/browse";
import { MAX_ITEM_QTY } from "../../logic/food-cart";
import { useHomeLocation } from "../../logic/home-location";
import { firstSlot, rxOnFor } from "../../logic/review";
import { useNow } from "../../logic/use-now";
import { useFeatureFlags } from "../../net/use-feature-flags";
import { useOrderFlags } from "../../net/use-order-flags";
import { useServiceFlags } from "../../net/use-service-flags";
import { useScheduleSlots } from "../../query/use-order-flow";
import { useShopCatalogue } from "../../query/use-shops";
import { haptic } from "../haptics";
import { Icon } from "../Icon";
import { EmptyState } from "../EmptyState";
import { emptyCopy, fillEmpty } from "../emptyCopy";
import { B, fmt } from "./copy";
import { CompactBar, IconButton, NARROW_MAX, STORE_EMPTY_TOP, TABULAR } from "./kit";
import { ItemSheet, JustClosedModal, NewCartSheet } from "./sheets";
import {
  BrowseToast,
  CartBar,
  ClosedStrip,
  ClosingStrip,
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

/** The ink toast's life (README §3 "Errors show once, as an ink toast (~4 s)"). */
const TOAST_MS = 4000;
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

function storeItem(d: RestaurantMenuDish, served: boolean, rxEnabled: boolean): StoreItem {
  return {
    id: d.id,
    name: d.name,
    description: d.description,
    priceUsd: d.priceUsd,
    photoUrl: d.photoUrl,
    unavailable: d.outOfStock || !served,
    outOfStock: d.outOfStock,
    rxRequired: rxEnabled && d.rxRequired === true,
  };
}

/** "Closed · opens 10:00" / "Closed · opens tomorrow 09:00" (a later weekday names the day). */
function closedLabel(v: VenueView): string {
  if (!v.opens) return B.list.closedNow;
  if (v.opens.dayOffset === 1) return fmt(B.store.closedTmr, { t: v.opens.time });
  return fmt(B.store.closed, { t: v.opens.dayOffset === 0 ? v.opens.time : `${v.opens.day} ${v.opens.time}` });
}

/**
 * Shop storefront (S3) and Pharmacy storefront (S4) — Browse v2 (`packages/design/handoff/browse-v2`,
 * ledgers D-57 / D-58) with ordering from Order flow v2 (ledger D-59). The Restaurants storefront's header
 * (cover, logo, name, open line, info strip, closing / closed strip) over sticky scroll-spy tabs; the body
 * is a 2-column item grid for a shop and item rows for a pharmacy, which also carries the OTC notice.
 * Search inside the shop is S12.
 *
 * Ordering is the restaurant storefront's kit: + adds one, the tile / row opens the item sheet (I1b/I1c:
 * quantity, "Note for the shop / pharmacy", "Add · $x"), a stepper once it's in the cart (S5/S6), the
 * cart bar → Review (R2a/R2b), and "Start a new cart?" (I3) when the one cart holds another venue. A closed
 * shop shows no + and, holding a basket, offers "Order for when they open" (R5c). The section's kill
 * switch (`useServiceFlags`) off ⇒ browse only. With `rxEnabled`, Rx items wear "Prescription needed".
 */
export function ShopStoreScreen({ service }: { service: ShopService }): React.ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const narrow = width < NARROW_MAX;
  const { id } = useLocalSearchParams<{ id: string }>();
  const { catalogue, isLoading, isError, isFetching, refetch } = useShopCatalogue(id, true);
  const cart = useFoodCart();
  const location = useHomeLocation();
  const now = useNow();
  const serviceFlags = useServiceFlags();
  const orderFlags = useOrderFlags();
  // U09: Rx is on when the flag says so OR this catalogue lists an Rx item (the server lists those only
  // while Rx is on) — so an item added before `/app/order-flags` answers still carries `rxRequired`.
  const rxEnabled = rxOnFor(orderFlags.rxEnabled, catalogue?.categories);
  // U65: every order route (Review, slots, Place) sits behind the Restaurants switch on the API
  // (RestaurantsEnabledGuard), so with Restaurants off a shop can't take an order either — the storefront
  // goes browse only, like its own section's switch, instead of offering a Place that always fails.
  const { restaurantsEnabled } = useFeatureFlags();
  const sectionOn = (service === "pharmacy" ? serviceFlags.pharmacyEnabled : serviceFlags.shopsEnabled) && restaurantsEnabled;
  const s = B.svc[service];

  const [openItem, setOpenItem] = useState<StoreItem | null>(null);
  const [pending, setPending] = useState<{ item: StoreItem; qty: number; note: string } | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [justClosed, setJustClosed] = useState(false);
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");
  const [collapsed, setCollapsed] = useState(false);
  const [active, setActive] = useState(0);
  const scrollRef = useRef<ScrollView>(null);
  const tabsY = useRef(0);
  const sectionY = useRef<number[]>([]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), TOAST_MS);
    return () => clearTimeout(t);
  }, [toast]);

  const name = catalogue?.shop.name ?? "";
  const v = useMemo(() => (catalogue ? shopVenue(catalogue.shop, location.point, now) : null), [catalogue, location.point, now]);
  const open = v?.open ?? false;

  // S9 — interrupt once on a genuine open → closed transition while a basket is held (not on first load).
  const prevOpen = useRef<boolean | null>(null);
  useEffect(() => {
    if (!v) return;
    if (prevOpen.current === true && !v.open && cart.itemCount > 0 && cart.cart.restaurantId === id) setJustClosed(true);
    prevOpen.current = v.open;
  }, [v, cart.itemCount, cart.cart.restaurantId, id]);

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
          items: c.dishes.map((d) => storeItem(d, served, rxEnabled)),
        };
      })
      .filter((c) => c.items.length > 0);
  }, [catalogue, now, rxEnabled]);

  const hasCart = cart.itemCount > 0 && cart.cart.restaurantId === id;
  const canAdd = open && sectionOn;
  // R5c — a closed shop holding this basket: its first slot ("Order for when they open · 10:30–11:00").
  const slotsQ = useScheduleSlots(id, location.point, hasCart && !open && sectionOn);
  const first = slotsQ.slots ? firstSlot(slotsQ.slots) : null;

  const qtyFor = (itemId: string): number => (cart.cart.restaurantId === id ? cart.cart.lines.filter((l) => l.dishId === itemId).reduce((n, l) => n + l.quantity, 0) : 0);
  const commit = (item: StoreItem, qty: number, note: string): void => {
    cart.addItem(
      id,
      name,
      { dishId: item.id, name: item.name, priceUsd: item.priceUsd, quantity: qty, note, ...(item.rxRequired ? { rxRequired: true } : {}) },
      { businessType: "shop", shopKind: catalogue?.shop.shopKind ?? (service === "pharmacy" ? "pharmacy" : "other") },
    );
    haptic("tap");
  };
  /** I3 — a cart from another venue is asked about BEFORE anything is cleared. */
  const add = (item: StoreItem, qty = 1, note = ""): void => {
    if (cart.itemCount > 0 && cart.cart.restaurantId != null && cart.cart.restaurantId !== id) {
      setPending({ item, qty, note });
      return;
    }
    if (qtyFor(item.id) + qty > MAX_ITEM_QTY) return;
    commit(item, qty, note);
  };
  const minus = (item: StoreItem): void => {
    const lines = cart.cart.lines.filter((l) => l.dishId === item.id);
    const line = lines.find((l) => l.note === "") ?? lines[lines.length - 1];
    if (line) cart.setQuantity(line.dishId, line.note, line.quantity - 1);
  };

  const renderItems = (items: StoreItem[], highlight?: string): React.ReactElement =>
    service === "pharmacy" ? (
      <View>
        {items.map((it) => (
          <PharmacyRow
            key={it.id}
            item={it}
            highlight={highlight}
            qty={qtyFor(it.id)}
            canAdd={canAdd}
            onOpen={() => setOpenItem(it)}
            onAdd={() => add(it)}
            onMinus={() => minus(it)}
          />
        ))}
      </View>
    ) : (
      <ShopGrid
        items={items}
        renderTile={(it) => <ShopTile item={it} qty={qtyFor(it.id)} canAdd={canAdd} onOpen={() => setOpenItem(it)} onAdd={() => add(it)} onMinus={() => minus(it)} />}
      />
    );

  function renderOverlays(): React.ReactElement {
    const showBar = hasCart && sectionOn && !openItem && !pending;
    return (
      <>
        {showBar ? (
          <CartBar
            count={cart.itemCount}
            subtotal={cart.subtotal}
            venue={name}
            minSubtotal={RESTAURANTS_PRICING.minOrderSubtotal}
            smallOrderFee={RESTAURANTS_PRICING.smallOrderFee}
            openFirst={!open && first ? first.slot.label : null}
            onPress={() => router.push((!open && first ? "/food/checkout?schedule=first" : "/food/checkout") as never)}
          />
        ) : null}
        {toast ? <BrowseToast text={toast} bottom={(showBar ? 88 : 24) + insets.bottom} /> : null}
        <ItemSheet
          item={openItem}
          service={service}
          browseOnly={!sectionOn}
          remind={false}
          rxEnabled={rxEnabled}
          closedAt={open ? null : (v?.opens?.time ?? null)}
          remindOn={false}
          remindBusy={false}
          onRemind={() => undefined}
          onAdd={(qty, note) => {
            const it = openItem;
            setOpenItem(null);
            if (it) add(it, qty, note);
          }}
          onClose={() => setOpenItem(null)}
        />
        <NewCartSheet
          pending={pending ? { oldVenue: cart.cart.restaurantName ?? "", oldCount: cart.itemCount, oldTotal: cart.subtotal, item: pending.item.name, newVenue: name } : null}
          onConfirm={() => {
            const p = pending;
            setPending(null);
            if (!p) return;
            cart.clear();
            commit(p.item, p.qty, p.note);
          }}
          onClose={() => setPending(null)}
        />
        <JustClosedModal
          venue={name}
          visible={justClosed}
          onSeeOpen={() => {
            setJustClosed(false);
            router.replace(`/${service}` as never);
          }}
          onDismiss={() => setJustClosed(false)}
        />
      </>
    );
  }

  // ── Loading / error (S13a / S13b) ────────────────────────────────────────────────────────────
  if (isLoading && !catalogue) return <StoreSkeleton />;
  if (!catalogue || !v) {
    return (
      <View style={{ flex: 1, backgroundColor: tokens.color.bg, paddingTop: insets.top }}>
        <View style={{ paddingHorizontal: 6 }}>
          <IconButton icon="chevron-left" size={22} label="Back" onPress={() => router.back()} />
        </View>
        {isError ? (
          <EmptyState
            icon="circle-alert"
            tone="error"
            title={fmt(B.store.errT, { place: s.place })}
            body={emptyCopy.browse.error.body}
            primary={{ label: emptyCopy.browse.error.primary, icon: "refresh-cw", disabled: isFetching, onPress: refetch }}
          />
        ) : null}
      </View>
    );
  }

  const empty = sections.length === 0;
  const closingStrip = open && v.closesInMin != null && v.closeTime != null;
  const bottomPad = hasCart ? 96 + insets.bottom : 24 + insets.bottom;

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
          <EmptyState
            icon="search"
            tone="info"
            title={fillEmpty(emptyCopy.store.noMatch.title, { q })}
            body={emptyCopy.store.noMatch.body.replace("restaurants", s.noun)}
            secondary={{ label: emptyCopy.store.noMatch.secondary.replace("restaurants", s.noun), onPress: () => router.push(`/${service}/search`) }}
          />
        ) : (
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: bottomPad }}>
            {hits.length > 0 ? (
              <Text style={{ paddingTop: 16, paddingHorizontal: 16, paddingBottom: 4, fontSize: 11.5, letterSpacing: 0.6, fontWeight: tokens.font.weight.bold, color: tokens.color.muted, ...TABULAR }}>
                {`${hits.length} ${(hits.length === 1 ? s.item : s.items).toUpperCase()}`}
              </Text>
            ) : null}
            {renderItems(hits, q)}
          </ScrollView>
        )}
        {renderOverlays()}
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
      <ScrollView ref={scrollRef} onScroll={onScroll} scrollEventThrottle={32} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: bottomPad }}>
        <StoreCover service={service} photoUrl={v.photoUrl} narrow={narrow} onBack={() => router.back()} onSearch={() => setSearching(true)} searchLabel={fmt(B.store.searchIn, { v: name })} />
        <StoreLogo logoUrl={v.logoUrl} name={name} kind={v.kind} />
        <StoreTitle name={name} sub={v.sub} />
        {open && !closingStrip ? <OpenLine v={v} service={service} /> : null}
        <InfoStrip v={v} />
        {closingStrip && sectionOn ? <ClosingStrip minutes={v.closesInMin!} orderBy={v.closeTime!} /> : null}
        {closingStrip && !sectionOn ? <OpenLine v={v} service={service} /> : null}
        {!open ? <ClosedStrip label={closedLabel(v)} /> : null}
        {service === "pharmacy" && !rxEnabled ? <OtcNotice marginTop={10} /> : null}
        {empty ? (
          // S13c — the shop has no items yet.
          <EmptyState icon="inbox" title={emptyCopy.store.noItems.title} body={emptyCopy.store.noItems.body} offsetTop={STORE_EMPTY_TOP} />
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
      {renderOverlays()}
    </View>
  );
}
