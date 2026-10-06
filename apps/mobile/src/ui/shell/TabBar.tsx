import { tokens } from "@lynia/shared/tokens";
import { BlurView } from "expo-blur";
import React, { useEffect, useRef, useState } from "react";
import { Animated, Easing, StyleSheet, Text, View, type LayoutChangeEvent } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Path, Polygon, Rect } from "react-native-svg";
import { haptic } from "../haptics";
import { Tappable } from "../Tappable";
import { useReduceMotion } from "../useReduceMotion";
import { useGlass } from "./useGlass";

/*
 * Tab bar v1.4 — floating pill (`packages/design/handoff/tab-bar-v1/`, ledger D-56). A port of the kit's
 * `components/shell/TabBar.jsx` (the handoff's source of truth): geometry, art, badge logic and the
 * screen-reader strings come from there verbatim. Change a value here only together with the handoff.
 */

/** The pill itself. */
export const TAB_BAR_H = 60;
/** Side + bottom float margin. */
export const TAB_BAR_GAP = 12;
/** `TAB_BAR_H + TAB_BAR_GAP` — the bar's reserve above the safe-area inset. Content pads by this + inset + 16. */
export const TAB_BAR_SPACE = 72;

/**
 * v1.4 glass: `bg` at 72% over a 24 blur. expo-blur's `systemChromeMaterial` overlays white (= `bg`) at
 * 0.75 × intensity / 100 and, on Android, blurs at intensity / `blurReductionFactor` (4), so 96 is exactly
 * 72% `bg` and a 24 radius. iOS draws UIKit's chrome material at that intensity; web, the kit's
 * `saturate(180%)` with a 19.2px blur (ledger D-56 §6).
 */
const GLASS_INTENSITY = 96;

export type TabArt = "home" | "orders" | "account" | "jobs" | "money";

/** `id` doubles as the route segment name (see the `(tabs)` layouts), so a press needs no lookup table. */
export type AppTab = { id: string; glyph: TabArt; label: string };

/** dot = attention (gold, Account/KYC) · count = new items (Jobs) · live = active orders (Orders) · warn = action needed (Money). */
export type TabBadge = { kind: "dot" } | { kind: "count"; n: number } | { kind: "live"; n?: number } | { kind: "warn" };

/**
 * Root tab bar — the app root, NOT a product switcher. Services live on Home as tiles, so a new
 * vertical adds a tile, never a tab.
 */
export const APP_TABS: AppTab[] = [
  { id: "home", glyph: "home", label: "Home" },
  { id: "orders", glyph: "orders", label: "Orders" },
  { id: "account", glyph: "account", label: "Account" },
];

/**
 * Rider root tabs — `Jobs | Money | Account`, nested under `/rider`. `id: "index"` (the board) keeps
 * every existing `"/rider"` call site working with zero string changes.
 */
export const RIDER_TABS: AppTab[] = [
  { id: "index", glyph: "jobs", label: "Jobs" },
  { id: "money", glyph: "money", label: "Money" },
  { id: "account", glyph: "account", label: "Account" },
];

// ── Art ─────────────────────────────────────────────────────────────────────────────────────────

type Part = [tag: "path" | "rect" | "circle" | "polygon", tone: string, attrs: Record<string, string | number>];

/* Faux-3D illustrations, 32 grid. Tones: L light/top, M mid/front, D dark/side, G gold, C coral, N mint,
   S sky, W white. The Orders bag handle is a 2-unit round-capped stroke. */
