import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { withPoolConfig } from "./prisma.service";

describe("withPoolConfig (E6)", () => {
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

  it("sets a deterministic default connection_limit when unset, preserving existing params", () => {
    const out = new URL(withPoolConfig("postgresql://u:p@host:5432/db?schema=public"));
    expect(out.searchParams.get("connection_limit")).toBe("10");
    expect(out.searchParams.get("schema")).toBe("public"); // existing query params survive
  });

  it("honours DATABASE_CONNECTION_LIMIT + DATABASE_POOL_TIMEOUT overrides", () => {
    process.env.DATABASE_CONNECTION_LIMIT = "25";
    process.env.DATABASE_POOL_TIMEOUT = "20";
    const out = new URL(withPoolConfig("postgresql://u:p@host:5432/db"));
    expect(out.searchParams.get("connection_limit")).toBe("25");
    expect(out.searchParams.get("pool_timeout")).toBe("20");
  });

  it("never overrides a connection_limit already present in the URL", () => {
    process.env.DATABASE_CONNECTION_LIMIT = "25";
    const out = new URL(withPoolConfig("postgresql://u:p@host:5432/db?connection_limit=5"));
    expect(out.searchParams.get("connection_limit")).toBe("5");
  });

  it("leaves pool_timeout unset when the env var is absent (falls back to Prisma's default)", () => {
    const out = new URL(withPoolConfig("postgresql://u:p@host:5432/db"));
    expect(out.searchParams.has("pool_timeout")).toBe(false);
  });

  it("returns an unparseable URL untouched rather than throwing (never blocks boot)", () => {
    expect(withPoolConfig("not a url")).toBe("not a url");
  });
});
