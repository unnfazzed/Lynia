import { tokens } from "@lynia/shared/tokens";
import { Tappable } from "../Tappable";
import React, { useState } from "react";
import { Modal, ScrollView, Text, TextInput, View } from "react-native";
import { BottomSheet } from "../BottomSheet";
import { Button, Icon } from "../index";
import { QtyStepper } from "../home/QtyStepper";
import { NoteField } from "./NoteField";

/** Kit R3·2 (r-customer-a.jsx:604): the dish note's own counter is `N / 140`. The whole-order note
 *  keeps the cart screen's existing 300 (it carries directions for the whole ticket, not one dish). */
export const DISH_NOTE_MAX = 140;
export const ORDER_NOTE_MAX = 300;

/** Kit R3·2 (r-customer-a.jsx:607): the four quick phrases, in the kit's order. They APPEND to the
 *  note rather than replacing it — a tap is a shortcut for typing, never a mode. */
export const QUICK_PHRASES = ["Leg portion", "No chilli", "Extra gravy", "Pack separately"] as const;

/** True when `phrase` is already part of `note` (case-insensitive), so the chip can render the kit's
 *  ✓ state and a second tap can take it back out. Exported for the unit test. */
export function hasPhrase(note: string, phrase: string): boolean {
  return note.toLowerCase().includes(phrase.toLowerCase());
}

/**
 * Toggle a quick phrase in/out of a free-text note.
 *
 * Appending joins with ". " so the kitchen ticket reads as sentences ("Leg portion. No chilli.");
 * removing strips the phrase and tidies the separators it left behind. Never exceeds `max` — an
 * append that wouldn't fit is refused outright (returns the note unchanged) rather than truncating a
 * half-phrase onto the ticket. Pure, so it unit-tests without a renderer.
 */
export function toggleQuickPhrase(note: string, phrase: string, max: number = DISH_NOTE_MAX): string {
  if (hasPhrase(note, phrase)) {
    const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const stripped = note.replace(new RegExp(`\\s*${escaped}\\s*[.,]?`, "i"), " ");
    return stripped
      .replace(/\s{2,}/g, " ")
      // Tidy the separators the removed phrase left dangling at either end, so add-then-remove is a
      // clean round trip back to what the customer had typed.
      .replace(/^\s*[.,]\s*/, "")
      .replace(/\s*[.,]\s*$/, "")
      .trim();
  }
  const trimmed = note.trim();
  const next = trimmed === "" ? phrase : `${trimmed.replace(/[.,]\s*$/, "")}. ${phrase}`;
  return next.length > max ? note : next;
}

/**
 * R3·2 — the note bottom sheet, over the cart.
 *
 * Two levels, deliberately (the kit's own rationale): a note on a DISH travels with that line on the
 * kitchen's ticket, and one note for the WHOLE order sits at the bottom of it. Free text, because
 * Zimbabwean kitchens improvise and a fixed option list can't cover it.
 *
 * Pure UI over cart state that already exists (FoodCartLine.note / FoodCartState.orderNote — D-35).
 * There is NO API here: nothing is sent anywhere until checkout places the order, exactly as before.
 */
