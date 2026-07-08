import { tokens } from "@lynia/shared";
import React from "react";
import { Pressable, Text, View } from "react-native";
import { Button, Card, Icon, Sub } from "../index";

/* Pickup item verification — between "arrived at pickup" and "collected", the rider ticks the
   sender's items against what's physically in hand. The collect CTA counts them and confirms
   (extracted verbatim from app/rider/job.tsx). */
export function PickupChecklist({
  items,
  checkedItems,
  collectedCount,
  pending,
  onToggle,
  onConfirm,
}: {
  items: { description: string; quantity: number }[];
  checkedItems: ReadonlySet<number>;
  collectedCount: number;
  pending: boolean;
  onToggle: (index: number) => void;
  onConfirm: () => void;
}): React.ReactElement {
  return (
    <Card style={{ borderColor: tokens.color.accent }}>
      <Text style={{ fontSize: tokens.font.size.bodyLg, fontWeight: tokens.font.weight.bold, color: tokens.color.ink, marginBottom: 2 }}>Confirm pickup</Text>
      <Sub>Tick each item against the sender&apos;s list before you ride off.</Sub>
      <View style={{ gap: tokens.space.sm }}>
        {items.map((it, i) => {
          const on = checkedItems.has(i);
          return (
            <Pressable
              key={i}
              testID={`pickup-item-${i}`}
              onPress={() => onToggle(i)}
              accessibilityRole="checkbox"
              accessibilityState={{ checked: on }}
              accessibilityLabel={`${it.quantity} ${it.description}`}
              style={{
                flexDirection: "row",
                alignItems: "center",
                gap: tokens.space.md,
                minHeight: tokens.touchTargetMin,
                paddingHorizontal: tokens.space.md,
                paddingVertical: tokens.space.sm,
                borderRadius: tokens.radius.input,
                backgroundColor: on ? tokens.color.accentWash : tokens.color.surface,
                borderWidth: 1,
                borderColor: on ? "transparent" : tokens.color.line,
              }}
            >
              <View
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 7,
                  // Bright accent as a non-text fill (the tick box); white check glyph on it.
                  backgroundColor: on ? tokens.color.accent : tokens.color.bg,
                  borderWidth: on ? 0 : 1.5,
                  borderColor: tokens.color.line,
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                {on ? <Icon name="check" size={15} color={tokens.color.onAccent} /> : null}
              </View>
              <Text style={{ flex: 1, fontSize: tokens.font.size.body, fontWeight: tokens.font.weight.semibold, color: tokens.color.ink }}>{it.description}</Text>
              <Text style={{ fontSize: tokens.font.size.body, fontWeight: tokens.font.weight.bold, color: tokens.color.muted, fontVariant: ["tabular-nums"] }}>{it.quantity}×</Text>
            </Pressable>
          );
        })}
      </View>
      <View style={{ flexDirection: "row", gap: tokens.space.sm, padding: tokens.space.sm, borderRadius: tokens.radius.input, backgroundColor: tokens.color.surface, marginTop: tokens.space.sm }}>
        <Icon name="triangle-alert" size={15} color={tokens.color.muted} />
        <Text style={{ flex: 1, fontSize: tokens.font.size.caption, color: tokens.color.muted, lineHeight: 18 }}>
          Only confirm what you actually have. The recipient still verifies delivery with the 6-digit code.
        </Text>
      </View>
      <Button
        testID="confirm-pickup"
        label={`Confirm ${collectedCount} item${collectedCount === 1 ? "" : "s"} collected`}
        onPress={onConfirm}
        loading={pending}
        disabled={checkedItems.size === 0}
      />
    </Card>
  );
}
