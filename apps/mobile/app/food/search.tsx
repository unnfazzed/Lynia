import { tokens } from "@lynia/shared";
import { useRouter } from "expo-router";
import React, { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { useFeatureFlags } from "../../src/net/use-feature-flags";
import { useRestaurantListFeed } from "../../src/query/use-restaurants";
import { EmptyState, Icon, Screen } from "../../src/ui";
import { RestaurantRow } from "../../src/ui/food/RestaurantRow";

/** R1·5 search — restaurant name + cuisine tags only (client-side, over the already-fetched list).
 *  Dish-level search (the gallery's "DISHES" section) needs a cross-restaurant menu index that
 *  doesn't exist in the C1 customer read API yet — an open item for a future Lane C increment,
 *  not silently faked here. */
export default function RestaurantSearchScreen(): React.ReactElement {
  const router = useRouter();
  const { restaurantsEnabled } = useFeatureFlags();
  const feed = useRestaurantListFeed(restaurantsEnabled);
  const [query, setQuery] = useState("");
  const now = useMemo(() => new Date(), []);

  const trimmed = query.trim().toLowerCase();
  const results = trimmed
    ? (feed.restaurants ?? []).filter(
        (r) => r.name.toLowerCase().includes(trimmed) || r.cuisineTags.some((t) => t.toLowerCase().includes(trimmed)),
      )
    : [];

  return (
    <Screen>
      <View
        style={{
          flexDirection: "row",
          alignItems: "center",
          gap: 9,
          borderWidth: 1.5,
          borderColor: tokens.color.accent,
          borderRadius: tokens.radius.input,
          padding: 12,
          marginBottom: 14,
        }}
      >
        <Icon name="search" size={17} color={tokens.color.muted} />
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search restaurants or cuisine"
          placeholderTextColor={tokens.color.muted}
          autoFocus
          style={{ flex: 1, fontSize: 14.5, color: tokens.color.ink }}
        />
        {query ? (
          <Pressable onPress={() => setQuery("")} accessibilityRole="button" accessibilityLabel="Clear search">
            <Icon name="x" size={16} color={tokens.color.muted} />
          </Pressable>
        ) : null}
      </View>

      {!trimmed ? (
        <Text style={{ fontSize: 13, color: tokens.color.muted, textAlign: "center", marginTop: 20 }}>
          Search by restaurant name or cuisine, like &quot;sadza&quot; or &quot;braai&quot;.
        </Text>
      ) : results.length > 0 ? (
        <ScrollView showsVerticalScrollIndicator={false}>
          {results.map((r) => (
            <RestaurantRow key={r.id} r={r} now={now} onPress={() => router.push(`/food/${r.id}`)} />
          ))}
        </ScrollView>
      ) : (
        <EmptyState icon="search" title="No matches" message={`Nothing found for "${query.trim()}".`} />
      )}
    </Screen>
  );
}
