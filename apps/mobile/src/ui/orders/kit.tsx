import { tokens } from "@lynia/shared/tokens";
import React from "react";
import { ScrollView, Text, TextInput, useWindowDimensions, View, type TextStyle, type ViewStyle } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { PharmacyStickerV2, RestaurantsSticker, SendStickerV2, ShopsSticker } from "../art/stickers";
import { ArcSpinner } from "../ArcSpinner";
import { Icon, type IconName } from "../Icon";
import { Tappable } from "../Tappable";
import { ordersCopy as C, OX } from "./copy";
import { NOW_SEGMENTS, type HistoryRowVM, type NowCardVM, type OrdersFilter, type OrdersService, type Outcome } from "./model";

/**
 * The Orders v2 kit (packages/design/handoff/orders-v2, README §4; ledger D-63). Every measurement is the
 * handoff's `o-kit.js`. Calm Mint v2 tokens only and ZERO shadows: separation is tint + hairline (README
 * §1 "Depth"); the forest card is the one solid exception. Values the handoff draws as literals and no
 * token names live here as named constants.
 */
const SKELETON = "#EEF1F3";
const ON_FOREST_PILL = "rgba(255,255,255,0.14)";
const ON_FOREST_SEG_OFF = "rgba(255,255,255,0.22)";
const tab = { fontVariant: ["tabular-nums"] as TextStyle["fontVariant"] };

/** Titles and item lines clamp to one line at font scale 1 and two above it (README §4 "History row"). */
function useClamp(): number {
  return useWindowDimensions().fontScale > 1 ? 2 : 1;
}

// ── Header ──────────────────────────────────────────────────────────────────────────────────────

function Circle({ size, color, pos }: { size: number; color: string; pos: ViewStyle }): React.ReactElement {
  return (
    <View
      accessibilityElementsHidden
      importantForAccessibility="no"
      pointerEvents="none"
      style={{ position: "absolute", width: size, height: size, borderRadius: size / 2, backgroundColor: color, ...pos }}
    />
  );
}

/** Mint header (Calm Mint v2): "Your orders" 24/700 + bell, then the search slot. Scrolls with the list. */
export function OrdersHeader({
  narrow,
  unread,
  onBell,
  children,
}: {
  narrow: boolean;
  unread: boolean;
  onBell: () => void;
  /** The search field, or nothing (empty / offline-nothing / error states hide it). */
  children?: React.ReactNode;
}): React.ReactElement {
  const top = useSafeAreaInsets().top;
  // The circles are placed against the DRAWN header (28px status bar); shift by the real inset's difference.
  const dy = top - 28;
  return (
    <View style={{ backgroundColor: tokens.color.accentWash, borderBottomLeftRadius: 28, borderBottomRightRadius: 28, paddingTop: top, paddingBottom: 18, overflow: "hidden" }}>
      <Circle size={150} color={tokens.color.highlight} pos={{ right: -62, top: -58 + dy }} />
      <Circle size={26} color={tokens.color.coral} pos={narrow ? { right: 14, top: 100 + dy } : { right: 78, top: 64 + dy }} />
      <Circle size={14} color={tokens.color.sky} pos={narrow ? { right: 50, top: 128 + dy } : { right: 30, top: 112 + dy }} />
      <View style={{ flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, paddingTop: 10, paddingHorizontal: 16 }}>
        <Text accessibilityRole="header" style={{ flex: 1, fontSize: 24, lineHeight: 27.6, letterSpacing: -0.4, fontWeight: tokens.font.weight.bold, color: tokens.color.ink }}>
          {C.title}
        </Text>
        <Tappable
          onPress={onBell}
          tone="icon"
          accessibilityRole="button"
          accessibilityLabel={unread ? "Notifications, unread" : "Notifications"}
          style={{ width: 44, height: 44, borderRadius: 22, backgroundColor: tokens.color.bg, alignItems: "center", justifyContent: "center" }}
        >
          <Icon name="bell" size={20} color={tokens.color.accentText} />
          {unread ? (
            <View style={{ position: "absolute", top: 8, right: 9, width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: tokens.color.bg, backgroundColor: tokens.color.highlight }} />
          ) : null}
        </Tappable>
      </View>
      {children}
    </View>
  );
}

