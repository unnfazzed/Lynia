import { tokens } from "@lynia/shared/tokens";
import React, { useState } from "react";
import { KeyboardAvoidingView, Modal, Platform, ScrollView, Text, TextInput, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { type BrowseService, type BrowseSort, BROWSE_SORTS, DISTANCE_SORTS } from "../../logic/browse";
import { MAX_ITEM_QTY } from "../../logic/food-cart";
import { formatMoney } from "../../logic/money";
import { Icon } from "../Icon";
import { RemoteImage } from "../RemoteImage";
import { Tappable } from "../Tappable";
import { B, fmt } from "./copy";
import { BrowseButton, GRAB, HAIRLINE, IconButton, RADIO_OFF, TABULAR } from "./kit";
import { QtyStepper, RemindRow, type StoreItem } from "./store";

/**
 * Browse v2 sheets (`packages/design/handoff/browse-v2` README §4: Sort sheet, Item sheet, New-cart
 * sheet; S9 the just-closed modal; ledger D-57). Sheets are radius 24 over the 45% ink dim.
 */

const DIM = "rgba(20,24,27,0.45)";

/** A bottom sheet over the dim: radius 24, grab handle, padding 8 16 20 (+ the safe-area inset). */
export function Sheet({ visible, onClose, children }: { visible: boolean; onClose: () => void; children: React.ReactNode }): React.ReactElement {
  const insets = useSafeAreaInsets();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose} statusBarTranslucent>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={{ flex: 1, justifyContent: "flex-end" }}>
        <Tappable accessibilityRole="button" accessibilityLabel={B.item.close} onPress={onClose} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, backgroundColor: DIM }} />
        <View style={{ backgroundColor: tokens.color.bg, borderTopLeftRadius: 24, borderTopRightRadius: 24, paddingTop: 8, paddingHorizontal: 16, paddingBottom: 20 + insets.bottom, maxHeight: "92%" }}>
          <View style={{ width: 36, height: 4, borderRadius: 2, backgroundColor: GRAB, alignSelf: "center", marginBottom: 12 }} />
          {children}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function SheetTitle({ children }: { children: string }): React.ReactElement {
  return (
    <Text accessibilityRole="header" style={{ fontSize: 20, lineHeight: 25, letterSpacing: -0.3, fontWeight: tokens.font.weight.bold, color: tokens.color.ink }}>
      {children}
    </Text>
  );
}

function Radio({ on, dim }: { on: boolean; dim?: boolean }): React.ReactElement {
  return <View style={{ width: 22, height: 22, borderRadius: 11, borderWidth: on ? 7 : 2, borderColor: on ? tokens.color.accent : RADIO_OFF, opacity: dim ? 0.4 : 1 }} />;
}

// ── Sort sheet (B5) ────────────────────────────────────────────────────────────────────────────

const SORT_LABEL: Record<BrowseSort, string> = {
  recommended: B.sort.opts[0],
  nearest: B.sort.opts[1],
  top_rated: B.sort.opts[3],
  lowest_fee: B.sort.opts[4],
};
export function sortLabel(s: BrowseSort): string {
  return SORT_LABEL[s];
}

/**
 * The dropdown's label. The mock draws "Cuisine" / "Shop type" as literals in its screen code
 * (`browse-screens.js` `sortSheet`), not in `B`, so they live here — the drawn words (D-57 §4).
 */
const CATEGORY_LABEL: Record<BrowseService, string> = { food: "Cuisine", shops: "Shop type", pharmacy: "Shop type" };

/**
 * B5 — "Sort by": the category dropdown on top, then one radio row per sort. Choosing a row applies it
 * and closes the sheet (no Apply). Distance sorts are muted without a location (B5b).
 */
