import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { connectWithRetry, poolConfig } from "./prisma.service";

describe("poolConfig (E6, Prisma 7 pg-adapter pool options)", () => {
  const saved = { limit: process.env.DATABASE_CONNECTION_LIMIT, timeout: process.env.DATABASE_POOL_TIMEOUT };

  beforeEach(() => {
    delete process.env.DATABASE_CONNECTION_LIMIT;
    delete process.env.DATABASE_POOL_TIMEOUT;
  });
  afterEach(() => {
    if (saved.limit === undefined) delete process.env.DATABASE_CONNECTION_LIMIT;
    else process.env.DATABASE_CONNECTION_LIMIT = saved.limit;
    if (saved.timeout === undefined) delete process.env.DATABASE_POOL_TIMEOUT;
    else process.env.DATABASE_POOL_TIMEOUT = saved.timeout;
  });

  it("sets a deterministic default pool size and passes the URL through verbatim", () => {
    const out = poolConfig("postgresql://u:p@host:5432/db?schema=public");
    expect(out.max).toBe(10);
    expect(out.connectionString).toBe("postgresql://u:p@host:5432/db?schema=public");
  });

  it("honours DATABASE_CONNECTION_LIMIT + DATABASE_POOL_TIMEOUT overrides (timeout seconds -> ms)", () => {
    process.env.DATABASE_CONNECTION_LIMIT = "25";
    process.env.DATABASE_POOL_TIMEOUT = "20";
    const out = poolConfig("postgresql://u:p@host:5432/db");
    expect(out.max).toBe(25);
    expect(out.connectionTimeoutMillis).toBe(20000);
  });

  it("a connection_limit already present in the URL wins over the env var", () => {
    process.env.DATABASE_CONNECTION_LIMIT = "25";
    const out = poolConfig("postgresql://u:p@host:5432/db?connection_limit=5");
    expect(out.max).toBe(5);
  });

  it("defaults connectionTimeoutMillis to a 10s fast-fail when no timeout is configured", () => {
    // Restores Prisma's old query-engine behaviour: without this, pg's Pool default of 0 = wait
    // forever, so an exhausted pool queues requests indefinitely instead of shedding load.
    const out = poolConfig("postgresql://u:p@host:5432/db");
    expect(out.connectionTimeoutMillis).toBe(10000);
  });

  it("falls back to defaults on an unparseable URL rather than throwing (never blocks boot)", () => {
    const out = poolConfig("not a url");
    expect(out.max).toBe(10);
    expect(out.connectionString).toBe("not a url");
  });
});

describe("connectWithRetry (boot-time connect is retried, not fatal on the first blip)", () => {
  const noSleep = () => Promise.resolve();

  it("returns after a single successful attempt and never retries", async () => {
    const connect = vi.fn().mockResolvedValue(undefined);
    const onRetry = vi.fn();
    await connectWithRetry(connect, { sleep: noSleep, onRetry });
    expect(connect).toHaveBeenCalledTimes(1);
    expect(onRetry).not.toHaveBeenCalled();
  });

  it("recovers from a transient connect timeout — the Cloud Run cold-start case", async () => {
    // The exact error pg-pool raises when opening a NEW physical connection exceeds
    // connectionTimeoutMillis; on Cloud Run that races the /cloudsql socket becoming ready.
    const connect = vi
      .fn()
      .mockRejectedValueOnce(new Error("Connection terminated due to connection timeout"))
      .mockResolvedValue(undefined);
    await expect(connectWithRetry(connect, { sleep: noSleep })).resolves.toBeUndefined();
    expect(connect).toHaveBeenCalledTimes(2);
  });

  it("gives up after the configured attempts and rethrows the LAST error", async () => {
    // A real outage must still fail the boot loudly — main.ts turns this into a non-zero exit.
    const connect = vi
      .fn()
      .mockRejectedValueOnce(new Error("first"))
      .mockRejectedValueOnce(new Error("second"))
      .mockRejectedValue(new Error("last"));
    await expect(connectWithRetry(connect, { attempts: 3, sleep: noSleep })).rejects.toThrow("last");
    expect(connect).toHaveBeenCalledTimes(3);
  });

  it("backs off exponentially between attempts and reports each retry", async () => {
    const delays: number[] = [];
    const onRetry = vi.fn();
    const connect = vi.fn().mockRejectedValue(new Error("down"));
    await expect(
      connectWithRetry(connect, {
        attempts: 3,
        baseDelayMs: 500,
        onRetry,
        sleep: (ms) => {
          delays.push(ms);
          return Promise.resolve();
        },
      }),
    ).rejects.toThrow("down");
    expect(delays).toEqual([500, 1000]); // no sleep after the final, rethrowing attempt
    expect(onRetry).toHaveBeenCalledTimes(2);
    expect(onRetry.mock.calls[0][0]).toBe(1);
  });

  it("leaves the backoff timer REF'd — an unref'd one lets Node exit 0 mid-retry, silently", async () => {
    // Regression pin (CodeRabbit, PR #857). onModuleInit runs before app.listen(), so during boot this
    // timer can be the only thing on the event loop. unref() it and Node drains and exits 0 partway
    // through the retry: no reconnect, no Sentry report, no non-zero exit. Exercises the REAL
    // defaultSleep by deliberately not passing an injected `sleep`.
    const handle = { unref: vi.fn() } as unknown as NodeJS.Timeout;
    const setTimeoutSpy = vi.spyOn(globalThis, "setTimeout").mockImplementation(((fn: () => void) => {
      fn();
      return handle;
    }) as unknown as typeof globalThis.setTimeout);
    try {
      const connect = vi.fn().mockRejectedValueOnce(new Error("timeout")).mockResolvedValue(undefined);
      await connectWithRetry(connect, { baseDelayMs: 1 });
      expect(connect).toHaveBeenCalledTimes(2);
      expect(handle.unref).not.toHaveBeenCalled();
    } finally {
      setTimeoutSpy.mockRestore();
    }
  });

  it("wraps a non-Error rejection so onRetry always receives an Error", async () => {
    const onRetry = vi.fn();
    const connect = vi.fn().mockRejectedValueOnce("socket hang up").mockResolvedValue(undefined);
    await connectWithRetry(connect, { sleep: noSleep, onRetry });
    expect(onRetry.mock.calls[0][1]).toBeInstanceOf(Error);
    expect((onRetry.mock.calls[0][1] as Error).message).toBe("socket hang up");
  });
});