/** Idle search field (48, white, r12). With a query (O10d, keyboard down) it shows the query + Clear. */
export function SearchField({ query, dim, onPress, onClear }: { query: string; dim?: boolean; onPress: () => void; onClear: () => void }): React.ReactElement {
  const has = query.length > 0;
  return (
    <Tappable
      onPress={onPress}
      accessibilityRole="search"
      accessibilityLabel={has ? `${C.search}: ${query}` : C.search}
      style={{
        marginTop: 14,
        marginHorizontal: 16,
        height: 48,
        borderRadius: tokens.radius.input,
        backgroundColor: tokens.color.bg,
        borderWidth: has ? 2 : 0,
        borderColor: tokens.color.accent,
        flexDirection: "row",
        alignItems: "center",
        gap: 10,
        paddingLeft: has ? 12 : 14,
        paddingRight: 4,
        opacity: dim ? 0.6 : 1,
      }}
    >
      <Icon name="search" size={18} color={has ? tokens.color.ink : tokens.color.muted} />
      <Text numberOfLines={1} style={{ flex: 1, fontSize: 14, color: has ? tokens.color.ink : tokens.color.muted }}>
        {has ? query : C.search}
      </Text>
      {has ? <ClearButton onPress={onClear} /> : null}
    </Tappable>
  );
}

function ClearButton({ onPress }: { onPress: () => void }): React.ReactElement {
  return (
    <Tappable
      onPress={onPress}
      tone="icon"
      accessibilityRole="button"
      accessibilityLabel={C.clear}
      style={{ minWidth: 44, height: 44, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4 }}
    >
      <Icon name="x" size={16} color={tokens.color.muted} />
      <Text style={{ fontSize: 13, fontWeight: tokens.font.weight.semibold, color: tokens.color.muted }}>{C.clear}</Text>
    </Tappable>
  );
}

/** The focused search header (O10a–c, O11): mint, no circles, the field + "Cancel"; the title is hidden. */
export function SearchBar({
  value,
  onChange,
  onCancel,
}: {
  value: string;
  onChange: (q: string) => void;
  onCancel: () => void;
}): React.ReactElement {
  const top = useSafeAreaInsets().top;
  return (
    <View style={{ backgroundColor: tokens.color.accentWash, borderBottomLeftRadius: 28, borderBottomRightRadius: 28, paddingTop: top + 6, paddingBottom: 12 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 4, paddingLeft: 16, paddingRight: 8 }}>
        <View
          style={{
            flex: 1,
            height: 48,
            borderRadius: tokens.radius.input,
            backgroundColor: tokens.color.bg,
            borderWidth: 2,
            borderColor: tokens.color.accent,
            flexDirection: "row",
            alignItems: "center",
            gap: 10,
            paddingLeft: 12,
            paddingRight: 4,
          }}
        >
          <Icon name="search" size={18} color={tokens.color.ink} />
          <TextInput
            autoFocus
            value={value}
            onChangeText={onChange}
            placeholder={C.search}
            placeholderTextColor={tokens.color.muted}
            selectionColor={tokens.color.accent}
            returnKeyType="search"
            autoCorrect={false}
            accessibilityLabel={C.search}
            style={{ flex: 1, fontSize: 14, color: tokens.color.ink, paddingVertical: 0 }}
          />
          {value.length > 0 ? <ClearButton onPress={() => onChange("")} /> : null}
        </View>
        <Tappable
          onPress={onCancel}
          accessibilityRole="button"
          accessibilityLabel={C.cancel}
          style={{ minWidth: 64, height: 44, alignItems: "center", justifyContent: "center" }}
        >
          <Text style={{ fontSize: 14, fontWeight: tokens.font.weight.semibold, color: tokens.color.accentText }}>{C.cancel}</Text>
        </Tappable>
      </View>
    </View>
  );
}

// ── Now ─────────────────────────────────────────────────────────────────────────────────────────

