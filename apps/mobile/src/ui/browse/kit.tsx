import { tokens } from "@lynia/shared/tokens";
import React, { useState } from "react";
import { Text, View, type TextStyle, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { BrowseService, VenueOpening, VenueView } from "../../logic/browse";
import { formatMoney } from "../../logic/money";
import { EmptyRow, EmptyState } from "../EmptyState";
import { emptyCopy, fillEmpty } from "../emptyCopy";
import { PharmacyStickerV2, RestaurantsSticker, ShopsSticker } from "../art/stickers";
import { Icon, type IconName } from "../Icon";
import { RemoteImage } from "../RemoteImage";
import { Tappable } from "../Tappable";
import { B, fmt } from "./copy";

/**
 * Browse v2 list kit (`packages/design/handoff/browse-v2`, README §4 + §4b round-2 values, which win
 * where they differ; ledger D-57). Every measurement is the handoff's. ZERO shadows: separation is
 * tint + hairline only; the solid exceptions are the cart bar and the sheet dim.
 */

export const TABULAR: Pick<TextStyle, "fontVariant"> = { fontVariant: ["tabular-nums"] };
/** Values the handoff draws as literals (`code/tokens.ts`), named once here. */
export const HAIRLINE = "#F0F2F4";
export const SKELETON = "#EEF1F3";
export const RADIO_OFF = "#C9D0D6";
export const GRAB = "#D5DBE0";
/** Phones narrower than this get the 320 variants (shorter placeholders, circle positions). */
export const NARROW_MAX = 340;

export const SERVICE_TILE: Record<BrowseService, string> = {
  food: tokens.color.tileFood,
  shops: tokens.color.tileShops,
  pharmacy: tokens.color.tilePharmacy,
};
const SERVICE_ART: Record<BrowseService, (p: { width: number }) => React.ReactElement> = {
  food: RestaurantsSticker,
  shops: ShopsSticker,
  pharmacy: PharmacyStickerV2,
};

/** [fill, ink] for a venue with no photo (`code/tokens.ts` KIND; "Food" is the restaurants entry). */
export function kindTint(kind: string | null): { bg: string; ink: string } {
  switch (kind) {
    case "Pharmacy":
      return { bg: tokens.color.tilePharmacyWash, ink: tokens.color.accentText };
    case "Grocery":
      return { bg: tokens.color.accentWash, ink: tokens.color.accentText };
    case "Fashion":
      return { bg: tokens.color.kindFashion, ink: tokens.color.kindFashionInk };
    case "Auto parts":
      return { bg: tokens.color.kindAuto, ink: tokens.color.kindAutoInk };
    case "Hardware":
    case "Electronics":
    case "Other":
      return { bg: tokens.color.surface, ink: tokens.color.ink };
    // Butchery and Food share the warm tint.
    default:
      return { bg: tokens.color.kindButchery, ink: tokens.color.dangerInk };
  }
}

/** "Opens 10:00" / "Opens tomorrow 09:00" (a later weekday names the day as the runtime value). */
export function opensLabel(o: VenueOpening | null): string | null {
  if (!o) return null;
  if (o.dayOffset === 0) return fmt(B.list.opens, { t: o.time });
  if (o.dayOffset === 1) return fmt(B.list.opensTmr, { t: o.time });
  return fmt(B.list.opens, { t: `${o.day} ${o.time}` });
}

export function initial(name: string): string {
  return name.trim().charAt(0).toUpperCase();
}

// ── Small parts ────────────────────────────────────────────────────────────────────────────────

/** A 44px round hit target holding one icon (back / search / close). */
export function IconButton({
  icon,
  label,
  onPress,
  size = 20,
  bg,
}: {
  icon: IconName;
  label: string;
  onPress: () => void;
  size?: number;
  bg?: string;
}): React.ReactElement {
  return (
    <Tappable
      onPress={onPress}
      tone="icon"
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{ width: tokens.touchTargetMin, height: tokens.touchTargetMin, borderRadius: tokens.touchTargetMin / 2, alignItems: "center", justifyContent: "center", backgroundColor: bg }}
    >
      <Icon name={icon} size={size} color={tokens.color.ink} />
    </Tappable>
  );
}

