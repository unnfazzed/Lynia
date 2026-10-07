import { AppState, Platform } from "react-native";
import { __resetReachability, __setProbeFetch, isReachable, reportUnreachable } from "../reachability";
import { wireReachabilitySignals } from "../reachability-signals";

/**
 * After a long outage the /health probe sits in a 30s heartbeat. These pin the hints that make it look
 * NOW: returning to the app, and the browser's online event. And the browser's offline event, which is
 * trustworthy, flips reachability at once instead of waiting for a request to time out.
 */

const originalOS = Platform.OS;
let appStateHandler: ((s: string) => void) | null = null;
const probe = jest.fn(async () => true);

beforeEach(() => {
  jest.useFakeTimers();
  probe.mockClear();
  __setProbeFetch(probe);
  __resetReachability();
  jest.spyOn(AppState, "addEventListener").mockImplementation(((_: string, fn: (s: string) => void) => {
    appStateHandler = fn;
    return { remove: () => (appStateHandler = null) };
  }) as never);
});
afterEach(() => {
  Object.defineProperty(Platform, "OS", { value: originalOS, configurable: true });
  jest.restoreAllMocks();
  jest.clearAllTimers();
  jest.useRealTimers();
});

it("probes immediately when the app returns to the foreground while offline", async () => {
  const off = wireReachabilitySignals();
  reportUnreachable();
  // Burn the backoff to its 30s cap with failing probes.
  probe.mockResolvedValue(false);
  for (let i = 0; i < 5; i += 1) await jest.runOnlyPendingTimersAsync();
  probe.mockClear();
  probe.mockResolvedValue(true);

  appStateHandler?.("active");
  await Promise.resolve();
  await Promise.resolve();
  expect(probe).toHaveBeenCalledTimes(1);
  expect(isReachable()).toBe(true);
  off();
});

it("does nothing on foreground while already online", () => {
  const off = wireReachabilitySignals();
  appStateHandler?.("active");
  expect(probe).not.toHaveBeenCalled();
  off();
});

it("on the web, the browser's offline event flips reachability and online probes at once", async () => {
  Object.defineProperty(Platform, "OS", { value: "web", configurable: true });
  const listeners = new Map<string, () => void>();
  const add = jest.fn((type: string, fn: () => void) => void listeners.set(type, fn));
  const remove = jest.fn((type: string) => void listeners.delete(type));
  Object.assign(globalThis, { addEventListener: add, removeEventListener: remove });

  const off = wireReachabilitySignals();
  listeners.get("offline")?.();
  expect(isReachable()).toBe(false);

  probe.mockResolvedValue(true);
  listeners.get("online")?.();
  await Promise.resolve();
  await Promise.resolve();
  expect(probe).toHaveBeenCalledTimes(1);
  expect(isReachable()).toBe(true);

  off();
  expect(listeners.size).toBe(0);
});
