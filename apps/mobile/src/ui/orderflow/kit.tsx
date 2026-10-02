import { tokens } from "@lynia/shared/tokens";
import React, { useEffect, useRef } from "react";
import { ActivityIndicator, Animated, Easing, Modal, PixelRatio, Text, type TextStyle, View, type ViewStyle } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { RestaurantsSticker } from "../art/stickers";
import { Icon, type IconName } from "../Icon";
import { RemoteImage } from "../RemoteImage";
import { Tappable } from "../Tappable";
import { RiderAvatar, VerifiedTag } from "../order/kit";
import { codeGroups } from "../../logic/merchant-order";
import { O, ofFmt } from "./copy";
import { OX } from "./kit-copy";

/**
 * Order flow v2.1 parts for the customer order screen (`packages/design/handoff/order-flow-v2/`, ledger
 * D-59), rebuilt from `of-kit.js` with the `of-polish.js` overrides on the app's tokens: the stage top
 * with the ETA hero, the four-step track in a surface panel, the striped prep bar, the venue row, the
 * order summary, the rider card, the door card, the forest code panel, the receipt and the rating row.
 * Built at size (44 small buttons, one 52 primary) — never inflated with hitSlop. Strings come from `O`
 * (`./copy`) or the markup strings in `./kit-copy`.
 */

const C = tokens.color;
export const TAB: TextStyle = { fontVariant: ["tabular-nums"] };
/** `ofAlpha` as token + alpha suffix: accentGlow 20 %, dropHalo 16 %, scrim 45 %. */
export const ALPHA = { accentGlow: `${C.accent}33`, dropHalo: `${C.danger}29`, scrim: `${C.ink}73`, track: `${C.accent}2E` } as const;

const usdOf = (n: number): string => `$${n.toFixed(2)}`;
export const usd = usdOf;

/** Stage title: 21/800, line 25, −0.5 tracking; wraps. */
export function StageTitle({ children, style }: { children: React.ReactNode; style?: TextStyle }): React.ReactElement {
  return (
    <Text accessibilityRole="header" style={{ fontSize: 21, lineHeight: 25, fontWeight: "800", letterSpacing: -0.5, color: C.ink, ...style }}>
      {children}
    </Text>
  );
}

export function Mut({ children, size = 13, style }: { children: React.ReactNode; size?: 13 | 14; style?: TextStyle }): React.ReactElement {
  return <Text style={{ fontSize: size, lineHeight: size === 14 ? 20 : 18, color: C.muted, ...style }}>{children}</Text>;
}

export type EtaView = { kind: "range"; text: string } | { kind: "one"; chip: string; at: string } | { kind: "line"; text: string };

