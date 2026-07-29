import { tokens } from "@lynia/shared";
import { isMerchantOpenNow } from "@lynia/shared";
import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { useFeatureFlags } from "../../src/net/use-feature-flags";
import { useRestaurantListFeed } from "../../src/query/use-restaurants";
import { Button, EmptyState, Icon, Screen, SkeletonList } from "../../src/ui";
import { RestaurantRow } from "../../src/ui/food/RestaurantRow";

/** R1·1..R1·5 restaurant list — five states (default / loading / empty / error / offline). */
export default function RestaurantListScreen(): React.ReactElement {
  const router = useRouter();
  const { restaurantsEnabled } = useFeatureFlags();
  const feed = useRestaurantListFeed(restaurantsEnabled);
  const [openOnly, setOpenOnly] = useState(false);
  const now = useMemo(() => new Date(), [feed.restaurants]);

  if (!restaurantsEnabled) {
    return (
      <Screen>
        <EmptyState icon="utensils" title="Restaurants isn't available yet" message="Check back soon.">
          <Button label="Back" variant="ghost" onPress={() => router.back()} />
        </EmptyState>
      </Screen>
    );
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
          <ScrollView showsVerticalScrollIndicator={false}>
            {visible.map((r) => (
              <RestaurantRow key={r.id} r={r} now={now} onPress={() => router.push(`/food/${r.id}`)} />
            ))}
            <View style={{ height: tokens.space.xxl }} />
          </ScrollView>
        ) : (
          <EmptyState icon="utensils" title="No kitchens are open right now" message="Try again later, or see everything including closed kitchens.">
            <Button label="Show closed kitchens too" onPress={() => setOpenOnly(false)} />
          </EmptyState>
        )
      ) : feed.isFetching ? (
        <SkeletonList />
      ) : feed.hasLiveData ? (
        <EmptyState icon="utensils" title="No restaurants deliver here yet" message="We're onboarding kitchens in your area — check back soon." />
      ) : (
        <EmptyState icon="wifi-off" title="Couldn't load restaurants" message="Check your connection and try again.">
          <Button label="Retry" onPress={feed.refetch} loading={feed.isFetching} />
        </EmptyState>
      )}
    </Screen>
  );
}