/** Section label: "NOW" (+ " · 3" and the helper when 2+), or a search-results count. */
export function SectionLabel({ text, helper }: { text: string; helper?: string | null }): React.ReactElement {
  return (
    <View style={{ flexDirection: "row", alignItems: "baseline", gap: 8, paddingTop: 20, paddingHorizontal: 16, paddingBottom: 8 }}>
      <Text style={{ fontSize: 12, fontWeight: tokens.font.weight.semibold, letterSpacing: 0.4, color: tokens.color.muted }}>{text}</Text>
      {helper ? <Text style={{ marginLeft: "auto", fontSize: 12.5, color: tokens.color.muted }}>{helper}</Text> : null}
    </View>
  );
}

function Segments({ lit }: { lit: number }): React.ReactElement {
  return (
    <View style={{ flexDirection: "row", gap: 3, marginTop: 8, maxWidth: 150 }}>
      {Array.from({ length: NOW_SEGMENTS }, (_, k) => (
        <View key={k} style={{ flex: 1, height: 3, borderRadius: 2, backgroundColor: k < lit ? tokens.color.accent : ON_FOREST_SEG_OFF }} />
      ))}
    </View>
  );
}

function EtaChip({ minutes, small }: { minutes: number; small?: boolean }): React.ReactElement {
  return (
    <View style={{ borderRadius: tokens.radius.pill, backgroundColor: tokens.color.highlight, paddingHorizontal: small ? 9 : 10, paddingVertical: small ? 5 : 6 }}>
      <Text style={{ fontSize: small ? 12 : 13, fontWeight: tokens.font.weight.bold, color: tokens.color.highlightChipInk, ...tab }}>{OX.eta(minutes)}</Text>
    </View>
  );
}

/** Now card (README §4): forest r18, 40 brand disc, 15/700 title, 12.5 sub, the track, ETA chip or quiet pill. */
export function NowCard({ v, onPress }: { v: NowCardVM; onPress: () => void }): React.ReactElement {
  return (
    <Tappable
      onPress={onPress}
      tone="onDark"
      accessibilityRole="button"
      accessibilityLabel={`${v.title}. ${v.sub}${v.etaMinutes != null ? `. ${OX.eta(v.etaMinutes)}` : v.pill ? `. ${v.pill}` : ""}`}
      style={{ backgroundColor: tokens.color.forest, borderRadius: 18, padding: 12, minHeight: 72, flexDirection: "row", alignItems: "center", gap: 12 }}
    >
      <View style={{ width: 40, height: 40, borderRadius: 20, backgroundColor: tokens.color.accent, alignItems: "center", justifyContent: "center" }}>
        <Icon name={v.icon} size={20} color={tokens.color.onAccent} />
      </View>
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text numberOfLines={2} style={{ fontSize: 15, lineHeight: 18.75, fontWeight: tokens.font.weight.bold, color: tokens.color.onAccent }}>
          {v.title}
        </Text>
        <Text numberOfLines={1} style={{ marginTop: 2, fontSize: 12.5, lineHeight: 16.9, color: tokens.color.onForestMuted }}>
          {v.sub}
        </Text>
        <Segments lit={v.lit} />
      </View>
      {v.etaMinutes != null ? (
        <EtaChip minutes={v.etaMinutes} />
      ) : v.pill ? (
        <View style={{ borderRadius: tokens.radius.pill, backgroundColor: ON_FOREST_PILL, paddingHorizontal: 10, paddingVertical: 6 }}>
          <Text style={{ fontSize: 12, fontWeight: tokens.font.weight.semibold, color: tokens.color.onAccent, ...tab }}>{v.pill}</Text>
        </View>
      ) : null}
    </Tappable>
  );
}