/** The star the handoff draws: highlight fill, star-stroke outline. */
export function Star({ size = 12 }: { size?: number }): React.ReactElement {
  return <Icon name="star" size={size} color={tokens.color.starStroke} fill={tokens.color.highlight} />;
}

function Pill({ bg, ink, text, size, pos }: { bg: string; ink: string; text: string; size: number; pos: ViewStyle }): React.ReactElement {
  return (
    <View style={{ position: "absolute", borderRadius: tokens.radius.pill, backgroundColor: bg, paddingHorizontal: 8, paddingVertical: 3, ...pos }}>
      <Text numberOfLines={1} style={{ fontSize: size, fontWeight: tokens.font.weight.bold, color: ink, ...TABULAR }}>
        {text}
      </Text>
    </View>
  );
}

/**
 * A venue/item image: the photo, or the kind tint + initial. `dim` is the closed / out-of-stock
 * treatment (the handoff's grayscale is not available on the old architecture — D-57 §4).
 */
export function VenueImage({
  photoUrl,
  name,
  kind,
  dim = false,
  disc = 0,
  initialSize = 30,
  style,
  priority,
  fallbackUrl,
  children,
}: {
  photoUrl: string | null;
  name: string;
  kind: string | null;
  dim?: boolean;
  /** >0 draws the initial on a white disc of this size (full cards: 76). */
  disc?: number;
  initialSize?: number;
  style: ViewStyle;
  /** P11: "low" for a catalogue row past the first screen (see `photoPriority`). */
  priority?: "low" | "normal";
  /** D7 review: the full photo, tried if `photoUrl` (a thumbnail) fails to load. */
  fallbackUrl?: string | null;
  children?: React.ReactNode;
}): React.ReactElement {
  const [failed, setFailed] = useState(false);
  const photo = !!photoUrl && !failed;
  const tint = kindTint(kind);
  return (
    <View style={{ overflow: "hidden", alignItems: "center", justifyContent: "center", backgroundColor: photo ? tokens.color.surface : tint.bg, ...style }}>
      <View style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, alignItems: "center", justifyContent: "center", opacity: dim ? 0.5 : 1 }}>
        {photo ? (
          <RemoteImage
            source={{ uri: photoUrl! }}
            onError={() => setFailed(true)}
            accessibilityElementsHidden
            importantForAccessibility="no"
            priority={priority}
            fallbackUri={fallbackUrl}
            style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
          />
        ) : disc > 0 ? (
          <View style={{ width: disc, height: disc, borderRadius: disc / 2, backgroundColor: tokens.color.bg, alignItems: "center", justifyContent: "center" }}>
            <Text style={{ fontSize: 34, fontWeight: tokens.font.weight.bold, color: tint.ink }}>{initial(name)}</Text>
          </View>
        ) : (
          <Text style={{ fontSize: initialSize, fontWeight: tokens.font.weight.bold, color: tint.ink }}>{initial(name)}</Text>
        )}
      </View>
      {kind && kind !== "Pharmacy" && !photo ? <Pill bg={tokens.color.bg} ink={tint.ink} text={kind} size={10.5} pos={{ left: 6, bottom: 6 }} /> : null}
      {children}
    </View>
  );
}

// ── List header ────────────────────────────────────────────────────────────────────────────────

