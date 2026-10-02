import { tokens } from "@lynia/shared/tokens";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { StatusBar } from "expo-status-bar";
import { useFocusEffect, useRouter } from "expo-router";
import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Keyboard, Platform, ScrollView, useWindowDimensions, View } from "react-native";
import { usePrewarmRoutes, type PrewarmRoute } from "../../src/boot/prewarm-routes";
import { getActiveCustomerOrders } from "../../src/api/orders";
import { useNow } from "../../src/logic/use-now";
import { useFeatureFlags } from "../../src/net/use-feature-flags";
import { useClaimOfflineBanner } from "../../src/net/offline-banner-owner";
import { useReachable } from "../../src/net/use-reachable";
import { useServiceFlags } from "../../src/net/use-service-flags";
import { useFoodOrdersPeek } from "../../src/query/use-food-order";
import { invalidateCustomerOrderHistory, useHistoryFeed } from "../../src/query/use-history-feed";
import { useNotificationsUnreadCount } from "../../src/query/use-notifications-unread";
import { useForegroundRefetch } from "../../src/realtime/use-foreground-refetch";
import { useTabRoot } from "../../src/ui";
import { hhmm } from "../../src/ui/order/copy";
import { ordersCopy as C, OX } from "../../src/ui/orders/copy";
import {
  DayLabel,
  EmptyArt,
  EndRow,
  HistoryRow,
  IconDisc,
  InfoCard,
  NoteRow,
  NowCard,
  NowStrip,
  OfflineBanner,
  OrdersButton,
  OrdersHeader,
  OrdersSkeleton,
  SearchBar,
  SearchField,
  SectionLabel,
  ServiceArt,
  ServiceChips,
} from "../../src/ui/orders/kit";
import {
  groupByDay,
  historyRowVM,
  matchesQuery,
  merchantNowVM,
  monthYear,
  parcelNowVM,
  searchDate,
  sortNow,
  type OrdersFilter,
  type OrdersService,
} from "../../src/ui/orders/model";

const ACTIVE_ORDERS_KEY = ["activeCustomerOrders"] as const;

/** Every row on this tab opens the one order screen; warm it from the list's idle time (prewarm-routes.ts). */
const ORDERS_PREWARM: readonly PrewarmRoute[] = ["order"];

/** The history endpoint's page size: a shorter page is the whole history. NEEDS BACKEND (orders-v2): a
 *  cursor (`/orders/history?cursor=`) for "Loading older orders…" past it. */
const HISTORY_PAGE = 50;

/** Phones narrower than this draw the 320 header circles (Calm Mint v2's H3 breakpoint). */
const NARROW_MAX = 340;

/**
 * Orders tab — the Orders v2 handoff (packages/design/handoff/orders-v2, ledger D-63): a mint header with
 * search, a pinned NOW section (one forest card per running order), service chips, and a day-grouped
 * history of the customer's own orders. It is the customer's only order history (Trip history retired).
 * No pull-to-refresh: the tab refreshes on focus, every 30 s while visible, on reconnect and on resume, and
 * a failed background refresh stays silent.
 */
