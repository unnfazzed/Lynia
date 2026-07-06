import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { poolConfig } from "./prisma.service";

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
