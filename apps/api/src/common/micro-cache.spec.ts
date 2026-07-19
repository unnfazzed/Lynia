import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MicroCache } from "./micro-cache";

describe("MicroCache", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
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
});
