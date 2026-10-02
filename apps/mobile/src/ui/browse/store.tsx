import { tokens } from "@lynia/shared/tokens";
import React, { useState } from "react";
import { ScrollView, Text, View, type LayoutChangeEvent } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { BrowseService, VenueView } from "../../logic/browse";
import { formatMoney } from "../../logic/money";
import { Icon } from "../Icon";
import { RemoteImage } from "../RemoteImage";
import { Tappable } from "../Tappable";
import { O, O_ADDED, ofFmt } from "../orderflow/copy";
import { RxTag } from "../orderflow/review";
import { B, fmt } from "./copy";
import { HAIRLINE, HeaderCircles, IconButton, RADIO_OFF, SERVICE_TILE, SKELETON, Star, TABULAR, VenueImage, initial, kindTint } from "./kit";

/**
 * Browse v2 storefront kit (`packages/design/handoff/browse-v2` README §4 "Storefront header" …
 * "Cart bar", with the §4b round-2 values; ledger D-57). Zero shadows.
 */

// ── Header ─────────────────────────────────────────────────────────────────────────────────────

/** Cover 196 (fallback: the service tint band at 150 with Calm Mint's circles), back + search discs. */
export function StoreCover({
  service,
  photoUrl,
  narrow,
  onBack,
  onSearch,
  searchLabel,
}: {
  service: BrowseService;
  photoUrl: string | null;
  narrow: boolean;
  onBack: () => void;
  onSearch: () => void;
  searchLabel: string;
}): React.ReactElement {
  const insets = useSafeAreaInsets();
  const [failed, setFailed] = useState(false);
  const photo = !!photoUrl && !failed;
  return (
    <View style={{ backgroundColor: tokens.color.bg, paddingTop: insets.top }}>
      <View style={{ height: photo ? 196 : 150, overflow: "hidden", backgroundColor: photo ? tokens.color.surface : SERVICE_TILE[service] }}>
        {photo ? (
          <RemoteImage
            source={{ uri: photoUrl! }}
            onError={() => setFailed(true)}
            accessibilityElementsHidden
            importantForAccessibility="no"
            style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
          />
        ) : (
          <HeaderCircles narrow={narrow} dy={0} />
        )}
        <View style={{ position: "absolute", top: 8, left: 10, right: 10, flexDirection: "row", justifyContent: "space-between" }}>
          <IconButton icon="chevron-left" size={22} label="Back" bg={tokens.color.bg} onPress={onBack} />
          <IconButton icon="search" label={searchLabel} bg={tokens.color.bg} onPress={onSearch} />
        </View>
      </View>
    </View>
  );
}

/** Logo 76 round with a 4px white ring, overlapping the cover by half. */
export function StoreLogo({ logoUrl, name, kind }: { logoUrl: string | null; name: string; kind: string | null }): React.ReactElement {
  const [failed, setFailed] = useState(false);
  const photo = !!logoUrl && !failed;
  const tint = kindTint(kind);
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no"
      style={{
        width: 76,
        height: 76,
        borderRadius: 38,
        borderWidth: 4,
        borderColor: tokens.color.bg,
        marginTop: -38,
        marginLeft: 16,
        backgroundColor: photo ? tokens.color.bg : tint.bg,
        overflow: "hidden",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      {photo ? (
        <RemoteImage source={{ uri: logoUrl! }} onError={() => setFailed(true)} style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }} />
      ) : (
        <Text style={{ fontSize: 28, fontWeight: tokens.font.weight.bold, color: tint.ink }}>{initial(name)}</Text>
      )}
    </View>
  );
}

export function StoreTitle({ name, sub }: { name: string; sub: string }): React.ReactElement {
  return (
    <View style={{ paddingTop: 10, paddingHorizontal: 16 }}>
      <Text accessibilityRole="header" style={{ fontSize: 26, lineHeight: 31, letterSpacing: -0.6, fontWeight: tokens.font.weight.bold, color: tokens.color.ink }}>
        {name}
      </Text>
      {sub ? <Text style={{ marginTop: 4, fontSize: 13.5, color: tokens.color.muted }}>{sub}</Text> : null}
    </View>
  );
}

