import TestRenderer, { act } from "react-test-renderer";

let mockSegments: string[] = ["(tabs)", "home"];
jest.mock("expo-router", () => ({ useSegments: () => mockSegments }));

const mockEnqueueNavOpen = jest.fn();
jest.mock("../rum", () => ({ enqueueNavOpen: (ms: number) => mockEnqueueNavOpen(ms) }));

let mockInteractionCallbacks: (() => void)[] = [];
jest.mock("react-native", () => ({
  InteractionManager: {
    runAfterInteractions: (cb: () => void) => {
      mockInteractionCallbacks.push(cb);
      return { cancel: jest.fn() };
    },
  },
}));

import { NAV_TOUCH_MAX_AGE_MS, NavOpenProbe } from "../nav-timing";
import { noteTouch, __resetTapSignal } from "../tap-signal";

/**
 * `nav_open` — tap → destination screen on glass. The interesting behaviour is entirely in what it
 * REFUSES to measure: a route change nobody pressed for is a redirect, a deep link or a
 * socket-driven navigation, and filing those under "how long the tap took" would make the histogram
 * describe a latency no person ever waited through
 * (docs/ANDROID-TAP-RESPONSIVENESS-RCA-2026-08-19.md §3).
 */

/** Flush the post-interaction callbacks the probe scheduled. */
function settleFrame(): void {
  const pending = mockInteractionCallbacks;
  mockInteractionCallbacks = [];
  act(() => {
    for (const cb of pending) cb();
  });
}

function mountProbe(): TestRenderer.ReactTestRenderer {
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(<NavOpenProbe />);
  });
  return tree;
}

function navigateTo(segments: string[], tree: TestRenderer.ReactTestRenderer): void {
  mockSegments = segments;
  act(() => {
    tree.update(<NavOpenProbe />);
  });
}

beforeEach(() => {
  jest.useFakeTimers();
  jest.setSystemTime(new Date("2026-08-19T09:00:00Z"));
  mockSegments = ["(tabs)", "home"];
  mockEnqueueNavOpen.mockClear();
  mockInteractionCallbacks = [];
  __resetTapSignal();
});
afterEach(() => jest.useRealTimers());

describe("NavOpenProbe", () => {
  it("renders nothing", () => {
    expect(mountProbe().toJSON()).toBeNull();
  });

  it("times a tap through to the destination's first presented frame", () => {
    const tree = mountProbe();
    noteTouch(Date.now());
    jest.setSystemTime(Date.now() + 120);
    navigateTo(["order", "[id]"], tree);
    jest.setSystemTime(Date.now() + 260); // the rest of the mount, up to the frame
    settleFrame();
    expect(mockEnqueueNavOpen).toHaveBeenCalledWith(380);
  });

  it("ignores the cold-start route — the boot marks already own that segment", () => {
    noteTouch(Date.now());
    mountProbe();
    settleFrame();
    expect(mockEnqueueNavOpen).not.toHaveBeenCalled();
  });

  it("ignores a route change no touch preceded (redirect, deep link, socket push)", () => {
    const tree = mountProbe();
    navigateTo(["order", "[id]"], tree);
    settleFrame();
    expect(mockEnqueueNavOpen).not.toHaveBeenCalled();
  });

  it("consumes the touch, so one press cannot be credited with two navigations", () => {
    const tree = mountProbe();
    noteTouch(Date.now());
    navigateTo(["order", "[id]"], tree);
    settleFrame();
    expect(mockEnqueueNavOpen).toHaveBeenCalledTimes(1);

    navigateTo(["food", "cart"], tree);
    settleFrame();
    expect(mockEnqueueNavOpen).toHaveBeenCalledTimes(1);
  });

  it("drops a touch too stale to have caused this navigation", () => {
    const tree = mountProbe();
    noteTouch(Date.now());
    jest.setSystemTime(Date.now() + NAV_TOUCH_MAX_AGE_MS + 1);
    navigateTo(["order", "[id]"], tree);
    settleFrame();
    expect(mockEnqueueNavOpen).not.toHaveBeenCalled();
  });
});
