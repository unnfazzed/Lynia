import { tokens } from "@lynia/shared/tokens";
import React, { useEffect, useRef, useState } from "react";
import { Animated, Easing, StyleSheet, Text, View, type LayoutChangeEvent } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Defs, G, Mask, Path, Polygon, Rect } from "react-native-svg";
import { haptic } from "../haptics";
import { Tappable } from "../Tappable";
import { useReduceMotion } from "../useReduceMotion";

/*
 * Tab bar v1 — floating pill (`packages/design/handoff/tab-bar-v1/`, ledger D-56). A port of the kit's
 * `components/shell/TabBar.jsx` (the handoff's source of truth): geometry, art, badge logic and the
 * screen-reader strings come from there verbatim. Change a value here only together with the handoff.
 */

/** The pill itself. */
export const TAB_BAR_H = 60;
/** Side + bottom float margin. */
export const TAB_BAR_GAP = 12;
/** `TAB_BAR_H + TAB_BAR_GAP` — the bar's reserve above the safe-area inset. Content pads by this + inset + 16. */
export const TAB_BAR_SPACE = 72;

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

/** Illustrated variant: the active pill takes the matching Home tile tint, ringed in its ink. */
export const TAB_TINT: Record<TabArt, [fill: string, ring: string]> = {
  home: [c.tileMint, c.accentIllus],
  orders: [c.tilePeach, c.coralInk],
  account: [c.tileLilac, c.riderAccent],
  jobs: [c.tileMint, c.accentIllus],
  money: [c.tileSun, c.sunInk],
};

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

/* Solid vector glyphs, 24 grid — the handoff's documented fallback for low-end / high-glare builds
   (`glyphStyle="solid"`). Not used by default. "f" = filled shape, "c" = knockout (transparent idle,
   painted with `detail` when active), "t" = fill drawn on top of the detail layer. */
const GLYPHS: Record<TabArt, Part[]> = {
  home: [
    ["path", "f", { d: "M3 10.2a1.5 1.5 0 0 1 .54-1.15l7.5-6.3a1.5 1.5 0 0 1 1.92 0l7.5 6.3a1.5 1.5 0 0 1 .54 1.15V19.5A1.5 1.5 0 0 1 19.5 21h-15A1.5 1.5 0 0 1 3 19.5Z" }],
    ["rect", "c", { x: 9.75, y: 13.5, width: 4.5, height: 8, rx: 1.25 }],
  ],
  orders: [
    ["path", "f", { d: "M5.5 2.5h13A1.5 1.5 0 0 1 20 4v17.2l-2.67-1.6-2.66 1.6L12 19.6l-2.67 1.6-2.66-1.6L4 21.2V4a1.5 1.5 0 0 1 1.5-1.5Z" }],
    ["rect", "c", { x: 8, y: 7, width: 8, height: 2, rx: 1 }],
    ["rect", "c", { x: 8, y: 11, width: 8, height: 2, rx: 1 }],
    ["rect", "c", { x: 8, y: 15, width: 4.5, height: 2, rx: 1 }],
  ],
  account: [
    ["circle", "f", { cx: 12, cy: 7.75, r: 4.75 }],
    ["path", "f", { d: "M3.5 20.2c0-4.1 3.8-6.7 8.5-6.7s8.5 2.6 8.5 6.7a.8.8 0 0 1-.8.8H4.3a.8.8 0 0 1-.8-.8Z" }],
    ["path", "c", { d: "M10 13.75h4L12 17.5Z" }],
  ],
  jobs: [
    ["rect", "f", { x: 2, y: 3, width: 8.5, height: 6.5, rx: 1.5 }],
    ["rect", "c", { x: 5.5, y: 3, width: 1.5, height: 2.5 }],
    ["rect", "f", { x: 2, y: 10.75, width: 13.5, height: 3.75, rx: 1.875 }],
    ["path", "f", { d: "M13.4 13.9 16.1 4.4a1 1 0 0 1 .96-.73H20a1 1 0 0 1 0 2h-2.2l-2.4 8.5Z" }],
    ["path", "f", { d: "M14.3 12.7l1.7-.9 3.6 6-1.7 1Z" }],
    ["circle", "f", { cx: 5.5, cy: 18.25, r: 3 }],
    ["circle", "c", { cx: 5.5, cy: 18.25, r: 1.25 }],
    ["circle", "f", { cx: 18.75, cy: 18.25, r: 3 }],
    ["circle", "c", { cx: 18.75, cy: 18.25, r: 1.25 }],
  ],
  money: [
    ["path", "f", { d: "M4.5 6.2 15.6 2.9a1.5 1.5 0 0 1 1.9 1.1l.5 2Z" }],
    ["rect", "f", { x: 2.5, y: 6, width: 19, height: 15, rx: 3 }],
    ["rect", "c", { x: 14.5, y: 11, width: 7, height: 5, rx: 2.5 }],
    ["circle", "t", { cx: 17, cy: 13.5, r: 1.25 }],
  ],
};

