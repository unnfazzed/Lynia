import { tokens } from "@lynia/shared/tokens";
import React from "react";
import { Pressable, Text, View } from "react-native";
import { MAX_QTY } from "../../logic/order-draft";

/** Compact − / count / + quantity stepper. 44px round targets (touchTargetMin) so it's tappable on
 *  a cheap phone; the count renders in tabular numerals so rows don't shimmy as digits change. */
export function QtyStepper({
  value,
  onChange,
  max = MAX_QTY,
}: {
  value: number;
  onChange: (n: number) => void;
  /** Ceiling for the + button — defaults to the Send composer's MAX_QTY; food dishes pass their own
   *  (server) cap so the stepper can never climb above what checkout would accept. */
  max?: number;
}): React.ReactElement {
  const btn = (glyph: "−" | "+", next: number, disabled: boolean, label: string): React.ReactElement => (
    <Pressable
      onPress={() => onChange(next)}
      disabled={disabled}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => ({
        width: tokens.touchTargetMin,
        height: tokens.touchTargetMin,
        borderRadius: tokens.touchTargetMin / 2,
        borderWidth: 1,
        borderColor: tokens.color.line,
        backgroundColor: pressed ? tokens.color.accentWash : tokens.color.bg,
        alignItems: "center",
        justifyContent: "center",
        opacity: disabled ? 0.4 : 1,
      })}
    >
      <Text style={{ fontSize: 20, fontWeight: "700", lineHeight: 22, color: tokens.color.accentText }}>{glyph}</Text>
    </Pressable>
  );
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: tokens.space.sm }}>
      {btn("−", Math.max(1, value - 1), value <= 1, "Decrease quantity")}
      <Text style={{ minWidth: 26, textAlign: "center", fontSize: 16, fontWeight: "700", color: tokens.color.ink, fontVariant: ["tabular-nums"] }}>
        {value}
      </Text>
      {btn("+", Math.min(max, value + 1), value >= max, "Increase quantity")}
    </View>
  );
}