/** The slim forest strip that keeps a running order visible while searching (README §4 "Now strip"). */
export function NowStrip({ v, onPress }: { v: NowCardVM; onPress: () => void }): React.ReactElement {
  return (
    <Tappable
      onPress={onPress}
      tone="onDark"
      accessibilityRole="button"
      accessibilityLabel={v.title}
      style={{ marginTop: 12, marginHorizontal: 16, backgroundColor: tokens.color.forest, borderRadius: 14, minHeight: 48, flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 6, paddingLeft: 12, paddingRight: 6 }}
    >
      <Icon name="bike" size={18} color={tokens.color.onForestMuted} />
      <Text numberOfLines={1} style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: tokens.font.weight.semibold, color: tokens.color.onAccent }}>
        {v.title}
      </Text>
      {v.etaMinutes != null ? <EtaChip minutes={v.etaMinutes} small /> : null}
    </Tappable>
  );
}

// ── Chips ───────────────────────────────────────────────────────────────────────────────────────

const CHIP_LABEL: Record<OrdersFilter, string> = {
  all: C.chips.all,
  send: C.chips.send,
  restaurants: C.chips.restaurants,
  shops: C.chips.shops,
  pharmacy: OX.pharmacyChip,
};

/** 44px chips; selected = mint fill + check + green text. The row scrolls sideways when it doesn't fit. */
export function ServiceChips({ services, value, onChange }: { services: OrdersService[]; value: OrdersFilter; onChange: (f: OrdersFilter) => void }): React.ReactElement {
  const ids: OrdersFilter[] = ["all", ...services];
  return (
    <View style={{ paddingTop: 16 }}>
      <ScrollRow>
        {ids.map((id) => {
          const on = id === value;
          return (
            <Tappable
              key={id}
              onPress={() => onChange(id)}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
              accessibilityLabel={CHIP_LABEL[id]}
              style={{
                height: 44,
                paddingHorizontal: 16,
                borderRadius: tokens.radius.pill,
                borderWidth: 1,
                borderColor: on ? tokens.color.accentWash : tokens.color.line,
                backgroundColor: on ? tokens.color.accentWash : "transparent",
                flexDirection: "row",
                alignItems: "center",
                gap: 6,
              }}
            >
              {on ? <Icon name="check" size={16} color={tokens.color.accentText} /> : null}
              <Text numberOfLines={1} style={{ fontSize: 14, fontWeight: tokens.font.weight.semibold, color: on ? tokens.color.accentText : tokens.color.ink }}>
                {CHIP_LABEL[id]}
              </Text>
            </Tappable>
          );
        })}
      </ScrollRow>
    </View>
  );
}

function ScrollRow({ children }: { children: React.ReactNode }): React.ReactElement {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8, paddingHorizontal: 16 }}>
      {children}
    </ScrollView>
  );
}

// ── History ─────────────────────────────────────────────────────────────────────────────────────

export function DayLabel({ label }: { label: string }): React.ReactElement {
  return (
    <Text accessibilityRole="header" style={{ paddingTop: 20, paddingHorizontal: 16, paddingBottom: 2, fontSize: 12, fontWeight: tokens.font.weight.semibold, letterSpacing: 0.4, color: tokens.color.muted }}>
      {label}
    </Text>
  );
}

const TINT: Record<OrdersService, string> = {
  send: tokens.color.tileSend,
  restaurants: tokens.color.tileFood,
  shops: tokens.color.tileShops,
  pharmacy: tokens.color.tilePharmacy,
};

const STICKER: Record<OrdersService, (p: { width: number }) => React.ReactElement> = {
  send: SendStickerV2,
  restaurants: RestaurantsSticker,
  shops: ShopsSticker,
  pharmacy: PharmacyStickerV2,
};

type Tone = "ok" | "neutral" | "bad";
const OUTCOME: Record<Outcome, { tone: Tone; icon: IconName }> = {
  delivered: { tone: "ok", icon: "check" },
  cancelledByYou: { tone: "neutral", icon: "ban" },
  cancelledByRider: { tone: "neutral", icon: "ban" },
  cancelledByLynia: { tone: "neutral", icon: "ban" },
  kitchenTimeout: { tone: "neutral", icon: "clock" },
  venueDeclined: { tone: "neutral", icon: "ban" },
  noRider: { tone: "neutral", icon: "bike" },
  notDelivered: { tone: "bad", icon: "triangle-alert" },
};
const TONE: Record<Tone, { bg: string; ink: string }> = {
  ok: { bg: tokens.color.accentWash, ink: tokens.color.accentText },
  neutral: { bg: tokens.color.surface, ink: tokens.color.muted },
  bad: { bg: tokens.color.dangerWash, ink: tokens.color.dangerInk },
};

