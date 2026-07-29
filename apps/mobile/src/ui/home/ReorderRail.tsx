import { tokens } from "@lynia/shared";
import React from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { avatarTint } from "../../logic/avatar";
import type { ReorderRailItem } from "../../logic/home-feed";

/**
 * Home "Send again" rail (plan §5 A2, ported from
 * `packages/design/components/home/ReorderRail.jsx`) — accent-ringed circles, one tap back to a
 * prefilled compose form. Parcels carry no photo, so every circle renders the tinted-initial
 * fallback (the same monogram-first convention `FoodThumb` established for D1, reused here as a
 * per-name colour instead of the mockup's flat wash so a shelf of text-only circles isn't
 * monotone). Renders nothing when there's no history to reorder from.
 */
export function ReorderRail({
  items,
  title = "Send again",
  size = 58,
  onItem,
}: {
  items: ReorderRailItem[];
  title?: string;
  size?: number;
  onItem: (item: ReorderRailItem) => void;
}): React.ReactElement | null {
  if (items.length === 0) return null;
  const circleSize = size + 4;
  return (
    <View>
      {title ? (
        <Text
          style={{
            fontSize: 16,
            fontWeight: "700",
            color: tokens.color.ink,
            paddingHorizontal: tokens.space.screen,
            paddingTop: tokens.space.sm,
            paddingBottom: 6,
          }}
        >
          {title}
        </Text>
      ) : null}
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ gap: 12, paddingHorizontal: tokens.space.screen }}
      >
        {items.map((it) => (
          <Pressable
            key={it.id}
            onPress={() => onItem(it)}
            accessibilityRole="button"
            accessibilityLabel={`Send again — ${it.name}, ${it.price}`}
            style={{ width: size + 28, alignItems: "center", gap: 5 }}
          >
            <View style={{ padding: 2, borderRadius: circleSize / 2, borderWidth: 2, borderColor: tokens.color.accent }}>
              <View
                style={{
                  width: size,
                  height: size,
                  borderRadius: size / 2,
                  backgroundColor: avatarTint(it.name),
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <Text style={{ fontSize: Math.round(size * 0.4), fontWeight: "800", color: tokens.color.ink }}>
                  {(it.name[0] ?? "•").toUpperCase()}
                </Text>
              </View>
            </View>
            <View style={{ alignItems: "center" }}>
              <Text numberOfLines={1} style={{ fontSize: 12, fontWeight: "600", color: tokens.color.ink, maxWidth: size + 24 }}>
                {it.name}
              </Text>
              <Text style={{ fontSize: 11.5, fontWeight: "700", color: tokens.color.accentText, fontVariant: ["tabular-nums"] }}>
                {it.price}
              </Text>
            </View>
          </Pressable>
        ))}
      </ScrollView>
    </View>
  );
}