export default function OrdersTabScreen(): React.ReactElement {
  const { scrollRef, bottomPad } = useTabRoot<ScrollView>("orders");
  usePrewarmRoutes(ORDERS_PREWARM);
  const router = useRouter();
  const qc = useQueryClient();
  const narrow = useWindowDimensions().width < NARROW_MAX;
  const online = useReachable();
  const unread = useNotificationsUnreadCount() > 0;
  const { restaurantsEnabled } = useFeatureFlags();
  const { shopsEnabled, pharmacyEnabled } = useServiceFlags();
  const now = useNow(15_000);

  // Focus-gated polling over the `["activeCustomerOrders"]` entry Home shares (one card per running job).
  const [focused, setFocused] = useState(true);
  useFocusEffect(
    useCallback(() => {
      setFocused(true);
      void qc.invalidateQueries({ queryKey: ACTIVE_ORDERS_KEY });
      return () => setFocused(false);
    }, [qc]),
  );
  const activeOrdersQ = useQuery({ queryKey: ACTIVE_ORDERS_KEY, queryFn: getActiveCustomerOrders, refetchInterval: focused ? 30_000 : false });
  // Array.isArray, not `?? []`: a malformed 200 body is a truthy non-array (CF-04 / UIP-02).
  const activeOrders = Array.isArray(activeOrdersQ.data) ? activeOrdersQ.data : [];
  const foodReads = useFoodOrdersPeek(
    activeOrders.filter((o) => o.orderType === "merchant").map((o) => o.id),
    focused,
  );
  const { rows, isFetching, refetch, savedAt } = useHistoryFeed();
  useForegroundRefetch(() => {
    void qc.invalidateQueries({ queryKey: ACTIVE_ORDERS_KEY });
    invalidateCustomerOrderHistory(qc);
  });

  // ── NOW ──
  const asOf = !online && activeOrdersQ.dataUpdatedAt ? hhmm(new Date(activeOrdersQ.dataUpdatedAt).toISOString()) : null;
  const nowCards = sortNow(
    activeOrders.map((o) => (o.orderType === "merchant" ? merchantNowVM(o, foodReads[o.id], now.getTime(), asOf) : parcelNowVM(o, now.getTime(), asOf))),
  );
  const open = (id: string): void => router.push(`/order/${id}`);

  // ── History: the customer's own orders (carried jobs live in the rider's Job history), minus the running ones ──
  const liveIds = useMemo(() => new Set(activeOrders.map((o) => o.id)), [activeOrders]);
  const history = useMemo(() => (rows ?? []).filter((r) => r.role === "customer" && !liveIds.has(r.id)).map(historyRowVM), [rows, liveIds]);
  const services: OrdersService[] = [
    "send",
    ...(restaurantsEnabled ? (["restaurants"] as const) : []),
    ...(shopsEnabled ? (["shops"] as const) : []),
    ...(pharmacyEnabled ? (["pharmacy"] as const) : []),
  ];
  const [filter, setFilter] = useState<OrdersFilter>("all");
  const shownFilter: OrdersFilter = filter === "all" || services.includes(filter) ? filter : "all";
  const filtered = shownFilter === "all" ? history : history.filter((r) => r.service === shownFilter);

  // ── Search ──
  const [query, setQuery] = useState("");
  const [searching, setSearching] = useState(false);
  const q = query.trim();
  const matches = useMemo(() => (q ? history.filter((r) => matchesQuery(r, q)) : []), [history, q]);
  const matchCount = useRef(0);
  matchCount.current = matches.length;
  // Keyboard down with results (O10d): back to the full header, the query kept in the field.
  useEffect(() => {
    const sub = Keyboard.addListener(Platform.OS === "ios" ? "keyboardWillHide" : "keyboardDidHide", () => {
      if (matchCount.current > 0) setSearching(false);
    });
    return () => sub.remove();
  }, []);
  const cancelSearch = (): void => {
    Keyboard.dismiss();
    setQuery("");
    setSearching(false);
  };

  const anyFood = restaurantsEnabled || shopsEnabled || pharmacyEnabled;
  const findFood = (): void => router.push(restaurantsEnabled ? "/food" : shopsEnabled ? "/shops" : "/pharmacy");
  const header = (search: boolean, dim = false): React.ReactElement => (
    <OrdersHeader narrow={narrow} unread={unread} onBell={() => router.push("/notifications")}>
      {search ? <SearchField query={query} dim={dim} onPress={() => setSearching(true)} onClear={() => setQuery("")} /> : null}
    </OrdersHeader>
  );
  const nowSection = (): React.ReactElement | null =>
    nowCards.length === 0 ? null : (
      <>
        <SectionLabel text={nowCards.length > 1 ? C.nowCount(nowCards.length) : C.now} helper={nowCards.length > 1 && online ? C.nowMany : null} />
        <View style={{ gap: 8, paddingHorizontal: 16 }}>
          {nowCards.map((v) => (
            <NowCard key={v.id} v={v} onPress={() => open(v.id)} />
          ))}
        </View>
      </>
    );
  const results = (): React.ReactElement =>
    matches.length > 0 ? (
      <>
        <SectionLabel text={C.matches(matches.length, q)} />
        {matches.map((r, i) => (
          <HistoryRow key={r.id} r={r} q={q} when={searchDate(r.createdAt, now)} last={i === matches.length - 1} onPress={() => open(r.id)} />
        ))}
      </>
    ) : (
      <InfoCard title={C.noMatch(q)} body={C.noMatchSub}>
        <OrdersButton kind="ghost" label={C.clearSearch} onPress={() => setQuery("")} />
      </InfoCard>
    );

  // The tab draws its own offline message (the banner, the search note, the O20 card), so the app-wide
  // strip stands down while it does — one offline bar, not two (the order screen's rule, D-53 state 19).
  useClaimOfflineBanner(focused && !online && (searching || (rows === null && !isFetching) || (history.length > 0 && savedAt != null)));

  let body: React.ReactElement;
  if (searching) {
    // O10a–c / O11: the compact search header; running orders stay as slim strips.
    body = (
      <>
        <SearchBar value={query} onChange={setQuery} onCancel={cancelSearch} />
        {!online ? <OfflineBanner text={C.offlineSearch} /> : null}
        {nowCards.map((v) => (
          <NowStrip key={v.id} v={v} onPress={() => open(v.id)} />
        ))}
        {q ? results() : <NoteRow icon="search" text={C.searchHint} />}
        {q && !online ? <NoteRow center text={C.noMatchOff} /> : null}
      </>
    );
  } else if (rows === null && isFetching) {
    // O15 — a genuine first load: the real header, skeleton chips and rows.
    body = (
      <>
        {header(true, true)}
        <OrdersSkeleton />
      </>
    );
  } else if (rows === null) {
    // O20 (offline, nothing saved) / O21 (couldn't load). Nothing to search, so no search field.
    body = (
      <>
        {header(false)}
        {nowSection()}
        {!online ? (
          <InfoCard art={<IconDisc icon="wifi-off" bg={tokens.color.surface} ink={tokens.color.muted} />} title={C.offT} body={C.offB} />
        ) : (
          <InfoCard art={<IconDisc icon="circle-alert" bg={tokens.color.dangerWash} ink={tokens.color.dangerInk} />} title={C.errT} body={C.errB}>
            <OrdersButton kind="primary" icon="refresh-cw" label={C.tryAgain} onPress={refetch} />
          </InfoCard>
        )}
      </>
    );
  } else if (history.length === 0) {
    // O18 (a running order, nothing earlier) / O16–O17 (no orders at all).
    body =
      nowCards.length > 0 ? (
        <>
          {header(false)}
          {nowSection()}
          <View style={{ marginTop: 8 }}>
            <NoteRow center icon="receipt" text={C.onlyNow} />
          </View>
        </>
      ) : (
        <>
          {header(false)}
          <InfoCard mint art={<EmptyArt />} title={C.emptyT} body={anyFood ? C.emptyB : C.emptyBParcels}>
            <OrdersButton kind="primary" icon="package" label={C.sendParcel} onPress={() => router.push("/send")} />
            {anyFood ? <OrdersButton kind="text" label={C.findFood} onPress={findFood} /> : null}
          </InfoCard>
        </>
      );
  } else {
    const groups = groupByDay(filtered, now);
    const none = shownFilter === "all" ? null : shownFilter;
    body = (
      <>
        {header(true)}
        {!online && savedAt ? <OfflineBanner text={C.offline(hhmm(savedAt))} /> : null}
        {nowSection()}
        {services.length > 1 ? <ServiceChips services={services} value={shownFilter} onChange={setFilter} /> : null}
        {q ? (
          // O10d — results with the keyboard down; the search ignores the chip filter.
          results()
        ) : none && filtered.length === 0 ? (
          <InfoCard art={<ServiceArt service={none} />} title={none === "pharmacy" ? OX.pharmacyNone : C.filterNone[none]} body={C.filterNoneSub}>
            <OrdersButton kind="ghost" label={C.showAll} onPress={() => setFilter("all")} />
          </InfoCard>
        ) : (
          <>
            {groups.map((g) => (
              <View key={g.label}>
                <DayLabel label={g.label} />
                {g.rows.map((r, i) => (
                  <HistoryRow key={r.id} r={r} when={hhmm(r.createdAt)} last={i === g.rows.length - 1} onPress={() => open(r.id)} />
                ))}
              </View>
            ))}
            {(rows?.length ?? 0) < HISTORY_PAGE && shownFilter === "all" ? <EndRow since={monthYear(history[history.length - 1]!.createdAt)} /> : null}
          </>
        )}
      </>
    );
  }

  return (
    // A plain root, not AppScreen: the mint header owns the top inset (it paints behind the status bar).
    <View style={{ flex: 1, backgroundColor: tokens.color.bg }}>
      <StatusBar style="dark" />
      <ScrollView
        ref={scrollRef}
        style={{ backgroundColor: tokens.color.bg }}
        contentContainerStyle={{ paddingBottom: bottomPad }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
      >
        {body}
      </ScrollView>
    </View>
  );
}