function outcomeLabel(outcome: Outcome, service: OrdersService): string {
  if (outcome === "cancelledByLynia") return OX.cancelledByLynia;
  if (outcome === "venueDeclined") return service === "pharmacy" ? OX.venueDeclinedPharmacy : service === "shops" ? OX.venueDeclinedShop : OX.venueDeclinedFood;
  if (outcome === "kitchenTimeout") return service === "pharmacy" ? OX.pharmacyTimeout : service === "shops" ? C.outcome.shopTimeout : C.outcome.kitchenTimeout;
  return C.outcome[outcome];
}

export function OutcomeTag({ outcome, service }: { outcome: Outcome; service: OrdersService }): React.ReactElement {
  const o = OUTCOME[outcome];
  const t = TONE[o.tone];
  return (
    <View style={{ minHeight: 22, paddingHorizontal: 8, borderRadius: tokens.radius.pill, backgroundColor: t.bg, flexDirection: "row", alignItems: "center", gap: 4 }}>
      <Icon name={o.icon} size={12} color={t.ink} />
      <Text numberOfLines={1} style={{ fontSize: 12, fontWeight: tokens.font.weight.semibold, color: t.ink }}>
        {outcomeLabel(outcome, service)}
      </Text>
    </View>
  );
}

/** Filled stars only, once rated (owner 2026-10-02). */
export function Stars({ n }: { n: number }): React.ReactElement {
  const count = Math.max(0, Math.min(5, Math.round(n)));
  return (
    <View accessible accessibilityLabel={`${count} stars`} style={{ flexDirection: "row", gap: 1 }}>
      {Array.from({ length: count }, (_, k) => (
        <Icon key={k} name="star" size={12} color={tokens.color.starStroke} fill={tokens.color.highlight} />
      ))}
    </View>
  );
}

/** `text` with the first match of `q` marked (mint, green text, r4). */
function Marked({ text, q, style, lines }: { text: string; q: string; style: TextStyle; lines: number }): React.ReactElement {
  const i = q ? text.toLowerCase().indexOf(q.toLowerCase()) : -1;
  if (i < 0) {
    return (
      <Text numberOfLines={lines} style={style}>
        {text}
      </Text>
    );
  }
  return (
    <Text numberOfLines={lines} style={style}>
      {text.slice(0, i)}
      <Text style={{ backgroundColor: tokens.color.accentWash, color: tokens.color.accentText, borderRadius: 4 }}>{text.slice(i, i + q.length)}</Text>
      {text.slice(i + q.length)}
    </Text>
  );
}