/** The address control Home draws (Calm Mint v2 H1), shared so both read the same slot. */
function AddressControl({ address, noAddress, onPress }: { address: string; noAddress: boolean; onPress: () => void }): React.ReactElement {
  return (
    <Tappable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={noAddress ? B.list.setLoc : `${B.list.delivering}: ${address}. Change`}
      style={{ flex: 1, minWidth: 0, minHeight: tokens.touchTargetMin, justifyContent: "center" }}
    >
      <Text style={{ fontSize: 11, fontWeight: tokens.font.weight.semibold, letterSpacing: 0.2, color: tokens.color.muted }}>
        {noAddress ? B.list.noAddr : B.list.delivering}
      </Text>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
        <Icon name="map-pin" size={16} color={noAddress ? tokens.color.danger : tokens.color.accent} />
        <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: 15, fontWeight: tokens.font.weight.bold, color: noAddress ? tokens.color.dangerInk : tokens.color.ink }}>
          {noAddress ? B.list.setLoc : address}
        </Text>
        <Icon name="chevron-down" size={16} color={tokens.color.ink} />
      </View>
    </Tappable>
  );
}

export function ServiceSticker({ service, size = 40, art = 32 }: { service: BrowseService; size?: number; art?: number }): React.ReactElement {
  const Art = SERVICE_ART[service];
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no"
      style={{ width: size, height: size, borderRadius: 12, backgroundColor: SERVICE_TILE[service], alignItems: "center", justifyContent: "center" }}
    >
      <Art width={art} />
    </View>
  );
}

/** Calm Mint's three decorative circles, placed against the drawn header (status bar included). */
export function HeaderCircles({ narrow, dy }: { narrow: boolean; dy: number }): React.ReactElement {
  const circle = (size: number, color: string, pos: ViewStyle): React.ReactElement => (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no"
      pointerEvents="none"
      style={{ position: "absolute", width: size, height: size, borderRadius: size / 2, backgroundColor: color, ...pos }}
    />
  );
  return (
    <>
      {circle(150, tokens.color.highlight, { right: -62, top: -58 + dy })}
      {circle(26, tokens.color.coral, narrow ? { right: 40, top: 104 + dy } : { right: 70, top: 100 + dy })}
      {circle(14, tokens.color.sky, narrow ? { right: 18, top: 126 + dy } : { right: 32, top: 124 + dy })}
    </>
  );
}

/** README §4 "List header": mint, bottom radius 28, back + address, sticker + title, search 48. */
export function ListHeader({
  service,
  narrow,
  address,
  noAddress,
  onBack,
  onAddress,
  onSearch,
}: {
  service: BrowseService;
  narrow: boolean;
  address: string;
  noAddress: boolean;
  onBack: () => void;
  onAddress: () => void;
  onSearch: () => void;
}): React.ReactElement {
  const insets = useSafeAreaInsets();
  const s = B.svc[service];
  const placeholder = narrow ? s.search320 : s.search;
  return (
    <View style={{ backgroundColor: tokens.color.accentWash, borderBottomLeftRadius: 28, borderBottomRightRadius: 28, paddingTop: insets.top, paddingBottom: 16, overflow: "hidden" }}>
      <HeaderCircles narrow={narrow} dy={insets.top - 28} />
      <View style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingTop: 4, paddingLeft: 6, paddingRight: 16 }}>
        <IconButton icon="chevron-left" size={22} label="Back" onPress={onBack} />
        <AddressControl address={address} noAddress={noAddress} onPress={onAddress} />
      </View>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, paddingTop: 6, paddingHorizontal: 16, paddingBottom: 12 }}>
        <ServiceSticker service={service} />
        <Text accessibilityRole="header" numberOfLines={1} style={{ flexShrink: 1, fontSize: 26, lineHeight: 30, letterSpacing: -0.6, fontWeight: tokens.font.weight.bold, color: tokens.color.ink }}>
          {s.title}
        </Text>
      </View>
      <Tappable
        onPress={onSearch}
        accessibilityRole="search"
        accessibilityLabel={placeholder}
        style={{ marginHorizontal: 16, minHeight: 48, borderRadius: tokens.radius.input, backgroundColor: tokens.color.bg, flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 14 }}
      >
        <Icon name="search" size={18} color={tokens.color.muted} />
        <Text numberOfLines={1} style={{ flex: 1, fontSize: 14, color: tokens.color.muted }}>
          {placeholder}
        </Text>
      </Tappable>
    </View>
  );
}

