import type { RestaurantMenuDish } from "@lynia/shared";
import { tokens } from "@lynia/shared";
import React, { useState } from "react";
import { Modal, Pressable, ScrollView, Text, View } from "react-native";
import { QtyStepper } from "../home/QtyStepper";
import { formatMoney } from "../../logic/money";
import { MAX_ITEM_QTY } from "../../logic/food-cart";
import { Button } from "../index";
import { BottomSheet } from "../BottomSheet";
import { FoodThumb } from "./FoodThumb";
import { NoteField } from "./NoteField";

/**
 * R2·3 item sheet. No portion/option picker — `MerchantDish` (C1) carries no variant schema, so
 * there's nothing to build a radio group over; flagged as an open item for a future menu-schema PR
 * rather than fabricated UI over data that doesn't exist.
 */
export function ItemSheet({
  dish,
  disabledReason,
  onAdd,
  onClose,
}: {
  dish: RestaurantMenuDish;
  /** Non-null blocks adding and explains why (kitchen closed) — the sheet still opens so the dish
   *  description is readable, per D-10's "browsable, never a dead end" spirit. */
  disabledReason?: string | null;
  onAdd: (quantity: number, note: string) => void;
  onClose: () => void;
}): React.ReactElement {
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState("");

  return (
    <Modal transparent animationType="fade" onRequestClose={onClose} visible>
      <Pressable
        accessibilityLabel="Close"
        accessibilityRole="button"
        onPress={onClose}
        style={{ flex: 1, backgroundColor: "rgba(20,24,27,0.45)", justifyContent: "flex-end" }}
      >
        <Pressable onPress={(e) => e.stopPropagation()}>
          <BottomSheet
            footer={
              disabledReason ? (
                <Text style={{ fontSize: 13, color: tokens.color.muted, textAlign: "center" }}>{disabledReason}</Text>
              ) : (
                <Button label={`Add · ${formatMoney(dish.priceUsd * qty)}`} onPress={() => onAdd(qty, note.trim())} />
              )
            }
          >
            <ScrollView showsVerticalScrollIndicator={false}>
              <View style={{ flexDirection: "row", gap: 12, marginBottom: 12 }}>
                <FoodThumb name={dish.name} photoUrl={dish.photoUrl} size={72} radius={14} />
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={{ fontSize: 17, fontWeight: "700", color: tokens.color.ink }}>{dish.name}</Text>
                  {dish.description ? (
                    <Text style={{ fontSize: 12.5, color: tokens.color.muted, marginTop: 3, lineHeight: 17 }}>{dish.description}</Text>
                  ) : null}
                  <Text style={{ fontSize: 15, fontWeight: "700", color: tokens.color.ink, marginTop: 6 }}>{formatMoney(dish.priceUsd)}</Text>
                </View>
              </View>
              <NoteField label="NOTE FOR THE KITCHEN" value={note} onChangeText={setNote} placeholder="No chilli, please" maxLength={200} />
              {!disabledReason ? (
                <View style={{ alignItems: "center", marginTop: 4 }}>
                  <QtyStepper value={qty} onChange={setQty} max={MAX_ITEM_QTY} />
                </View>
              ) : null}
            </ScrollView>
          </BottomSheet>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