/** History row (README §4): sticker disc · title · items · outcome + rider + stars | amount over time. */
export function HistoryRow({ r, when, q = "", last, onPress }: { r: HistoryRowVM; when: string; q?: string; last: boolean; onPress: () => void }): React.ReactElement {
  const lines = useClamp();
  const Art = STICKER[r.service];
  const amount = r.chargedUsd > 0 ? `$${r.chargedUsd.toFixed(2)}` : C.noCharge;
  return (
    <Tappable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={`${r.title}. ${r.items}. ${outcomeLabel(r.outcome, r.service)}. ${amount}`}
      style={{ flexDirection: "row", gap: 12, paddingHorizontal: 16, alignItems: "stretch" }}
    >
      <View style={{ width: 44, height: 44, borderRadius: 22, marginTop: 12, backgroundColor: TINT[r.service], alignItems: "center", justifyContent: "center" }}>
        <Art width={30} />
      </View>
      <View style={{ flex: 1, minWidth: 0, flexDirection: "row", gap: 10, paddingVertical: 12, borderBottomWidth: last ? 0 : 1, borderBottomColor: tokens.color.line }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Marked text={r.title} q={q} lines={lines} style={{ fontSize: 15, lineHeight: 19.5, fontWeight: tokens.font.weight.semibold, color: tokens.color.ink }} />
          <Text numberOfLines={lines} style={{ marginTop: 1, fontSize: 13, lineHeight: 17.55, color: tokens.color.muted }}>
            {r.items}
          </Text>
          <View style={{ marginTop: 6, flexDirection: "row", flexWrap: "wrap", alignItems: "center", columnGap: 8, rowGap: 4 }}>
            <OutcomeTag outcome={r.outcome} service={r.service} />
            {r.riderName ? <Marked text={r.riderName} q={q} lines={1} style={{ fontSize: 12.5, color: tokens.color.muted }} /> : null}
            {r.rating ? <Stars n={r.rating} /> : null}
          </View>
        </View>
        <View style={{ alignItems: "flex-end", gap: 3 }}>
          {r.chargedUsd > 0 ? (
            <Text style={{ fontSize: 15, fontWeight: tokens.font.weight.bold, color: tokens.color.ink, ...tab }}>{amount}</Text>
          ) : (
            <Text style={{ fontSize: 13, fontWeight: tokens.font.weight.semibold, color: tokens.color.muted }}>{amount}</Text>
          )}
          <Text style={{ fontSize: 12, color: tokens.color.muted, ...tab }}>{when}</Text>
        </View>
      </View>
    </Tappable>
  );
}

// ── Footers, banners, cards ─────────────────────────────────────────────────────────────────────

/** The 18px ring (2.5px tile-send track, brand top arc, 0.8 s linear turn) the handoff draws. */
function Spinner(): React.ReactElement {
  return <ArcSpinner size={18} width={2.5} track={tokens.color.tileSend} arc={tokens.color.accent} duration={800} />;
}

/** Loading older orders (O12): an 18px ring (track tile-send, brand arc) + "Loading older orders…". */
export function LoadingOlderRow(): React.ReactElement {
  return (
    <View accessibilityRole="progressbar" accessibilityLabel={C.loadingOlder} style={{ minHeight: 56, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, paddingVertical: 8, paddingHorizontal: 16 }}>
      <Spinner />
      <Text style={{ fontSize: 13, fontWeight: tokens.font.weight.semibold, color: tokens.color.muted }}>{C.loadingOlder}</Text>
    </View>
  );
}

/** An older page failed (O14): the list above stays; this row offers "Try again". */
export function PageFailedRow({ onRetry }: { onRetry: () => void }): React.ReactElement {
  return (
    <View style={{ marginTop: 8, marginHorizontal: 16, marginBottom: 16, backgroundColor: tokens.color.surface, borderRadius: 14, paddingVertical: 6, paddingRight: 6, paddingLeft: 14, flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 10 }}>
      <Text style={{ flexShrink: 1, fontSize: 13, fontWeight: tokens.font.weight.semibold, color: tokens.color.muted }}>{C.olderFail}</Text>
      <OrdersButton kind="ghost" icon="refresh-cw" label={C.tryAgain} onPress={onRetry} />
    </View>
  );
}

/** End of history (O13): ✓ "That's everything" over "Your orders since Mar 2025". */
export function EndRow({ since }: { since: string }): React.ReactElement {
  return (
    <View style={{ alignItems: "center", gap: 2, paddingTop: 20, paddingHorizontal: 16, paddingBottom: 24 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
        <Icon name="check" size={16} color={tokens.color.accentText} />
        <Text style={{ fontSize: 13, fontWeight: tokens.font.weight.semibold, color: tokens.color.ink }}>{C.end}</Text>
      </View>
      {since ? <Text style={{ fontSize: 13, color: tokens.color.muted }}>{C.endSub(since)}</Text> : null}
    </View>
  );
}

/** A muted icon + one line (the search hint, the "only a running order" note, the offline-search footnote). */
export function NoteRow({ icon, text, center }: { icon?: IconName; text: string; center?: boolean }): React.ReactElement {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", justifyContent: center ? "center" : "flex-start", gap: 10, minHeight: 56, paddingVertical: 8, paddingHorizontal: 16 }}>
      {icon ? <Icon name={icon} size={16} color={tokens.color.muted} /> : null}
      <Text style={{ flexShrink: 1, fontSize: center ? 12.5 : 13, lineHeight: 18, color: tokens.color.muted, textAlign: center ? "center" : "left" }}>{text}</Text>
    </View>
  );
}

/** Calm Mint's muted offline banner under the header. */
export function OfflineBanner({ text }: { text: string }): React.ReactElement {
  return (
    <View accessibilityRole="alert" style={{ marginTop: 12, marginHorizontal: 16, backgroundColor: tokens.color.surface, borderRadius: 12, paddingVertical: 10, paddingHorizontal: 12, flexDirection: "row", alignItems: "flex-start", gap: 10 }}>
      <View style={{ marginTop: 1 }}>
        <Icon name="wifi-off" size={16} color={tokens.color.muted} />
      </View>
      <Text style={{ flex: 1, fontSize: 13, lineHeight: 18.2, fontWeight: tokens.font.weight.semibold, color: tokens.color.muted }}>{text}</Text>
    </View>
  );
}

/** Pill buttons: primary (52, cta) · text (48, green) · ghost (44, hairline). */
export function OrdersButton({ label, icon, kind, onPress }: { label: string; icon?: IconName; kind: "primary" | "text" | "ghost"; onPress: () => void }): React.ReactElement {
  const primary = kind === "primary";
  const ink = primary ? tokens.color.onAccent : tokens.color.accentText;
  return (
    <Tappable
      onPress={onPress}
      tone={primary ? "onDark" : "row"}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={{
        alignSelf: kind === "ghost" ? "center" : "stretch",
        height: primary ? tokens.touchTargetPrimary : kind === "text" ? 48 : 44,
        marginTop: kind === "text" ? 8 : 0,
        paddingHorizontal: kind === "ghost" ? 18 : 0,
        borderRadius: tokens.radius.pill,
        backgroundColor: primary ? tokens.color.cta : kind === "ghost" ? tokens.color.bg : "transparent",
        borderWidth: kind === "ghost" ? 1 : 0,
        borderColor: tokens.color.line,
        flexDirection: "row",
        alignItems: "center",
        justifyContent: "center",
        gap: primary ? 8 : 6,
      }}
    >
      {icon ? <Icon name={icon} size={primary ? 18 : 16} color={ink} /> : null}
      <Text style={{ fontSize: primary ? 16 : 14, fontWeight: tokens.font.weight.semibold, color: ink }}>{label}</Text>
    </Tappable>
  );
}

/** First load (O15): four chip pills, a day-label bar, five rows mirroring the row anatomy. */
export function OrdersSkeleton(): React.ReactElement {
  const bar = (w: number | `${number}%`, h: number, mt = 0, r = 12): React.ReactElement => (
    <View style={{ width: w, height: h, marginTop: mt, borderRadius: r, backgroundColor: SKELETON }} />
  );
  return (
    <View accessibilityLabel="Loading your orders" accessibilityRole="progressbar">
      <View style={{ flexDirection: "row", gap: 8, paddingTop: 16, paddingHorizontal: 16 }}>
        {[56, 88, 68, 72].map((w) => (
          <View key={w}>{bar(w, 44, 0, tokens.radius.pill)}</View>
        ))}
      </View>
      <View style={{ paddingTop: 20, paddingHorizontal: 16, paddingBottom: 2 }}>{bar(64, 12)}</View>
      {Array.from({ length: 5 }, (_, k) => (
        <View key={k} style={{ flexDirection: "row", gap: 12, paddingHorizontal: 16 }}>
          <View style={{ width: 44, height: 44, marginTop: 12, borderRadius: 22, backgroundColor: SKELETON }} />
          <View style={{ flex: 1, flexDirection: "row", gap: 10, paddingVertical: 12, borderBottomWidth: k === 4 ? 0 : 1, borderBottomColor: tokens.color.line }}>
            <View style={{ flex: 1 }}>
              {bar("70%", 14)}
              {bar("50%", 11, 8)}
              {bar("40%", 18, 8, tokens.radius.pill)}
            </View>
            {bar(48, 14)}
          </View>
        </View>
      ))}
    </View>
  );
}