export function SortSheet({
  visible,
  service,
  sort,
  category,
  categories,
  hasLocation,
  onSort,
  onCategory,
  onClose,
}: {
  visible: boolean;
  service: BrowseService;
  sort: BrowseSort;
  category: string | null;
  categories: string[];
  hasLocation: boolean;
  onSort: (s: BrowseSort) => void;
  onCategory: (c: string | null) => void;
  onClose: () => void;
}): React.ReactElement {
  const [picking, setPicking] = useState(false);
  const showCategory = service !== "pharmacy" && categories.length > 0;
  return (
    <Sheet
      visible={visible}
      onClose={() => {
        setPicking(false);
        onClose();
      }}
    >
      <SheetTitle>{B.sort.title}</SheetTitle>
      <ScrollView bounces={false} showsVerticalScrollIndicator={false}>
        {showCategory ? (
          <Tappable
            onPress={() => setPicking((p) => !p)}
            accessibilityRole="button"
            accessibilityState={{ expanded: picking }}
            accessibilityLabel={`${CATEGORY_LABEL[service]}: ${category ?? B.list.all}`}
            style={{ marginTop: 10, marginBottom: 4, minHeight: 52, borderWidth: 1, borderColor: tokens.color.line, borderRadius: 12, paddingVertical: 6, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", justifyContent: "space-between" }}
          >
            <View>
              <Text style={{ fontSize: 12, color: tokens.color.muted }}>{CATEGORY_LABEL[service]}</Text>
              <Text style={{ fontSize: 15, fontWeight: tokens.font.weight.bold, color: tokens.color.ink }}>{category ?? B.list.all}</Text>
            </View>
            <Icon name={picking ? "chevron-up" : "chevron-down"} size={18} color={tokens.color.ink} />
          </Tappable>
        ) : null}
        {picking ? (
          [null, ...categories].map((c) => (
            <Tappable
              key={c ?? "all"}
              onPress={() => {
                onCategory(c);
                setPicking(false);
              }}
              accessibilityRole="radio"
              accessibilityState={{ checked: c === category }}
              style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 56, borderBottomWidth: 1, borderBottomColor: HAIRLINE }}
            >
              <Text style={{ flex: 1, fontSize: 15, fontWeight: c === category ? tokens.font.weight.bold : tokens.font.weight.regular, color: tokens.color.ink }}>{c ?? B.list.all}</Text>
              <Radio on={c === category} />
            </Tappable>
          ))
        ) : (
          <View style={{ marginTop: 4 }}>
            {BROWSE_SORTS.map((s, k) => {
              const off = !hasLocation && DISTANCE_SORTS.has(s);
              const on = s === sort;
              return (
                <Tappable
                  key={s}
                  disabled={off}
                  onPress={() => {
                    onSort(s);
                    onClose();
                  }}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on, disabled: off }}
                  accessibilityHint={off ? B.sort.needsLoc : undefined}
                  style={{ flexDirection: "row", alignItems: "center", gap: 12, minHeight: 56, borderBottomWidth: k === BROWSE_SORTS.length - 1 ? 0 : 1, borderBottomColor: HAIRLINE }}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={{ fontSize: 15, fontWeight: on ? tokens.font.weight.bold : tokens.font.weight.regular, color: off ? tokens.color.muted : tokens.color.ink }}>{SORT_LABEL[s]}</Text>
                    {off ? <Text style={{ fontSize: 12.5, color: tokens.color.muted }}>{B.sort.needsLoc}</Text> : null}
                  </View>
                  <Radio on={on} dim={off} />
                </Tappable>
              );
            })}
          </View>
        )}
      </ScrollView>
    </Sheet>
  );
}

// ── Item sheet (I1, I2) ────────────────────────────────────────────────────────────────────────

const NOTE_MAX = 200;
const NOTE_HINT: Record<BrowseService, string> = { food: B.item.noteHint, shops: B.item.noteShop, pharmacy: B.item.notePharm };

/**
 * I1 — the item sheet: 16:9 photo with a close disc, name + price, description, Quantity stepper, the
 * optional note (200 max, "Notes can't change the price."), and "Add · $4.50" / "Add 2 · $9.00". While
 * the note is focused the photo is dropped so the CTA rides above the keyboard (I2). Closed venue (I1d):
 * read-only, a disabled "Opens at 10:00" bar and the Remind me row. `browseOnly` (Shops and Pharmacy
 * until Order flow v2, ledger D-58): photo, name, price and description only — nothing to add.
 * Pharmacy (I1c) carries the OTC line.
 */
