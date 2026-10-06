/**
 * Tab bar v1.4 glass (`packages/design/handoff/tab-bar-v1/` README "Accessibility fallback", ledger D-56
 * §6) — the material pins:
 * - glass is `bg` at 72% over a 24 blur: expo-blur's `systemChromeMaterial` at intensity 96 (Android
 *   blur radius 96 / 4), on a transparent bar;
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
  it("is glass by default: a transparent bar over a 72% bg / 24 blur", async () => {
    const r = await mount(<TabBar tabs={APP_TABS} active="home" reduceMotion />);
    const [blur] = blurOf(r);
    expect(blur).toBeDefined();
    expect([blur!.props.intensity, blur!.props.tint, blur!.props.experimentalBlurMethod]).toEqual([96, "systemChromeMaterial", "dimezisBlurView"]);
    // 0.75 × 96 / 100 = 72% white (= bg) overlay; 96 / the default reduction factor 4 = a 24 radius.
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

  it("is never translucent without the blur", async () => {
    for (const material of ["glass", "solid"] as const) {
      const r = await mount(<TabBar tabs={APP_TABS} active="orders" reduceMotion material={material} />);
      const bg = flat(barOf(r)).backgroundColor;
      expect(bg === tokens.color.bg || blurOf(r).length === 1).toBe(true);
    }
  });
});