/** The stage top (polish `K.top`): title, then the ETA hero — a range, or the highlight chip + "Arrives 12:47". */
export function StageTop({ title, eta, sub }: { title: string; eta: EtaView | null; sub?: string | null }): React.ReactElement {
  return (
    <View>
      <StageTitle>{title}</StageTitle>
      {eta?.kind === "range" ? (
        <View style={{ marginTop: 10, gap: 2 }} accessible accessibilityLabel={`${OX.etaRangeLabel} ${eta.text}`}>
          <Text style={{ fontSize: 11.5, fontWeight: "700", letterSpacing: 0.8, textTransform: "uppercase", color: C.muted }}>{OX.etaRangeLabel}</Text>
          <Text style={{ fontSize: 30, lineHeight: 32, fontWeight: "800", letterSpacing: -0.9, color: C.ink, ...TAB }}>{eta.text}</Text>
        </View>
      ) : eta?.kind === "one" ? (
        <View style={{ marginTop: 10, gap: 2 }} accessible accessibilityLabel={`${OX.etaOneLabel} ${eta.chip}. ${eta.at}`}>
          <Text style={{ fontSize: 11.5, fontWeight: "700", letterSpacing: 0.8, textTransform: "uppercase", color: C.muted }}>{OX.etaOneLabel}</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <View style={{ backgroundColor: C.highlight, borderRadius: 12, paddingHorizontal: 11, paddingTop: 5, paddingBottom: 6 }}>
              <Text style={{ fontSize: 30, lineHeight: 32, fontWeight: "800", letterSpacing: -0.9, color: C.highlightChipInk, ...TAB }}>{eta.chip}</Text>
            </View>
            <Text style={{ fontSize: 15, fontWeight: "700", color: C.ink, ...TAB }}>{eta.at}</Text>
          </View>
        </View>
      ) : eta?.kind === "line" ? (
        <View style={{ marginTop: 4, flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
          <Icon name="clock" size={16} color={C.muted} />
          <Text style={{ fontSize: 15, fontWeight: "600", color: C.ink, ...TAB }}>{eta.text}</Text>
        </View>
      ) : null}
      {sub ? <Mut style={{ marginTop: 6 }}>{sub}</Mut> : null}
    </View>
  );
}

function PulseRing({ reduceMotion }: { reduceMotion: boolean }): React.ReactElement {
  const v = useRef(new Animated.Value(0)).current;
  useEffect(() => {
    if (reduceMotion) return;
    const loop = Animated.loop(Animated.timing(v, { toValue: 1, duration: 1800, easing: Easing.out(Easing.quad), useNativeDriver: true }));
    loop.start();
    return () => loop.stop();
  }, [v, reduceMotion]);
  return (
    <Animated.View
      pointerEvents="none"
      style={{
        position: "absolute",
        width: 34,
        height: 34,
        borderRadius: 17,
        backgroundColor: ALPHA.track,
        opacity: reduceMotion ? 1 : v.interpolate({ inputRange: [0, 0.7, 1], outputRange: [1, 0, 0] }),
        transform: reduceMotion ? [] : [{ scale: v.interpolate({ inputRange: [0, 1], outputRange: [0.75, 1.3] }) }],
      }}
    />
  );
}

/** The four-step track in a surface panel: 24 circles, 4 connectors, the current one pulses. `current` 4 = all done. */
export function Track({ labels, current, reduceMotion }: { labels: readonly string[]; current: number; reduceMotion: boolean }): React.ReactElement {
  const now = Math.min(current, labels.length - 1);
  return (
    <View
      accessible
      accessibilityLabel={current >= labels.length ? labels[labels.length - 1] : `Step ${current + 1} of ${labels.length}, ${labels[now]}`}
      style={{ flexDirection: "row", backgroundColor: C.surface, borderRadius: 16, paddingTop: 12, paddingBottom: 10, paddingHorizontal: 2 }}
    >
      {labels.map((label, k) => {
        const done = k < current;
        const cur = k === current;
        return (
          <View key={label} style={{ flex: 1, alignItems: "center", minWidth: 0 }}>
            {k > 0 ? <View style={{ position: "absolute", top: 10, left: 0, right: "50%", height: 4, backgroundColor: k <= current ? C.accent : C.line }} /> : null}
            {k < labels.length - 1 ? <View style={{ position: "absolute", top: 10, left: "50%", right: 0, height: 4, backgroundColor: k < current ? C.accent : C.line }} /> : null}
            <View style={{ width: 24, height: 24, alignItems: "center", justifyContent: "center" }}>
              {cur ? <PulseRing reduceMotion={reduceMotion} /> : null}
              <View
                style={{
                  width: 24,
                  height: 24,
                  borderRadius: 12,
                  alignItems: "center",
                  justifyContent: "center",
                  backgroundColor: done || cur ? C.accentText : C.bg,
                  borderWidth: done || cur ? 0 : 1,
                  borderColor: C.line,
                }}
              >
                {done ? <Icon name="check" size={13} color={C.onAccent} strokeWidth={3} /> : <Text style={{ fontSize: 12, fontWeight: "700", color: cur ? C.onAccent : C.muted }}>{k + 1}</Text>}
              </View>
            </View>
            <Text style={{ marginTop: 7, fontSize: 12, lineHeight: 16, fontWeight: cur ? "700" : "600", color: done ? C.accentText : cur ? C.ink : C.muted, textAlign: "center", paddingHorizontal: 2 }}>{label}</Text>
          </View>
        );
      })}
    </View>
  );
}

/** Polish `K.prep`: "Cooking" 14/800 · "about 12 min left" 13/700 green · a 6px striped bar · the rider note. */
export function PrepBar({ making, minutesLeft, pct, note }: { making: string; minutesLeft: number; pct: number; note: boolean }): React.ReactElement {
  const stripes = Array.from({ length: 24 });
  return (
    <View style={{ gap: 8 }}>
      <View style={{ flexDirection: "row", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
        <Text style={{ fontSize: 14, fontWeight: "800", color: C.ink }}>{making}</Text>
        <Text style={{ fontSize: 13, fontWeight: "700", color: C.accentText, ...TAB }}>{ofFmt(OX.prepLeft, { m: minutesLeft })}</Text>
      </View>
      <View style={{ height: 6, borderRadius: 3, backgroundColor: C.line, overflow: "hidden" }}>
        <View style={{ width: `${pct}%`, height: 6, borderRadius: 3, backgroundColor: C.accent, overflow: "hidden", flexDirection: "row" }}>
          {stripes.map((_, i) => (
            <View key={i} style={{ width: 6, height: 12, marginTop: -3, marginRight: 6, backgroundColor: `${C.onAccent}47`, transform: [{ rotate: "45deg" }] }} />
          ))}
        </View>
      </View>
      {note ? <Mut>{O.t.prepNote}</Mut> : null}
    </View>
  );
}

/** Small button (polish): 44 pill, surface fill, no border, 14/800. `fill` = cta, `white` = white. */
export function SmallBtn({
  label,
  icon,
  kind = "surface",
  flex,
  onPress,
  disabled,
  loading,
  selected,
}: {
  label: string;
  icon?: IconName;
  kind?: "surface" | "fill" | "white" | "picked";
  flex?: number;
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  selected?: boolean;
}): React.ReactElement {
  const bg = kind === "fill" ? C.cta : kind === "white" ? C.bg : C.surface;
  const fg = disabled && kind !== "fill" && kind !== "picked" ? C.muted : kind === "fill" ? C.onAccent : kind === "picked" ? C.ink : C.accentText;
  return (
    <Tappable
      tone={kind === "fill" ? "onDark" : "row"}
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!(disabled || loading), busy: !!loading, selected: !!selected }}
      style={{ flex, minHeight: tokens.touchTargetMin, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingHorizontal: 14, paddingVertical: 4, borderRadius: tokens.radius.pill, backgroundColor: bg, borderWidth: kind === "picked" ? 1.5 : 0, borderColor: C.ink }}
    >
      {loading ? <ActivityIndicator size="small" color={fg} /> : icon ? <Icon name={icon} size={16} color={fg} /> : null}
      <Text style={{ fontSize: 14, fontWeight: "800", color: fg, textAlign: "center", flexShrink: 1 }}>{label}</Text>
    </Tappable>
  );
}

/** The 52 button: cta fill · `ghost` surface fill (no border) · `danger` danger fill · disabled line fill. */
export function Btn({
  label,
  icon,
  kind = "primary",
  onPress,
  disabled,
  loading,
  flex,
}: {
  label: string;
  icon?: IconName;
  kind?: "primary" | "ghost" | "danger";
  onPress: () => void;
  disabled?: boolean;
  loading?: boolean;
  flex?: number;
}): React.ReactElement {
  const off = !!disabled && !loading;
  const bg = off ? C.line : kind === "ghost" ? C.surface : kind === "danger" ? C.danger : C.cta;
  const fg = off ? C.muted : kind === "ghost" ? C.accentText : C.onAccent;
  return (
    <Tappable
      tone={kind === "ghost" ? "row" : "onDark"}
      onPress={onPress}
      disabled={disabled || loading}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: !!(disabled || loading), busy: !!loading }}
      style={{ flex, minHeight: tokens.touchTargetPrimary, borderRadius: tokens.radius.pill, backgroundColor: bg, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingHorizontal: 16, paddingVertical: 4 }}
    >
      {loading ? <ActivityIndicator size="small" color={fg} /> : icon ? <Icon name={icon} size={18} color={fg} /> : null}
      <Text style={{ fontSize: 16, fontWeight: "800", letterSpacing: -0.1, color: fg, textAlign: "center", flexShrink: 1, ...TAB }}>{label}</Text>
    </Tappable>
  );
}

