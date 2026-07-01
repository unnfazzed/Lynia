import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Env } from "../config/env";
import type { MetricsService } from "../observability/metrics.service";
import { PrismaService } from "../prisma/prisma.service";
import { AuthService } from "./auth.service";
import { ConsoleOtpSender } from "./otp-sender";
import { InMemoryOtpStore } from "./otp-store";
import { TokenService } from "./token.service";

/**
 * AuthService branch coverage. Uses the real TokenService (hashing/JWT) and the real
 * InMemoryOtpStore (attempt counter + fixed-window rate limits) so the security paths are
 * exercised for real; only Prisma is a per-test fake (no DB needed — runs in the `test` job).
 */
const baseEnv = {
  NODE_ENV: "test",
  JWT_SIGNING_SECRET: "test-secret-0123456789",
  ACCESS_TTL_SECONDS: 900,
  REFRESH_TTL_SECONDS: 2_592_000,
  OTP_TTL_SECONDS: 300,
  OTP_CHANNEL: "console",
} as Env;

const tokens = new TokenService(baseEnv);

/** Spy metrics fake — OTP-verify recording is best-effort; keep tests off the OTel path. */
const fakeMetrics = () =>
  ({ startTimer: () => () => 0, recordOtpVerify: vi.fn() }) as unknown as MetricsService;

function make(env: Env, prisma: Partial<Record<string, unknown>>) {
  const store = new InMemoryOtpStore();
  const metrics = fakeMetrics();
  const svc = new AuthService(
    env,
    prisma as unknown as PrismaService,
    new TokenService(env),
    store,
    new ConsoleOtpSender(),
    metrics,
  );
  return { svc, store, metrics };
}

describe("AuthService.requestOtp", () => {
  it("enforces the per-phone send cap (429 on the 6th send)", async () => {
    const { svc } = make(baseEnv, {});
    for (let i = 0; i < 5; i++) {
      await expect(svc.requestOtp("+263770000001", "1.1.1.1")).resolves.toMatchObject({ sent: true });
    }
    await expect(svc.requestOtp("+263770000001", "1.1.1.1")).rejects.toMatchObject({ status: 429 });
  });

  it("returns devCode only on the console channel outside production", async () => {
    const { svc } = make(baseEnv, {});
    const res = await svc.requestOtp("+263770000002", "1.1.1.2");
    expect(res.channel).toBe("console");
    expect(res.devCode).toMatch(/^\d{6}$/);
  });

  it("never leaks devCode in production", async () => {
    const { svc } = make({ ...baseEnv, NODE_ENV: "production" } as Env, {});
    const res = await svc.requestOtp("+263770000003", "1.1.1.3");
    expect(res.devCode).toBeUndefined();
  });

  it("never leaks devCode on a non-console channel", async () => {
    const { svc } = make({ ...baseEnv, OTP_CHANNEL: "whatsapp" } as Env, {});
    const res = await svc.requestOtp("+263770000004", "1.1.1.4");
    expect(res.devCode).toBeUndefined();
  });

  it("returns devCode in production for an allowlisted OTP_TEST_PHONES number (QA)", async () => {
    const env = {
      ...baseEnv,
      NODE_ENV: "production",
      OTP_TEST_PHONES: "+263770000010, +263770000011",
    } as Env;
    const { svc } = make(env, {});
    const allowed = await svc.requestOtp("+263770000011", "1.1.1.5");
    expect(allowed.devCode).toMatch(/^\d{6}$/);
    // A non-allowlisted phone in production is still never exposed.
    const blocked = await svc.requestOtp("+263779999999", "1.1.1.6");
    expect(blocked.devCode).toBeUndefined();
  });
});