/** "● Open until 22:00 · Ready in ~20 min" — the open state is an inline line (§4b). */
export function OpenLine({ v, service }: { v: VenueView; service: BrowseService }): React.ReactElement {
  const time = fmt(B.svc[service].time, { m: v.prepMinutes });
  return (
    <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 6, paddingTop: 8, paddingHorizontal: 16 }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: tokens.color.accent }} />
      {v.closeTime ? (
        <>
          <Text style={{ fontSize: 13.5, fontWeight: tokens.font.weight.bold, color: tokens.color.accentText, ...TABULAR }}>{fmt(B.store.openUntil, { t: v.closeTime })}</Text>
          <Text style={{ fontSize: 13.5, color: tokens.color.muted }}>·</Text>
        </>
      ) : null}
      <Text style={{ fontSize: 13.5, color: tokens.color.muted, ...TABULAR }}>{time}</Text>
    </View>
  );
}

/** README §4b "Info strip": surface, radius 16, up to four cells. Cells with no honest value drop out. */
export function InfoStrip({ v }: { v: VenueView }): React.ReactElement {
  const cells: Array<{ key: string; value: React.ReactNode; label: string }> = [
    {
      key: "rating",
      value:
        v.rating != null ? (
          <>
            <Star size={14} />
            <Text style={{ fontSize: 16, fontWeight: tokens.font.weight.bold, color: tokens.color.ink, ...TABULAR }}>{v.rating.toFixed(1)}</Text>
          </>
        ) : (
          <Text style={{ fontSize: 16, fontWeight: tokens.font.weight.bold, color: tokens.color.ink }}>{B.list.isNew}</Text>
        ),
      label: v.rating != null ? fmt(B.store.ratings, { n: v.ratingCount }) : B.store.noRatings,
    },
  ];
  if (v.etaLow != null && v.etaHigh != null) {
    cells.push({ key: "eta", value: <CellValue text={`${v.etaLow}–${v.etaHigh}`} />, label: B.store.min });
  }
  if (v.freeDelivery) cells.push({ key: "fee", value: <CellValue text={B.store.free} color={tokens.color.free} />, label: B.store.delivery });
  else if (v.feeUsd != null) cells.push({ key: "fee", value: <CellValue text={formatMoney(v.feeUsd)} />, label: B.store.delivery });
  if (v.km != null) cells.push({ key: "km", value: <CellValue text={`${v.km.toFixed(1)} km`} />, label: B.store.away });
  return (
    <View style={{ flexDirection: "row", marginTop: 14, marginHorizontal: 16, borderRadius: 16, backgroundColor: tokens.color.surface }}>
      {cells.map((c, k) => (
        <View
          key={c.key}
          accessible
          accessibilityLabel={`${typeof c.value === "string" ? c.value : ""} ${c.label}`.trim()}
          style={{ flex: 1, minWidth: 0, paddingVertical: 12, paddingHorizontal: 4, alignItems: "center", borderLeftWidth: k === 0 ? 0 : 1, borderLeftColor: tokens.color.line }}
        >
          <View style={{ flexDirection: "row", alignItems: "center", gap: 3 }}>{c.value}</View>
          <Text numberOfLines={1} style={{ marginTop: 1, fontSize: 12, color: tokens.color.muted, ...TABULAR }}>
            {c.label}
          </Text>
        </View>
      ))}
    </View>
  );
}

function CellValue({ text, color = tokens.color.ink }: { text: string; color?: string }): React.ReactElement {
  return (
    <Text numberOfLines={1} style={{ fontSize: 16, fontWeight: tokens.font.weight.bold, color, ...TABULAR }}>
      {text}
    </Text>
  );
}

/** Closing soon: the highlight-wash strip under the info strip. */
export function ClosingStrip({ minutes, orderBy }: { minutes: number; orderBy: string }): React.ReactElement {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10, marginHorizontal: 16, minHeight: 40, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 12, backgroundColor: tokens.color.highlightChipWash }}>
      <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: tokens.color.highlight, borderWidth: 2, borderColor: tokens.color.highlightChipInk }} />
      <Text style={{ flex: 1, fontSize: 13, fontWeight: tokens.font.weight.bold, color: tokens.color.highlightChipInk, ...TABULAR }}>
        {fmt(B.store.closingSoon, { m: minutes, t: orderBy })}
      </Text>
    </View>
  );
}