export function ItemSheet({
  item,
  service,
  closedAt,
  remindOn,
  remindBusy,
  onRemind,
  onAdd,
  onClose,
  browseOnly = false,
}: {
  item: StoreItem | null;
  service: BrowseService;
  browseOnly?: boolean;
  /** Non-null when the venue is closed: the time it next opens ("10:00"). */
  closedAt: string | null;
  remindOn: boolean;
  remindBusy: boolean;
  onRemind: () => void;
  onAdd: (quantity: number, note: string) => void;
  onClose: () => void;
}): React.ReactElement {
  const [qty, setQty] = useState(1);
  const [note, setNote] = useState("");
  const [typing, setTyping] = useState(false);
  const close = (): void => {
    setQty(1);
    setNote("");
    setTyping(false);
    onClose();
  };
  const readOnly = browseOnly || closedAt != null || !!item?.unavailable;
  return (
    <Sheet visible={item != null} onClose={close}>
      {item ? (
        <ScrollView bounces={false} keyboardShouldPersistTaps="handled" showsVerticalScrollIndicator={false}>
          {typing ? (
            <View style={{ position: "absolute", right: -8, top: -8, zIndex: 1 }}>
              <IconButton icon="x" label={B.item.close} bg={tokens.color.surface} onPress={close} />
            </View>
          ) : (
            <View style={{ marginTop: -2, marginHorizontal: -4 }}>
              <View style={{ aspectRatio: 16 / 9, borderRadius: 16, overflow: "hidden", backgroundColor: tokens.color.surface }}>
                {item.photoUrl ? <RemoteImage source={{ uri: item.photoUrl }} accessibilityElementsHidden importantForAccessibility="no" style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} /> : null}
              </View>
              <View style={{ position: "absolute", right: 8, top: 8 }}>
                <IconButton icon="x" label={B.item.close} bg={tokens.color.bg} onPress={close} />
              </View>
            </View>
          )}
          <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "baseline", gap: 12, marginTop: typing ? 4 : 14, paddingRight: typing ? 48 : 0 }}>
            <View style={{ flex: 1 }}>
              <SheetTitle>{item.name}</SheetTitle>
            </View>
            <Text style={{ fontSize: 17, fontWeight: tokens.font.weight.bold, color: tokens.color.ink, ...TABULAR }}>{formatMoney(item.priceUsd)}</Text>
          </View>
          {item.description ? <Text style={{ marginTop: 6, fontSize: 14, lineHeight: 20.3, color: tokens.color.muted }}>{item.description}</Text> : null}
          {!readOnly ? (
            <>
              <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginTop: 12, paddingTop: 4, borderTopWidth: 1, borderTopColor: HAIRLINE }}>
                <Text style={{ fontSize: 15, fontWeight: tokens.font.weight.bold, color: tokens.color.ink }}>{B.item.qty}</Text>
                <QtyStepper
                  qty={qty}
                  label={item.name}
                  binAtOne={false}
                  plusDisabled={qty >= MAX_ITEM_QTY}
                  onMinus={() => setQty((q) => Math.max(1, q - 1))}
                  onPlus={() => setQty((q) => Math.min(MAX_ITEM_QTY, q + 1))}
                />
              </View>
              <View style={{ marginTop: 12 }}>
                <Text style={{ marginBottom: 6, fontSize: 13, fontWeight: tokens.font.weight.semibold, color: tokens.color.muted }}>
                  {B.svc[service].note} <Text style={{ fontWeight: tokens.font.weight.regular }}>(optional)</Text>
                </Text>
                <TextInput
                  value={note}
                  onChangeText={(t) => setNote(t.slice(0, NOTE_MAX))}
                  onFocus={() => setTyping(true)}
                  onBlur={() => setTyping(false)}
                  placeholder={NOTE_HINT[service]}
                  placeholderTextColor={tokens.color.muted}
                  multiline
                  maxLength={NOTE_MAX}
                  accessibilityLabel={B.svc[service].note}
                  style={{
                    minHeight: 72,
                    borderRadius: 12,
                    borderWidth: typing ? 1.5 : 1,
                    borderColor: typing ? tokens.color.accent : tokens.color.line,
                    paddingVertical: 12,
                    paddingHorizontal: 14,
                    fontSize: 15,
                    color: tokens.color.ink,
                    textAlignVertical: "top",
                  }}
                />
                <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 6 }}>
                  <Text style={{ fontSize: 12, color: tokens.color.muted }}>{B.item.noteRule}</Text>
                  <Text style={{ fontSize: 12, color: tokens.color.muted, ...TABULAR }}>{`${note.length}/${NOTE_MAX}`}</Text>
                </View>
              </View>
            </>
          ) : null}
          {service === "pharmacy" ? (
            <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10 }}>
              <Icon name="circle-alert" size={14} color={tokens.color.accentText} />
              <Text style={{ flex: 1, fontSize: 12.5, color: tokens.color.muted }}>{B.list.otc}</Text>
            </View>
          ) : null}
          <View style={{ marginTop: 14 }}>
            {browseOnly ? null : closedAt != null ? (
              <>
                <BrowseButton label={fmt(B.item.closedCta, { t: closedAt })} variant="muted" disabled onPress={() => undefined} />
                <View style={{ marginTop: 4 }}>
                  <RemindRow on={remindOn} busy={remindBusy} onToggle={onRemind} bordered={false} />
                </View>
              </>
            ) : readOnly ? null : (
              <BrowseButton
                label={qty > 1 ? fmt(B.item.addN, { n: qty, p: formatMoney(item.priceUsd * qty) }) : fmt(B.item.add, { p: formatMoney(item.priceUsd) })}
                onPress={() => {
                  onAdd(qty, note.trim());
                  setQty(1);
                  setNote("");
                  setTyping(false);
                }}
              />
            )}
          </View>
        </ScrollView>
      ) : null}
    </Sheet>
  );
}

