/**
 * Tab bar v1.4 glass (`packages/design/handoff/tab-bar-v1/` README "Accessibility fallback", ledger D-56
 * §6) — the material pins:
 * - glass is `bg` at 93% over a 24 blur: expo-blur's `systemChromeMaterialLight` at intensity 96
 *   (Android blur radius 96 / 4), on a transparent bar — raised from the handoff's 72% so an idle label
 *   stays readable (≥ 4.5:1) over any backdrop, black included (owner, ledger D-56 §6);
 * - the bar is solid `bg` (and draws no blur) when `material="solid"`, on Android below API 31, on a
 *   low-RAM phone, and while Reduce Transparency or increased contrast is on — live, both ways;
 * - it is never translucent without blur.
 */
import { tokens } from "@lynia/shared/tokens";
import { BlurView } from "expo-blur";
import React from "react";
import { AccessibilityInfo, StyleSheet } from "react-native";
import renderer, { act } from "react-test-renderer";
import { SafeAreaProvider } from "react-native-safe-area-context";

jest.mock("../../haptics", () => ({ haptic: jest.fn() }));

import { APP_TABS, TabBar } from "../TabBar";
import { blurSupported, GLASS_MIN_API, GLASS_MIN_RAM_BYTES, lowRam } from "../useGlass";

const METRICS = { insets: { top: 0, left: 0, right: 0, bottom: 24 }, frame: { x: 0, y: 0, width: 360, height: 720 } };
const GIB = 1024 ** 3;

/** expo-blur's white-overlay factors for the two chrome tints (Android TintStyle / web getBackgroundColor). */
const TINT_WHITE = { systemChromeMaterial: 0.75, systemChromeMaterialLight: 0.97 } as const;