/** The on/off switch the handoff draws (44×26). */
export function Switch({ on }: { on: boolean }): React.ReactElement {
  return (
    <View style={{ width: 44, height: 26, borderRadius: 13, backgroundColor: on ? tokens.color.accent : RADIO_OFF, justifyContent: "center" }}>
      <View style={{ width: 20, height: 20, borderRadius: 10, backgroundColor: tokens.color.bg, marginLeft: on ? 21 : 3 }} />
    </View>
  );
}

/** "Remind me when they open" — a 52px bordered row with a bell and the switch. */
export function RemindRow({ on, busy, onToggle, bordered = true }: { on: boolean; busy: boolean; onToggle: () => void; bordered?: boolean }): React.ReactElement {
  return (
    <Tappable
      onPress={onToggle}
      disabled={busy}
      accessibilityRole="switch"
      accessibilityState={{ checked: on, busy }}
      accessibilityLabel={B.store.remind}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 8,
        minHeight: bordered ? 52 : 56,
        paddingHorizontal: bordered ? 12 : 0,
        borderRadius: 12,
        borderWidth: bordered ? 1 : 0,
        borderColor: tokens.color.line,
      }}
    >
      <Icon name="bell" size={18} color={tokens.color.accentText} />
      <Text style={{ flex: 1, fontSize: 13, fontWeight: tokens.font.weight.semibold, color: tokens.color.ink }}>{B.store.remind}</Text>
      <Switch on={on} />
    </Tappable>
  );
}

/** Closed: a surface strip "Closed · opens 10:00", then the Remind me row (none without `onRemind`:
 *  Shops and Pharmacy have no reminder while they're browse-only, ledger D-58). */
export function ClosedStrip({ label, remindOn = false, remindBusy = false, onRemind }: { label: string; remindOn?: boolean; remindBusy?: boolean; onRemind?: () => void }): React.ReactElement {
  return (
    <View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10, marginHorizontal: 16, minHeight: 40, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 12, backgroundColor: tokens.color.surface }}>
        <View style={{ width: 8, height: 8, borderRadius: 4, backgroundColor: tokens.color.muted }} />
        <Text style={{ flex: 1, fontSize: 13, fontWeight: tokens.font.weight.bold, color: tokens.color.ink, ...TABULAR }}>{label}</Text>
      </View>
      {onRemind ? (
        <View style={{ marginTop: 10, marginHorizontal: 16 }}>
          <RemindRow on={remindOn} busy={remindBusy} onToggle={onRemind} />
        </View>
      ) : null}
    </View>
  );
}

// ── Tabs + sections ────────────────────────────────────────────────────────────────────────────

/** Sticky tabs: 48 high, 15/600 muted; active ink 700 with a 3px brand underline. Scrolls sideways. */
export function StoreTabs({ names, active, onPick }: { names: string[]; active: number; onPick: (i: number) => void }): React.ReactElement {
  return (
    <View style={{ backgroundColor: tokens.color.bg, borderBottomWidth: 1, borderBottomColor: tokens.color.line }}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ paddingHorizontal: 6 }} accessibilityRole="tablist">
        {names.map((n, i) => (
          <Tappable
            key={`${n}-${i}`}
            onPress={() => onPick(i)}
            accessibilityRole="tab"
            accessibilityState={{ selected: i === active }}
            style={{ minHeight: 48, justifyContent: "center", paddingHorizontal: 12, borderBottomWidth: 3, borderBottomColor: i === active ? tokens.color.accent : "transparent" }}
          >
            <Text style={{ fontSize: 15, fontWeight: i === active ? tokens.font.weight.bold : tokens.font.weight.semibold, color: i === active ? tokens.color.ink : tokens.color.muted }}>{n}</Text>
          </Tappable>
        ))}
      </ScrollView>
    </View>
  );
}

/** Section heading 20/700, with the time-window chip and its note when the category isn't served now. */
export function SectionHeading({ title, window, note, onLayout }: { title: string; window?: string | null; note?: string | null; onLayout?: (e: LayoutChangeEvent) => void }): React.ReactElement {
  return (
    <View onLayout={onLayout}>
      <View style={{ flexDirection: "row", alignItems: "center", flexWrap: "wrap", gap: 8, paddingTop: 26, paddingHorizontal: 16, paddingBottom: 6 }}>
        <Text accessibilityRole="header" style={{ fontSize: 20, letterSpacing: -0.4, fontWeight: tokens.font.weight.bold, color: tokens.color.ink }}>
          {title}
        </Text>
        {window ? (
          <View style={{ borderRadius: tokens.radius.pill, backgroundColor: tokens.color.surface, paddingHorizontal: 8, paddingVertical: 4 }}>
            <Text style={{ fontSize: 12, fontWeight: tokens.font.weight.semibold, color: tokens.color.muted, ...TABULAR }}>{window}</Text>
          </View>
        ) : null}
      </View>
      {note ? <Text style={{ paddingTop: 2, paddingHorizontal: 16, fontSize: 13, color: tokens.color.muted }}>{note}</Text> : null}
    </View>
  );
}