const ILLUS: Record<TabArt, Part[]> = {
  home: [
    ["polygon", "D", { points: "18,15 26,11 26,23 18,27" }],
    ["rect", "M", { x: 5, y: 15, width: 13, height: 12 }],
    ["polygon", "C", { points: "11.5,6.5 19.5,2.5 27,11.5 19,15.5" }],
    ["polygon", "L", { points: "3.5,16 11.5,6.5 19.5,16" }],
    ["rect", "G", { x: 9.5, y: 20, width: 4, height: 7, rx: 1 }],
    ["polygon", "S", { points: "20.5,17.5 23.5,16 23.5,19.5 20.5,21" }],
  ],
  orders: [
    ["path", "G", { d: "M10 12V8.5a3.5 3.5 0 0 1 7 0V12", stroke: "G" }],
    ["polygon", "L", { points: "6,12 12,9 26,9 20,12" }],
    ["polygon", "D", { points: "20,12 26,9 26,25 20,28" }],
    ["rect", "M", { x: 6, y: 12, width: 14, height: 16 }],
    ["rect", "W", { x: 8.5, y: 16.5, width: 9, height: 7, rx: 1 }],
    ["rect", "C", { x: 10, y: 18.5, width: 6, height: 1.5, rx: 0.75 }],
    ["rect", "S", { x: 10, y: 21, width: 4, height: 1.5, rx: 0.75 }],
  ],
  account: [
    ["path", "M", { d: "M5 28c0-6 4.9-10 11-10s11 4 11 10Z" }],
    ["path", "D", { d: "M16 18c6.1 0 11 4 11 10H16Z" }],
    ["path", "N", { d: "M13 18.4 16 22l3-3.6A11 11 0 0 0 16 18a11 11 0 0 0-3 .4Z" }],
    ["circle", "L", { cx: 16, cy: 10.5, r: 6 }],
    ["path", "M", { d: "M16 4.5a6 6 0 0 1 0 12a7.5 7.5 0 0 0 0-12Z" }],
  ],
  jobs: [
    ["rect", "S", { x: 1, y: 15, width: 3.5, height: 1.5, rx: 0.75 }],
    ["rect", "N", { x: 0.5, y: 19, width: 4, height: 1.5, rx: 0.75 }],
    ["polygon", "L", { points: "6,11 16,7 26,11 16,15" }],
    ["polygon", "M", { points: "6,11 16,15 16,28 6,23.5" }],
    ["polygon", "D", { points: "16,15 26,11 26,23.5 16,28" }],
    ["polygon", "G", { points: "10.5,8.8 20.5,12.8 20.5,17 18,18 18,13.8 8,9.8" }],
  ],
  money: [
    ["circle", "G", { cx: 24.5, cy: 8.5, r: 4.5 }],
    ["circle", "C", { cx: 24.5, cy: 8.5, r: 2, opacity: 0.55 }],
    ["polygon", "N", { points: "6.5,13 19.5,7 22,12 9,18" }],
    ["rect", "M", { x: 3.5, y: 12, width: 22, height: 16, rx: 3 }],
    ["rect", "L", { x: 3.5, y: 12, width: 22, height: 3.5, rx: 1.75 }],
    ["rect", "D", { x: 17, y: 17.5, width: 10.5, height: 6.5, rx: 3.25 }],
    ["circle", "G", { cx: 21, cy: 20.75, r: 1.5 }],
  ],
};

const c = tokens.color;
const ILLUS_ON: Record<string, string> = { L: c.illusLight, M: c.illusMid, D: c.illusDark, G: c.illusGold, C: c.illusCoral, N: c.illusMint, S: c.illusSky, W: c.bg };
const ILLUS_IDLE: Record<string, string> = { L: c.illusIdleLight, M: c.illusIdleMid, D: c.illusIdleDark, G: c.illusIdleLight, C: c.illusIdleMid, N: c.illusIdleLight, S: c.illusIdleLight, W: c.bg };

const SVG_TAG = { path: Path, rect: Rect, circle: Circle, polygon: Polygon } as const;

/** Faux-3D tab illustration (32 grid). Full colour when active, the neutral set when idle. */
export const TabIllus = React.memo(function TabIllus({ name, idle = false, size = 28 }: { name: TabArt; idle?: boolean; size?: number }): React.ReactElement {
  const pal = idle ? ILLUS_IDLE : ILLUS_ON;
  return (
    <Svg width={size} height={size} viewBox="0 0 32 32" style={styles.overhang}>
      {ILLUS[name].map(([tag, tone, a], i) => {
        const El = SVG_TAG[tag] as React.ComponentType<Record<string, unknown>>;
        const { stroke, ...rest } = a;
        return stroke ? (
          <El key={i} {...rest} fill="none" stroke={pal[String(stroke)]} strokeWidth={2} strokeLinecap="round" />
        ) : (
          <El key={i} {...rest} fill={pal[tone]} />
        );
      })}
    </Svg>
  );
});

/* The handoff's solid-vector fallback (`glyphStyle="solid"`, GLYPHS / TabGlyph) is deliberately NOT
   ported: the handoff says to build it only if asked, and it would ship unused bytes over metered data
   (the bundle-size budget, docs/APP-SIZE.md). Its drawings stay in the kit's TabBar.jsx (ledger D-56). */

// ── Badges + screen-reader strings ──────────────────────────────────────────────────────────────

/** `{Label}, tab, {i} of {n}[, {badge}]` — the handoff's final strings. */
export function tabA11yLabel(tab: AppTab, i: number, n: number, b?: TabBadge | null): string {
  return [tab.label, `tab, ${i + 1} of ${n}`, srBadge(tab.glyph, b)].filter(Boolean).join(", ");
}