/** The pinned bar: white, padding 10 16 12, sheet shadow; an optional muted hint above. */
export function Bar({ hint, children }: { hint?: string | null; children: React.ReactNode }): React.ReactElement {
  return (
    <View style={{ backgroundColor: C.bg, paddingTop: 10, paddingHorizontal: 16, paddingBottom: 12, gap: 8, ...tokens.shadow.sheet }}>
      {hint ? <Text style={{ fontSize: 13, lineHeight: 18, color: C.muted, textAlign: "center" }}>{hint}</Text> : null}
      {children}
    </View>
  );
}

/** A centred 44 text link (Cancel order · free, Cancel the whole order — free, Get help with this order). */
export function LinkRow({ label, onPress, loading }: { label: string; onPress: () => void; loading?: boolean }): React.ReactElement {
  return (
    <Tappable tone="icon" onPress={onPress} disabled={loading} accessibilityRole="button" accessibilityLabel={label} style={{ minHeight: tokens.touchTargetMin, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 6 }}>
      {loading ? <ActivityIndicator size="small" color={C.accentText} /> : null}
      <Text style={{ fontSize: 14, fontWeight: "600", color: C.accentText }}>{label}</Text>
    </Tappable>
  );
}

/** The venue's sticker on its tile colour (restaurants: tileFood). */
export function VenueDisc({ size = 48, radius = 14 }: { size?: number; radius?: number }): React.ReactElement {
  return (
    <View accessibilityElementsHidden importantForAccessibility="no" style={{ width: size, height: size, borderRadius: radius, backgroundColor: C.tileFood, alignItems: "center", justifyContent: "center" }}>
      <RestaurantsSticker width={Math.round(size * 0.72)} />
    </View>
  );
}

/** Polish `K.venueRow`: 48 tile · name 16/800 · "Order #A1B2" · Call. */
export function VenueRow({ name, sub, onCall }: { name: string; sub: string; onCall?: (() => void) | null }): React.ReactElement {
  return (
    <View style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
      <VenueDisc />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 16, fontWeight: "800", letterSpacing: -0.2, color: C.ink }}>{name}</Text>
        <Mut>{sub}</Mut>
      </View>
      {onCall ? <SmallBtn label={O.c.call} icon="phone" onPress={onCall} /> : null}
    </View>
  );
}