// ── Add + stepper ──────────────────────────────────────────────────────────────────────────────

/** The + inside the photo: a 36 brand disc in a 48 target; shows the count once in the cart. */
export function AddButton({ count, label, onPress }: { count: number; label: string; onPress: () => void }): React.ReactElement {
  return (
    <Tappable
      onPress={onPress}
      tone="icon"
      accessibilityRole="button"
      accessibilityLabel={count > 0 ? `${label}, ${count} in cart. Add one more` : `Add ${label}`}
      style={{ position: "absolute", right: 0, bottom: 0, width: 48, height: 48, alignItems: "center", justifyContent: "center" }}
    >
      <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: tokens.color.accent, alignItems: "center", justifyContent: "center" }}>
        {count > 0 ? (
          <Text style={{ fontSize: 15, fontWeight: tokens.font.weight.bold, color: tokens.color.onAccent, ...TABULAR }}>{count}</Text>
        ) : (
          <Icon name="plus" size={18} color={tokens.color.onAccent} />
        )}
      </View>
    </Tappable>
  );
}

/** "− n +" 44 tall; at 1, − becomes a bin (removes the item). `wide` spans the tile. */
export function QtyStepper({
  qty,
  label,
  onMinus,
  onPlus,
  wide = false,
  binAtOne = true,
  plusDisabled = false,
}: {
  qty: number;
  label: string;
  onMinus: () => void;
  onPlus: () => void;
  wide?: boolean;
  binAtOne?: boolean;
  plusDisabled?: boolean;
}): React.ReactElement {
  const bin = binAtOne && qty <= 1;
  const minusDisabled = !binAtOne && qty <= 1;
  return (
    <View
      style={{
        flexDirection: "row",
        alignItems: "center",
        justifyContent: wide ? "space-between" : "flex-start",
        alignSelf: wide ? "stretch" : "flex-start",
        height: 44,
        borderRadius: tokens.radius.pill,
        borderWidth: 1,
        borderColor: tokens.color.line,
        marginTop: 8,
      }}
    >
      <Tappable
        onPress={onMinus}
        disabled={minusDisabled}
        tone="icon"
        accessibilityRole="button"
        accessibilityLabel={bin ? `Remove ${label}` : `One less ${label}`}
        style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center", opacity: minusDisabled ? 0.4 : 1 }}
      >
        <Icon name={bin ? "trash" : "minus"} size={bin ? 16 : 18} color={bin ? tokens.color.muted : tokens.color.ink} />
      </Tappable>
      <Text accessibilityLabel={`${qty}`} style={{ minWidth: 28, textAlign: "center", fontSize: 15, fontWeight: tokens.font.weight.bold, color: tokens.color.ink, ...TABULAR }}>
        {qty}
      </Text>
      <Tappable
        onPress={onPlus}
        disabled={plusDisabled}
        tone="icon"
        accessibilityRole="button"
        accessibilityLabel={`One more ${label}`}
        style={{ width: 44, height: 44, alignItems: "center", justifyContent: "center", opacity: plusDisabled ? 0.4 : 1 }}
      >
        <Icon name="plus" size={18} color={tokens.color.accentText} />
      </Tappable>
    </View>
  );
}

// ── Item rows ──────────────────────────────────────────────────────────────────────────────────

export interface StoreItem {
  id: string;
  name: string;
  description: string | null;
  priceUsd: number;
  photoUrl: string | null;
  /** Out of stock today, or its category is outside its serving window. */
  unavailable: boolean;
  /** Only the out-of-stock reason shows the chip; a time window says so on its heading. */
  outOfStock: boolean;
  /** Order flow v2 R8: a pharmacy item that needs a prescription (sent only while `rxEnabled`). */
  rxRequired?: boolean;
}

