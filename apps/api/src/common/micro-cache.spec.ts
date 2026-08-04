import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MicroCache } from "./micro-cache";

describe("MicroCache", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("loads once and serves the cached value within the TTL", async () => {
    const cache = new MicroCache<number>();
    const loader = vi.fn(async () => 7);

    expect(await cache.getOrLoad("k", 1000, loader)).toBe(7);
    expect(await cache.getOrLoad("k", 1000, loader)).toBe(7);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("reloads after the TTL expires", async () => {
    const cache = new MicroCache<number>();
    let n = 0;
    const loader = vi.fn(async () => ++n);

    expect(await cache.getOrLoad("k", 1000, loader)).toBe(1);
    vi.advanceTimersByTime(1001);
    expect(await cache.getOrLoad("k", 1000, loader)).toBe(2);
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("single-flights concurrent callers onto one loader run (stampede guard)", async () => {
    const cache = new MicroCache<number>();
    let resolve!: (n: number) => void;
    const loader = vi.fn(() => new Promise<number>((r) => (resolve = r)));

    const a = cache.getOrLoad("k", 1000, loader);
    const b = cache.getOrLoad("k", 1000, loader);
    resolve(42);
    expect(await a).toBe(42);
    expect(await b).toBe(42);
    expect(loader).toHaveBeenCalledTimes(1);
  });

  it("does not cache a loader failure — the next caller retries", async () => {
    const cache = new MicroCache<number>();
    const loader = vi
      .fn<() => Promise<number>>()
      .mockRejectedValueOnce(new Error("db blip"))
      .mockResolvedValueOnce(9);

    await expect(cache.getOrLoad("k", 1000, loader)).rejects.toThrow("db blip");
    expect(await cache.getOrLoad("k", 1000, loader)).toBe(9);
    expect(loader).toHaveBeenCalledTimes(2);
  });

  it("keys are independent", async () => {
    const cache = new MicroCache<string>();
    expect(await cache.getOrLoad("a", 1000, async () => "A")).toBe("A");
    expect(await cache.getOrLoad("b", 1000, async () => "B")).toBe("B");
  });

  it("evicts oldest-first at capacity", async () => {
    const cache = new MicroCache<number>(2);
    await cache.getOrLoad("a", 10_000, async () => 1);
    await cache.getOrLoad("b", 10_000, async () => 2);
    await cache.getOrLoad("c", 10_000, async () => 3); // evicts "a"

    const reloadA = vi.fn(async () => 10);
    expect(await cache.getOrLoad("a", 10_000, reloadA)).toBe(10);
    expect(reloadA).toHaveBeenCalledTimes(1);

    // "c" (and "b") are still cached — only the oldest fell out.
    const reloadC = vi.fn(async () => 30);
    expect(await cache.getOrLoad("c", 10_000, reloadC)).toBe(3);
    expect(reloadC).not.toHaveBeenCalled();
  });

  it("invalidate drops one key; invalidate() drops all", async () => {
    const cache = new MicroCache<number>();
    await cache.getOrLoad("a", 10_000, async () => 1);
    await cache.getOrLoad("b", 10_000, async () => 2);

    cache.invalidate("a");
    const reloadA = vi.fn(async () => 11);
    expect(await cache.getOrLoad("a", 10_000, reloadA)).toBe(11);
    expect(await cache.getOrLoad("b", 10_000, vi.fn(async () => 22))).toBe(2);

    cache.invalidate();
    const reloadB = vi.fn(async () => 222);
    expect(await cache.getOrLoad("b", 10_000, reloadB)).toBe(222);
  });

  // --- Wave-2 upgrades: observability hook, TTL jitter, optional shared L2 ---

  it("emits one bounded outcome per lookup: miss → hit → coalesced → error", async () => {
    const outcomes: string[] = [];
    const cache = new MicroCache<number>(500, { onEvent: (o) => outcomes.push(o) });

    await cache.getOrLoad("k", 1000, async () => 1); // miss (went to loader)
    await cache.getOrLoad("k", 1000, async () => 2); // hit
    vi.advanceTimersByTime(1001);
    let resolve!: (n: number) => void;
    const slow = cache.getOrLoad("k", 1000, () => new Promise<number>((r) => (resolve = r)));
    const rider = cache.getOrLoad("k", 1000, async () => 99); // coalesced onto the slow flight
    resolve(3);
    await Promise.all([slow, rider]);
    vi.advanceTimersByTime(1001);
    await expect(cache.getOrLoad("k", 1000, async () => { throw new Error("db"); })).rejects.toThrow("db");

    // The slow flight emits its own "miss" when it finally completes (it DID go to the loader);
    // the coalesced rider's event fired at join time, before that completion.
    expect(outcomes).toEqual(["miss", "hit", "coalesced", "miss", "error"]);
  });

  it("a throwing onEvent hook never breaks the lookup (telemetry is not a dependency)", async () => {
    const cache = new MicroCache<number>(500, { onEvent: () => { throw new Error("meter down"); } });
    expect(await cache.getOrLoad("k", 1000, async () => 7)).toBe(7);
  });

  it("applies ±ratio TTL jitter only when opted in (default stays exact)", async () => {
    vi.spyOn(Math, "random").mockReturnValue(1); // max jitter → ttl * (1 + r)
    const jittered = new MicroCache<number>(500, { ttlJitterRatio: 0.1 });
    await jittered.getOrLoad("k", 1000, async () => 1);
    vi.advanceTimersByTime(1050); // inside the jittered 1100ms window → still cached
    const reload = vi.fn(async () => 2);
    expect(await jittered.getOrLoad("k", 1000, reload)).toBe(1);
    expect(reload).not.toHaveBeenCalled();
    vi.advanceTimersByTime(100); // past 1100ms → expired
    expect(await jittered.getOrLoad("k", 1000, reload)).toBe(2);
  });

  it("serves from L2 between instances: seeds L1 with the REMAINING lifetime, not a fresh TTL", async () => {
    const store = new Map<string, string>();
    const l2 = {
      get: async (k: string) => store.get(k) ?? null,
      set: async (k: string, v: string) => void store.set(k, v),
    };
    const writer = new MicroCache<number>(500, { l2: () => l2, l2KeyPrefix: "mc:t:" });
    await writer.getOrLoad("k", 10_000, async () => 42); // populates L1 + L2 envelope {v, exp}
    expect(store.has("mc:t:k")).toBe(true);

    vi.advanceTimersByTime(9_000); // 1s of envelope life left
    const reader = new MicroCache<number>(500, { l2: () => l2, l2KeyPrefix: "mc:t:" });
    const outcomes: string[] = [];
    const readerWithTap = new MicroCache<number>(500, { l2: () => l2, l2KeyPrefix: "mc:t:", onEvent: (o) => outcomes.push(o) });
    const loader = vi.fn(async () => 99);
    expect(await readerWithTap.getOrLoad("k", 10_000, loader)).toBe(42);
    expect(loader).not.toHaveBeenCalled();
    expect(outcomes).toEqual(["l2_hit"]);
    // The seeded L1 entry expires with the envelope (~1s), NOT 10s from now.
    vi.advanceTimersByTime(1_001);
    expect(await reader.getOrLoad("k", 10_000, vi.fn(async () => 7))).toBe(7); // envelope expired for a fresh instance too
  });

  it("treats an expired L2 envelope as a miss and reloads", async () => {
    const store = new Map<string, string>();
    const l2 = { get: async (k: string) => store.get(k) ?? null, set: async (k: string, v: string) => void store.set(k, v) };
    store.set("mc:t:k", JSON.stringify({ v: 1, exp: Date.now() - 1 }));
    const cache = new MicroCache<number>(500, { l2: () => l2, l2KeyPrefix: "mc:t:" });
    expect(await cache.getOrLoad("k", 1000, async () => 5)).toBe(5);
  });

  it("degrades to L1-only when L2 throws (accelerant, never a dependency)", async () => {
    const l2 = {
      get: async () => { throw new Error("redis down"); },
      set: async () => { throw new Error("redis down"); },
    };
    const cache = new MicroCache<number>(500, { l2: () => l2 });
    expect(await cache.getOrLoad("k", 1000, async () => 11)).toBe(11); // loader ran despite L2 get failure
    expect(await cache.getOrLoad("k", 1000, async () => 12)).toBe(11); // L1 still serves (set failure swallowed)
  });

  // --- C-O4: serve-stale-on-upstream-failure (DoorDash lesson 8) ---

  it("serve-stale: a loader failure within staleTtlMs of expiry returns the last known-good value", async () => {
    const outcomes: string[] = [];
    const cache = new MicroCache<number>(500, { onEvent: (o) => outcomes.push(o) });
    await cache.getOrLoad("k", 1000, async () => 7, { staleTtlMs: 5000 });
    vi.advanceTimersByTime(1001); // fresh TTL expired, but within the 5s stale bound

    const loader = vi.fn<() => Promise<number>>().mockRejectedValueOnce(new Error("geo blip"));
    expect(await cache.getOrLoad("k", 1000, loader, { staleTtlMs: 5000 })).toBe(7);
    expect(loader).toHaveBeenCalledTimes(1);
    expect(outcomes).toEqual(["miss", "stale"]);
  });

  it("serve-stale: past the staleTtlMs hard bound, a loader failure still throws (no permanent staleness)", async () => {
    const cache = new MicroCache<number>(500);
    await cache.getOrLoad("k", 1000, async () => 7, { staleTtlMs: 5000 });
    vi.advanceTimersByTime(1000 + 5000 + 1); // past expiresAt + staleTtlMs

    await expect(
      cache.getOrLoad("k", 1000, async () => { throw new Error("geo blip"); }, { staleTtlMs: 5000 }),
    ).rejects.toThrow("geo blip");
  });

  it("serve-stale: a cold failure with nothing cached yet still throws (unchanged behavior)", async () => {
    const cache = new MicroCache<number>(500);
    await expect(
      cache.getOrLoad("k", 1000, async () => { throw new Error("db blip"); }, { staleTtlMs: 5000 }),
    ).rejects.toThrow("db blip");
  });

  it("serve-stale: omitting staleTtlMs keeps the old behavior exactly (errors never cached)", async () => {
    const cache = new MicroCache<number>(500);
    await cache.getOrLoad("k", 1000, async () => 7);
    vi.advanceTimersByTime(1001);

    await expect(
      cache.getOrLoad("k", 1000, async () => { throw new Error("geo blip"); }),
    ).rejects.toThrow("geo blip");
  });

  it("serve-stale: recovers to a fresh value on the next successful load after serving stale", async () => {
    const cache = new MicroCache<number>(500);
    await cache.getOrLoad("k", 1000, async () => 7, { staleTtlMs: 5000 });
    vi.advanceTimersByTime(1001);
    expect(
      await cache.getOrLoad("k", 1000, async () => { throw new Error("geo blip"); }, { staleTtlMs: 5000 }),
    ).toBe(7);

    vi.advanceTimersByTime(1001);
    expect(await cache.getOrLoad("k", 1000, async () => 9, { staleTtlMs: 5000 })).toBe(9);
  });
});
