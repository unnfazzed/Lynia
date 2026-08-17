import { tokens } from "@lynia/shared/tokens";
import React from "react";
import { Pressable, Text, View } from "react-native";
import { Icon, type IconName } from "../Icon";

/**
 * Home 8c live-order tracker — one mint PILL per running job (`packages/design/handoff/home-8c`
 * §3), replacing the pre-8c white card with a green border, a 42px mint icon tile, a bold title, a
 * muted meta line and a trailing chevron.
 *
 * What changed and why it matters: the pill carries ONE line of text plus a progress strip and a
 * gold ETA chip. The pre-8c card's second (meta) line — "Cash at the door · $15.50" / "Delivery
 * code 4192 · $3.36" — is not drawn in 8c, so it is not rendered ("not drawn ⇒ not rendered"); the
 * tracker screen the pill opens is where the payment and the code live. The whole pill is the tap
 * target, exactly as the mock says.
 *
 * Zero shadow / zero elevation (the screen's hard rule), and the unlit progress segments are
 * `tileSendBlob`, not `line` — a `line`-grey bar disappears on the mint wash.
 */
export function LiveOrderCard({
  title,
  step,
  steps = 7,
  etaMinutes,
  icon = "bike",
  onPress,
}: {
  /** The whole drawn line, e.g. "Tendai M. · on the way" — built by `logic/home-feed.ts`. */
  title: string;
  /** 0-based tracker index; segments `0..step` render lit. A negative value (pre-assignment) lights
   *  none rather than clamping to the first. */
  step: number;
  steps?: number;
  /** Minutes for the gold ETA chip. Null/undefined hides the chip — an estimate we do not have is
   *  never invented (there is no rider fix yet, or the leg cannot be estimated). */
  etaMinutes?: number | null;
  icon?: IconName;
  onPress?: () => void;
}): React.ReactElement {
  return (
    <Pressable
      onPress={onPress}
      disabled={!onPress}
      accessibilityRole={onPress ? "button" : undefined}
      accessibilityLabel={etaMinutes != null ? `${title}, ${etaMinutes} minutes` : title}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        marginTop: 14,
        marginHorizontal: 16,
        backgroundColor: tokens.color.accentWash,
        borderRadius: tokens.radius.pill,
        paddingLeft: 10,
        paddingRight: 14,
        paddingVertical: 9,
      }}
    >
      <View
        style={{
          width: 36,
          height: 36,
          borderRadius: 18,
          backgroundColor: tokens.color.accent,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Icon name={icon} size={17} color={tokens.color.onAccent} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ fontSize: 13, fontWeight: "700", color: tokens.color.ink }}>
          {title}
        </Text>
        <View
          accessible
          accessibilityLabel={`Step ${step + 1} of ${steps}`}
          style={{ flexDirection: "row", gap: 4, marginTop: 5 }}
        >
          {Array.from({ length: steps }, (_, i) => (
            <View
              key={i}
              style={{ flex: 1, height: 3, borderRadius: 2, backgroundColor: i <= step ? tokens.color.accent : tokens.color.tileSendBlob }}
            />
          ))}
        </View>
      </View>
      {etaMinutes != null ? (
        <View style={{ backgroundColor: tokens.color.highlight, borderRadius: tokens.radius.pill, paddingHorizontal: 9, paddingVertical: 4 }}>
          <Text style={{ fontSize: 11.5, fontWeight: "800", color: tokens.color.highlightChipInk, fontVariant: ["tabular-nums"] }}>
            {etaMinutes} min
          </Text>
        </View>
      ) : null}
    </Pressable>
  );
}