/** README §4b "Dish row": text left, a 112 photo right with the + inside; inset hairline. */
/** The name with the search match in green-text (S12a). */
function Highlighted({ text, match }: { text: string; match?: string }): React.ReactElement {
  const at = match ? text.toLowerCase().indexOf(match.toLowerCase()) : -1;
  if (!match || at < 0) return <>{text}</>;
  return (
    <>
      {text.slice(0, at)}
      <Text style={{ color: tokens.color.accentText, fontWeight: tokens.font.weight.bold }}>{text.slice(at, at + match.length)}</Text>
      {text.slice(at + match.length)}
    </>
  );
}

export function DishRow({
  item,
  qty,
  canAdd,
  highlight,
  onOpen,
  onAdd,
  onMinus,
}: {
  item: StoreItem;
  qty: number;
  canAdd: boolean;
  /** A search query to mark in the name. */
  highlight?: string;
  onOpen: () => void;
  onAdd: () => void;
  onMinus: () => void;
}): React.ReactElement {
  const ink = item.unavailable ? tokens.color.muted : tokens.color.ink;
  return (
    <Tappable
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={`${item.name}, ${formatMoney(item.priceUsd)}${item.outOfStock ? `, ${B.store.oos}` : ""}`}
      style={{ flexDirection: "row", gap: 14, marginHorizontal: 16, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: HAIRLINE }}
    >
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 16, lineHeight: 20.8, fontWeight: tokens.font.weight.semibold, color: ink }}>
          <Highlighted text={item.name} match={highlight} />
        </Text>
        {item.description ? (
          <Text numberOfLines={2} style={{ marginTop: 4, marginBottom: 8, fontSize: 13.5, lineHeight: 18.9, color: tokens.color.muted }}>
            {item.description}
          </Text>
        ) : (
          <View style={{ height: 6 }} />
        )}
        <Text style={{ fontSize: 15, fontWeight: tokens.font.weight.semibold, color: ink, ...TABULAR }}>{formatMoney(item.priceUsd)}</Text>
        {item.outOfStock ? <OosChip /> : null}
        {qty > 0 && canAdd ? <QtyStepper qty={qty} label={item.name} onMinus={onMinus} onPlus={onAdd} /> : null}
      </View>
      <VenueImage photoUrl={item.photoUrl} name={item.name} kind={null} dim={item.unavailable} style={{ width: 112, height: 112, borderRadius: 14 }}>
        {canAdd && !item.unavailable ? <AddButton count={qty} label={item.name} onPress={onAdd} /> : null}
      </VenueImage>
    </Tappable>
  );
}

/** README §4 "Item tile (shops)" with the §4b values: a square photo (radius 16) with the + inside, price
 *  first 16/700, then the name 13.5/400 on two lines, and a full-width stepper once it's in the cart (S5).
 *  Two to a row (`ShopGrid`). */
export function ShopTile({
  item,
  qty = 0,
  canAdd = false,
  onOpen,
  onAdd,
  onMinus,
}: {
  item: StoreItem;
  qty?: number;
  canAdd?: boolean;
  onOpen: () => void;
  onAdd?: () => void;
  onMinus?: () => void;
}): React.ReactElement {
  const ink = item.unavailable ? tokens.color.muted : tokens.color.ink;
  return (
    <View style={{ flex: 1, minWidth: 0 }}>
      <Tappable onPress={onOpen} accessibilityRole="button" accessibilityLabel={`${item.name}, ${formatMoney(item.priceUsd)}${item.outOfStock ? `, ${B.store.oos}` : ""}`}>
        <VenueImage photoUrl={item.photoUrl} name={item.name} kind={null} dim={item.unavailable} style={{ width: "100%", aspectRatio: 1, borderRadius: 16 }}>
          {canAdd && !item.unavailable && onAdd ? <AddButton count={qty} label={item.name} onPress={onAdd} /> : null}
        </VenueImage>
        <Text style={{ marginTop: 10, fontSize: 16, fontWeight: tokens.font.weight.bold, color: ink, ...TABULAR }}>{formatMoney(item.priceUsd)}</Text>
        <Text numberOfLines={2} style={{ marginTop: 2, fontSize: 13.5, lineHeight: 18.2, color: ink }}>
          {item.name}
        </Text>
        {item.outOfStock ? <OosChip /> : null}
      </Tappable>
      {qty > 0 && canAdd && onAdd && onMinus ? <QtyStepper qty={qty} label={item.name} wide onMinus={onMinus} onPlus={onAdd} /> : null}
    </View>
  );
}

