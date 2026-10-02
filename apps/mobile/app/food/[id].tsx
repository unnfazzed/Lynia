import type { RestaurantMenuDish } from "@lynia/shared";
import { RESTAURANTS_PRICING } from "@lynia/shared/restaurants-order";
import { tokens } from "@lynia/shared/tokens";
import { useLocalSearchParams, useRouter } from "expo-router";
import React, { useEffect, useMemo, useRef, useState } from "react";
import { ScrollView, Text, TextInput, View, useWindowDimensions, type NativeScrollEvent, type NativeSyntheticEvent } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { usePrewarmRoutes, type PrewarmRoute } from "../../src/boot/prewarm-routes";
import { useFoodCart } from "../../src/food/cart-context";
import { categoryServedNow, restaurantVenue, windowLaterToday, type VenueView } from "../../src/logic/browse";
import { MAX_ITEM_QTY } from "../../src/logic/food-cart";
import { useHomeLocation } from "../../src/logic/home-location";
import { firstSlot } from "../../src/logic/review";
import { useNow } from "../../src/logic/use-now";
import { useScheduleSlots } from "../../src/query/use-order-flow";
import { useReopenReminder, useRestaurantMenu } from "../../src/query/use-restaurants";
import { haptic, Icon } from "../../src/ui";
import { B, fmt } from "../../src/ui/browse/copy";
import { BrowseButton, BrowseEmpty, CompactBar, IconButton, NARROW_MAX, TABULAR } from "../../src/ui/browse/kit";
import { ItemSheet, JustClosedModal, NewCartSheet } from "../../src/ui/browse/sheets";
import {
  BrowseToast,
  CartBar,
  ClosedStrip,
  ClosingStrip,
  DishRow,
  InfoStrip,
  OpenLine,
  PopularCard,
  SectionHeading,
  StoreCover,
  StoreLogo,
  StoreSkeleton,
  StoreTabs,
  StoreTitle,
  type StoreItem,
} from "../../src/ui/browse/store";

/**
 * Restaurant storefront — Browse v2 S1–S13 + I1–I3 (`packages/design/handoff/browse-v2`, ledger
 * D-57). One scrolling menu: cover, logo, name, the open line, the info strip (how good, how long, how
 * much, how far), then sticky scroll-spy tabs over every section (Popular first when the kitchen has
 * the history for it). + adds one with no sheet; the row opens the item sheet. Adding from another
 * kitchen asks first (I3). A closed kitchen shows prices and photos but no + anywhere.
 */

const REVIEW_PREWARM: readonly PrewarmRoute[] = ["foodCheckout"];
const NO_PREWARM: readonly PrewarmRoute[] = [];

/** The ink toast's life (README §3 "Errors show once, as an ink toast (~4 s)"). */
const TOAST_MS = 4000;
/** The compact bar is 56 high; the tabs under it 48 (+1 hairline). */
const BAR_H = 56;
const TABS_H = 49;

