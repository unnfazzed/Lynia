import React from "react";
import { InteractionManager } from "react-native";
import TestRenderer, { act } from "react-test-renderer";
import { prewarmedRoutes, prewarmRoute, usePrewarmRoutes, __resetPrewarmedRoutes, type PrewarmRoute } from "../prewarm-routes";

/**
 * The route prewarm registry (docs/ANDROID-TAP-RESPONSIVENESS-RCA-2026-08-19.md §2.1). expo-router
 * evaluates a route's module graph on the FIRST navigation to it — synchronously, inside the tap
 * handler — which is why the first tap into a screen is the slow one and later taps to the same
 * screen are not. This moves that evaluation into the idle time of the screen that links to it.
 * PERF-SEND-01 did it for `/send` alone; the registry does it for the five other heavy routes.
 *
 * `react-native` is deliberately NOT module-mocked here: the whole point of `prewarmRoute` is that
 * it really evaluates a route's module graph, and a stubbed react-native would make every `require`
 * throw and every assertion below vacuous. The interaction scheduler is spied on instead, so the
 * routes load for real while the test still controls when each idle slot runs.
 */

let slots: (() => void)[] = [];
const cancels: jest.Mock[] = [];
let runAfterInteractions: jest.SpyInstance;

/** Run one queued interaction slot; returns whether there was one. */
function runNextSlot(): boolean {
  const next = slots.shift();
  if (!next) return false;
  act(() => {
    next();
  });
  return true;
}

/** Drain every slot, including ones a slot schedules as it finishes (the chain). */
function drainSlots(max = 20): void {
  let ran = 0;
  while (ran < max && runNextSlot()) ran++;
}

/** Minimal hook harness — this app has no @testing-library/react-native (see use-app-fonts.test.tsx). */
function renderHook(hook: () => void): { unmount: () => void } {
  const Probe = (): null => {
    hook();
    return null;
  };
  let tree!: TestRenderer.ReactTestRenderer;
  act(() => {
    tree = TestRenderer.create(React.createElement(Probe));
  });
  return {
    unmount: () =>
      act(() => {
        tree.unmount();
      }),
  };
}

beforeEach(() => {
  slots = [];
  cancels.length = 0;
  __resetPrewarmedRoutes();
  runAfterInteractions = jest.spyOn(InteractionManager, "runAfterInteractions").mockImplementation(((cb: () => void) => {
    slots.push(cb);
    const cancel = jest.fn();
    cancels.push(cancel);
    return { cancel };
  }) as never);
});
afterEach(() => runAfterInteractions.mockRestore());

describe("prewarmRoute", () => {
  it("evaluates a real route module and records it as warm", () => {
    expect(prewarmRoute("order")).toBe(true);
    expect(prewarmedRoutes()).toEqual(["order"]);
  });

  it("is a no-op the second time — the module cache already holds it", () => {
    prewarmRoute("foodCheckout");
    expect(prewarmRoute("foodCheckout")).toBe(true);
    expect(prewarmedRoutes()).toEqual(["foodCheckout"]);
  });

  it("resolves every route in the registry", () => {
    const all: PrewarmRoute[] = ["send", "order", "foodOrder", "foodCheckout", "riderJob", "riderFoodJob"];
    for (const route of all) expect(prewarmRoute(route)).toBe(true);
    expect([...prewarmedRoutes()].sort()).toEqual([...all].sort());
  });
});

describe("usePrewarmRoutes", () => {
  it("warms ONE route per interaction slot, not all of them in one block", () => {
    renderHook(() => usePrewarmRoutes(["order", "foodCheckout"]));

    // Only the first is scheduled up front; evaluating both inside one callback would hand the JS
    // thread a single long block — the stall this program removes, just moved off the tap.
    expect(slots).toHaveLength(1);
    runNextSlot();
    expect(prewarmedRoutes()).toEqual(["order"]);

    // ...and finishing the first schedules the second.
    expect(slots).toHaveLength(1);
    runNextSlot();
    expect(prewarmedRoutes()).toEqual(["order", "foodCheckout"]);
  });

  it("schedules nothing at all when every route is already warm", () => {
    prewarmRoute("order");
    renderHook(() => usePrewarmRoutes(["order"]));
    expect(slots).toHaveLength(0);
  });

  it("stops the chain when the screen unmounts mid-warm", () => {
    const { unmount } = renderHook(() => usePrewarmRoutes(["order", "foodCheckout", "send"]));
    runNextSlot(); // "order" warms; "foodCheckout" is scheduled
    unmount();
    drainSlots();
    expect(prewarmedRoutes()).toEqual(["order"]);
    expect(cancels.some((c) => c.mock.calls.length > 0)).toBe(true);
  });

  it("warms the whole list when left to run", () => {
    renderHook(() => usePrewarmRoutes(["riderJob", "riderFoodJob"]));
    drainSlots();
    expect(prewarmedRoutes()).toEqual(["riderJob", "riderFoodJob"]);
  });
});