/** WCAG 2 relative luminance / contrast, and `top` at `alpha` composited over `bottom` (sRGB, as drawn). */
const rgb = (hex: string): number[] => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const lum = (c: number[]): number => {
  const [r, g, b] = c.map((v) => (v / 255 <= 0.04045 ? v / 255 / 12.92 : ((v / 255 + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r! + 0.7152 * g! + 0.0722 * b!;
};
const contrast = (a: string | number[], b: string | number[]): number => {
  const [x, y] = [a, b].map((c) => lum(typeof c === "string" ? rgb(c) : c)).sort((p, q) => q - p);
  return (x! + 0.05) / (y! + 0.05);
};
const over = (top: string, alpha: number, bottom: string): number[] => rgb(top).map((t, i) => alpha * t + (1 - alpha) * rgb(bottom)[i]!);

async function mount(el: React.ReactElement): Promise<renderer.ReactTestRenderer> {
  let r!: renderer.ReactTestRenderer;
  await act(async () => {
    r = renderer.create(<SafeAreaProvider initialMetrics={METRICS}>{el}</SafeAreaProvider>);
  });
  return r;
}

const flat = (n: renderer.ReactTestInstance) => StyleSheet.flatten(n.props.style) ?? {};
const barOf = (r: renderer.ReactTestRenderer) => r.root.findAll((n) => n.props.accessibilityRole === "tablist" && typeof n.type === "string")[0]!;
const blurOf = (r: renderer.ReactTestRenderer) => r.root.findAll((n) => n.type === BlurView);

/** Capture the bar's OS-setting listeners so a test can flip a setting while it's mounted. */
function captureListeners(): Record<string, (on: boolean) => void> {
  const seen: Record<string, (on: boolean) => void> = {};
  jest.spyOn(AccessibilityInfo, "addEventListener").mockImplementation(((name: string, fn: (on: boolean) => void) => {
    seen[name] = fn;
    return { remove: () => undefined };
  }) as never);
  return seen;
}

afterEach(() => jest.restoreAllMocks());

describe("glass eligibility", () => {
  it("blurs on iOS and on Android from API 31, never below it", () => {
    expect(blurSupported("ios", 17)).toBe(true);
    expect(blurSupported("android", GLASS_MIN_API)).toBe(true);
    expect(blurSupported("android", 30)).toBe(false);
    expect(blurSupported("android", 26)).toBe(false);
  });

  it("needs backdrop-filter on web", () => {
    expect(blurSupported("web", NaN)).toBe(false); // jsdom-less jest has no CSS.supports
  });

  it("keeps 2–3GB Android phones solid, 4GB+ glass, unknown memory glass", () => {
    expect(GLASS_MIN_RAM_BYTES).toBe(3.5 * GIB);
    expect(lowRam("android", 1.8 * GIB)).toBe(true);
    expect(lowRam("android", 2.8 * GIB)).toBe(true); // sold as 3GB
    expect(lowRam("android", 3.7 * GIB)).toBe(false); // sold as 4GB
    expect(lowRam("android", null)).toBe(false);
    expect(lowRam("ios", 2 * GIB)).toBe(false);
  });
});

describe("TabBar material", () => {
  it("is glass by default: a transparent bar over a 93% bg / 24 blur", async () => {
    const r = await mount(<TabBar tabs={APP_TABS} active="home" reduceMotion />);
    const [blur] = blurOf(r);
    expect(blur).toBeDefined();
    expect([blur!.props.intensity, blur!.props.tint, blur!.props.experimentalBlurMethod]).toEqual([96, "systemChromeMaterialLight", "dimezisBlurView"]);
    // 0.97 × 96 / 100 = 93% white (= bg) overlay; 96 / the default reduction factor 4 = a 24 radius.
    expect(tokens.color.bg.toUpperCase()).toBe("#FFFFFF");
    expect(blur!.props.blurReductionFactor).toBeUndefined();
    expect(flat(blur!)).toMatchObject({ position: "absolute", borderRadius: tokens.radius.pill, overflow: "hidden" });
    expect(blur!.props.pointerEvents).toBe("none");
    expect(flat(barOf(r)).backgroundColor).toBe("transparent");
  });

  it("is solid bg with no blur when material is solid", async () => {
    const r = await mount(<TabBar tabs={APP_TABS} active="home" reduceMotion material="solid" />);
    expect(blurOf(r)).toHaveLength(0);
    expect(flat(barOf(r)).backgroundColor).toBe(tokens.color.bg);
  });

  it("falls back to solid while Reduce Transparency is on", async () => {
    jest.spyOn(AccessibilityInfo, "isReduceTransparencyEnabled").mockResolvedValue(true);
    const r = await mount(<TabBar tabs={APP_TABS} active="home" reduceMotion />);
    expect(blurOf(r)).toHaveLength(0);
    expect(flat(barOf(r)).backgroundColor).toBe(tokens.color.bg);
  });

  it("follows Increase Contrast live, both ways", async () => {
    const on = captureListeners();
    jest.spyOn(AccessibilityInfo, "isReduceTransparencyEnabled").mockResolvedValue(false);
    jest.spyOn(AccessibilityInfo, "isDarkerSystemColorsEnabled").mockResolvedValue(false);
    const r = await mount(<TabBar tabs={APP_TABS} active="home" reduceMotion />);
    expect(blurOf(r)).toHaveLength(1);
    await act(async () => on.darkerSystemColorsChanged!(true));
    expect(blurOf(r)).toHaveLength(0);
    expect(flat(barOf(r)).backgroundColor).toBe(tokens.color.bg);
    await act(async () => on.darkerSystemColorsChanged!(false));
    expect(blurOf(r)).toHaveLength(1);
    expect(flat(barOf(r)).backgroundColor).toBe("transparent");
  });

  it("reads an unanswerable setting as off rather than never showing glass", async () => {
    jest.spyOn(AccessibilityInfo, "isReduceTransparencyEnabled").mockRejectedValue(null);
    jest.spyOn(AccessibilityInfo, "isDarkerSystemColorsEnabled").mockRejectedValue(null);
    const r = await mount(<TabBar tabs={APP_TABS} active="home" reduceMotion />);
    expect(blurOf(r)).toHaveLength(1);
  });

  it("keeps an idle label readable (≥ 4.5:1) through the glass over any backdrop, black included", async () => {
    const r = await mount(<TabBar tabs={APP_TABS} active="home" reduceMotion />);
    const { intensity, tint } = blurOf(r)[0]!.props as { intensity: number; tint: keyof typeof TINT_WHITE };
    // expo-blur 15's Android overlay (TintStyle.toColorInt): white at floor(255 × intensity / 100 × factor).
    const alpha = Math.floor(255 * (intensity / 100) * TINT_WHITE[tint]) / 255;
    for (const backdrop of ["#000000", tokens.color.ink, tokens.color.forest]) {
      expect(contrast(tokens.color.muted, over(tokens.color.bg, alpha, backdrop))).toBeGreaterThanOrEqual(4.5);
    }
    // The handoff's 72% (systemChromeMaterial) is what this guards against: about 3:1 over black.
    expect(contrast(tokens.color.muted, over(tokens.color.bg, Math.floor(255 * 0.96 * TINT_WHITE.systemChromeMaterial) / 255, "#000000"))).toBeLessThan(4.5);
  });

  it("is never translucent without the blur", async () => {
    for (const material of ["glass", "solid"] as const) {
      const r = await mount(<TabBar tabs={APP_TABS} active="orders" reduceMotion material={material} />);
      const bg = flat(barOf(r)).backgroundColor;
      expect(bg === tokens.color.bg || blurOf(r).length === 1).toBe(true);
    }
  });
});

// Owner (2026-10-06, ledger D-56 §6): "option A but make is as thin as possible and greyer".
describe("TabBar edge", () => {
  it("outlines the pill with one physical pixel of the idle-art grey, glass or solid, as an overlay", async () => {
    for (const material of ["glass", "solid"] as const) {
      const r = await mount(<TabBar tabs={APP_TABS} active="home" reduceMotion material={material} />);
      const edges = r.root.findAll((n) => typeof n.type === "string" && flat(n).borderColor === tokens.color.illusIdleMid);
      expect(edges).toHaveLength(1);
      const edge = flat(edges[0]!);
      expect(edge).toMatchObject({ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, borderRadius: tokens.radius.pill });
      expect(edge.borderWidth).toBe(StyleSheet.hairlineWidth);
      expect(edges[0]!.props.pointerEvents).toBe("none");
      // The bar itself is untouched: no border of its own, no shadow, padding 4 so the cells sit 4 in.
      const bar = flat(barOf(r));
      expect([bar.borderWidth, bar.shadowOpacity, bar.elevation, bar.padding]).toEqual([undefined, undefined, undefined, 4]);
    }
  });
});