export interface LineView {
  qty: number;
  name: string;
  price: number;
  note: string | null;
}

/** `lines`: "2×" 14/700 · name (+ the note in quotes) · price 14/600. */
export function Lines({ lines }: { lines: LineView[] }): React.ReactElement {
  return (
    <View>
      {lines.map((l, i) => (
        <View key={`${l.name}-${i}`} style={{ flexDirection: "row", gap: 10, alignItems: "flex-start", paddingVertical: 8 }}>
          <Text style={{ fontSize: 14, lineHeight: 19, fontWeight: "700", minWidth: 22, color: C.ink }}>{l.qty}×</Text>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={{ fontSize: 14, lineHeight: 19, color: C.ink }}>{l.name}</Text>
            {l.note ? <Mut>“{l.note}”</Mut> : null}
          </View>
          <Text style={{ fontSize: 14, lineHeight: 19, fontWeight: "600", color: C.ink, ...TAB }}>{usdOf(l.price)}</Text>
        </View>
      ))}
    </View>
  );
}

/** ★ OrderSummary: the 44 row "Your order · 3 dishes · $16.50 cash · See order ⌄", expanding to the lines. */
export function OrderSummary({ count, total, lines, open, onToggle }: { count: number; total: number; lines: LineView[]; open: boolean; onToggle: () => void }): React.ReactElement {
  return (
    <View style={{ borderWidth: 1, borderColor: C.line, borderRadius: 16, paddingHorizontal: 12, paddingVertical: 4 }}>
      <Tappable onPress={onToggle} accessibilityRole="button" accessibilityState={{ expanded: open }} accessibilityLabel={`${O.t.order}. ${count} ${count === 1 ? O.svc.food.item : O.svc.food.items} · ${usdOf(total)} cash`} style={{ minHeight: tokens.touchTargetMin, flexDirection: "row", alignItems: "center", gap: 10 }}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontSize: 14, fontWeight: "700", color: C.ink }}>{O.t.order}</Text>
          <Mut style={TAB}>{`${count} ${count === 1 ? O.svc.food.item : O.svc.food.items} · ${usdOf(total)} cash`}</Mut>
        </View>
        <View style={{ flexDirection: "row", alignItems: "center", gap: 2, minHeight: tokens.touchTargetMin }}>
          <Text style={{ fontSize: 13, fontWeight: "600", color: C.accentText }}>{open ? O.t.hideOrder : O.t.viewOrder}</Text>
          <Icon name={open ? "chevron-up" : "chevron-down"} size={16} color={C.accentText} />
        </View>
      </Tappable>
      {open ? (
        <View style={{ borderTopWidth: 1, borderTopColor: C.line }}>
          <Lines lines={lines} />
        </View>
      ) : null}
    </View>
  );
}

export interface RiderCardView {
  name: string;
  initials: string;
  photoUrl: string | null;
  ratingAvg: number | null;
  trips: number;
  plate: string | null;
  verified: boolean;
}

/** Polish `K.riderCard`: 52 avatar with the accent ring · 17/800 name · Verified · gold star · trips · plate · Call / WhatsApp. */
export function RiderCard({ r, onCall, onWhatsApp }: { r: RiderCardView; onCall?: (() => void) | null; onWhatsApp?: (() => void) | null }): React.ReactElement {
  return (
    <View style={{ borderWidth: 1, borderColor: C.line, borderRadius: 16, padding: 14, gap: 12 }}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 14 }}>
        <View style={{ width: 60, height: 60, borderRadius: 30, borderWidth: 2, borderColor: C.accent, alignItems: "center", justifyContent: "center" }}>
          <RiderAvatar photoUrl={r.photoUrl} initials={r.initials} size={52} />
        </View>
        <View style={{ flex: 1, minWidth: 0 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
            <Text style={{ fontSize: 17, fontWeight: "800", letterSpacing: -0.2, color: C.ink }}>{r.name}</Text>
            {r.verified ? <VerifiedTag /> : null}
          </View>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 10, flexWrap: "wrap", marginTop: 3 }}>
            {r.ratingAvg != null ? (
              <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
                <Icon name="star" size={13} color={C.starStroke} fill={C.highlight} />
                <Text style={{ fontSize: 13, fontWeight: "700", color: C.ink, ...TAB }}>{r.ratingAvg.toFixed(1)}</Text>
              </View>
            ) : null}
            <Mut style={TAB}>{`${r.trips} ${O.c.trips}`}</Mut>
            {r.plate ? (
              <View style={{ borderWidth: 1.5, borderColor: C.ink, borderRadius: 4, paddingHorizontal: 6 }}>
                <Text style={{ fontSize: 12, lineHeight: 18, fontWeight: "700", letterSpacing: 1, color: C.ink }}>{r.plate}</Text>
              </View>
            ) : null}
          </View>
        </View>
      </View>
      {onCall || onWhatsApp ? (
        <View style={{ flexDirection: "row", gap: 8 }}>
          {onCall ? <SmallBtn flex={1} label={O.c.call} icon="phone" onPress={onCall} /> : null}
          {onWhatsApp ? <SmallBtn flex={1} label={O.c.whatsapp} icon="message-circle" onPress={onWhatsApp} /> : null}
        </View>
      ) : null}
    </View>
  );
}

