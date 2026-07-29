import { tokens } from "@lynia/shared";
import React from "react";
import { Pressable, Text, View } from "react-native";
import { Icon, type IconName } from "../Icon";

/**
 * Home LiveOrderCard (plan §5 A2, ported from `packages/design/components/home/LiveOrderCard.jsx`)
 * — the always-on-top home card while an order runs. Green-bordered card, mint icon tile, one bold
 * status line, a muted meta line, and a progress strip mirroring the tracker steps.
 */
export function LiveOrderCard({
  title,
  meta,
  step,
  steps = 7,
  icon = "bike",
  onPress,
}: {
  title: string;
  meta?: string;
  /** 0-based tracker index — segments `0..step` render accent-filled. A negative value (e.g. -1,
   *  pre-assignment) renders every segment unlit rather than clamping to the first one. */
  step: number;
  steps?: number;
  icon?: IconName;
  onPress?: () => void;
}): React.ReactElement {
  return (
    <Pressable onPress={onPress} disabled={!onPress} accessibilityRole={onPress ? "button" : undefined} accessibilityLabel={title}>
      {/* Mirrors `Card`'s styling inline rather than importing it from `../index` — that barrel
          re-exports this very component, and importing it back would be a circular dependency. */}
      <View
        style={{
          backgroundColor: tokens.color.bg,
          borderWidth: 1.5,
          borderColor: tokens.color.accent,
          borderRadius: tokens.radius.card,
          padding: 12,
          marginBottom: tokens.space.md,
          ...tokens.shadow.card,
        }}
      >
        <View style={{ flexDirection: "row", alignItems: "center", gap: 10 }}>
          <View
            style={{
              width: 42,
              height: 42,
              borderRadius: 21,
              backgroundColor: tokens.color.accentWash,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Icon name={icon} size={20} color={tokens.color.accentText} />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: "700", color: tokens.color.ink }}>
              {title}
            </Text>
            {meta ? (
              <Text numberOfLines={1} style={{ fontSize: 12.5, color: tokens.color.muted, fontVariant: ["tabular-nums"] }}>
                {meta}
              </Text>
            ) : null}
            <View accessible accessibilityLabel={`Step ${step + 1} of ${steps}`} style={{ flexDirection: "row", gap: 4, marginTop: 6 }}>
              {Array.from({ length: steps }, (_, i) => (
                <View
                  key={i}
                  style={{ flex: 1, height: 3, borderRadius: 2, backgroundColor: i <= step ? tokens.color.accent : tokens.color.line }}
                />
              ))}
            </View>
          </View>
          <Icon name="chevron-right" size={18} color={tokens.color.muted} />
        </View>
      </View>
    </Pressable>
  );
}