/** README §4 "Collapsed list bar": white, 56 high, hairline bottom — back · title · search. */
export function CompactBar({ title, onBack, onSearch, searchLabel }: { title: string; onBack: () => void; onSearch?: () => void; searchLabel?: string }): React.ReactElement {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ backgroundColor: tokens.color.bg, paddingTop: insets.top }}>
      <View style={{ minHeight: 56, flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 6, borderBottomWidth: 1, borderBottomColor: tokens.color.line }}>
        <IconButton icon="chevron-left" size={22} label="Back" onPress={onBack} />
        <Text accessibilityRole="header" numberOfLines={1} style={{ flex: 1, minWidth: 0, fontSize: 17, fontWeight: tokens.font.weight.bold, color: tokens.color.ink }}>
          {title}
        </Text>
        {onSearch ? <IconButton icon="search" label={searchLabel ?? "Search"} onPress={onSearch} /> : null}
      </View>
    </View>
  );
}

// ── Filter bar, heading, groups ────────────────────────────────────────────────────────────────

/** README §4b "Filter bar": the Sort pill (category-prefixed) and the Free delivery toggle. */
export function FilterBar({
  sortLabel,
  category,
  sortActive,
  showFree,
  free,
  onSort,
  onFree,
}: {
  sortLabel: string;
  category: string | null;
  sortActive: boolean;
  showFree: boolean;
  free: boolean;
  onSort: () => void;
  onFree: () => void;
}): React.ReactElement {
  const on = sortActive || category != null;
  const label = `${category ? `${category} · ` : ""}${fmt(B.list.sortBy, { s: sortLabel })}`;
  return (
    <View style={{ flexDirection: "row", gap: 8, paddingTop: 12, paddingHorizontal: 16, backgroundColor: tokens.color.bg }}>
      <Tappable onPress={onSort} accessibilityRole="button" accessibilityLabel={label} style={{ minHeight: tokens.touchTargetMin, justifyContent: "center", flexShrink: 1 }}>
        <View style={{ minHeight: 36, flexDirection: "row", alignItems: "center", gap: 6, paddingLeft: 14, paddingRight: 12, borderRadius: tokens.radius.pill, backgroundColor: on ? tokens.color.accentWash : tokens.color.surface }}>
          <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: 13, fontWeight: tokens.font.weight.semibold, color: on ? tokens.color.accentText : tokens.color.ink }}>
            {label}
          </Text>
          <Icon name="chevron-down" size={16} color={on ? tokens.color.accentText : tokens.color.ink} />
        </View>
      </Tappable>
      {showFree ? (
        <Tappable
          onPress={onFree}
          accessibilityRole="button"
          accessibilityState={{ selected: free }}
          accessibilityLabel={B.list.free}
          style={{ minHeight: tokens.touchTargetMin, justifyContent: "center" }}
        >
          <View style={{ minHeight: 36, flexDirection: "row", alignItems: "center", gap: 6, paddingLeft: 14, paddingRight: 12, borderRadius: tokens.radius.pill, backgroundColor: free ? tokens.color.riderWash : tokens.color.surface }}>
            {free ? <Icon name="check" size={14} color={tokens.color.free} /> : null}
            <Text style={{ fontSize: 13, fontWeight: tokens.font.weight.semibold, color: tokens.color.free }}>{B.list.free}</Text>
          </View>
        </Tappable>
      ) : null}
    </View>
  );
}