/** Lays `ShopTile`s out two to a row: row gap 20, column gap 12, padding 8 16 0 (README §4b). */
export function ShopGrid({ items, renderTile }: { items: StoreItem[]; renderTile: (item: StoreItem) => React.ReactElement }): React.ReactElement {
  const rows: StoreItem[][] = [];
  for (let i = 0; i < items.length; i += 2) rows.push(items.slice(i, i + 2));
  return (
    <View style={{ paddingTop: 8, paddingHorizontal: 16, gap: 20 }}>
      {rows.map((row) => (
        <View key={row[0]!.id} style={{ flexDirection: "row", gap: 12, alignItems: "flex-start" }}>
          {row.map((it) => (
            <React.Fragment key={it.id}>{renderTile(it)}</React.Fragment>
          ))}
          {row.length === 1 ? <View style={{ flex: 1 }} /> : null}
        </View>
      ))}
    </View>
  );
}

/** README §4 "Item row (pharmacy)" with the §4b values: photo 72 radius 14, vertically centred; name
 *  15/600 (the pack size is part of the name), price 15/700, the stepper under it once in the cart (S6),
 *  and the + on the right (a 36 disc in a 48 target, `.ir .plus`); inset hairline. With `rxEnabled`, an
 *  Rx item carries the "Prescription needed" pill (R8). */
export function PharmacyRow({
  item,
  highlight,
  qty = 0,
  canAdd = false,
  onOpen,
  onAdd,
  onMinus,
}: {
  item: StoreItem;
  highlight?: string;
  qty?: number;
  canAdd?: boolean;
  onOpen: () => void;
  onAdd?: () => void;
  onMinus?: () => void;
}): React.ReactElement {
  const ink = item.unavailable ? tokens.color.muted : tokens.color.ink;
  const plus = canAdd && !item.unavailable && onAdd;
  return (
    <Tappable
      onPress={onOpen}
      accessibilityRole="button"
      accessibilityLabel={`${item.name}, ${formatMoney(item.priceUsd)}${item.outOfStock ? `, ${B.store.oos}` : ""}${item.rxRequired ? `, ${O.r.rxNeed}` : ""}`}
      style={{ flexDirection: "row", alignItems: "center", gap: 14, marginHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: HAIRLINE }}
    >
      <VenueImage photoUrl={item.photoUrl} name={item.name} kind={null} dim={item.unavailable} style={{ width: 72, height: 72, borderRadius: 14 }} />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 15, lineHeight: 19.5, fontWeight: tokens.font.weight.semibold, color: ink }}>
          {highlight ? <Highlighted text={item.name} match={highlight} /> : item.name}
        </Text>
        <Text style={{ marginTop: 4, fontSize: 15, fontWeight: tokens.font.weight.bold, color: ink, ...TABULAR }}>{formatMoney(item.priceUsd)}</Text>
        {item.rxRequired ? (
          <View style={{ alignSelf: "flex-start", marginTop: 4 }}>
            <RxTag />
          </View>
        ) : null}
        {item.outOfStock ? <OosChip /> : null}
        {qty > 0 && plus && onMinus ? <QtyStepper qty={qty} label={item.name} onMinus={onMinus} onPlus={onAdd} /> : null}
      </View>
      {plus ? (
        <Tappable
          onPress={onAdd}
          tone="icon"
          accessibilityRole="button"
          accessibilityLabel={qty > 0 ? `${item.name}, ${qty} in cart. Add one more` : `Add ${item.name}`}
          style={{ width: 48, height: 48, marginRight: -6, alignItems: "center", justifyContent: "center" }}
        >
          <View style={{ width: 36, height: 36, borderRadius: 18, backgroundColor: tokens.color.accent, alignItems: "center", justifyContent: "center" }}>
            {qty > 0 ? (
              <Text style={{ fontSize: 15, fontWeight: tokens.font.weight.bold, color: tokens.color.onAccent, ...TABULAR }}>{qty}</Text>
            ) : (
              <Icon name="plus" size={18} color={tokens.color.onAccent} />
            )}
          </View>
        </Tappable>
      ) : null}
    </Tappable>
  );
}