interface Section {
  key: string;
  title: string;
  popular: boolean;
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

export default function RestaurantMenuScreen(): React.ReactElement {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const narrow = width < NARROW_MAX;
  const { id } = useLocalSearchParams<{ id: string }>();
  const { menu, isLoading, isError, isFetching, refetch } = useRestaurantMenu(id, true);
  const cart = useFoodCart();
  const location = useHomeLocation();
  const now = useNow();

  const [openItem, setOpenItem] = useState<StoreItem | null>(null);
  const [pending, setPending] = useState<{ item: StoreItem; qty: number; note: string } | null>(null);
  const [toast, setToast] = useState<{ text: string; icon?: "bell" | "check" } | null>(null);
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

  const name = menu?.restaurant.name ?? "";
  const reminder = useReopenReminder(
    id,
    (res) => {
      // The kitchen opened between the render and the tap: nothing was banked, so refresh instead of
      // promising a message.
      if (res.alreadyOpen) {
        refetch();
        return;
      }
      haptic("tap");
      if (res.set) setToast({ text: fmt(B.toast.reminder, { v: name }), icon: "bell" });
    },
    () => setToast({ text: B.toast.err }),
  );

  const v = useMemo(() => (menu ? restaurantVenue(menu.restaurant, location.point, now) : null), [menu, location.point, now]);
  const open = v?.open ?? false;

  // S9 — interrupt once on a genuine open → closed transition while browsing (not on first load).
  const prevOpen = useRef<boolean | null>(null);
  useEffect(() => {
    if (!v) return;
    if (prevOpen.current === true && !v.open) setJustClosed(true);
    prevOpen.current = v.open;
  }, [v]);

  const sections = useMemo<Section[]>(() => {
    if (!menu) return [];
    const out: Section[] = [];
    const byId = new Map<string, { d: RestaurantMenuDish; served: boolean }>();
    const cats = menu.categories.map((c) => {
      const served = categoryServedNow(c.availableFrom, c.availableTo, now);
      for (const d of c.dishes) byId.set(d.id, { d, served });
      const windowed = !served && c.availableFrom && c.availableTo;
      return {
        key: c.id,
        title: c.name,
        popular: false,
        window: windowed ? fmt(B.store.window, { a: c.availableFrom!, b: c.availableTo! }) : null,
        note: windowed ? fmt(B.store.windowNote, { a: windowLaterToday(c.availableFrom!, now) ? c.availableFrom! : `${c.availableFrom!} tomorrow` }) : null,
        items: c.dishes.map((d) => storeItem(d, served)),
      };
    });
    const popular = (menu.popularDishIds ?? []).map((pid) => byId.get(pid)).filter((x): x is { d: RestaurantMenuDish; served: boolean } => x != null);
    // "Popular" is the drawn tab label (S1); the rail only shows with two or more dishes.
    if (popular.length >= 2) out.push({ key: "popular", title: "Popular", popular: true, window: null, note: null, items: popular.map((p) => storeItem(p.d, p.served)) });
    return [...out, ...cats.filter((c) => c.items.length > 0)];
  }, [menu, now]);

  const qtyFor = (dishId: string): number => (cart.cart.restaurantId === id ? cart.cart.lines.filter((l) => l.dishId === dishId).reduce((s, l) => s + l.quantity, 0) : 0);
  const hasCart = cart.itemCount > 0 && cart.cart.restaurantId === id;
  // The cart bar's one exit is Review & place (D-59), which pulls react-native-maps in for the inline
  // address card — warm it while the customer is still browsing, but only once there IS a basket.
  usePrewarmRoutes(hasCart ? REVIEW_PREWARM : NO_PREWARM);
  // R5c (Order flow v2, D-59) — a closed kitchen holding this basket: its first slot, for the cart bar's
  // "Order for when they open · 10:30–11:00" (the slots are for the customer's deliver-to).
  const slotsQ = useScheduleSlots(id, location.point, hasCart && !open);
  const first = slotsQ.slots ? firstSlot(slotsQ.slots) : null;

  const commit = (item: StoreItem, qty: number, note: string): void => {
    cart.addItem(id, name, { dishId: item.id, name: item.name, priceUsd: item.priceUsd, quantity: qty, note }, { businessType: "restaurant", shopKind: null });
    haptic("tap");
  };
  /** I3 — a cart from another kitchen is asked about BEFORE anything is cleared. */
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

  // ── Loading / error ──────────────────────────────────────────────────────────────────────────
  if (isLoading && !menu) return <StoreSkeleton />;
  if (!menu || !v) {
    return (
      <View style={{ flex: 1, backgroundColor: tokens.color.bg, paddingTop: insets.top }}>
        <View style={{ paddingHorizontal: 6 }}>
          <IconButton icon="chevron-left" size={22} label="Back" onPress={() => router.back()} />
        </View>
        {isError ? (
          <BrowseEmpty icon="circle-alert" title={fmt(B.store.errT, { place: B.svc.food.place })} body={B.list.errS}>
            <BrowseButton label={B.list.retry} variant="ghost" disabled={isFetching} onPress={refetch} />
          </BrowseEmpty>
        ) : null}
      </View>
    );
  }

  const canAdd = open;
  const closingStrip = open && v.closesInMin != null && v.closeTime != null;
  const empty = sections.length === 0;

  // ── S12 — search inside the venue ────────────────────────────────────────────────────────────
  if (searching) {
    const q = query.trim();
    const seen = new Set<string>();
    const hits =
      q.length < 2
        ? []
        : sections
            .filter((s) => !s.popular)
            .flatMap((s) => s.items)
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
          <BrowseEmpty title={fmt(B.store.noHits.t, { q, v: name })} body={fmt(B.store.noHits.s, { noun: B.svc.food.noun })}>
            <BrowseButton label={fmt(B.store.noHits.cta, { noun: B.svc.food.noun })} variant="ghost" onPress={() => router.push(`/food/search?q=${encodeURIComponent(q)}` as never)} />
          </BrowseEmpty>
        ) : (
          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingBottom: hasCart ? 96 : 24 }}>
            {hits.length > 0 ? (
              <Text style={{ paddingTop: 16, paddingHorizontal: 16, paddingBottom: 4, fontSize: 11.5, letterSpacing: 0.6, fontWeight: tokens.font.weight.bold, color: tokens.color.muted, ...TABULAR }}>
                {`${hits.length} ${(hits.length === 1 ? B.svc.food.item : B.svc.food.items).toUpperCase()}`}
              </Text>
            ) : null}
            {hits.map((it) => (
              <DishRow key={it.id} item={it} qty={qtyFor(it.id)} canAdd={canAdd} highlight={q} onOpen={() => setOpenItem(it)} onAdd={() => add(it)} onMinus={() => minus(it)} />
            ))}
          </ScrollView>
        )}
        {renderOverlays()}
      </View>
    );
  }

  const tabNames = sections.map((s) => s.title);
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

  function renderOverlays(): React.ReactElement {
    const showBar = hasCart && !openItem && !pending;
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
            onPress={() => router.push(!open && first ? "/food/checkout?schedule=first" : "/food/checkout")}
          />
        ) : null}
        {toast ? <BrowseToast text={toast.text} icon={toast.icon} bottom={(showBar ? 88 : 24) + insets.bottom} /> : null}
        <ItemSheet
          item={openItem}
          service="food"
          closedAt={canAdd ? null : (v?.opens?.time ?? null)}
          remindOn={reminder.isSet}
          remindBusy={reminder.isPending || reminder.isLoading}
          onRemind={reminder.toggle}
          onAdd={(qty, note) => {
            const it = openItem;
            setOpenItem(null);
            if (it) add(it, qty, note);
          }}
          onClose={() => setOpenItem(null)}
        />
        <NewCartSheet
          pending={
            pending
              ? { oldVenue: cart.cart.restaurantName ?? "", oldCount: cart.itemCount, oldTotal: cart.subtotal, item: pending.item.name, newVenue: name }
              : null
          }
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
            router.replace("/food");
          }}
          onDismiss={() => setJustClosed(false)}
        />
      </>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: tokens.color.bg }}>
      <ScrollView ref={scrollRef} onScroll={onScroll} scrollEventThrottle={32} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: hasCart ? 96 + insets.bottom : 24 }}>
        <StoreCover service="food" photoUrl={v.photoUrl} narrow={narrow} onBack={() => router.back()} onSearch={() => setSearching(true)} searchLabel={fmt(B.store.searchIn, { v: name })} />
        <StoreLogo logoUrl={v.logoUrl} name={name} kind={null} />
        <StoreTitle name={name} sub={v.sub} />
        {open && !closingStrip ? <OpenLine v={v} service="food" /> : null}
        <InfoStrip v={v} />
        {closingStrip ? <ClosingStrip minutes={v.closesInMin!} orderBy={v.closeTime!} /> : null}
        {!open ? <ClosedStrip label={closedLabel(v)} remindOn={reminder.isSet} remindBusy={reminder.isPending || reminder.isLoading} onRemind={reminder.toggle} /> : null}
        {empty ? (
          // S13c — the kitchen has no dishes on its menu yet.
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
            {sections.map((s, i) => (
              <View
                key={s.key}
                onLayout={(e) => {
                  sectionY.current[i] = e.nativeEvent.layout.y;
                }}
              >
                <SectionHeading title={s.title} window={s.window} note={s.note} />
                {s.popular ? (
                  <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 12, paddingVertical: 6, paddingHorizontal: 16 }}>
                    {s.items.map((it) => (
                      <PopularCard key={it.id} item={it} qty={qtyFor(it.id)} canAdd={canAdd} onOpen={() => setOpenItem(it)} onAdd={() => add(it)} onMinus={() => minus(it)} />
                    ))}
                  </ScrollView>
                ) : (
                  s.items.map((it) => (
                    <DishRow key={it.id} item={it} qty={qtyFor(it.id)} canAdd={canAdd} onOpen={() => setOpenItem(it)} onAdd={() => add(it)} onMinus={() => minus(it)} />
                  ))
                )}
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
