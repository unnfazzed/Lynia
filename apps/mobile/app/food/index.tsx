import type { RestaurantListItem } from "@lynia/shared";
import { tokens } from "@lynia/shared";
import { isMerchantOpenNow } from "@lynia/shared";
import { useRouter } from "expo-router";
import React, { useEffect, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, Text, View } from "react-native";
import { useNow } from "../../src/logic/use-now";
import { useFeatureFlags } from "../../src/net/use-feature-flags";
import { useRestaurantListFeed } from "../../src/query/use-restaurants";
import { AppBar, Button, Card, EmptyState, Icon, Screen } from "../../src/ui";
import { RestaurantRow } from "../../src/ui/food/RestaurantRow";
import { FoodListErrorView } from "./food-list.error.view";
import { FoodListLoadingView } from "./food-list.loading.view";

/** R1·1..R1·5 restaurant list — five states (default / loading / empty / error / offline). */
export default function RestaurantListScreen(): React.ReactElement {
  const router = useRouter();
  const { restaurantsEnabled } = useFeatureFlags();
  const feed = useRestaurantListFeed(restaurantsEnabled);
  const [openOnly, setOpenOnly] = useState(false);
  // LC-B06: was `useMemo(() => new Date(), [feed.restaurants])` — useRestaurantListFeed's default
  // structural sharing keeps the same `restaurants` reference across a no-change refetch, so `now`
  // stayed pinned at first render for practical purposes; a stale-open restaurant kept passing the
  // "Open now" filter after it actually closed.
  const now = useNow();

  // B-O10: the "Open now" filter runs over whatever pages have loaded so far — with pagination
  // in place, that's no longer necessarily the whole catalog. Auto-drain the rest while the filter
  // is on so it never silently under-reports (mirrors search.tsx's identical need below).
  useEffect(() => {
    if (openOnly && feed.hasMore && !feed.isLoadingMore) feed.loadMore();
  }, [openOnly, feed.hasMore, feed.isLoadingMore, feed.loadMore]);

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

  const all = feed.restaurants ?? [];
  const visible = openOnly ? all.filter((r) => isMerchantOpenNow(r.hours, now)) : all;

  return (
    <Screen>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <Pressable onPress={() => router.back()} accessibilityRole="button" accessibilityLabel="Back" style={{ padding: 4 }}>
          <View style={{ transform: [{ rotate: "180deg" }] }}>
            <Icon name="chevron-right" size={20} color={tokens.color.ink} />
          </View>
        </Pressable>
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 12, fontWeight: "700", color: tokens.color.muted, letterSpacing: 0.4 }}>FOOD · DELIVER TO</Text>
          <Text style={{ fontSize: 15, fontWeight: "700", color: tokens.color.ink }} numberOfLines={1}>
            Harare
          </Text>
        </View>
        <Pressable
          onPress={() => router.push("/food/search")}
          accessibilityRole="button"
          accessibilityLabel="Search restaurants"
          style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: tokens.color.surface, alignItems: "center", justifyContent: "center" }}
        >
          <Icon name="search" size={18} color={tokens.color.ink} />
        </Pressable>
      </View>

      <Pressable
        onPress={() => setOpenOnly((v) => !v)}
        accessibilityRole="button"
        accessibilityState={{ selected: openOnly }}
        accessibilityLabel="Open now filter"
        style={{
          alignSelf: "flex-start",
          paddingHorizontal: 12,
          paddingVertical: 8,
          borderRadius: 999,
          borderWidth: 1,
          borderColor: openOnly ? tokens.color.accent : tokens.color.line,
          backgroundColor: openOnly ? tokens.color.accentWash : tokens.color.bg,
          marginBottom: 10,
        }}
      >
        <Text style={{ fontSize: 12.5, fontWeight: "700", color: openOnly ? tokens.color.accentText : tokens.color.muted }}>Open now</Text>
      </Pressable>

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
          <Card style={{ paddingTop: 10, paddingRight: 16, paddingBottom: 18, paddingLeft: 16, marginTop: 40 }}>
            <EmptyState icon="utensils" title="No kitchens are open right now" message="Try again later, or see everything including closed kitchens.">
              <Button label="Show closed kitchens too" onPress={() => setOpenOnly(false)} />
            </EmptyState>
          </Card>
        )
      ) : (
        // No restaurants to show and it isn't an error (the cold error state is the full-screen
        // FoodListErrorView early-return above) — a successful-but-empty corridor, or the rare settled
        // idle state. Either way there is genuinely nothing here yet.
        <EmptyState icon="utensils" title="No restaurants deliver here yet" message="We're onboarding kitchens in your area — check back soon." />
      )}
    </Screen>
  );
}