// ── New-cart sheet (I3) ────────────────────────────────────────────────────────────────────────

export function NewCartSheet({
  pending,
  onConfirm,
  onClose,
}: {
  pending: { oldVenue: string; oldCount: number; oldTotal: number; item: string; newVenue: string } | null;
  onConfirm: () => void;
  onClose: () => void;
}): React.ReactElement {
  return (
    <Sheet visible={pending != null} onClose={onClose}>
      {pending ? (
        <View>
          <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: tokens.color.highlightChipWash, alignItems: "center", justifyContent: "center" }}>
            <Icon name="shopping-bag" size={24} color={tokens.color.highlightChipInk} />
          </View>
          <View style={{ marginTop: 12 }}>
            <SheetTitle>{B.newCart.t}</SheetTitle>
          </View>
          <Text style={{ marginTop: 6, marginBottom: 4, fontSize: 15, lineHeight: 21.75, color: tokens.color.ink, ...TABULAR }}>
            {fmt(B.newCart.s, { v: pending.oldVenue, n: pending.oldCount, p: formatMoney(pending.oldTotal) })}
          </Text>
          <Text style={{ marginBottom: 18, fontSize: 14, lineHeight: 20.3, color: tokens.color.muted }}>{fmt(B.newCart.adding, { i: pending.item, w: pending.newVenue })}</Text>
          <BrowseButton label={B.newCart.yes} onPress={onConfirm} />
          <View style={{ marginTop: 8 }}>
            <BrowseButton label={B.newCart.no} variant="ghost" onPress={onClose} />
          </View>
        </View>
      ) : null}
    </Sheet>
  );
}

// ── Just closed (S9) ───────────────────────────────────────────────────────────────────────────

export function JustClosedModal({ venue, visible, onSeeOpen, onDismiss }: { venue: string; visible: boolean; onSeeOpen: () => void; onDismiss: () => void }): React.ReactElement {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onDismiss} statusBarTranslucent>
      <View style={{ flex: 1, justifyContent: "center", paddingHorizontal: 20, backgroundColor: DIM }}>
        <View accessibilityViewIsModal style={{ backgroundColor: tokens.color.bg, borderRadius: 24, padding: 20 }}>
          <View style={{ width: 56, height: 56, borderRadius: 28, backgroundColor: tokens.color.surface, alignItems: "center", justifyContent: "center" }}>
            <Icon name="clock" size={24} color={tokens.color.muted} />
          </View>
          <View style={{ marginTop: 12 }}>
            <SheetTitle>{fmt(B.justClosed.t, { v: venue })}</SheetTitle>
          </View>
          <Text style={{ marginTop: 6, marginBottom: 18, fontSize: 14.5, lineHeight: 21, color: tokens.color.muted }}>{B.justClosed.s}</Text>
          <BrowseButton label={B.justClosed.yes} onPress={onSeeOpen} />
          <View style={{ marginTop: 4 }}>
            <BrowseButton label={B.justClosed.no} variant="text" onPress={onDismiss} />
          </View>
        </View>
      </View>
    </Modal>
  );
}