/** Solid vector glyph. Knockouts are transparent, or painted with `detail` (the two-tone active state). */
export function TabGlyph({ name, color, detail, size = 24 }: { name: TabArt; color: string; detail?: string; size?: number }): React.ReactElement {
  const parts = GLYPHS[name];
  const id = `tg-${name}`;
  const draw = (kind: string, fill: string) =>
    parts
      .filter((p) => p[1] === kind)
      .map(([tag, , a], i) => {
        const El = SVG_TAG[tag] as React.ComponentType<Record<string, unknown>>;
        return <El key={kind + i} {...a} fill={fill} />;
      });
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Defs>
        <Mask id={id} maskUnits="userSpaceOnUse" x="0" y="0" width="24" height="24">
          <Rect width="24" height="24" fill="#fff" />
          {draw("c", "#000")}
        </Mask>
      </Defs>
      <G mask={`url(#${id})`}>{draw("f", color)}</G>
      {detail ? draw("c", detail) : null}
      {draw("t", color)}
    </Svg>
  );
}

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

const POP_EASE = Easing.bezier(0.2, 0, 0, 1);
const SPRING_EASE = Easing.bezier(0.34, 1.36, 0.64, 1);

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
  solid,
  reduceMotion,
  mounted,
  onPress,
  onPressedChange,
}: {
  tab: AppTab;
  index: number;
  count: number;
  on: boolean;
  badge?: TabBadge | null;
  width: number;
  solid: boolean;
  reduceMotion: boolean;
  mounted: boolean;
  onPress: () => void;
  onPressedChange: (down: boolean) => void;
}): React.ReactElement {
  const [pressed, setPressed] = useState(false);
  const [focused, setFocused] = useState(false);
  const press = useRef(new Animated.Value(1)).current;
  // Activation pop for the illustration: 0 → 1 drives 0.86 → 1.16 (−4) → 1.08 (−2). Starts at rest.
  const pop = useRef(new Animated.Value(1)).current;
  const wasOn = useRef(on);
  useEffect(() => {
    if (on && !wasOn.current && mounted && !reduceMotion) {
      pop.setValue(0);
      Animated.timing(pop, { toValue: 1, duration: 200, easing: POP_EASE, useNativeDriver: true }).start();
    } else {
      pop.setValue(1);
    }
    wasOn.current = on;
  }, [on, mounted, reduceMotion, pop]);

  const setDown = (down: boolean): void => {
    setPressed(down);
    onPressedChange(down);
    if (reduceMotion) return;
    Animated.timing(press, { toValue: down ? 0.94 : 1, duration: down ? 100 : 160, easing: down ? Easing.out(Easing.ease) : SPRING_EASE, useNativeDriver: true }).start();
  };

  const artTransform = solid
    ? on
      ? [{ scale: pop.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0.82, 1.12, 1] }) }]
      : []
    : on
      ? [
          { translateY: pop.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0, -4, -2] }) },
          { scale: pop.interpolate({ inputRange: [0, 0.6, 1], outputRange: [0.86, 1.16, 1.08] }) },
        ]
      : [];
  const ink = on ? (solid ? c.onAccent : c.ink) : c.muted;
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
      <Animated.View style={[styles.cellInner, { gap: solid ? 4 : 2, transform: [{ scale: press }] }, pressed && !on ? styles.pressFill : null, focused ? styles.focus : null]}>
        <Animated.View style={{ transform: artTransform }}>
          {solid ? <TabGlyph name={tab.glyph} color={ink} detail={on ? c.accent : undefined} /> : <TabIllus name={tab.glyph} idle={!on} />}
        </Animated.View>
        <Text numberOfLines={1} style={on ? [styles.labelOn, { color: ink }] : styles.labelOff}>
          {tab.label}
        </Text>
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
  glyphStyle = "illustrated",
}: {
  active?: string;
  tabs?: AppTab[];
  badges?: Partial<Record<string, TabBadge | null>>;
  onTab?: (id: string) => void;
  onReselect?: (id: string) => void;
  hidden?: boolean;
  reduceMotion?: boolean;
  glyphStyle?: "illustrated" | "solid";
}): React.ReactElement | null {
  const insets = useSafeAreaInsets();
  const osReduce = useReduceMotion();
  const reduceMotion = reduceMotionProp ?? osReduce;
  const solid = glyphStyle === "solid";
  const n = tabs.length;
  const idx = Math.max(0, tabs.findIndex((t) => t.id === active));
  const cur = tabs[idx]!;

  const [barW, setBarW] = useState(0);
  const cellW = barW > 0 ? (barW - 8) / n : 0;
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const [activePressed, setActivePressed] = useState(false);

  // One shared indicator: translateX slides (native driver); the tint + ring cross-fade (JS driver,
  // on a nested view — the two drivers can't share a node).
  const slide = useRef(new Animated.Value(idx)).current;
  const fade = useRef(new Animated.Value(1)).current;
  const tint = useRef<{ from: [string, string]; to: [string, string] }>({ from: TAB_TINT[cur.glyph], to: TAB_TINT[cur.glyph] });
  const lastIdx = useRef(idx);
  if (lastIdx.current !== idx) {
    const prev = tabs[lastIdx.current];
    tint.current = { from: prev ? TAB_TINT[prev.glyph] : TAB_TINT[cur.glyph], to: TAB_TINT[cur.glyph] };
  }
  useEffect(() => {
    if (lastIdx.current === idx) return;
    lastIdx.current = idx;
    if (reduceMotion) {
      slide.setValue(idx);
      fade.setValue(1);
      return;
    }
    fade.setValue(0);
    Animated.timing(slide, { toValue: idx, duration: 200, easing: SPRING_EASE, useNativeDriver: true }).start();
    Animated.timing(fade, { toValue: 1, duration: 160, easing: Easing.linear, useNativeDriver: false }).start();
  }, [idx, reduceMotion, slide, fade]);

  if (hidden) return null;

  const tap = (t: AppTab): void => {
    if (t.id === cur.id) {
      onReselect?.(t.id);
      return;
    }
    haptic("tap");
    onTab?.(t.id);
  };

  const indicatorFill = solid
    ? { backgroundColor: activePressed ? c.ctaPressed : c.cta, ...tokens.shadow.active }
    : {
        backgroundColor: fade.interpolate({ inputRange: [0, 1], outputRange: [tint.current.from[0], tint.current.to[0]] }),
        borderWidth: 2,
        borderColor: fade.interpolate({ inputRange: [0, 1], outputRange: [tint.current.from[1], tint.current.to[1]] }),
      };

  return (
    <View
      accessibilityRole="tablist"
      accessibilityLabel="Main"
      onLayout={(e: LayoutChangeEvent) => setBarW(e.nativeEvent.layout.width)}
      style={[styles.bar, { bottom: TAB_BAR_GAP + insets.bottom }]}
    >
      {cellW > 0 ? (
        <Animated.View pointerEvents="none" style={[styles.indicator, { width: cellW, transform: [{ translateX: Animated.multiply(slide, cellW) }] }]}>
          <Animated.View style={[styles.indicatorFill, indicatorFill]} />
        </Animated.View>
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
          solid={solid}
          reduceMotion={reduceMotion}
          mounted={mounted}
          onPress={() => tap(t)}
          onPressedChange={(down) => {
            if (t.id === cur.id) setActivePressed(down);
          }}
        />
      ))}
    </View>
  );
}