function srBadge(glyph: TabArt, b?: TabBadge | null): string {
  if (!b) return "";
  const n = "n" in b && b.n != null ? b.n : 1;
  if (b.kind === "live") return n === 1 ? "1 active order" : `${n} active orders`;
  if (b.kind === "warn") return glyph === "money" ? "top-up needed" : "action needed";
  if (b.kind === "dot") return "action needed";
  return glyph === "jobs" ? (n === 1 ? "1 new job" : `${n} new jobs`) : `${n} new`;
}

/** Counts above 9 render "9+". */
export function badgeCount(n: number): string {
  return n > 9 ? "9+" : String(n);
}

/** Badge pop only (0.4 → 1.15 → 1, unchanged in v1.4). */
const POP_EASE = Easing.bezier(0.2, 0, 0, 1);
/** v1.4: one curve for every other move — no overshoot, no keyframes. */
const EASE = Easing.bezier(0.32, 0.72, 0, 1);
/** CSS `ease`, for the 300ms colour changes. */
const COLOUR_EASE = Easing.bezier(0.25, 0.1, 0.25, 1);

/** Anchored to the cell (left edge at cell centre + 4, dot + 6), overlapping the art's top-right corner. */
function Badge({ b, centre, animate }: { b: TabBadge; centre: number; animate: boolean }): React.ReactElement {
  const pop = useRef(new Animated.Value(animate ? 0 : 1)).current;
  useEffect(() => {
    if (!animate) return;
    Animated.timing(pop, { toValue: 1, duration: 160, easing: POP_EASE, useNativeDriver: true }).start();
  }, [animate, pop]);
  const scale = pop.interpolate({ inputRange: [0, 0.65, 1], outputRange: [0.4, 1.15, 1] });
  const anim = { transform: [{ scale }] };
  if (b.kind === "dot") return <Animated.View pointerEvents="none" style={[styles.badge, styles.dot, { left: centre + 6 }, anim]} />;
  if (b.kind === "warn") {
    return (
      <Animated.View pointerEvents="none" style={[styles.badge, styles.box, styles.warn, { left: centre + 4 }, anim]}>
        <Text style={[styles.badgeText, { color: c.ink }]}>!</Text>
      </Animated.View>
    );
  }
  const label = badgeCount(b.n ?? 1);
  if (b.kind === "live") {
    return (
      <Animated.View pointerEvents="none" style={[styles.badge, styles.box, styles.live, { left: centre + 4 }, anim]}>
        <View style={styles.liveDot} />
        <Text style={[styles.badgeText, { color: c.onAccent }]}>{label}</Text>
      </Animated.View>
    );
  }
  return (
    <Animated.View pointerEvents="none" style={[styles.badge, styles.box, styles.count, { left: centre + 4 }, anim]}>
      <Text style={[styles.badgeText, { color: c.onAccent }]}>{label}</Text>
    </Animated.View>
  );
}

// ── Cell ────────────────────────────────────────────────────────────────────────────────────────

