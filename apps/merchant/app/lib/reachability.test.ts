import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { nextProbeDelayMs, ReachabilityStore, type ReachabilityState } from "./reachability";

describe("nextProbeDelayMs", () => {
  it("doubles from 2s and caps at 30s", () => {
    expect(nextProbeDelayMs(0)).toBe(2_000);
    expect(nextProbeDelayMs(1)).toBe(4_000);
    expect(nextProbeDelayMs(2)).toBe(8_000);
    expect(nextProbeDelayMs(3)).toBe(16_000);
    expect(nextProbeDelayMs(4)).toBe(30_000);
    expect(nextProbeDelayMs(10)).toBe(30_000);
  });
});

describe("ReachabilityStore", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("starts reachable and stays reachable on repeated success", () => {
    const store = new ReachabilityStore(async () => true, "http://api", () => 0);
    expect(store.getState().reachable).toBe(true);
    store.reportReachable();
    expect(store.getState()).toEqual({ reachable: true, attempt: 0, unreachableSinceMs: null });
  });

  it("flips unreachable, starts probing with backoff, and recovers on the first ok probe", async () => {
    let ok = false;
    const probe = vi.fn(async () => ok);
    const store = new ReachabilityStore(probe, "http://api", () => 42);
    store.start();

    store.reportUnreachable();
    expect(store.getState()).toMatchObject({ reachable: false, unreachableSinceMs: 42 });
    // First probe scheduled after 2s (attempt 0 -> 1 shown immediately per the UI's "(attempt N)").
    expect(store.getState().attempt).toBe(1);

    await vi.advanceTimersByTimeAsync(2_000);
    expect(probe).toHaveBeenCalledTimes(1);
    // Still down — schedules the next probe at 4s (attempt now 2).
    expect(store.getState().reachable).toBe(false);
    expect(store.getState().attempt).toBe(2);

    ok = true;
    await vi.advanceTimersByTimeAsync(4_000);
    expect(store.getState()).toEqual({ reachable: true, attempt: 0, unreachableSinceMs: null });
  });

  it("notifies subscribers on every transition", () => {
    const store = new ReachabilityStore(async () => true, "http://api", () => 0);
    const seen: ReachabilityState[] = [];
    const unsubscribe = store.subscribe((s) => seen.push(s));
    store.reportUnreachable();
    store.reportReachable();
    unsubscribe();
    store.reportUnreachable();
    expect(seen).toHaveLength(2);
  });

  it("stop() cancels a pending probe so it never fires", async () => {
    const probe = vi.fn(async () => true);
    const store = new ReachabilityStore(probe, "http://api", () => 0);
    store.start();
    store.reportUnreachable();
    store.stop();
    await vi.advanceTimersByTimeAsync(10_000);
    expect(probe).not.toHaveBeenCalled();
  });
});
