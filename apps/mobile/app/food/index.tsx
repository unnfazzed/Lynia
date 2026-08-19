import type { RestaurantListItem } from "@lynia/shared";
import { tokens } from "@lynia/shared/tokens";
import { useRouter } from "expo-router";
import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, ScrollView, Text, View } from "react-native";
import { applyFoodListView, deliverToLabel, deliverySummary, etaRange, restaurantMeta, type FoodListSort } from "../../src/logic/food-list";
import { useHomeLocation } from "../../src/logic/home-location";
import { useNow } from "../../src/logic/use-now";
import { useFeatureFlags } from "../../src/net/use-feature-flags";
import { useRestaurantListFeed } from "../../src/query/use-restaurants";
import { AppBar, Button, Card, EmptyState, Icon, Screen, Tappable } from "../../src/ui";
import { RestaurantRow } from "../../src/ui/food/RestaurantRow";
// Not from the ui barrel: LocationSheet reaches AddressSearch, which imports the barrel back (a
// cycle) — the same direct import the customer home takes for the same reason.
import { LocationSheet } from "../../src/ui/home/LocationSheet";
import { FoodListErrorView } from "./food-list.error.view";
import { FoodListLoadingView } from "./food-list.loading.view";

/** R1·1..R1·5 restaurant list — five states (default / loading / empty / error / offline). */
export default function RestaurantListScreen(): React.ReactElement {
  const router = useRouter();
  const { restaurantsEnabled } = useFeatureFlags();
  const feed = useRestaurantListFeed(restaurantsEnabled);
  const [openOnly, setOpenOnly] = useState(false);
  // The other three drawn pills (RC.list draws four; the app shipped one). `sort` is single-valued
  // because Nearest and Top rated are two answers to the same question — a list has one order.
  const [cheapFee, setCheapFee] = useState(false);
  const [sort, setSort] = useState<FoodListSort>(null);
  // The deliver-to is the customer's LIVE location, the same value (and the same persisted slot) the
  // home header shows — not the "Harare" this screen used to hardcode. `home-location.ts` exists
  // precisely to kill that string; this screen was left behind when the home adopted it.
  const location = useHomeLocation();
  const [locationOpen, setLocationOpen] = useState(false);
  // LC-B06: was `useMemo(() => new Date(), [feed.restaurants])` — useRestaurantListFeed's default
  // structural sharing keeps the same `restaurants` reference across a no-change refetch, so `now`
  // stayed pinned at first render for practical purposes; a stale-open restaurant kept passing the
  // "Open now" filter after it actually closed.
  const now = useNow();

  // B-O10: a filter runs over whatever pages have loaded so far — with pagination in place, that's
  // no longer necessarily the whole catalog. Auto-drain the rest while any pill is active so it never
  // silently under-reports (mirrors search.tsx's identical need below).
  //
  // The SORTS drain for the same reason the filters do: "Nearest" over page 1 is not the nearest, it
  // is the nearest of the first page — a wrong answer that looks like a right one. Idle (no pill) is
  // unchanged: the list pages lazily on scroll as before.
  const narrowing = openOnly || cheapFee || sort !== null;
  useEffect(() => {
    if (narrowing && feed.hasMore && !feed.isLoadingMore) feed.loadMore();
  }, [narrowing, feed.hasMore, feed.isLoadingMore, feed.loadMore]);

  // Derived view state. These MUST sit above the state-dependent early returns below: a hook after
  // them runs on the data frame but not on the loading/error frame, so the hook COUNT changes between
  // renders and React tears the screen down mid-transition ("Rendered more hooks than during the
  // previous render") — a blank screen on the ordinary cold-load → data path. `feed.restaurants` is
  // already resolved here, so nothing is lost by computing them early.
  const all = feed.restaurants ?? [];
  const visible = useMemo(
    () => applyFoodListView(all, now, location.point, { openOnly, cheapFee, sort }),
    [all, now, location.point, openOnly, cheapFee, sort],
  );
  // "5 places deliver to Belgravia · 25–45 min" — the mock's results summary, over what is ACTUALLY
  // on screen (post-filter), so the count never contradicts the rows beneath it.
  const summary = useMemo(
    () => deliverySummary(visible.length, location.area, etaRange(visible.map((r) => restaurantMeta(r, location.point)))),
    [visible, location.area, location.point],
  );
  // Nearest and Under $2 fee are both functions of distance, so neither can answer without a fix.
  // They render drawn-but-disabled rather than silently no-opping; the deliver-to row directly above
  // is the fix, and the a11y hint says so.
  const canRank = location.point != null;
  // RC.list draws the street QUALIFIED BY ITS SUBURB ("12 Lanark Rd, Belgravia") — this screen picks
  // the corridor to browse, so the area is load-bearing here in a way it isn't on the home header.
  const deliverTo = deliverToLabel(location.label, location.area);

  // Reachable only from a live server `false` (the kill switch actually pulled) — NOT a boot state.
  // `useFeatureFlags` defaults `restaurantsEnabled` true because the vertical is launched, so this
  // screen never renders as a cold-start frame ahead of the flags fetch (MOB-BOOT-02).
  if (!restaurantsEnabled) {
    return (
      <Screen>
        <AppBar onBack={() => router.back()} />
        <EmptyState icon="utensils" title="Restaurants isn't available yet" message="Check back soon." />
      </Screen>
    );
  }

  // R1·2 list_loading — cold load: fetching with NO data yet (not even a stale copy). The mock draws a
  // full-screen content skeleton (its own Screen), so replace the whole screen — matching RC.list_loading
  // by construction (structural-snapshot guardrail). This is composition, not a rewrite: the state LOGIC
  // (when loading shows) is unchanged; only its look moves to the generated view. Once any data (stale or
  // fresh) exists the header + list render below exactly as before.
  if (feed.isFetching && !(feed.restaurants && feed.restaurants.length > 0)) {
    return <FoodListLoadingView />;
  }

  // R1·4 list_error — cold offline/fetch failure: the fetch settled in error with NO data to show (not
  // even a stale copy). The mock draws a full-screen offline state (`<Screen banner={<Banner offline/>}>`
  // → AppBar → Card → EmptyState with a Try-again), so replace the whole screen — matching RC.list_error
  // by construction (structural-snapshot guardrail). Composition, not a rewrite: the retry is still
  // feed.refetch and the state LOGIC is unchanged; only its look moves to the generated view. A stale
  // copy (showingStale) keeps the list + inline retry below instead — that is a different, honest state.
  if (feed.isError && !(feed.restaurants && feed.restaurants.length > 0)) {
    return <FoodListErrorView onBack={() => router.back()} onRetry={feed.refetch} loading={feed.isFetching} />;
  }

  return (
    <Screen>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <Tappable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back" style={{ padding: 4 }}>
          <View style={{ transform: [{ rotate: "180deg" }] }}>
            <Icon name="chevron-right" size={20} color={tokens.color.ink} />
          </View>
        </Tappable>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontSize: 12, fontWeight: "700", color: tokens.color.muted, letterSpacing: 0.4 }}>FOOD · DELIVER TO</Text>
          {/* The mock draws the address with a chevron-down beside it (r-customer-a.jsx:98) — a
              picker, which the app never rendered. Tapping opens the SAME sheet the home's address
              row opens, and a pick there persists to the shared slot, so the two screens can never
              disagree about where the customer is. */}
          <Tappable
            onPress={() => setLocationOpen(true)}
            accessibilityRole="button"
            accessibilityLabel={`Deliver to ${deliverTo}. Change location`}
            style={{ flexDirection: "row", alignItems: "center", gap: 4 }}
          >
            <Text style={{ flexShrink: 1, fontSize: 15, fontWeight: "700", color: tokens.color.ink }} numberOfLines={1}>
              {deliverTo}
            </Text>
            <Icon name="chevron-down" size={15} color={tokens.color.muted} />
          </Tappable>
        </View>
        <Tappable
          onPress={() => router.push("/food/search")}
          accessibilityRole="button"
          accessibilityLabel="Search restaurants"
          style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: tokens.color.surface, alignItems: "center", justifyContent: "center" }}
        >
          <Icon name="search" size={18} color={tokens.color.ink} />
        </Tappable>
      </View>

      {/* All four drawn pills (RC.list). The mock lays them out in one clipped row at 360px; a phone
          has to be able to REACH the fourth, so the drawn row scrolls horizontally rather than
          cutting "Top rated" off — the live behaviour derived inside the mock's structure. */}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ flexDirection: "row", gap: 6, paddingRight: 16 }}
        style={{ flexGrow: 0, marginBottom: 4 }}
      >
        <FilterPill label="Open now" a11yLabel="Open now filter" selected={openOnly} onPress={() => setOpenOnly((v) => !v)} />
        <FilterPill
          label="Nearest"
          a11yLabel="Sort by nearest"
          selected={sort === "nearest"}
          disabled={!canRank}
          hint="Set your location to sort by distance"
          onPress={() => setSort((v) => (v === "nearest" ? null : "nearest"))}
        />
        <FilterPill
          label="Under $2 fee"
          a11yLabel="Under $2 delivery fee filter"
          selected={cheapFee}
          disabled={!canRank}
          hint="Set your location to estimate delivery fees"
          onPress={() => setCheapFee((v) => !v)}
        />
        <FilterPill
          label="Top rated"
          a11yLabel="Sort by top rated"
          selected={sort === "top_rated"}
          onPress={() => setSort((v) => (v === "top_rated" ? null : "top_rated"))}
        />
      </ScrollView>

      {visible.length > 0 ? (
        <Text style={{ fontSize: 12.5, color: tokens.color.muted, marginTop: 6, marginBottom: 8 }}>{summary}</Text>
      ) : null}

      {feed.showingStale ? (
        <View style={{ marginBottom: tokens.space.sm }}>
          <Text style={{ fontSize: tokens.font.size.body, color: tokens.color.muted }}>
            Showing what we had{feed.staleSavedAt ? ` at ${new Date(feed.staleSavedAt).toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" })}` : ""}.
          </Text>
          {feed.isError ? <Button label="Retry" variant="ghost" onPress={feed.refetch} loading={feed.isFetching} /> : null}
        </View>
      ) : null}

      {feed.restaurants && feed.restaurants.length > 0 ? (
        visible.length > 0 ? (
          // B-T3: was ScrollView + .map over the whole list — GET /restaurants has no server-side cap
          // (unlike history/board/notifications, all server-capped at 30-50), so this is the one list in
          // the app whose backing collection grows unbounded with merchant onboarding. FlatList windows
          // the concurrently-mounted/decoded RestaurantRow images to what's on-screen regardless of catalog
          // size, bounding the memory cost independent of the still-uncapped query.
          // B-O10: the query itself is now cursor-paginated too — scrolling near the end requests the
          // next page instead of the old single unbounded fetch.
          <FlatList
            data={visible}
            keyExtractor={(r) => r.id}
            renderItem={({ item }: { item: RestaurantListItem }) => (
              <RestaurantRow r={item} now={now} onPress={() => router.push(`/food/${item.id}`)} />
            )}
            showsVerticalScrollIndicator={false}
            onEndReached={() => {
              if (feed.hasMore && !feed.isLoadingMore) feed.loadMore();
            }}
            onEndReachedThreshold={0.5}
            ListFooterComponent={
              feed.isLoadingMore ? (
                <View style={{ paddingVertical: tokens.space.md }}>
                  <ActivityIndicator color={tokens.color.accent} />
                </View>
              ) : (
                <View style={{ height: tokens.space.xxl }} />
              )
            }
          />
        ) : (
          // Kit R1·3 `list_empty` (r-customer-a.jsx:130): the empty state sits inside a Card (the
          // owner-decided empty-state wrapper), not bare on the page.
          //
          // Which emptiness this is matters: with four pills, "no kitchens are OPEN" is only true when
          // Open-now is the sole reason nothing showed. Otherwise the list is empty because of the
          // filters the customer set, and the way out is to clear THOSE — telling them to show closed
          // kitchens would be a dead end that doesn't refill the list.
          <Card style={{ paddingTop: 10, paddingRight: 16, paddingBottom: 18, paddingLeft: 16, marginTop: 40 }}>
            {openOnly && !cheapFee && sort === null ? (
              <EmptyState icon="utensils" title="No kitchens are open right now" message="Try again later, or see everything including closed kitchens.">
                <Button label="Show closed kitchens too" onPress={() => setOpenOnly(false)} />
              </EmptyState>
            ) : (
              <EmptyState icon="utensils" title="Nothing matches those filters" message="Try widening them to see more kitchens.">
                <Button
                  label="Clear filters"
                  onPress={() => {
                    setOpenOnly(false);
                    setCheapFee(false);
                    setSort(null);
                  }}
                />
              </EmptyState>
            )}
          </Card>
        )
      ) : (
        // No restaurants to show and it isn't an error (the cold error state is the full-screen
        // FoodListErrorView early-return above) — a successful-but-empty corridor, or the rare settled
        // idle state. Either way there is genuinely nothing here yet.
        <EmptyState icon="utensils" title="No restaurants deliver here yet" message="We're onboarding kitchens in your area — check back soon." />
      )}

      <LocationSheet
        visible={locationOpen}
        denied={location.denied}
        onClose={() => setLocationOpen(false)}
        onUseCurrentLocation={location.useCurrentLocation}
        onPick={location.setManualPlace}
      />
    </Screen>
  );
}