/** A tinted note: surface · ok (mint) · hi (highlight wash) · dn (danger wash) · ink. */
export function Note({ tone = "plain", icon, children }: { tone?: "plain" | "ok" | "hi" | "dn" | "ink"; icon?: IconName; children: React.ReactNode }): React.ReactElement {
  const bg = tone === "ok" ? C.accentWash : tone === "hi" ? C.highlightChipWash : tone === "dn" ? C.dangerWash : tone === "ink" ? C.ink : C.surface;
  const fg = tone === "hi" ? C.highlightChipInk : tone === "dn" ? C.dangerInk : tone === "ink" ? C.onAccent : C.ink;
  const ic = tone === "ok" ? C.accentText : tone === "hi" ? C.highlightChipInk : tone === "dn" ? C.dangerInk : tone === "ink" ? C.onAccent : C.muted;
  return (
    <View accessibilityLiveRegion="polite" style={{ flexDirection: "row", gap: 10, alignItems: "flex-start", paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, backgroundColor: bg }}>
      {icon ? <Icon name={icon} size={18} color={ic} /> : null}
      <View style={{ flex: 1 }}>{typeof children === "string" ? <Text style={{ fontSize: 13, lineHeight: 19, color: fg }}>{children}</Text> : children}</View>
    </View>
  );
}

export type DoorRowState = "done" | "current" | "upcoming";
export interface DoorRow {
  state: DoorRowState;
  title: string;
  sub?: string | null;
  extra?: React.ReactNode;
}

/** ★ DoorCard: 2px green border, r20 · "AT YOUR DOOR" · three numbered rows (done = green fill + check, current = green ring on mint). */
export function DoorCard({ rows }: { rows: DoorRow[] }): React.ReactElement {
  return (
    <View style={{ borderWidth: 2, borderColor: C.accentText, borderRadius: 20, paddingVertical: 12, paddingHorizontal: 14, gap: 2 }}>
      <Text style={{ fontSize: 12, fontWeight: "700", letterSpacing: 0.84, textTransform: "uppercase", color: C.accentText, paddingTop: 2 }}>{O.p.t}</Text>
      {rows.map((r, i) => {
        const cur = r.state === "current";
        const prevCur = i > 0 && rows[i - 1]!.state === "current";
        return (
          <View
            key={r.title}
            accessible
            accessibilityLabel={`${i + 1}. ${r.title}${r.sub ? `. ${r.sub}` : ""}`}
            accessibilityState={{ checked: r.state === "done" }}
            style={{
              flexDirection: "row",
              gap: 12,
              alignItems: "flex-start",
              paddingVertical: cur ? 10 : 8,
              paddingHorizontal: cur ? 8 : 0,
              marginHorizontal: cur ? -8 : 0,
              marginVertical: cur ? 4 : 0,
              borderRadius: cur ? 12 : 0,
              backgroundColor: cur ? C.accentWash : "transparent",
              borderTopWidth: i > 0 && !cur && !prevCur ? 1 : 0,
              borderTopColor: C.line,
            }}
          >
            <View
              style={{
                width: 28,
                height: 28,
                borderRadius: 14,
                alignItems: "center",
                justifyContent: "center",
                backgroundColor: r.state === "done" ? C.accentText : r.state === "current" ? C.bg : C.surface,
                borderWidth: r.state === "done" ? 0 : r.state === "current" ? 2 : 1,
                borderColor: r.state === "current" ? C.accentText : C.line,
              }}
            >
              {r.state === "done" ? <Icon name="check" size={14} color={C.onAccent} strokeWidth={3} /> : <Text style={{ fontSize: 13, fontWeight: "700", color: r.state === "current" ? C.accentText : C.muted }}>{i + 1}</Text>}
            </View>
            <View style={{ flex: 1, minWidth: 0 }}>
              <Text style={{ fontSize: 15, lineHeight: 20, fontWeight: r.state === "upcoming" ? "600" : "700", color: r.state === "upcoming" ? C.muted : C.ink, ...TAB }}>{r.title}</Text>
              {r.sub ? <Mut>{r.sub}</Mut> : null}
              {r.extra}
            </View>
          </View>
        );
      })}
    </View>
  );
}