/** README §4 "OTC notice": surface, radius 12, padding 12 14, circle-alert 18 green-text, the first
 *  sentence bold. Text, not a gate. On the Pharmacy list (margin 12 16 0) and storefront (10 16 0). */
export function OtcNotice({ marginTop = 12 }: { marginTop?: number }): React.ReactElement {
  const [lead, ...rest] = B.list.otc.split(". ");
  return (
    <View style={{ flexDirection: "row", alignItems: "flex-start", gap: 10, marginTop, marginHorizontal: 16, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 12, backgroundColor: tokens.color.surface }}>
      <View style={{ marginTop: 1 }}>
        <Icon name="circle-alert" size={18} color={tokens.color.accentText} />
      </View>
      <Text style={{ flex: 1, fontSize: 13, lineHeight: 18.85, color: tokens.color.ink }}>
        <Text style={{ fontWeight: tokens.font.weight.bold }}>{`${lead}.`}</Text> {rest.join(". ")}
      </Text>
    </View>
  );
}

export function OosChip(): React.ReactElement {
  return (
    <View style={{ alignSelf: "flex-start", marginTop: 4, borderRadius: tokens.radius.pill, backgroundColor: tokens.color.surface, paddingHorizontal: 8, paddingVertical: 3 }}>
      <Text style={{ fontSize: 12, fontWeight: tokens.font.weight.semibold, color: tokens.color.muted }}>{B.store.oos}</Text>
    </View>
  );
}

export const POPULAR_CARD = 148;

/** README §4b "Popular (restaurants)": a 148 square card with the + inside; stepper under when in cart. */
export function PopularCard({
  item,
  qty,
  canAdd,
  onOpen,
  onAdd,
  onMinus,
}: {
  item: StoreItem;
  qty: number;
  canAdd: boolean;
  onOpen: () => void;
  onAdd: () => void;
  onMinus: () => void;
}): React.ReactElement {
  return (
    <View style={{ width: POPULAR_CARD }}>
      <Tappable onPress={onOpen} accessibilityRole="button" accessibilityLabel={`${item.name}, ${formatMoney(item.priceUsd)}`}>
        <VenueImage photoUrl={item.photoUrl} name={item.name} kind={null} dim={item.unavailable} style={{ width: POPULAR_CARD, height: POPULAR_CARD, borderRadius: 16 }}>
          {canAdd && !item.unavailable ? <AddButton count={qty} label={item.name} onPress={onAdd} /> : null}
        </VenueImage>
        <Text numberOfLines={2} style={{ marginTop: 8, fontSize: 14, lineHeight: 18.2, fontWeight: tokens.font.weight.semibold, color: tokens.color.ink }}>
          {item.name}
        </Text>
        <Text style={{ marginTop: 2, fontSize: 14, fontWeight: tokens.font.weight.semibold, color: tokens.color.muted, ...TABULAR }}>{formatMoney(item.priceUsd)}</Text>
      </Tappable>
      {qty > 0 && canAdd ? <QtyStepper qty={qty} label={item.name} wide onMinus={onMinus} onPlus={onAdd} /> : null}
    </View>
  );
}

// ── Cart bar + toast ───────────────────────────────────────────────────────────────────────────

const PROGRESS_TRACK = "rgba(255,255,255,0.22)";