/**
 * One drawn pill from the RC.list header row. Four instances, one shape — the mock draws them
 * identically and distinguishes them only by label and selected state, so they are one component
 * rather than four copies of the same style block.
 *
 * `disabled` is for a pill whose ANSWER doesn't exist yet (distance, with no customer fix). It dims
 * rather than disappearing: the mock draws four pills, so four pills render ("not drawn ⇒ not
 * rendered" cuts the other way too — drawn means drawn), and the hint tells a screen-reader user the
 * one thing that makes it work.
 */
function FilterPill({
  label,
  a11yLabel,
  selected,
  onPress,
  disabled = false,
  hint,
}: {
  label: string;
  a11yLabel: string;
  selected: boolean;
  onPress: () => void;
  disabled?: boolean;
  hint?: string;
}): React.ReactElement {
  return (
    <Tappable
      onPress={onPress}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled }}
      accessibilityLabel={a11yLabel}
      accessibilityHint={disabled ? hint : undefined}
      style={{
        paddingHorizontal: 12,
        paddingVertical: 8,
        borderRadius: tokens.radius.pill,
        borderWidth: 1,
        borderColor: selected ? tokens.color.accent : tokens.color.line,
        backgroundColor: selected ? tokens.color.accentWash : tokens.color.bg,
        opacity: disabled ? 0.45 : 1,
      }}
    >
      <Text style={{ fontSize: 12.5, fontWeight: "700", color: selected ? tokens.color.accentText : tokens.color.muted }}>{label}</Text>
    </Tappable>
  );
}