/** ★ CodeBig (v2.1): forest panel r20 · "DELIVERY CODE" forest-sub · 58/800 white digits 3+3 (48 under 340) in an accent-bordered pan. */
export function CodeBig({ code, sub, screenWidth }: { code: string; sub: string; screenWidth: number }): React.ReactElement {
  const narrow = screenWidth < 340;
  // The big code never grows with the system font (maxFontScale 1.0).
  const size = narrow ? 48 : 58;
  const groups = codeGroups(code);
  return (
    <View style={{ backgroundColor: C.forest, borderRadius: 20, paddingTop: 16, paddingHorizontal: 14, paddingBottom: 18, alignItems: "center", gap: 10 }}>
      <Text style={{ fontSize: 12, fontWeight: "700", letterSpacing: 0.84, textTransform: "uppercase", color: C.onForestMuted }}>{OX.deliveryCode}</Text>
      <View
        accessible
        accessibilityLabel={`${OX.deliveryCode} ${code.split("").join(" ")}`}
        style={{ alignSelf: "stretch", borderWidth: 2, borderColor: C.accent, borderRadius: 14, paddingVertical: 10, flexDirection: "row", justifyContent: "center", gap: narrow ? 16 : 20 }}
      >
        {groups.map((g) => (
          <Text key={g} allowFontScaling={false} style={{ fontSize: size, lineHeight: Math.round(size * 1.15), fontWeight: "800", letterSpacing: 2, color: C.onAccent, ...TAB }}>
            {g}
          </Text>
        ))}
      </View>
      <Text maxFontSizeMultiplier={1.15} style={{ fontSize: 14, lineHeight: 20, textAlign: "center", color: C.onAccent }}>
        {sub}
      </Text>
    </View>
  );
}

/** A "k · v" receipt row (13; the total row 17/700). */
export function KV({ k, v, total }: { k: string; v: string; total?: boolean }): React.ReactElement {
  return (
    <View style={{ flexDirection: "row", alignItems: "baseline", gap: 12, paddingVertical: 7, borderTopWidth: 1, borderTopColor: C.line }}>
      <Text style={{ flex: 1, minWidth: 0, fontSize: 13, color: total ? C.ink : C.muted, fontWeight: total ? "700" : "400" }}>{k}</Text>
      <Text style={{ fontSize: total ? 17 : 13, fontWeight: total ? "700" : "600", color: C.ink, textAlign: "right", flexShrink: 1, ...TAB }}>{v}</Text>
    </View>
  );
}

/** Five 44 star cells (32 stars, highlight fill + star-stroke outline) and the rating word. */
export function GoldStars({ value, onChange, labelFor }: { value: number; onChange: (n: number) => void; labelFor: (n: number) => string }): React.ReactElement {
  return (
    <View style={{ flexDirection: "row", alignItems: "center" }}>
      {[1, 2, 3, 4, 5].map((i) => {
        const on = i <= value;
        return (
          <Tappable
            key={i}
            tone="icon"
            onPress={() => onChange(i)}
            accessibilityRole="button"
            accessibilityLabel={`${i} ${i === 1 ? "star" : "stars"}, ${labelFor(i)}`}
            accessibilityState={{ selected: i === value }}
            style={{ width: tokens.touchTargetMin, height: tokens.touchTargetMin, alignItems: "center", justifyContent: "center" }}
          >
            <Icon name="star" size={32} color={on ? C.starStroke : C.line} fill={on ? C.highlight : undefined} />
          </Tappable>
        );
      })}
      {value ? <Text style={{ marginLeft: 4, fontSize: 14, fontWeight: "700", color: C.accentText }}>{labelFor(value)}</Text> : null}
    </View>
  );
}

/** Read-only stars (the "You rated" line). */
export function SmallStars({ value }: { value: number }): React.ReactElement {
  return (
    <View style={{ flexDirection: "row", gap: 2 }} accessible accessibilityLabel={`${value} of 5 stars`}>
      {[1, 2, 3, 4, 5].map((i) => (
        <Icon key={i} name="star" size={18} color={i <= value ? C.starStroke : C.line} fill={i <= value ? C.highlight : undefined} />
      ))}
    </View>
  );
}

/** 44 chips: off = line border · on = accent-text border on mint with a check. */
export function Chips({ list, on, onToggle }: { list: readonly string[]; on: readonly number[]; onToggle: (i: number) => void }): React.ReactElement {
  return (
    <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
      {list.map((label, i) => {
        const sel = on.includes(i);
        return (
          <Tappable
            key={label}
            onPress={() => onToggle(i)}
            accessibilityRole="checkbox"
            accessibilityLabel={label}
            accessibilityState={{ checked: sel }}
            style={{
              minHeight: tokens.touchTargetMin,
              flexDirection: "row",
              alignItems: "center",
              gap: 6,
              paddingHorizontal: 14,
              borderRadius: tokens.radius.pill,
              borderWidth: sel ? 1.5 : 1,
              borderColor: sel ? C.accentText : C.line,
              backgroundColor: sel ? C.accentWash : C.bg,
            }}
          >
            {sel ? <Icon name="check" size={14} color={C.accentText} /> : null}
            <Text style={{ fontSize: 13, fontWeight: sel ? "700" : "600", color: sel ? C.accentText : C.ink }}>{label}</Text>
          </Tappable>
        );
      })}
    </View>
  );
}

