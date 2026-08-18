import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MicroCacheL2Provider (D6) — the one shared Redis L2 behind every read-through micro-cache,
 * extracted verbatim from OrdersService's private copy. The contract worth pinning is the GATING
 * and the LAZINESS: no flag or no URL ⇒ null and no client is ever created; enabled ⇒ exactly one
 * client however many caches resolve; the adapter's set() carries the PX ttl.
 */
const mockCreate = vi.fn();
vi.mock("./redis", () => ({
  REDIS_FAIL_FAST: { commandTimeoutMs: 2_000, enableOfflineQueue: false },
  createRedisClient: (url: string, opts: unknown) => mockCreate(url, opts),
}));

import { MicroCacheL2Provider } from "./micro-cache-l2.provider";
import type { Env } from "../config/env";

function fakeClient() {
  return {
    on: vi.fn(),
    get: vi.fn(async () => "cached"),
    set: vi.fn(async () => "OK"),
    quit: vi.fn(async () => "OK"),
  };
}

beforeEach(() => {
  mockCreate.mockReset();
});

describe("MicroCacheL2Provider", () => {
  it("resolves null (and creates NO client) when the flag is off", () => {
    const p = new MicroCacheL2Provider({ MICRO_CACHE_REDIS_L2: "false", REDIS_URL: "redis://x" } as Env);
    expect(p.resolve()).toBeNull();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("resolves null (and creates NO client) when REDIS_URL is absent", () => {
    const p = new MicroCacheL2Provider({ MICRO_CACHE_REDIS_L2: "true" } as Env);
    expect(p.resolve()).toBeNull();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("creates exactly ONE fail-fast client however many caches resolve the adapter", () => {
    const client = fakeClient();
    mockCreate.mockReturnValue(client);
    const p = new MicroCacheL2Provider({ MICRO_CACHE_REDIS_L2: "true", REDIS_URL: "redis://x" } as Env);
    expect(p.resolve()).not.toBeNull();
    expect(p.resolve()).not.toBeNull(); // a second cache's thunk
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockCreate).toHaveBeenCalledWith("redis://x", { commandTimeoutMs: 2_000, enableOfflineQueue: false });
  });

  it("the adapter's set() carries the PX ttl (rounded, floored at 1ms)", async () => {
    const client = fakeClient();
    mockCreate.mockReturnValue(client);
    const p = new MicroCacheL2Provider({ MICRO_CACHE_REDIS_L2: "true", REDIS_URL: "redis://x" } as Env);
    const adapter = p.resolve()!;
    await adapter.set("k", "v", 1234.6);
    expect(client.set).toHaveBeenCalledWith("k", "v", "PX", 1235);
    await expect(adapter.get("k")).resolves.toBe("cached");
  });

  it("quits the client on module destroy (the provider owns the lifecycle now)", async () => {
    const client = fakeClient();
    mockCreate.mockReturnValue(client);
    const p = new MicroCacheL2Provider({ MICRO_CACHE_REDIS_L2: "true", REDIS_URL: "redis://x" } as Env);
    p.resolve();
    await p.onModuleDestroy();
    expect(client.quit).toHaveBeenCalledTimes(1);
  });
});