export function CartNoteSheet({
  dishName,
  dishNote = "",
  orderNote,
  quantity,
  maxQuantity,
  onSave,
  onClose,
}: {
  /** The line the sheet was opened on. Usually entered from a dish — both levels show, exactly as
   *  the kit draws them (r-customer-a.jsx:597-614). Omitted when opened from the cart's own "NOTE FOR
   *  THE WHOLE ORDER" row (that row has no dish to attach a per-dish note to): the sheet then shows
   *  only the whole-order section. */
  dishName?: string;
  dishNote?: string;
  orderNote: string;
  /** D-39: the kit's cart row (r-customer-a.jsx:319) draws quantity as a static badge — no inline
   *  stepper on that screen, because its own editing surface is the Item Sheet's bottom-bar stepper
   *  (r-customer-a.jsx:279-286). This sheet is that same editing surface reached from an already-added
   *  line, so it carries the stepper instead of the cart row. Present only when opened from a dish. */
  quantity?: number;
  maxQuantity?: number;
  onSave: (next: { dishNote: string; orderNote: string; quantity?: number }) => void;
  onClose: () => void;
}): React.ReactElement {
  const [note, setNote] = useState(dishNote);
  const [whole, setWhole] = useState(orderNote);
  const [qty, setQty] = useState(quantity ?? 1);
  const over = note.length > DISH_NOTE_MAX;
  // A note added from the item sheet can already be longer than the ticket limit (ItemSheet allows
  // 200). A plain `maxLength` would let the platform silently clip the tail off a note the customer
  // has already written — so the cap never bites BELOW what's already there: the counter turns red and
  // the customer decides what to cut. New typing is still held to DISH_NOTE_MAX.
  const inputMax = Math.max(DISH_NOTE_MAX, dishNote.length);

  return (
    <Modal transparent animationType="fade" onRequestClose={onClose} visible>
      <Tappable
        accessibilityLabel="Close"
        accessibilityRole="button"
        onPress={onClose}
        style={{ flex: 1, backgroundColor: "rgba(20,24,27,0.45)", justifyContent: "flex-end" }}
      >
        <Tappable onPress={(e) => e.stopPropagation()}>
          <BottomSheet
            // Kit R3·2 (r-customer-a.jsx:597): the sheet's top corners are 20px, a step softer than
            // the shared 16px card radius — same as the item sheet it sits alongside.
            style={{ borderTopLeftRadius: 20, borderTopRightRadius: 20 }}
            footer={
              quantity != null ? (
                <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
                  <QtyStepper value={qty} onChange={setQty} max={maxQuantity} />
                  <View style={{ flex: 1 }}>
                    <Button label="Save" onPress={() => onSave({ dishNote: note.trim(), orderNote: whole, quantity: qty })} />
                  </View>
                </View>
              ) : (
                <Button label="Save notes" onPress={() => onSave({ dishNote: note.trim(), orderNote: whole })} />
              )
            }
          >
            <ScrollView showsVerticalScrollIndicator={false}>
              {dishName != null ? (
                <>
                  <Text style={{ fontSize: 16.5, fontWeight: "700", color: tokens.color.ink }}>Note for the kitchen</Text>
                  <Text style={{ fontSize: 13, color: tokens.color.muted, marginTop: 4, lineHeight: 19 }}>
                    <Text style={{ color: tokens.color.ink, fontWeight: "700" }}>{dishName}</Text> — tell them how you want it. This sits
                    next to the dish on their ticket.
                  </Text>
                  {/* Kit R3·2 (r-customer-a.jsx:603): the dish note's box is the 1.5px ACCENT border — it's
                      the thing the sheet was opened for, so it carries the emphasis treatment. */}
                  <TextInput
                    value={note}
                    onChangeText={setNote}
                    placeholder="Leg portion please, not breast. No chilli."
                    placeholderTextColor={tokens.color.muted}
                    multiline
                    maxLength={inputMax}
                    accessibilityLabel={`Note for ${dishName}`}
                    style={{
                      marginTop: tokens.space.md,
                      borderWidth: 1.5,
                      borderColor: tokens.color.accent,
                      borderRadius: tokens.radius.input,
                      paddingHorizontal: tokens.space.md,
                      paddingVertical: 11,
                      minHeight: 76,
                      textAlignVertical: "top",
                      fontSize: 14.5,
                      lineHeight: 21,
                      color: tokens.color.ink,
                      backgroundColor: tokens.color.bg,
                    }}
                  />
                  {/* Kit R3·2 (r-customer-a.jsx:604): the counter is right-aligned, tabular, and muted until
                      the note runs past what the ticket will carry. */}
                  <Text
                    accessibilityLabel={`${note.length} of ${DISH_NOTE_MAX} characters used`}
                    style={{
                      alignSelf: "flex-end",
                      fontSize: 12,
                      marginTop: 4,
                      color: over ? tokens.color.danger : tokens.color.muted,
                      fontVariant: ["tabular-nums"],
                    }}
                  >
                    {note.length} / {DISH_NOTE_MAX}
                  </Text>
                  <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 7, marginTop: tokens.space.sm }}>
                    {QUICK_PHRASES.map((phrase) => {
                      const on = hasPhrase(note, phrase);
                      return (
                        <Tappable
                          key={phrase}
                          onPress={() => setNote((cur) => toggleQuickPhrase(cur, phrase))}
                          accessibilityRole="button"
                          accessibilityState={{ selected: on }}
                          accessibilityLabel={`${on ? "Remove" : "Add"} ${phrase}`}
                          style={{
                            minHeight: tokens.touchTargetMin,
                            justifyContent: "center",
                            paddingHorizontal: 13,
                            borderRadius: tokens.radius.pill,
                            borderWidth: 1,
                            borderColor: on ? tokens.color.accent : tokens.color.line,
                            backgroundColor: on ? tokens.color.accentWash : tokens.color.bg,
                          }}
                        >
                          <Text style={{ fontSize: 13, fontWeight: "700", color: on ? tokens.color.accentText : tokens.color.muted }}>
                            {on ? "✓ " : "+ "}
                            {phrase}
                          </Text>
                        </Tappable>
                      );
                    })}
                  </View>
                </>
              ) : (
                // Opened from the cart's own whole-order-note row (no dish in context) — this section
                // is the sheet's entire reason for being, so it carries the sheet's title instead of
                // sitting under a dish-specific one.
                <Text style={{ fontSize: 16.5, fontWeight: "700", color: tokens.color.ink }}>Note for the whole order</Text>
              )}

              <View style={{ marginTop: dishName != null ? tokens.space.lg : tokens.space.md }}>
                <NoteField
                  label="NOTE FOR THE WHOLE ORDER"
                  value={whole}
                  onChangeText={setWhole}
                  placeholder="Pack the sadza separately from the stew"
                  maxLength={ORDER_NOTE_MAX}
                />
              </View>

              {/* Kit R3·2 (r-customer-a.jsx:614): the price caveat is the sheet's last word before the
                  CTA — a note is an instruction, never a re-price. */}
              <View
                style={{
                  flexDirection: "row",
                  gap: 9,
                  padding: tokens.space.md,
                  backgroundColor: tokens.color.surface,
                  borderRadius: tokens.radius.input,
                }}
              >
                <Icon name="circle-alert" size={15} color={tokens.color.muted} style={{ marginTop: 1 }} />
                <Text style={{ flex: 1, fontSize: 12, color: tokens.color.muted, lineHeight: 17 }}>
                  A note can&apos;t change the price. If what you want costs more, the kitchen will call you before cooking.
                </Text>
              </View>
            </ScrollView>
          </BottomSheet>
        </Tappable>
      </Tappable>
    </Modal>
  );
}