/**
 * Hoisted out of render (docs/ANDROID-TAP-RESPONSIVENESS-RCA-2026-08-19.md §2.2): the bar is on screen
 * for the whole session and re-renders on every route change, so its static styles are created once.
 * The 1px `line` edge is a real border (RN has no inset ring), so the padding is 3 — the cells and the
 * indicator still sit 4 in from the outer edge, exactly as the handoff draws them.
 */
const styles = StyleSheet.create({
  bar: {
    position: "absolute",
    left: TAB_BAR_GAP,
    right: TAB_BAR_GAP,
    height: TAB_BAR_H,
    padding: 3,
    flexDirection: "row",
    backgroundColor: c.bg,
    borderRadius: tokens.radius.pill,
    borderWidth: 1,
    borderColor: c.line,
    zIndex: 20,
    ...tokens.shadow.float,
  },
  indicator: { position: "absolute", top: 3, left: 3, height: 52 },
  indicatorFill: { flex: 1, borderRadius: tokens.radius.pill },
  cell: { flex: 1, minWidth: 0, height: 52, borderRadius: tokens.radius.pill },
  cellInner: { flex: 1, alignItems: "center", justifyContent: "center", borderRadius: tokens.radius.pill },
  pressFill: { backgroundColor: c.surface },
  // Focus (keyboard / D-pad only — Android never focuses a Pressable in touch mode): a 2px ink ring.
  // Drawn on the cell's inner pill rather than 2px outside it: the bar's border + padding leave no
  // room for an outside ring in RN, which has no box-shadow spread.
  focus: { borderWidth: 2, borderColor: c.ink },
  overhang: { overflow: "visible" },
  labelOn: { fontSize: 12, lineHeight: 16, letterSpacing: 0, fontWeight: tokens.font.weight.bold },
  labelOff: { fontSize: 12, lineHeight: 16, letterSpacing: 0, fontWeight: tokens.font.weight.semibold, color: c.muted },
  badge: { position: "absolute", borderWidth: 2, borderColor: c.bg, borderRadius: tokens.radius.pill, transformOrigin: "0% 100%", ...tokens.shadow.badge },
  dot: { top: 4, width: 12, height: 12, backgroundColor: c.highlight },
  box: { top: 0, height: 20, minWidth: 20, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 4, paddingHorizontal: 4 },
  count: { backgroundColor: c.cta },
  warn: { width: 20, paddingHorizontal: 0, backgroundColor: c.highlight },
  live: { paddingLeft: 5, paddingRight: 6, backgroundColor: c.liveBar },
  liveDot: { width: 6, height: 6, borderRadius: tokens.radius.pill, backgroundColor: c.illusGold },
  badgeText: { fontSize: 12, lineHeight: 16, fontWeight: tokens.font.weight.bold, fontVariant: ["tabular-nums"] },
});