function Cell({
  tab,
  index,
  count,
  on,
  badge,
  width,
  reduceMotion,
  mounted,
  onPress,
}: {
  tab: AppTab;
  index: number;
  count: number;
  on: boolean;
  badge?: TabBadge | null;
  width: number;
  reduceMotion: boolean;
  mounted: boolean;
  onPress: () => void;
}): React.ReactElement {
  const [pressed, setPressed] = useState(false);
  const [focused, setFocused] = useState(false);
  const press = useRef(new Animated.Value(1)).current;
  // v1.4: `lift` eases the art to its raised rest (−2, 1.08) over 420ms and back on deselect; `tone`
  // cross-fades the idle → active art and the muted → ink label over 300ms. Both start at rest, so
  // nothing animates on first mount.
  const lift = useRef(new Animated.Value(on ? 1 : 0)).current;
  const tone = useRef(new Animated.Value(on ? 1 : 0)).current;
  useEffect(() => {
    const to = on ? 1 : 0;
    if (!mounted || reduceMotion) {
      lift.setValue(to);
      tone.setValue(to);
      return;
    }
    Animated.timing(lift, { toValue: to, duration: 420, easing: EASE, useNativeDriver: true }).start();
    Animated.timing(tone, { toValue: to, duration: 300, easing: COLOUR_EASE, useNativeDriver: true }).start();
  }, [on, mounted, reduceMotion, lift, tone]);

  const setDown = (down: boolean): void => {
    setPressed(down);
    if (reduceMotion) return;
    Animated.timing(press, { toValue: down ? 0.97 : 1, duration: down ? 160 : 360, easing: EASE, useNativeDriver: true }).start();
  };

  const artTransform = [
    { translateY: lift.interpolate({ inputRange: [0, 1], outputRange: [0, -2] }) },
    { scale: lift.interpolate({ inputRange: [0, 1], outputRange: [1, 1.08] }) },
  ];
  const offOpacity = tone.interpolate({ inputRange: [0, 1], outputRange: [1, 0] });
  // The idle cell's `surface` press fill fades with the press scale; under reduce motion it is instant.
  const fillOpacity = on ? 0 : reduceMotion ? (pressed ? 1 : 0) : press.interpolate({ inputRange: [0.97, 1], outputRange: [1, 0], extrapolate: "clamp" });
  // Re-key on kind/count so a change re-pops; never on first mount.
  const badgeKey = badge ? `${badge.kind}${"n" in badge ? (badge.n ?? "") : ""}` : "none";

  return (
    <Tappable
      onPress={onPress}
      onPressIn={() => setDown(true)}
      onPressOut={() => setDown(false)}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      accessibilityRole="tab"
      accessibilityLabel={tabA11yLabel(tab, index, count, badge)}
      accessibilityState={{ selected: on }}
      style={styles.cell}
    >
      <Animated.View style={[styles.cellInner, { gap: 2, transform: [{ scale: press }] }, focused ? styles.focus : null]}>
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.pressFill, { opacity: fillOpacity }]} />
        <Animated.View style={{ transform: artTransform }}>
          <Animated.View style={{ opacity: offOpacity }}>
            <TabIllus name={tab.glyph} idle />
          </Animated.View>
          <Animated.View style={[StyleSheet.absoluteFill, { opacity: tone }]}>
            <TabIllus name={tab.glyph} />
          </Animated.View>
        </Animated.View>
        <View>
          <Animated.View style={{ opacity: offOpacity }}>
            <Text numberOfLines={1} style={[styles.label, styles.labelOff]}>
              {tab.label}
            </Text>
          </Animated.View>
          <Animated.View style={[styles.labelOver, { opacity: tone }]}>
            <Text numberOfLines={1} style={[styles.label, styles.labelOn, styles.labelCentre]}>
              {tab.label}
            </Text>
          </Animated.View>
        </View>
      </Animated.View>
      {badge && width > 0 ? <Badge key={badgeKey} b={badge} centre={width / 2} animate={mounted && !reduceMotion} /> : null}
    </Tappable>
  );
}

// ── Bar ─────────────────────────────────────────────────────────────────────────────────────────

/**
 * Bottom tab bar — a floating pill, three tabs. Customer: Home · Orders · Account. Rider: Jobs · Money ·
 * Account. Absolutely positioned 12 from the sides and 12 + the safe-area inset from the bottom, so the
 * screen content scrolls behind it; tab roots pad by `useTabBarSpace() + 16` (see `TabBarSpace`).
 */
export function TabBar({
  active,
  tabs = APP_TABS,
  badges = {},
  onTab,
  onReselect,
  hidden = false,
  reduceMotion: reduceMotionProp,
  material = "glass",
}: {
  active?: string;
  tabs?: AppTab[];
  badges?: Partial<Record<string, TabBadge | null>>;
  onTab?: (id: string) => void;
  onReselect?: (id: string) => void;
  hidden?: boolean;
  reduceMotion?: boolean;
  /** The kit's `material`: glass (the default) falls back to solid by itself; `solid` forces it. */
  material?: "glass" | "solid";
}): React.ReactElement | null {
  const insets = useSafeAreaInsets();
  const osReduce = useReduceMotion();
  const reduceMotion = reduceMotionProp ?? osReduce;
  const glass = useGlass(material === "glass");
  const n = tabs.length;
  const idx = Math.max(0, tabs.findIndex((t) => t.id === active));
  const cur = tabs[idx]!;

  const [barW, setBarW] = useState(0);
  const cellW = barW > 0 ? (barW - 8) / n : 0;
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  // One shared indicator, `tileMint` on every tab (v1.4): only its translateX moves, 420ms on EASE.
  const slide = useRef(new Animated.Value(idx)).current;
  const lastIdx = useRef(idx);
  useEffect(() => {
    if (lastIdx.current === idx) return;
    lastIdx.current = idx;
    if (reduceMotion) {
      slide.setValue(idx);
      return;
    }
    Animated.timing(slide, { toValue: idx, duration: 420, easing: EASE, useNativeDriver: true }).start();
  }, [idx, reduceMotion, slide]);

  if (hidden) return null;

  const tap = (t: AppTab): void => {
    if (t.id === cur.id) {
      onReselect?.(t.id);
      return;
    }
    haptic("tap");
    onTab?.(t.id);
  };

  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel="Main"
      onLayout={(e: LayoutChangeEvent) => setBarW(e.nativeEvent.layout.width)}
      style={[styles.bar, glass ? styles.barGlass : null, { bottom: TAB_BAR_GAP + insets.bottom }]}
    >
      {glass ? (
        <BlurView pointerEvents="none" intensity={GLASS_INTENSITY} tint="systemChromeMaterial" experimentalBlurMethod="dimezisBlurView" style={styles.glass} />
      ) : null}
      {cellW > 0 ? (
        <Animated.View pointerEvents="none" style={[styles.indicator, { width: cellW, transform: [{ translateX: Animated.multiply(slide, cellW) }] }]} />
      ) : null}
      {tabs.map((t, i) => (
        <Cell
          key={t.id}
          tab={t}
          index={i}
          count={n}
          on={t.id === cur.id}
          badge={badges[t.id] ?? null}
          width={cellW}
          reduceMotion={reduceMotion}
          mounted={mounted}
          onPress={() => tap(t)}
        />
      ))}
    </View>
  );
}