/** The 72 disc of an ending / Done: surface, or `ok` = accent fill with a white glyph. */
export function Disc({ icon, ok }: { icon: IconName; ok?: boolean }): React.ReactElement {
  return (
    <View style={{ width: 72, height: 72, borderRadius: 36, backgroundColor: ok ? C.accent : C.surface, alignItems: "center", justifyContent: "center" }}>
      <Icon name={icon} size={ok ? 30 : 28} color={ok ? C.onAccent : C.muted} />
    </View>
  );
}

/** A photo tile (44 / 48, r10): the photo when there is one, else the surface placeholder. */
function PhotoTile({ uri, size, icon }: { uri: string | null; size: number; icon: IconName }): React.ReactElement {
  return (
    <View accessibilityElementsHidden importantForAccessibility="no" style={{ width: size, height: size, borderRadius: 10, overflow: "hidden", backgroundColor: C.surface, alignItems: "center", justifyContent: "center" }}>
      {uri ? <RemoteImage source={{ uri }} cachePolicy="memory" style={{ width: size, height: size }} /> : <Icon name={icon} size={18} color={C.muted} />}
    </View>
  );
}

/** The ± pill: up = highlight wash + highlight ink, down = mint + accent text (11/700, 20 high). */
function DiffPill({ d }: { d: number }): React.ReactElement {
  const up = d > 0;
  const text = `${up ? "+" : d < 0 ? "−" : ""}${usdOf(Math.abs(d))}`;
  return (
    <View style={{ height: 20, borderRadius: tokens.radius.pill, paddingHorizontal: 9, justifyContent: "center", backgroundColor: up ? C.highlightChipWash : C.accentWash }}>
      <Text style={{ fontSize: 11, fontWeight: "700", color: up ? C.highlightChipInk : C.accentText, ...TAB }}>{ofFmt(O.u.diff, { d: text })}</Text>
    </View>
  );
}

export interface SubCardView {
  action: "remove" | "swap" | "reduce";
  name: string;
  was: number;
  newQuantity: number | null;
  swapName: string | null;
  now: number | null;
  diff: number;
  photoUrl: string | null;
}

/**
 * ★ SubCard (of-screens-upd.js `subLine`): 44 photo · "Out of X · ~~$1.10~~" 13/600 muted · "Swap for Y"
 * (or "Will be removed") 15/700 · the new price + the ± pill · for a swap, two 44 buttons (Accept swap /
 * Remove it — the picked one filled, or ink-ringed). An unanswered swap has the 1.5 green border.
 */
export function SubCard({ line, answer, onAnswer, disabled }: { line: SubCardView; answer: "accept" | "remove" | null; onAnswer?: (a: "accept" | "remove") => void; disabled?: boolean }): React.ReactElement {
  const swap = line.action === "swap";
  const need = swap && answer == null && !!onAnswer;
  const title = swap ? ofFmt(O.u.swapFor, { i: line.swapName ?? line.name }) : line.action === "reduce" ? `${line.newQuantity ?? 0}× ${line.name}` : O.u.removed;
  return (
    <View style={{ borderWidth: need ? 1.5 : 1, borderColor: need ? C.accentText : C.line, borderRadius: 16, padding: 12, gap: 8, backgroundColor: C.bg }}>
      <View style={{ flexDirection: "row", gap: 10, alignItems: "flex-start" }}>
        <PhotoTile uri={swap ? line.photoUrl : null} size={44} icon="package" />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={{ fontSize: 13, lineHeight: 18, fontWeight: "600", color: C.muted }}>
            {ofFmt(O.u.outOf, { i: line.name })} · <Text style={{ textDecorationLine: "line-through", ...TAB }}>{usdOf(line.was)}</Text>
          </Text>
          <Text style={{ fontSize: 15, lineHeight: 20, fontWeight: "700", marginTop: 2, color: C.ink }}>{title}</Text>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 6, marginTop: 2 }}>
            {swap && line.now != null ? <Text style={{ fontSize: 14, fontWeight: "600", color: C.ink, ...TAB }}>{usdOf(line.now)}</Text> : null}
            <DiffPill d={line.diff} />
          </View>
        </View>
      </View>
      {swap && onAnswer ? (
        <View style={{ flexDirection: "row", gap: 8 }}>
          <SmallBtn flex={1} kind={answer === "accept" ? "fill" : "surface"} icon={answer === "accept" ? "check" : undefined} selected={answer === "accept"} label={O.u.acceptSwap} onPress={() => onAnswer("accept")} disabled={disabled} />
          <SmallBtn flex={1} kind={answer === "remove" ? "picked" : "surface"} icon={answer === "remove" ? "check" : undefined} selected={answer === "remove"} label={O.u.removeIt} onPress={() => onAnswer("remove")} disabled={disabled} />
        </View>
      ) : null}
    </View>
  );
}