/** "6 places" 20/700 with "25–45 min" on the right. */
export function ListHeading({ count, range }: { count: string; range: string | null }): React.ReactElement {
  return (
    <View style={{ flexDirection: "row", alignItems: "baseline", justifyContent: "space-between", gap: 8, paddingTop: 16, paddingHorizontal: 16, paddingBottom: 4 }}>
      <Text accessibilityRole="header" numberOfLines={1} style={{ fontSize: 20, fontWeight: tokens.font.weight.bold, letterSpacing: -0.4, color: tokens.color.ink, ...TABULAR }}>
        {count}
      </Text>
      {range ? (
        <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: 13, color: tokens.color.muted, ...TABULAR }}>
          {range}
        </Text>
      ) : null}
    </View>
  );
}

export function ClosedGroupHeader(): React.ReactElement {
  return (
    <View style={{ paddingTop: 24, paddingBottom: 6 }}>
      <Text accessibilityRole="header" style={{ fontSize: 20, fontWeight: tokens.font.weight.bold, letterSpacing: -0.4, color: tokens.color.ink }}>
        {B.list.closedNow}
      </Text>
      <Text style={{ marginTop: 2, fontSize: 13, color: tokens.color.muted }}>{B.list.closedSub}</Text>
    </View>
  );
}

// ── Venue cards ────────────────────────────────────────────────────────────────────────────────

/** The fee words: "$1.50 delivery", or bold purple "Free delivery". */
function FeeText({ v }: { v: VenueView }): React.ReactElement | null {
  if (v.freeDelivery) return <Text style={{ fontSize: 13, fontWeight: tokens.font.weight.bold, color: tokens.color.free }}>{B.list.free}</Text>;
  if (v.feeUsd == null) return null;
  return <Text style={{ fontSize: 13, color: tokens.color.muted, ...TABULAR }}>{`${formatMoney(v.feeUsd)} ${B.store.delivery}`}</Text>;
}

/** bike · fee · km — absent without a location (no numbers we can't stand behind). */
function DeliveryMeta({ v }: { v: VenueView }): React.ReactElement | null {
  if (v.km == null) return null;
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 3, overflow: "hidden" }}>
      <Icon name="bike" size={14} color={tokens.color.muted} />
      <FeeText v={v} />
      <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: 13, color: tokens.color.muted, ...TABULAR }}>
        {` · ${v.km.toFixed(1)} km`}
      </Text>
    </View>
  );
}

function etaText(v: VenueView): string | null {
  return v.etaLow != null && v.etaHigh != null ? `${fmt(B.list.range, { a: v.etaLow, b: v.etaHigh })}` : null;
}

function a11yFor(v: VenueView): string {
  const parts = [v.name];
  if (!v.open) parts.push(opensLabel(v.opens) ?? B.list.closedNow);
  else if (v.closesInMin != null) parts.push(fmt(B.list.closesIn, { m: v.closesInMin }));
  return parts.join(", ");
}

