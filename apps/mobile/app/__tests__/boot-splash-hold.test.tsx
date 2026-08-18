/**
 * BootSplashHold — the cold-start splash hold (RCA 2026-08-17 §1.2 full fix). The contract worth
 * pinning is the two-sided guarantee: the green frame stays up until the FIRST real screen's frame
 * settles (dismiss-on-ANY-route — no per-screen cooperation), and it can NEVER strand — a settle cap
 * bounds a route whose interactions never drain, and an absolute cap bounds everything else.
 */
import renderer, { act } from "react-test-renderer";
import { controlInteractions, type InteractionControl } from "../../src/testing/interactions";

let mockPathname = "/";
jest.mock("expo-router", () => ({ usePathname: () => mockPathname }));

// SplashView pulls the Brand SVG tree; a marker stub keeps this test about the HOLD logic.
jest.mock("../splash.view", () => {
  const React_ = require("react");
  const { Text: Text_ } = require("react-native");
  return { SplashView: () => React_.createElement(Text_, null, "SPLASH-FRAME") };
});

import { BOOT_HOLD_ABS_CAP_MS, BOOT_HOLD_SETTLE_CAP_MS, BootSplashHold } from "../boot-splash-hold.view";

const shown = (tree: renderer.ReactTestRenderer): boolean => JSON.stringify(tree.toJSON() ?? "").includes("SPLASH-FRAME");

let interactions: InteractionControl;
let rafQueue: ((time: number) => void)[];
let rafSpy: jest.SpyInstance;
beforeEach(() => {
  jest.useFakeTimers();
  interactions = controlInteractions();
  // rAF under manual control so "one frame past the interactions drain" is a real, ordered assertion.
  rafQueue = [];
  rafSpy = jest.spyOn(globalThis, "requestAnimationFrame").mockImplementation(((cb: (time: number) => void) => {
    rafQueue.push(cb);
    return rafQueue.length;
  }) as never);
  mockPathname = "/";
});
afterEach(() => {
  rafSpy.mockRestore();
  interactions.restore();
  jest.useRealTimers();
});

function render(): renderer.ReactTestRenderer {
  let tree!: renderer.ReactTestRenderer;
  act(() => {
    tree = renderer.create(<BootSplashHold />);
  });
  return tree;
}

const flushFrame = (): void => {
  act(() => interactions.flush());
  act(() => {
    rafQueue.splice(0).forEach((cb) => cb(0));
  });
};

describe("BootSplashHold", () => {
  it("holds the splash frame while the boot route is still current", () => {
    const tree = render();
    expect(shown(tree)).toBe(true);
    // Frames pass on the splash route itself — that must not release anything.
    flushFrame();
    expect(shown(tree)).toBe(true);
    act(() => tree.unmount());
  });

  it("releases one presented frame after ANY real route commits (no per-screen wiring)", () => {
    const tree = render();
    mockPathname = "/order/abc123"; // a push-tap deep link, not home — the generic case
    act(() => {
      tree.update(<BootSplashHold />);
    });
    // Committed but not yet presented: still held.
    expect(shown(tree)).toBe(true);
    flushFrame();
    expect(shown(tree)).toBe(false);
    act(() => tree.unmount());
  });

  it("settle cap: a destination whose interactions never drain still releases", () => {
    const tree = render();
    mockPathname = "/home";
    act(() => {
      tree.update(<BootSplashHold />);
    });
    act(() => {
      jest.advanceTimersByTime(BOOT_HOLD_SETTLE_CAP_MS + 1);
    });
    expect(shown(tree)).toBe(false);
    act(() => tree.unmount());
  });

  it("absolute cap: can never strand a green screen, whatever the router does", () => {
    const tree = render();
    act(() => {
      jest.advanceTimersByTime(BOOT_HOLD_ABS_CAP_MS + 1);
    });
    expect(shown(tree)).toBe(false);
    act(() => tree.unmount());
  });

  it("once released it stays released — warm navigation never resurrects it", () => {
    const tree = render();
    mockPathname = "/home";
    act(() => {
      tree.update(<BootSplashHold />);
    });
    flushFrame();
    expect(shown(tree)).toBe(false);
    mockPathname = "/send";
    act(() => {
      tree.update(<BootSplashHold />);
    });
    expect(shown(tree)).toBe(false);
    act(() => tree.unmount());
  });
});