/** ★ PhotoRow (of-kit.js `photoRow`): card · 48 thumb · title 14/700 · sub 13 muted · View SmallBtn. */
export function PhotoRow({ title, sub, uri, onView }: { title: string; sub: string; uri: string | null; onView: () => void }): React.ReactElement {
  return (
    <View style={{ borderWidth: 1, borderColor: C.line, borderRadius: 16, paddingVertical: 10, paddingHorizontal: 12, flexDirection: "row", alignItems: "center", gap: 12, backgroundColor: C.bg }}>
      <PhotoTile uri={uri} size={48} icon="image" />
      <View style={{ flex: 1, minWidth: 0 }}>
        <Text style={{ fontSize: 14, lineHeight: 19, fontWeight: "700", color: C.ink }}>{title}</Text>
        <Mut>{sub}</Mut>
      </View>
      <SmallBtn label={O.c.view} icon="image" onPress={onView} />
    </View>
  );
}

/** ★ PhotoViewer (T8b): ink full screen · title 16/700 white + white Close · the photo r16 · caption 13 forest-sub. */
export function PhotoViewer({ visible, title, uri, caption, onClose }: { visible: boolean; title: string; uri: string | null; caption: string; onClose: () => void }): React.ReactElement {
  return (
    <Modal visible={visible} transparent={false} animationType="fade" onRequestClose={onClose}>
      <SafeAreaView edges={["top", "bottom"]} style={{ flex: 1, backgroundColor: C.ink }}>
        <View style={{ flex: 1, paddingTop: 32, paddingHorizontal: 16, paddingBottom: 16, gap: 12 }}>
          <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <Text accessibilityRole="header" style={{ flex: 1, fontSize: 16, fontWeight: "700", color: C.onAccent }}>
              {title}
            </Text>
            <SmallBtn kind="white" icon="x" label={O.c.close} onPress={onClose} />
          </View>
          <View style={{ flex: 1, borderRadius: 16, overflow: "hidden", backgroundColor: C.surface, alignItems: "center", justifyContent: "center" }}>
            {uri ? <RemoteImage source={{ uri }} cachePolicy="memory" resizeMode="contain" accessible accessibilityLabel={title} style={{ width: "100%", height: "100%" }} /> : <Icon name="image" size={28} color={C.muted} />}
          </View>
          <Text style={{ fontSize: 13, lineHeight: 18, color: C.onForestMuted }}>{caption}</Text>
        </View>
      </SafeAreaView>
    </Modal>
  );
}

/** One row of the two-row rating card: "How was …?" 15/700 · five 44 stars · the chips once starred. */
export function RateRow({ title, value, onChange, tags, on, onToggle }: { title: string; value: number; onChange: (n: number) => void; tags: readonly string[] | null; on: readonly number[]; onToggle: (i: number) => void }): React.ReactElement {
  return (
    <View style={{ gap: 6 }}>
      <Text style={{ fontSize: 15, fontWeight: "700", color: C.ink }}>{title}</Text>
      <GoldStars value={value} onChange={onChange} labelFor={(n) => O.d.rl[n] ?? ""} />
      {value && tags ? <Chips list={tags} on={on} onToggle={onToggle} /> : null}
    </View>
  );
}

/** The substitution head: title, the highlight countdown pill "0:52 left" + a 4px bar, an optional sub. */
export function AnswerHead({ title, left, pct, sub }: { title: string; left: string; pct: number; sub?: string | null }): React.ReactElement {
  return (
    <View>
      <StageTitle>{title}</StageTitle>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 10, marginTop: 8 }}>
        <View style={{ height: 28, flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 9, borderRadius: tokens.radius.pill, backgroundColor: C.highlight }}>
          <Icon name="timer" size={14} color={C.highlightChipInk} />
          <Text style={{ fontSize: 12, fontWeight: "700", color: C.highlightChipInk, ...TAB }}>{`${left} ${O.t.left}`}</Text>
        </View>
        <View style={{ flex: 1, height: 6, borderRadius: 3, backgroundColor: C.line, overflow: "hidden" }}>
          <View style={{ width: `${Math.max(0, Math.min(100, pct))}%`, height: 6, backgroundColor: C.accent }} />
        </View>
      </View>
      {sub ? <Mut style={{ marginTop: 8 }}>{sub}</Mut> : null}
    </View>
  );
}

/** A card frame (r16, 1px line). */
export function Card({ children, style }: { children: React.ReactNode; style?: ViewStyle }): React.ReactElement {
  return <View style={{ borderWidth: 1, borderColor: C.line, borderRadius: 16, padding: 12, gap: 10, backgroundColor: C.bg, ...style }}>{children}</View>;
}

/** The system font scale, for the few places a size caps (code card ×1.15, big code ×1.0). */
export const fontScale = (): number => PixelRatio.getFontScale();
