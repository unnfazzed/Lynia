import type { ExecutionContext } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import type { OtpStore } from "../auth/otp-store";
import type { TokenService } from "../auth/token.service";
import { ThrottleGuard, type ThrottleOptions } from "./throttle.guard";

function makeCtx(req: unknown): ExecutionContext {
  return {
    getHandler: () => () => undefined,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

function makeReflector(opts: ThrottleOptions | ThrottleOptions[] | undefined) {
  return { getAllAndOverride: () => opts } as unknown as ConstructorParameters<typeof ThrottleGuard>[0];
}

/** Token stub: a bearer value of `valid:<sub>` verifies to that subject; anything else throws (invalid). */
function makeTokens(): TokenService {
  return {
    verifyAccess(token: string) {
      if (token.startsWith("valid:")) return { sub: token.slice("valid:".length), role: "customer" };
      throw new Error("invalid token");
    },
  } as unknown as TokenService;
}

/** Minimal OtpStore whose `hit` is a real in-memory fixed-window counter, so limits actually count. */
function makeStore(): OtpStore & { counts: Map<string, number> } {
  const counts = new Map<string, number>();
  return {
    counts,
    async hit(key: string): Promise<number> {
      const n = (counts.get(key) ?? 0) + 1;
      counts.set(key, n);
      return n;
    },
    put: async () => undefined,
    get: async () => null,
    incrAttempts: async () => 0,
    del: async () => undefined,
    graceSet: async () => undefined,
    graceGet: async () => null,
    ttl: async () => null,
    unhit: async () => undefined,
  } as OtpStore & { counts: Map<string, number> };
}

describe("ThrottleGuard", () => {
  it("passes through when the route carries no @Throttle metadata", async () => {
    const guard = new ThrottleGuard(makeReflector(undefined), makeStore(), makeTokens());
    expect(await guard.canActivate(makeCtx({ ip: "1.1.1.1" }))).toBe(true);
  });

  it("allows up to the limit, then throws 429", async () => {
    const guard = new ThrottleGuard(makeReflector({ limit: 2, windowSec: 60, keyPrefix: "t" }), makeStore(), makeTokens());
    const ctx = makeCtx({ ip: "1.1.1.1" });
    expect(await guard.canActivate(ctx)).toBe(true); // 1
    expect(await guard.canActivate(ctx)).toBe(true); // 2
    await expect(guard.canActivate(ctx)).rejects.toThrow(/Too many requests/);
  });

  it("E2E 2026-10-05 FS-3: the 429 body is { statusCode, message }, not a bare string", async () => {
    const guard = new ThrottleGuard(makeReflector({ limit: 0, windowSec: 60, keyPrefix: "t" }), makeStore(), makeTokens());
    const err = await guard.canActivate(makeCtx({ ip: "1.1.1.1" })).catch((e: unknown) => e);
    expect((err as { getStatus(): number }).getStatus()).toBe(429);
    expect((err as { getResponse(): unknown }).getResponse()).toEqual({
      statusCode: 429,
      message: "Too many requests — try again later",
    });
  });

  describe("E2E 2026-10-05 FS-1: several rules, and a custom key", () => {
    const byPhone = (req: { body?: unknown }) => (req.body as { phone?: string } | undefined)?.phone;
    const byIp = (req: { ip?: string }) => req.ip ?? "unknown";

    it("keys a rule by its own `key` — many phones behind one IP each get the per-phone budget", async () => {
      const store = makeStore();
      const guard = new ThrottleGuard(
        makeReflector([
          { limit: 1, windowSec: 60, keyPrefix: "p", key: byPhone },
          { limit: 10, windowSec: 60, keyPrefix: "ip", key: byIp },
        ]),
        store,
        makeTokens(),
      );
      const nat = "100.64.0.1";
      for (let i = 0; i < 5; i++) {
        expect(await guard.canActivate(makeCtx({ ip: nat, body: { phone: `+26377000000${i}` } }))).toBe(true);
      }
      // One phone's second try is over ITS limit, whatever the IP.
      await expect(guard.canActivate(makeCtx({ ip: "8.8.8.8", body: { phone: "+263770000000" } }))).rejects.toThrow();
      expect(store.counts.get("rl:throttle:p:+263770000001")).toBe(1);
      expect(store.counts.get(`rl:throttle:ip:${nat}`)).toBe(5);
    });

    it("the loose IP ceiling still binds", async () => {
      const guard = new ThrottleGuard(
        makeReflector([
          { limit: 1, windowSec: 60, keyPrefix: "p", key: byPhone },
          { limit: 3, windowSec: 60, keyPrefix: "ip", key: byIp },
        ]),
        makeStore(),
        makeTokens(),
      );
      for (let i = 0; i < 3; i++) await guard.canActivate(makeCtx({ ip: "1.1.1.1", body: { phone: `p${i}` } }));
      await expect(guard.canActivate(makeCtx({ ip: "1.1.1.1", body: { phone: "p9" } }))).rejects.toThrow(/Too many/);
    });

    it("a rule whose key is undefined is skipped (the other rules still apply)", async () => {
      const store = makeStore();
      const guard = new ThrottleGuard(
        makeReflector([
          { limit: 1, windowSec: 60, keyPrefix: "p", key: byPhone },
          { limit: 2, windowSec: 60, keyPrefix: "ip", key: byIp },
        ]),
        store,
        makeTokens(),
      );
      expect(await guard.canActivate(makeCtx({ ip: "1.1.1.1", body: {} }))).toBe(true);
      expect(await guard.canActivate(makeCtx({ ip: "1.1.1.1", body: {} }))).toBe(true);
      await expect(guard.canActivate(makeCtx({ ip: "1.1.1.1", body: {} }))).rejects.toThrow();
      expect([...store.counts.keys()].some((k) => k.startsWith("rl:throttle:p:"))).toBe(false);
    });
  });

  it("gives each client IP an independent budget", async () => {
    const guard = new ThrottleGuard(makeReflector({ limit: 1, windowSec: 60, keyPrefix: "t" }), makeStore(), makeTokens());
    expect(await guard.canActivate(makeCtx({ ip: "1.1.1.1" }))).toBe(true);
    expect(await guard.canActivate(makeCtx({ ip: "2.2.2.2" }))).toBe(true);
    await expect(guard.canActivate(makeCtx({ ip: "1.1.1.1" }))).rejects.toThrow();
  });

  it("keys by authenticated subject when present", async () => {
    const store = makeStore();
    const guard = new ThrottleGuard(makeReflector({ limit: 5, windowSec: 60, keyPrefix: "t" }), store, makeTokens());
    await guard.canActivate(makeCtx({ user: { sub: "user-1" }, ip: "1.1.1.1" }));
    expect([...store.counts.keys()].some((k) => k.includes("user-1"))).toBe(true);
  });

  it("P3-5: keys by the bearer token's subject even when JwtAuthGuard hasn't run yet (req.user unset)", async () => {
    const store = makeStore();
    const guard = new ThrottleGuard(makeReflector({ limit: 5, windowSec: 60, keyPrefix: "t" }), store, makeTokens());
    // Global guard runs before JwtAuthGuard → no req.user, but a valid bearer is present. The subject
    // is decoded from the token so per-account limits actually bind (not the shared client IP).
    await guard.canActivate(makeCtx({ headers: { authorization: "Bearer valid:user-9" }, ip: "9.9.9.9" }));
    expect([...store.counts.keys()].some((k) => k.includes("user-9"))).toBe(true);
    expect([...store.counts.keys()].some((k) => k.includes("9.9.9.9"))).toBe(false);
  });

  it("P3-5: two accounts sharing one IP get independent budgets (a NAT'd building no longer shares a limit)", async () => {
    const store = makeStore();
    const guard = new ThrottleGuard(makeReflector({ limit: 1, windowSec: 60, keyPrefix: "t" }), store, makeTokens());
    const ip = "10.0.0.1";
    expect(await guard.canActivate(makeCtx({ headers: { authorization: "Bearer valid:acct-A" }, ip }))).toBe(true);
    // Same IP, different account → NOT throttled (would have 429'd if both collapsed to the IP key).
    expect(await guard.canActivate(makeCtx({ headers: { authorization: "Bearer valid:acct-B" }, ip }))).toBe(true);
    // acct-A's second request DOES hit its own limit.
    await expect(guard.canActivate(makeCtx({ headers: { authorization: "Bearer valid:acct-A" }, ip }))).rejects.toThrow();
  });

  it("P3-5: an invalid/missing bearer falls back to IP keying (JwtAuthGuard still rejects it downstream)", async () => {
    const store = makeStore();
    const guard = new ThrottleGuard(makeReflector({ limit: 5, windowSec: 60, keyPrefix: "t" }), store, makeTokens());
    await guard.canActivate(makeCtx({ headers: { authorization: "Bearer garbage" }, ip: "3.3.3.3" }));
    expect([...store.counts.keys()].some((k) => k.includes("3.3.3.3"))).toBe(true);
  });

  it("LC-D19: a store error fails OPEN — the request passes and the error is counted, not a 500", async () => {
    const store = makeStore();
    store.hit = async () => {
      throw new Error("Connection is closed.");
    };
    const recorded: string[] = [];
    const metrics = {
      recordThrottleStoreError: (prefix: string) => recorded.push(prefix),
    } as unknown as ConstructorParameters<typeof ThrottleGuard>[3];
    const guard = new ThrottleGuard(
      makeReflector({ limit: 1, windowSec: 60, keyPrefix: "sos-raise" }),
      store,
      makeTokens(),
      metrics,
    );
    const ctx = makeCtx({ ip: "1.1.1.1" });
    // Past the limit of 1 and still allowed: the counter can't be read, so rate limiting degrades.
    expect(await guard.canActivate(ctx)).toBe(true);
    expect(await guard.canActivate(ctx)).toBe(true);
    expect(recorded).toEqual(["sos-raise", "sos-raise"]);
  });

  it("LC-D19: fail-open is scoped to store errors — a healthy store over the limit still 429s", async () => {
    const guard = new ThrottleGuard(makeReflector({ limit: 1, windowSec: 60, keyPrefix: "t" }), makeStore(), makeTokens());
    const ctx = makeCtx({ ip: "1.1.1.1" });
    expect(await guard.canActivate(ctx)).toBe(true);
    await expect(guard.canActivate(ctx)).rejects.toMatchObject({ status: 429 });
  });
});
