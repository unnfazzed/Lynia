import { onlineManager } from "@tanstack/react-query";
import {
  __resetReachability,
  __setProbeFetch,
  isReachable,
  nextProbeDelayMs,
  reportReachable,
  reportUnreachable,
  subscribeReachability,
} from "../reachability";

describe("nextProbeDelayMs", () => {
  it("backs off exponentially and caps at 30s", () => {
    expect(nextProbeDelayMs(0)).toBe(2_000);
    expect(nextProbeDelayMs(1)).toBe(4_000);
    expect(nextProbeDelayMs(2)).toBe(8_000);
    expect(nextProbeDelayMs(3)).toBe(16_000);
    expect(nextProbeDelayMs(4)).toBe(30_000); // 32s → capped
    expect(nextProbeDelayMs(12)).toBe(30_000);
  });
});

describe("reachability store", () => {
  beforeEach(() => {
    jest.useFakeTimers();
    __setProbeFetch(async () => false); // default: probe keeps failing unless a test says otherwise
    __resetReachability();
  });
  afterEach(() => {
    jest.clearAllTimers();
    jest.useRealTimers();
  });

  it("starts optimistically online", () => {
    expect(isReachable()).toBe(true);
    expect(onlineManager.isOnline()).toBe(true);
  });

  it("flips offline on a network failure and notifies subscribers + onlineManager", () => {
    const seen: boolean[] = [];
    const unsub = subscribeReachability((r) => seen.push(r));
    reportUnreachable();
    expect(isReachable()).toBe(false);
    expect(onlineManager.isOnline()).toBe(false);
    expect(seen).toEqual([false]);
    unsub();
  });

  it("does not re-notify when already offline", () => {
    reportUnreachable();
    const seen: boolean[] = [];
    subscribeReachability((r) => seen.push(r));
    reportUnreachable(); // still offline — no transition
    expect(seen).toEqual([]);
  });

  it("recovers when the /health probe succeeds", async () => {
    reportUnreachable();
    expect(isReachable()).toBe(false);
    __setProbeFetch(async () => true); // the network is back
    await jest.advanceTimersByTimeAsync(2_000); // first probe fires at 2s
    expect(isReachable()).toBe(true);
    expect(onlineManager.isOnline()).toBe(true);
  });

  it("keeps probing on backoff until the network returns", async () => {
    reportUnreachable();
    await jest.advanceTimersByTimeAsync(2_000); // probe #1 fails
    expect(isReachable()).toBe(false);
    await jest.advanceTimersByTimeAsync(4_000); // probe #2 fails
    expect(isReachable()).toBe(false);
    __setProbeFetch(async () => true);
    await jest.advanceTimersByTimeAsync(8_000); // probe #3 succeeds
    expect(isReachable()).toBe(true);
  });

  it("reportReachable (a passing request) cancels the probe and resets backoff", async () => {
    reportUnreachable();
    reportReachable(); // e.g. a later apiFetch got an HTTP response
    expect(isReachable()).toBe(true);
    const seen: boolean[] = [];
    subscribeReachability((r) => seen.push(r));
    await jest.advanceTimersByTimeAsync(60_000); // no lingering probe should fire
    expect(seen).toEqual([]);
  });
});