/** README §4b "Full card": 16:9 image radius 16, name + rating badge, sub, delivery meta. */
export function VenueCardFull({ v, onPress }: { v: VenueView; onPress: () => void }): React.ReactElement {
  const eta = etaText(v);
  return (
    <Tappable onPress={onPress} accessibilityRole="button" accessibilityLabel={a11yFor(v)} style={{ paddingTop: 10, paddingBottom: 18 }}>
      <VenueImage photoUrl={v.photoUrl} name={v.name} kind={v.kind} dim={!v.open} disc={76} style={{ aspectRatio: 16 / 9, borderRadius: 16 }}>
        {!v.open ? (
          <Pill bg={tokens.color.bg} ink={tokens.color.ink} text={opensLabel(v.opens) ?? B.list.closedNow} size={11} pos={{ right: 6, bottom: 6 }} />
        ) : eta ? (
          <Pill bg={tokens.color.bg} ink={tokens.color.ink} text={eta} size={11} pos={{ right: 6, bottom: 6 }} />
        ) : null}
        {v.open && v.closesInMin != null ? (
          <Pill bg={tokens.color.highlight} ink={tokens.color.highlightChipInk} text={fmt(B.list.closesIn, { m: v.closesInMin })} size={11} pos={{ left: 6, bottom: 6 }} />
        ) : null}
        {v.open && v.freeDelivery && v.km != null ? (
          <View style={{ position: "absolute", left: 6, top: 6, borderRadius: tokens.radius.pill, backgroundColor: tokens.color.free, paddingHorizontal: 8, paddingVertical: 4 }}>
            <Text style={{ fontSize: 10.5, fontWeight: tokens.font.weight.bold, color: tokens.color.onAccent }}>{B.list.free}</Text>
          </View>
        ) : null}
      </VenueImage>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12 }}>
        <Text numberOfLines={1} style={{ flex: 1, minWidth: 0, fontSize: 17, lineHeight: 21, letterSpacing: -0.2, fontWeight: tokens.font.weight.bold, color: tokens.color.ink }}>
          {v.name}
        </Text>
        {v.rating != null ? (
          <View style={{ flexDirection: "row", alignItems: "center", gap: 4, borderRadius: tokens.radius.pill, backgroundColor: tokens.color.surface, paddingLeft: 7, paddingRight: 9, paddingVertical: 4 }}>
            <Star size={13} />
            <Text style={{ fontSize: 12.5, fontWeight: tokens.font.weight.bold, color: tokens.color.ink, ...TABULAR }}>
              {v.rating.toFixed(1)}
              <Text style={{ fontWeight: tokens.font.weight.regular, color: tokens.color.muted }}>{` (${v.ratingCount})`}</Text>
            </Text>
          </View>
        ) : (
          <View style={{ borderRadius: tokens.radius.pill, backgroundColor: tokens.color.accentWash, paddingHorizontal: 9, paddingVertical: 4 }}>
            <Text style={{ fontSize: 12.5, fontWeight: tokens.font.weight.bold, color: tokens.color.accentText }}>{B.list.isNew}</Text>
          </View>
        )}
      </View>
      {v.sub ? (
        <Text numberOfLines={1} style={{ marginTop: 3, fontSize: 13, color: tokens.color.muted }}>
          {v.sub}
        </Text>
      ) : null}
      <DeliveryMeta v={v} />
    </Tappable>
  );
}

/** README §4b "Compact row": 104 thumb radius 16, three fixed single lines, never wraps. */
export function VenueRow({ v, onPress }: { v: VenueView; onPress: () => void }): React.ReactElement {
  const eta = etaText(v);
  const what = v.categories.join(" · ") || v.sub;
  return (
    <Tappable onPress={onPress} accessibilityRole="button" accessibilityLabel={a11yFor(v)} style={{ flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 10 }}>
      <VenueImage photoUrl={v.thumbUrl ?? v.photoUrl} fallbackUrl={v.photoUrl} name={v.name} kind={v.kind} dim={!v.open} initialSize={28} style={{ width: 104, height: 104, borderRadius: 16 }}>
        {v.open && eta ? <Pill bg={tokens.color.bg} ink={tokens.color.ink} text={eta} size={10.5} pos={{ right: 6, bottom: 6 }} /> : null}
        {v.open && v.closesInMin != null ? (
          <Pill bg={tokens.color.highlight} ink={tokens.color.highlightChipInk} text={fmt(B.list.closesIn, { m: v.closesInMin })} size={10} pos={{ left: 6, bottom: 6 }} />
        ) : null}
      </VenueImage>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={1} style={{ fontSize: 16, lineHeight: 20, letterSpacing: -0.2, fontWeight: tokens.font.weight.bold, color: tokens.color.ink }}>
          {v.name}
        </Text>
        {!v.open ? (
          <>
            <Text numberOfLines={1} style={{ marginTop: 3, fontSize: 13, fontWeight: tokens.font.weight.semibold, color: tokens.color.ink, ...TABULAR }}>
              {opensLabel(v.opens) ?? B.list.closedNow}
            </Text>
            <Text numberOfLines={1} style={{ marginTop: 3, fontSize: 13, color: tokens.color.muted }}>
              {what}
            </Text>
          </>
        ) : (
          <>
            <View style={{ flexDirection: "row", alignItems: "center", gap: 4, marginTop: 3, overflow: "hidden" }}>
              {v.rating != null ? (
                <>
                  <Star size={12} />
                  <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: 13, color: tokens.color.muted, ...TABULAR }}>
                    <Text style={{ fontWeight: tokens.font.weight.semibold, color: tokens.color.ink }}>{v.rating.toFixed(1)}</Text>
                    {` (${v.ratingCount}) · ${what}`}
                  </Text>
                </>
              ) : (
                <Text numberOfLines={1} style={{ flexShrink: 1, fontSize: 13, color: tokens.color.muted }}>
                  <Text style={{ fontWeight: tokens.font.weight.bold, color: tokens.color.accentText }}>{B.list.isNew}</Text>
                  {` · ${what}`}
                </Text>
              )}
            </View>
            <DeliveryMeta v={v} />
          </>
        )}
      </View>
    </Tappable>
  );
}