/**
 * Hoisted out of render (docs/ANDROID-TAP-RESPONSIVENESS-RCA-2026-08-19.md §2.2): the bar is on screen
 * for the whole session and re-renders on every route change, so its static styles are created once.
 * v1.4: no edge and no shadow. The fill is the glass (`BlurView` under a transparent bar) or, wherever
 * `useGlass` says the handoff's fallback applies, opaque `bg` — never a translucent bar without blur.
 */
const styles = StyleSheet.create({
  bar: {
    position: "absolute",
    left: TAB_BAR_GAP,
    right: TAB_BAR_GAP,
    height: TAB_BAR_H,
    padding: 4,
    flexDirection: "row",
    backgroundColor: c.bg,
    borderRadius: tokens.radius.pill,
    zIndex: 20,
  },
  barGlass: { backgroundColor: "transparent" },
  // expo-blur ignores `borderRadius` unless the view clips (its docs: `overflow: "hidden"`).
  glass: { ...StyleSheet.absoluteFillObject, borderRadius: tokens.radius.pill, overflow: "hidden" },
  indicator: { position: "absolute", top: 4, left: 4, height: 52, borderRadius: tokens.radius.pill, backgroundColor: c.tileMint },
  cell: { flex: 1, minWidth: 0, height: 52, borderRadius: tokens.radius.pill },
  cellInner: { flex: 1, alignItems: "center", justifyContent: "center", borderRadius: tokens.radius.pill },
  pressFill: { borderRadius: tokens.radius.pill, backgroundColor: c.surface },
  // Focus (keyboard / D-pad only — Android never focuses a Pressable in touch mode): a 2px ink ring,
  // drawn on the cell's inner pill — RN on the old architecture has no box-shadow spread for the
  // handoff's outside `bg` + `ink` ring.
  focus: { borderWidth: 2, borderColor: c.ink },
  overhang: { overflow: "visible" },
  // v1.4: always 700, so nothing reflows; only the colour cross-fades (two stacked layers).
  label: { fontSize: 12, lineHeight: 16, letterSpacing: 0, fontWeight: tokens.font.weight.bold },
  labelOn: { color: c.ink },
  labelOff: { color: c.muted },
  labelOver: { position: "absolute", top: 0, left: 0, right: 0 },
  labelCentre: { textAlign: "center" },
  badge: { position: "absolute", borderWidth: 2, borderColor: c.bg, borderRadius: tokens.radius.pill, transformOrigin: "0% 100%", ...tokens.shadow.badge },
  dot: { top: 4, width: 12, height: 12, backgroundColor: c.highlight },
  box: { top: 0, height: 20, minWidth: 20, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, paddingHorizontal: 4 },
  count: { backgroundColor: c.cta },
  warn: { width: 20, paddingHorizontal: 0, backgroundColor: c.highlight },
  live: { paddingLeft: 5, paddingRight: 6, backgroundColor: c.liveBar },
  liveDot: { width: 6, height: 6, borderRadius: tokens.radius.pill, backgroundColor: c.illusGold },
  badgeText: { fontSize: 12, lineHeight: 16, fontWeight: tokens.font.weight.bold, fontVariant: ["tabular-nums"] },
});
