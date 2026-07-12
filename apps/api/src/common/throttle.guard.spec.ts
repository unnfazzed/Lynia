import type { ExecutionContext } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import type { OtpStore } from "../auth/otp-store";
import { ThrottleGuard, type ThrottleOptions } from "./throttle.guard";

function makeCtx(req: unknown): ExecutionContext {
  return {
    getHandler: () => () => undefined,
    getClass: () => class {},
    switchToHttp: () => ({ getRequest: () => req }),
  } as unknown as ExecutionContext;
}

function makeReflector(opts: ThrottleOptions | undefined) {
  return { getAllAndOverride: () => opts } as unknown as ConstructorParameters<typeof ThrottleGuard>[0];
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
  } as OtpStore & { counts: Map<string, number> };
}

describe("ThrottleGuard", () => {
  it("passes through when the route carries no @Throttle metadata", async () => {
    const guard = new ThrottleGuard(makeReflector(undefined), makeStore());
    expect(await guard.canActivate(makeCtx({ ip: "1.1.1.1" }))).toBe(true);
  });

  it("allows up to the limit, then throws 429", async () => {
    const guard = new ThrottleGuard(makeReflector({ limit: 2, windowSec: 60, keyPrefix: "t" }), makeStore());
    const ctx = makeCtx({ ip: "1.1.1.1" });
    expect(await guard.canActivate(ctx)).toBe(true); // 1
    expect(await guard.canActivate(ctx)).toBe(true); // 2
    await expect(guard.canActivate(ctx)).rejects.toThrow(/Too many requests/);
  });

  it("gives each client IP an independent budget", async () => {
    const guard = new ThrottleGuard(makeReflector({ limit: 1, windowSec: 60, keyPrefix: "t" }), makeStore());
    expect(await guard.canActivate(makeCtx({ ip: "1.1.1.1" }))).toBe(true);
    expect(await guard.canActivate(makeCtx({ ip: "2.2.2.2" }))).toBe(true);
    await expect(guard.canActivate(makeCtx({ ip: "1.1.1.1" }))).rejects.toThrow();
  });

  it("keys by authenticated subject when present", async () => {
    const store = makeStore();
    const guard = new ThrottleGuard(makeReflector({ limit: 5, windowSec: 60, keyPrefix: "t" }), store);
    await guard.canActivate(makeCtx({ user: { sub: "user-1" }, ip: "1.1.1.1" }));
    expect([...store.counts.keys()].some((k) => k.includes("user-1"))).toBe(true);
  });
});