describe("AuthService.getProfile", () => {
  const customerRow = {
    id: "p1",
    role: "customer",
    firstName: "Tatenda",
    lastName: "M",
    phone: "+263771111111",
    email: null,
    photoUrl: null,
    ordersCount: 3,
    rider: null,
  };
  const riderRow = {
    ...customerRow,
    id: "p2",
    role: "rider",
    rider: { bikeReg: "ABZ 1234", kycStatus: "verified", ratingAvg: 4.8, ratingCount: 12, tripsCount: 30, isOnline: true },
  };

  it("returns a customer profile with rider:null", async () => {
    const { svc } = make(baseEnv, { profile: { findUnique: async () => customerRow } });
    const me = await svc.getProfile("p1");
    expect(me).toMatchObject({ profileId: "p1", role: "customer", firstName: "Tatenda", phone: "+263771111111", rider: null });
  });

  it("nests the denormalized rider stats when the caller is a rider", async () => {
    const { svc } = make(baseEnv, { profile: { findUnique: async () => riderRow } });
    const me = await svc.getProfile("p2");
    expect(me.rider).toMatchObject({ bikeReg: "ABZ 1234", kycStatus: "verified", ratingAvg: 4.8, tripsCount: 30, isOnline: true });
  });

  it("404s when the profile is missing", async () => {
    const { svc } = make(baseEnv, { profile: { findUnique: async () => null } });
    await expect(svc.getProfile("nope")).rejects.toThrow(/not found/i);
  });
});

describe("AuthService.verifyOtp", () => {
  const profileRow = { id: "p1", role: "customer", firstName: "" };
  const fakePrisma = () => ({
    profile: { upsert: async () => profileRow },
    session: { create: async () => ({ id: "s1" }) },
  });

  it("rejects when no code was requested", async () => {
    const { svc } = make(baseEnv, fakePrisma());
    await expect(svc.verifyOtp("+263770000010", "123456")).rejects.toThrow(/expired or never/i);
  });

  it("rejects and clears the code after too many attempts", async () => {
    const { svc, store } = make(baseEnv, fakePrisma());
    await store.put("+263770000011", tokens.hash("123456"), 300);
    for (let i = 0; i < 5; i++) await store.incrAttempts("+263770000011");
    await expect(svc.verifyOtp("+263770000011", "123456")).rejects.toThrow(/too many/i);
    expect(await store.get("+263770000011")).toBeNull();
  });

  it("rejects an invalid code", async () => {
    const { svc, store } = make(baseEnv, fakePrisma());
    await store.put("+263770000012", tokens.hash("111111"), 300);
    await expect(svc.verifyOtp("+263770000012", "222222")).rejects.toThrow(/invalid code/i);
  });

  it("verifies a correct code and flags needsProfile when the name is empty", async () => {
    const { svc, store } = make(baseEnv, fakePrisma());
    await store.put("+263770000013", tokens.hash("654321"), 300);
    const res = await svc.verifyOtp("+263770000013", "654321");
    expect(res).toMatchObject({ profileId: "p1", role: "customer", needsProfile: true });
    expect(res.accessToken).toBeTruthy();
    expect(res.refreshToken).toContain(".");
  });

  it("records otp_verify_duration with the mapped result label on every exit path", async () => {
    const expired = make(baseEnv, fakePrisma());
    await expect(expired.svc.verifyOtp("+263770000020", "123456")).rejects.toThrow();
    expect(expired.metrics.recordOtpVerify).toHaveBeenLastCalledWith(expect.any(Number), "expired");

    const locked = make(baseEnv, fakePrisma());
    await locked.store.put("+263770000021", tokens.hash("123456"), 300);
    for (let i = 0; i < 5; i++) await locked.store.incrAttempts("+263770000021");
    await expect(locked.svc.verifyOtp("+263770000021", "123456")).rejects.toThrow();
    expect(locked.metrics.recordOtpVerify).toHaveBeenLastCalledWith(expect.any(Number), "locked");

    const invalid = make(baseEnv, fakePrisma());
    await invalid.store.put("+263770000022", tokens.hash("111111"), 300);
    await expect(invalid.svc.verifyOtp("+263770000022", "222222")).rejects.toThrow();
    expect(invalid.metrics.recordOtpVerify).toHaveBeenLastCalledWith(expect.any(Number), "invalid");

    const ok = make(baseEnv, fakePrisma());
    await ok.store.put("+263770000023", tokens.hash("654321"), 300);
    await ok.svc.verifyOtp("+263770000023", "654321");
    expect(ok.metrics.recordOtpVerify).toHaveBeenLastCalledWith(expect.any(Number), "ok");
  });

  it("clears needsProfile once the profile has a name", async () => {
    const prisma = {
      profile: { upsert: async () => ({ id: "p2", role: "rider", firstName: "Tendai" }) },
      session: { create: async () => ({ id: "s2" }) },
    };
    const { svc, store } = make(baseEnv, prisma);
    await store.put("+263770000014", tokens.hash("777777"), 300);
    const res = await svc.verifyOtp("+263770000014", "777777");
    expect(res.needsProfile).toBe(false);
  });
});