// ── States ─────────────────────────────────────────────────────────────────────────────────────

/** A pill button: primary (cta fill, 52) or ghost (bordered, 48) or text (44). */
export function BrowseButton({
  label,
  onPress,
  variant = "primary",
  icon,
  disabled = false,
  compact = false,
}: {
  label: string;
  onPress: () => void;
  variant?: "primary" | "ghost" | "text" | "muted";
  icon?: IconName;
  disabled?: boolean;
  /** The no-location card's inline 44px button. */
  compact?: boolean;
}): React.ReactElement {
  const ink = variant === "primary" ? tokens.color.onAccent : variant === "muted" ? tokens.color.muted : tokens.color.accentText;
  const height = compact ? 44 : variant === "primary" || variant === "muted" ? tokens.touchTargetPrimary : variant === "ghost" ? 48 : 44;
  return (
    <Tappable
      onPress={onPress}
      disabled={disabled}
      tone={variant === "primary" ? "onDark" : "row"}
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      accessibilityLabel={label}
      style={{
        minHeight: height,
        borderRadius: tokens.radius.pill,
        backgroundColor: variant === "primary" ? tokens.color.cta : variant === "muted" ? tokens.color.surface : "transparent",
        borderWidth: variant === "ghost" ? 1 : 0,
        borderColor: tokens.color.line,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: 8,
        paddingHorizontal: 16,
        alignSelf: compact ? "flex-start" : "stretch",
      }}
    >
      {icon ? <Icon name={icon} size={compact ? 16 : 18} color={ink} /> : null}
      <Text style={{ fontSize: compact ? 14 : 16, fontWeight: tokens.font.weight.semibold, color: ink, textAlign: "center" }}>{label}</Text>
    </Tappable>
  );
}

// ── Empty states (handoff empty-states-v2-2026-10, ledger D-78) ─────────────────────────────────

/** The gap above the mark when an empty state sits under a list's header in content-sized space. */
export const LIST_EMPTY_TOP = 48;
/** S13c: the mark sits 120 below the storefront's info, as drawn. */
export const STORE_EMPTY_TOP = 120;

/**
 * B9 — nothing delivers here. The handoff draws Restaurants; Shops and Pharmacy take the same lines with
 * their own noun (ledger D-78 §3).
 */
const NONE_IN_AREA: Record<BrowseService, { icon: IconName; title: string; body: string }> = {
  food: { icon: "utensils", title: emptyCopy.browse.noneInArea.title, body: emptyCopy.browse.noneInArea.body },
  shops: { icon: "store", title: "No shops in {area} yet", body: "We’re adding shops near you." },
  pharmacy: { icon: "pill", title: "No pharmacies in {area} yet", body: "We’re adding pharmacies near you." },
};

