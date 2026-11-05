/**
 * Tab bar material, D-123 (owner 2026-11-05): the bar is the handoff's solid variant on every platform —
 * opaque `bg`, `--shadow-float`, the D-56 §6 hairline edge, never a blur (the Android blur was the prime
 * suspect for MOB-WHITE-01). The active `tileMint` pill is drawn by each cell and shows from the first
 * frame; the focus ring is keyboard-only on the web.
 */
import { tokens } from "@lynia/shared/tokens";
import { BlurView } from "expo-blur";
import React from "react";
import { Platform, StyleSheet } from "react-native";
import renderer, { act } from "react-test-renderer";
import { SafeAreaProvider } from "react-native-safe-area-context";

jest.mock("../../haptics", () => ({ haptic: jest.fn() }));

import { __setKeyboardModality, APP_TABS, EDGE, focusRingWanted, TabBar } from "../TabBar";

const METRICS = { insets: { top: 0, left: 0, right: 0, bottom: 24 }, frame: { x: 0, y: 0, width: 360, height: 720 } };

async function mount(el: React.ReactElement): Promise<renderer.ReactTestRenderer> {
  let r!: renderer.ReactTestRenderer;
  await act(async () => {
    r = renderer.create(<SafeAreaProvider initialMetrics={METRICS}>{el}</SafeAreaProvider>);
  });
  return r;
}

const flat = (n: renderer.ReactTestInstance) => StyleSheet.flatten(n.props.style) ?? {};
const barOf = (r: renderer.ReactTestRenderer) => r.root.findAll((n) => n.props.accessibilityRole === "tablist" && typeof n.type === "string")[0]!;
const mintOf = (r: renderer.ReactTestRenderer) => r.root.findAll((n) => typeof n.type === "string" && flat(n).backgroundColor === tokens.color.tileMint);
/** An Animated opacity as the test renderer sees it (a plain number once Animated has flattened it). */
const opacityOf = (n: renderer.ReactTestInstance): unknown => flat(n).opacity;

describe("TabBar material (D-123)", () => {
  it.each(["android", "ios", "web"] as const)("is solid bg with the float shadow and no blur on %s", async (os) => {
    const restore = jest.replaceProperty(Platform, "OS", os);
    try {
      for (const material of ["glass", "solid"] as const) {
        const r = await mount(<TabBar tabs={APP_TABS} active="home" reduceMotion material={material} />);
        expect(r.root.findAll((n) => n.type === BlurView)).toHaveLength(0);
        const bar = flat(barOf(r));
        expect(bar.backgroundColor).toBe(tokens.color.bg);
        expect(bar).toMatchObject(tokens.shadow.float);
        expect(bar.padding).toBe(4);
      }
    } finally {
      restore.restore();
    }
  });

  it("keeps the owner's hairline edge as an overlay", async () => {
    const r = await mount(<TabBar tabs={APP_TABS} active="home" reduceMotion />);
    const edges = r.root.findAll((n) => typeof n.type === "string" && flat(n).borderColor === EDGE);
    expect(edges).toHaveLength(1);
    expect(flat(edges[0]!)).toMatchObject({ position: "absolute", top: 0, left: 0, right: 0, bottom: 0, borderRadius: tokens.radius.pill });
    expect(flat(edges[0]!).borderWidth).toBe(StyleSheet.hairlineWidth);
  });
});

describe("TabBar active pill (D-123)", () => {
  it("shows the active tab's mint from the first frame, before the bar has measured itself", async () => {
    // No onLayout is fired here: the old shared indicator drew nothing until it had.
    for (const [i, active] of ["home", "orders", "account"].entries()) {
      const r = await mount(<TabBar tabs={APP_TABS} active={active} reduceMotion />);
      const mint = mintOf(r);
      expect(mint).toHaveLength(APP_TABS.length);
      expect(mint.map(opacityOf)).toEqual(APP_TABS.map((_, j) => (j === i ? 1 : 0)));
      expect(flat(mint[i]!).borderRadius).toBe(tokens.radius.pill);
    }
  });

  it("moves the mint to the new tab when the active tab changes", async () => {
    const r = await mount(<TabBar tabs={APP_TABS} active="home" reduceMotion />);
    await act(async () => {
      r.update(
        <SafeAreaProvider initialMetrics={METRICS}>
          <TabBar tabs={APP_TABS} active="account" reduceMotion />
        </SafeAreaProvider>,
      );
    });
    expect(mintOf(r).map(opacityOf)).toEqual([0, 0, 1]);
  });
});

describe("TabBar focus ring (D-123)", () => {
  afterEach(() => __setKeyboardModality(false));

  it("never rings a tapped tab on the web, only a keyboard-focused one", () => {
    __setKeyboardModality(false);
    expect(focusRingWanted("web")).toBe(false);
    __setKeyboardModality(true);
    expect(focusRingWanted("web")).toBe(true);
  });

  it("rings on native, where only a keyboard or D-pad can focus a tab", () => {
    expect(focusRingWanted("android")).toBe(true);
    expect(focusRingWanted("ios")).toBe(true);
  });

  it("draws no ink ring after a tap-focus on the web", async () => {
    const restore = jest.replaceProperty(Platform, "OS", "web");
    try {
      const r = await mount(<TabBar tabs={APP_TABS} active="home" reduceMotion />);
      const tab = r.root.findAll((n) => n.props.accessibilityRole === "tab" && typeof n.props.onFocus === "function")[0]!;
      act(() => tab.props.onFocus());
      const ringed = r.root.findAll((n) => typeof n.type === "string" && flat(n).borderWidth === 2 && flat(n).borderColor === tokens.color.ink);
      expect(ringed).toHaveLength(0);
    } finally {
      restore.restore();
    }
  });
});
