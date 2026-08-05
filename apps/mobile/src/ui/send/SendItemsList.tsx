import { tokens } from "@lynia/shared";
import React from "react";
import { Pressable, Text, View } from "react-native";
import type { ItemRow } from "../../logic/order-draft";
import { MAX_ITEMS } from "../../logic/order-draft";
import { Button, Field, Icon, Label } from "../index";
import { QtyStepper } from "../home/QtyStepper";

/**
 * RF-21: the "Items list" section of app/send.tsx, extracted verbatim (see
 * docs/RF-21-SEND-SCREEN.md). Repeatable description + quantity rows (item-model decision,
 * packages/design/HANDOFF.md: multiple {description, quantity}, nothing more for the pilot).
 */
export function SendItemsList({
  items,
  updateItem,
  addItem,
  removeItem,
}: {
  items: ItemRow[];
  updateItem: (i: number, patch: Partial<ItemRow>) => void;
  addItem: () => void;
  removeItem: (i: number) => void;
}): React.ReactElement {
  return (
    <>
      {/* Line items — repeatable description + quantity rows (item-model decision, packages/design/HANDOFF.md: multiple
          {description, quantity}, nothing more for the pilot). Description stacks above the
          qty stepper so a row still works at 320px. */}
      <Label>What are you sending?</Label>
      {items.map((it, i) => (
        // Kit (screens.jsx:177): description + qty sit inside one bordered box, so a multi-item order
        // reads as discrete parcels rather than a run of loose fields.
        <View
          key={i}
          style={{
            borderWidth: 1,
            borderColor: tokens.color.line,
            borderRadius: tokens.radius.input,
            paddingHorizontal: 10,
            paddingTop: 10,
            paddingBottom: tokens.space.xs,
            marginBottom: tokens.space.sm,
          }}
        >
          <Field
            value={it.description}
            onChangeText={(t) => updateItem(i, { description: t })}
            placeholder={i === 0 ? "Documents" : "Another item"}
            maxLength={140}
          />
          <View style={{ flexDirection: "row", alignItems: "center", marginTop: -tokens.space.sm, marginBottom: tokens.space.sm }}>
            {/* Kit label is "Qty" (screens.jsx:180). */}
            <Text style={{ fontSize: 12, fontWeight: "600", color: tokens.color.muted, marginRight: tokens.space.sm }}>Qty</Text>
            <QtyStepper value={it.quantity} onChange={(q) => updateItem(i, { quantity: q })} />
            <View style={{ flex: 1 }} />
            {items.length > 1 ? (
              <Pressable
                onPress={() => removeItem(i)}
                accessibilityRole="button"
                accessibilityLabel={`Remove item ${i + 1}`}
                style={({ pressed }) => ({
                  minHeight: tokens.touchTargetMin,
                  flexDirection: "row",
                  alignItems: "center",
                  gap: tokens.space.xs,
                  paddingHorizontal: tokens.space.xs,
                  opacity: pressed ? 0.6 : 1,
                })}
              >
                <Icon name="x" size={16} color={tokens.color.muted} />
                {/* Icons are always paired with a text label (low-literacy market). */}
                <Text style={{ fontSize: 12, fontWeight: "600", color: tokens.color.muted }}>Remove</Text>
              </Pressable>
            ) : null}
          </View>
        </View>
      ))}
      {items.length < MAX_ITEMS ? (
        <Button label="Add another item" variant="ghost" onPress={addItem} />
      ) : (
        // The control never just vanishes — say why it's gone (every dead-end explains itself).
        <Text style={{ fontSize: 12, color: tokens.color.muted, marginBottom: tokens.space.sm }}>Up to 10 items per order.</Text>
      )}
    </>
  );
}