describe("AuthService.refresh", () => {
  const future = new Date(Date.now() + 60_000);
  const past = new Date(Date.now() - 60_000);

  function sessionPrisma(row: Record<string, unknown> | null) {
    return {
      session: {
        findUnique: async () => row,
        update: async () => ({}),
        create: async () => ({ id: "rotated" }),
      },
    };
  }

  it("rejects a malformed token (no dot)", async () => {
    const { svc } = make(baseEnv, sessionPrisma(null));
    await expect(svc.refresh("no-dot-token")).rejects.toThrow(/malformed/i);
  });

  it("rejects when the session is not found", async () => {
    const { svc } = make(baseEnv, sessionPrisma(null));
    await expect(svc.refresh("sid.secret")).rejects.toThrow(/invalid or expired/i);
  });

  it("rejects a revoked session", async () => {
    const row = { id: "sid", profileId: "p1", refreshTokenHash: tokens.hash("secret"), revokedAt: new Date(), expiresAt: future, profile: { role: "customer" } };
    const { svc } = make(baseEnv, sessionPrisma(row));
    await expect(svc.refresh("sid.secret")).rejects.toThrow(/invalid or expired/i);
  });

  it("rejects an expired session", async () => {
    const row = { id: "sid", profileId: "p1", refreshTokenHash: tokens.hash("secret"), revokedAt: null, expiresAt: past, profile: { role: "customer" } };
    const { svc } = make(baseEnv, sessionPrisma(row));
    await expect(svc.refresh("sid.secret")).rejects.toThrow(/invalid or expired/i);
  });

  it("rejects a mismatched refresh secret", async () => {
    const row = { id: "sid", profileId: "p1", refreshTokenHash: tokens.hash("other"), revokedAt: null, expiresAt: future, profile: { role: "customer" } };
    const { svc } = make(baseEnv, sessionPrisma(row));
    await expect(svc.refresh("sid.secret")).rejects.toThrow(/invalid or expired/i);
  });

  it("rotates a valid session into fresh tokens", async () => {
    const row = { id: "sid", profileId: "p1", refreshTokenHash: tokens.hash("secret"), revokedAt: null, expiresAt: future, profile: { role: "customer" } };
    let revoked = false;
    const prisma = {
      session: {
        findUnique: async () => row,
        update: async () => { revoked = true; return {}; },
        create: async () => ({ id: "rotated" }),
      },
    };
    const { svc } = make(baseEnv, prisma);
    const res = await svc.refresh("sid.secret");
    expect(revoked).toBe(true);
    expect(res.refreshToken).toMatch(/^rotated\./);
  });
});

describe("AuthService.logout", () => {
  it("reports revoked=false when no live session matched", async () => {
    const { svc } = make(baseEnv, { session: { updateMany: async () => ({ count: 0 }) } });
    expect(await svc.logout("sid")).toEqual({ revoked: false });
  });

  it("reports revoked=true when a live session was revoked", async () => {
    const { svc } = make(baseEnv, { session: { updateMany: async () => ({ count: 1 }) } });
    expect(await svc.logout("sid")).toEqual({ revoked: true });
  });
});
