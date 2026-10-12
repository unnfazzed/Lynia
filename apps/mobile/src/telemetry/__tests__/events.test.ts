/**
 * Funnel events (src/telemetry/events.ts): R2/R3/F1–F8/the board are all `/rider` and P1–P13 all
 * `/permissions` to the route-pattern screen tracker, so these name the step. Pinned: no-op without an
 * analytics key, a bounded queue until the SDK arms, then a flush to the live client.
 */
let mockEnabled = true;
jest.mock("../../config", () => ({ analyticsEnabled: () => mockEnabled }));

import { __resetEvents, setAnalyticsSink, track } from "../events";

beforeEach(() => {
  mockEnabled = true;
  __resetEvents();
});

describe("track", () => {
  it("queues until the SDK's client arrives, then flushes in order", () => {
    track("a", { screen: "F3" });
    track("b");
    const capture = jest.fn();
    setAnalyticsSink({ capture });
    expect(capture.mock.calls).toEqual([
      ["a", { screen: "F3" }],
      ["b", undefined],
    ]);
    track("c", { ok: true });
    expect(capture).toHaveBeenLastCalledWith("c", { ok: true });
  });

  it("is a no-op without an analytics key (nothing queued either)", () => {
    mockEnabled = false;
    track("a");
    mockEnabled = true;
    const capture = jest.fn();
    setAnalyticsSink({ capture });
    expect(capture).not.toHaveBeenCalled();
  });

  it("keeps the queue bounded and never throws on a failing client", () => {
    for (let i = 0; i < 80; i++) track(`e${i}`);
    const capture = jest.fn((_event: string, _props?: unknown) => {
      throw new Error("sdk");
    });
    expect(() => setAnalyticsSink({ capture })).not.toThrow();
    expect(capture).toHaveBeenCalledTimes(50);
    expect(capture.mock.calls[0]![0]).toBe("e30");
    expect(() => track("x")).not.toThrow();
  });
});
