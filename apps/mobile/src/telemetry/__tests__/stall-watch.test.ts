/**
 * JS-stall watch (src/telemetry/stall-watch.ts, MOB-WHITE-01): a tick that arrives more than STALL_MS late
 * reports `js_stall` with the gap and the route; normal ticks and background time report nothing.
 */
const mockTrack = jest.fn();
jest.mock("../events", () => ({
  EVENTS: { jsStall: "js_stall" },
  track: (e: string, p: unknown) => mockTrack(e, p),
}));
jest.mock("expo-device", () => ({ totalMemory: 2 * 1024 ** 3 }));
let mockEndedAt: number | null = 1;
jest.mock("../../boot/boot-readiness", () => ({ getBootReadiness: () => ({ endedAt: mockEndedAt }) }));
let mockAppStateListener: ((s: string) => void) | null = null;
jest.mock("react-native", () => ({
  AppState: {
    currentState: "active",
    addEventListener: (_: string, l: (s: string) => void) => {
      mockAppStateListener = l;
      return { remove: () => undefined };
    },
  },
}));

import { __resetStallWatch, MAX_REPORTS, noteStallScreen, STALL_MS, startStallWatch, tick, TICK_MS } from "../stall-watch";

beforeEach(() => {
  jest.useFakeTimers();
  mockTrack.mockClear();
  mockEndedAt = 1;
  __resetStallWatch();
});
afterEach(() => {
  __resetStallWatch();
  jest.useRealTimers();
});

it("reports nothing while ticks arrive on time", () => {
  startStallWatch();
  jest.advanceTimersByTime(10_000);
  expect(mockTrack).not.toHaveBeenCalled();
});

it("reports a blocked JS thread with its length, route, boot flag and RAM class", () => {
  startStallWatch();
  noteStallScreen("/order/[id]");
  const t0 = Date.now();
  tick(t0 + TICK_MS + STALL_MS + 1_500);
  expect(mockTrack).toHaveBeenCalledWith("js_stall", {
    stall_ms: STALL_MS + 1_500,
    screen: "/order/[id]",
    during_boot: false,
    ram_gb: 2,
    nth: 1,
  });
});

it("flags a stall during the cold start", () => {
  mockEndedAt = null;
  startStallWatch();
  tick(Date.now() + TICK_MS + STALL_MS);
  expect(mockTrack.mock.calls[0][1]).toMatchObject({ during_boot: true });
});

it("ignores a gap just under the threshold", () => {
  startStallWatch();
  tick(Date.now() + TICK_MS + STALL_MS - 1);
  expect(mockTrack).not.toHaveBeenCalled();
});

it("does not count background time as a stall", () => {
  startStallWatch();
  mockAppStateListener?.("background");
  // A minute in the background: the clock is stopped, so resuming starts fresh.
  jest.setSystemTime(Date.now() + 60_000);
  mockAppStateListener?.("active");
  jest.advanceTimersByTime(TICK_MS * 4);
  expect(mockTrack).not.toHaveBeenCalled();
});

it("caps reports per launch", () => {
  startStallWatch();
  let now = Date.now();
  for (let i = 0; i < MAX_REPORTS + 5; i++) {
    now += TICK_MS + STALL_MS + 100;
    tick(now);
  }
  expect(mockTrack).toHaveBeenCalledTimes(MAX_REPORTS);
});