export function ServiceEmpty({ service, area, onChangeAddress }: { service: BrowseService; area: string; onChangeAddress: () => void }): React.ReactElement {
  const n = NONE_IN_AREA[service];
  return (
    <EmptyState
      icon={n.icon}
      title={fillEmpty(n.title, { area })}
      body={n.body}
      primary={{ label: emptyCopy.browse.noneInArea.primary, icon: "map-pin", onPress: onChangeAddress }}
    />
  );
}

/** B7 — no address, list has results: one bordered row, "Set" asks for the phone's location. */
export function NoAddressRow({ onSet }: { onSet: () => void }): React.ReactElement {
  const e = emptyCopy.browse.noAddressRow;
  return (
    <EmptyRow
      icon="map-pin"
      text={e.text}
      action={{ label: e.action, onPress: onSet }}
      style={{ marginHorizontal: 16, marginTop: 4, paddingBottom: 4, borderBottomWidth: 1, borderBottomColor: tokens.color.line }}
    />
  );
}

/** X4b and the list's offline line: a 16px wifi-off, no box (gap 8). */
export function OfflineRow({ text }: { text: string }): React.ReactElement {
  return <EmptyRow icon="wifi-off" iconSize={16} gap={8} text={text} style={{ marginHorizontal: 16, marginTop: 10 }} />;
}

/** README §4 "Offline banner": surface, radius 12, wifi-off 16, 12.5 muted. */
export function OfflineNote({ text }: { text: string }): React.ReactElement {
  return (
    <View accessibilityRole="alert" style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 10, marginHorizontal: 16, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, backgroundColor: tokens.color.surface }}>
      <Icon name="wifi-off" size={16} color={tokens.color.muted} />
      <Text style={{ flex: 1, fontSize: 12.5, color: tokens.color.muted }}>{text}</Text>
    </View>
  );
}

export function Bone({ w, h, r = 12, style }: { w: number | `${number}%`; h: number; r?: number; style?: ViewStyle }): React.ReactElement {
  return <View style={{ width: w, height: h, borderRadius: r, backgroundColor: SKELETON, ...style }} />;
}

/** Skeleton compact rows (B8, B12a). */
export function RowSkeletons({ count }: { count: number }): React.ReactElement {
  return (
    <View accessibilityLabel="Loading" accessibilityState={{ busy: true }}>
      {Array.from({ length: count }, (_, k) => (
        <View key={k} style={{ flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 10 }}>
          <Bone w={104} h={104} r={16} />
          <View style={{ flex: 1 }}>
            <Bone w="70%" h={13} />
            <Bone w="50%" h={10} style={{ marginTop: 8 }} />
            <Bone w="60%" h={10} style={{ marginTop: 6 }} />
          </View>
        </View>
      ))}
    </View>
  );
}

/** B8 — first load: the real header stays; pills, one full card and two rows are skeletons. */
export function ListSkeleton(): React.ReactElement {
  return (
    <View accessibilityLabel="Loading" accessibilityState={{ busy: true }}>
      <View style={{ flexDirection: "row", gap: 8, paddingTop: 12, paddingHorizontal: 16 }}>
        <Bone w={150} h={36} r={tokens.radius.pill} style={{ marginVertical: 4 }} />
        <Bone w={110} h={36} r={tokens.radius.pill} style={{ marginVertical: 4 }} />
      </View>
      <View style={{ paddingHorizontal: 16, paddingTop: 12 }}>
        <View style={{ paddingTop: 10, paddingBottom: 18 }}>
          <View style={{ aspectRatio: 16 / 9, borderRadius: 16, backgroundColor: SKELETON }} />
          <Bone w="60%" h={14} style={{ marginTop: 12 }} />
          <Bone w="40%" h={10} style={{ marginTop: 8 }} />
        </View>
        <RowSkeletons count={2} />
      </View>
    </View>
  );
}
