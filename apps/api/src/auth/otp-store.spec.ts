import { describe, expect, it } from "vitest";
import { InMemoryOtpStore, RedisOtpStore } from "./otp-store";

describe("InMemoryOtpStore", () => {
  it("stores, reads, increments attempts, and deletes", async () => {
    const store = new InMemoryOtpStore();
    await store.put("+263771", "hashvalue", 300);

    expect(await store.get("+263771")).toEqual({ hash: "hashvalue", attempts: 0 });
    expect(await store.incrAttempts("+263771")).toBe(1);
    expect(await store.incrAttempts("+263771")).toBe(2);
    expect((await store.get("+263771"))?.attempts).toBe(2);

    await store.del("+263771");
    expect(await store.get("+263771")).toBeNull();
  });

  it("expires records past their TTL", async () => {
    const store = new InMemoryOtpStore();
    await store.put("+263772", "h", 0);
    // ttl 0 → already expired on the next read
    await new Promise((r) => setTimeout(r, 2));
    expect(await store.get("+263772")).toBeNull();
  });

  it("counts hits within a fixed window for rate limiting", async () => {
    const store = new InMemoryOtpStore();
    expect(await store.hit("rl:phone:x", 3600)).toBe(1);
    expect(await store.hit("rl:phone:x", 3600)).toBe(2);
    expect(await store.hit("rl:phone:y", 3600)).toBe(1);
  });
});

describe("RedisOtpStore atomicity (incr/hset + expire cannot be split)", () => {
  /** Fake ioredis that only records eval() invocations — enough to assert the atomic contract. */
  function fakeRedis() {
    const calls: unknown[][] = [];
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const redis = { eval: async (...args: unknown[]) => (calls.push(args), 1) } as any;
    return { redis, calls };
  }

  it("hit() does incr + first-hit expire in a single eval (numkeys=1)", async () => {
    const { redis, calls } = fakeRedis();
    const store = new RedisOtpStore(redis);
    const n = await store.hit("rl:global", 86400);
    expect(n).toBe(1);
    expect(calls).toHaveLength(1);
    const [script, numkeys, key, arg] = calls[0] as [string, number, string, unknown];
    expect(numkeys).toBe(1);
    expect(key).toBe("rl:global");
    expect(String(arg)).toBe("86400");
    expect(script).toMatch(/incr/i);
    expect(script).toMatch(/expire/i);
  });

  it("put() writes hash+attempts and sets the TTL in a single eval (numkeys=1)", async () => {
    const { redis, calls } = fakeRedis();
    const store = new RedisOtpStore(redis);
    await store.put("+263771", "hashvalue", 300);
    expect(calls).toHaveLength(1);
    const [script, numkeys, key, hash, ttl] = calls[0] as [string, number, string, string, unknown];
    expect(numkeys).toBe(1);
    expect(key).toBe("otp:+263771");
    expect(hash).toBe("hashvalue");
    expect(String(ttl)).toBe("300");
    expect(script).toMatch(/hset/i);
    expect(script).toMatch(/expire/i);
  });
});