/** README §4 "Cart bar": forest, inset 12, radius 18; the small-order hint + progress under $4.00. */
export function CartBar({
  count,
  subtotal,
  venue,
  minSubtotal,
  smallOrderFee,
  onPress,
  openFirst = null,
}: {
  count: number;
  subtotal: number;
  venue: string;
  minSubtotal: number;
  smallOrderFee: number;
  onPress: () => void;
  /** Order flow v2 R5c: the venue is closed and this is its first slot ("10:30–11:00") — the bar reads
   *  "Order for when they open · 10:30–11:00" behind a calendar, and its button is "Review". */
  openFirst?: string | null;
}): React.ReactElement {
  const insets = useSafeAreaInsets();
  const under = openFirst == null && subtotal < minSubtotal;
  const title = fmt(count === 1 ? B.cart.bar1 : B.cart.bar, { n: count, p: formatMoney(subtotal) });
  const sub = openFirst != null ? ofFmt(O.r.openFirst, { s: openFirst }) : under ? fmt(B.cart.minHint, { d: formatMoney(minSubtotal - subtotal), f: formatMoney(smallOrderFee) }) : venue;
  const cta = openFirst != null ? O_ADDED.r.review : B.cart.view;
  return (
    <Tappable
      onPress={onPress}
      tone="onDark"
      accessibilityRole="button"
      accessibilityLabel={`${title}. ${sub}. ${cta}`}
      style={{
        position: "absolute",
        left: 12,
        right: 12,
        bottom: 12 + insets.bottom,
        minHeight: 64,
        borderRadius: 18,
        backgroundColor: tokens.color.forest,
        paddingVertical: 10,
        paddingLeft: 12,
        paddingRight: 8,
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
      }}
    >
      <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: tokens.color.accent, alignItems: "center", justifyContent: "center" }}>
        <Icon name={openFirst != null ? "calendar" : "shopping-bag"} size={20} color={tokens.color.onAccent} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: tokens.font.weight.bold, color: tokens.color.onAccent, ...TABULAR }}>
          {title}
        </Text>
        <Text numberOfLines={2} style={{ fontSize: 12, lineHeight: 15.6, color: tokens.color.onForestMuted, ...TABULAR }}>
          {sub}
        </Text>
        {under ? (
          <View style={{ height: 3, borderRadius: 2, backgroundColor: PROGRESS_TRACK, marginTop: 6, maxWidth: 150 }}>
            <View style={{ position: "absolute", left: 0, top: 0, bottom: 0, borderRadius: 2, backgroundColor: tokens.color.accent, width: `${Math.max(0, Math.min(1, subtotal / minSubtotal)) * 100}%` }} />
          </View>
        ) : null}
      </View>
      <View style={{ minHeight: 44, flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 14, borderRadius: tokens.radius.pill, backgroundColor: tokens.color.highlight }}>
        <Text style={{ fontSize: 13, fontWeight: tokens.font.weight.bold, color: tokens.color.highlightChipInk }}>{cta}</Text>
        {openFirst != null ? null : <Icon name="chevron-right" size={16} color={tokens.color.highlightChipInk} />}
      </View>
    </Tappable>
  );
}

/** README §4 "Toast": ink, radius 12, 13.5 white, 16 from the sides, above the cart bar. */
export function BrowseToast({ text, icon, bottom }: { text: string; icon?: "bell" | "check"; bottom: number }): React.ReactElement {
  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      pointerEvents="none"
      style={{ position: "absolute", left: 16, right: 16, bottom, flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 12, paddingHorizontal: 14, borderRadius: 12, backgroundColor: tokens.color.ink }}
    >
      {icon ? <Icon name={icon} size={18} color={tokens.color.onForestMuted} /> : null}
      <Text style={{ flex: 1, fontSize: 13.5, lineHeight: 18.9, color: tokens.color.onAccent }}>{text}</Text>
    </View>
  );
}

/** S13a — the storefront skeleton: cover, logo, title, strip, two rows. */
export function StoreSkeleton(): React.ReactElement {
  const insets = useSafeAreaInsets();
  const bone = (w: number | `${number}%`, h: number, extra: object = {}): React.ReactElement => <View style={{ width: w, height: h, borderRadius: 12, backgroundColor: SKELETON, ...extra }} />;
  return (
    <View accessibilityLabel="Loading" accessibilityState={{ busy: true }} style={{ paddingTop: insets.top }}>
      {bone("100%", 140, { borderRadius: 0 })}
      <View style={{ width: 60, height: 60, borderRadius: 30, marginTop: -30, marginLeft: 16, borderWidth: 3, borderColor: tokens.color.bg, backgroundColor: SKELETON }} />
      <View style={{ paddingVertical: 8, paddingHorizontal: 16 }}>
        {bone("60%", 20)}
        {bone("40%", 12, { marginTop: 8 })}
        {bone("100%", 60, { marginTop: 14, borderRadius: 14 })}
        {bone("100%", 40, { marginTop: 10 })}
      </View>
      {[0, 1].map((k) => (
        <View key={k} style={{ flexDirection: "row", gap: 12, paddingVertical: 14, paddingHorizontal: 16 }}>
          <View style={{ flex: 1 }}>
            {bone("70%", 14)}
            {bone("90%", 10, { marginTop: 8 })}
            {bone("30%", 12, { marginTop: 10 })}
          </View>
          {bone(96, 96)}
        </View>
      ))}
    </View>
  );
}
