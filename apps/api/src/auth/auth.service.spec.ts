import { describe, expect, it, vi } from "vitest";
import type { Env } from "../config/env";
import type { MetricsService } from "../observability/metrics.service";
import { PrismaService } from "../prisma/prisma.service";
import { PiiCryptoService } from "../common/pii-crypto.service";
import { AuthService } from "./auth.service";
import { ConsoleOtpSender } from "./otp-sender";
import { InMemoryOtpStore } from "./otp-store";
import { TokenService } from "./token.service";

/** Real crypto with a fixed test key so encrypt/decrypt + hashId are deterministic in the assertions. */
const pii = new PiiCryptoService({ PII_ENCRYPTION_KEY: "test-pii-key-0123456789abcdefghij" } as Env);

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
    pii,
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

describe("AuthService phone identity is E.164-normalized", () => {
  it("request in local form + verify in international form resolve to one account", async () => {
    let upsertWhere: { phone?: string } = {};
    const prisma = {
      profile: {
        upsert: async (args: { where: { phone: string } }) => {
          upsertWhere = args.where;
          return { id: "p9", role: "customer", firstName: "" };
        },
      },
      session: { create: async () => ({ id: "s9" }) },
    };
    const { svc } = make(baseEnv, prisma);
    // Requested with the local trunk-0 form...
    const req = await svc.requestOtp("0771230000", "1.2.3.4");
    expect(req.devCode).toMatch(/^\d{6}$/);
    // ...verified with the international form — same stored OTP key, same account.
    const res = await svc.verifyOtp("+263771230000", req.devCode as string);
    expect(res).toMatchObject({ profileId: "p9" });
    expect(upsertWhere.phone).toBe("+263771230000");
  });

  it("rejects an unparseable phone with 400 instead of minting a junk identity", async () => {
    const { svc } = make(baseEnv, {});
    await expect(svc.requestOtp("abc", "1.2.3.4")).rejects.toMatchObject({ status: 400 });
    await expect(svc.verifyOtp("xx", "123456")).rejects.toMatchObject({ status: 400 });
  });

  it("matches an allowlisted tester written in a different format (local list vs E.164 device)", async () => {
    const env = { ...baseEnv, NODE_ENV: "production", OTP_TEST_PHONES: "0770000011" } as Env;
    const { svc } = make(env, {});
    const res = await svc.requestOtp("+263770000011", "1.1.1.9");
    expect(res.devCode).toMatch(/^\d{6}$/);
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

describe("AuthService.updateProfile", () => {
  const row = { id: "p1", role: "customer", firstName: "Chipo", lastName: "Marufu", phone: "+263771111111", email: null, photoUrl: null, ordersCount: 0, rider: null };

  // The write now runs in a $transaction (DS-11): profile.update + a duplicate-ID recompute that
  // persists the A-04 flag on the rider row. `dupCount` = how many OTHER accounts share the new ID.
  // `opts.kycStatus`/`opts.storedIdHash` drive the post-verification ID-lock pre-check (DS-11 hardening).
  function makeUpdate(dupCount = 0, opts: { kycStatus?: string; storedIdHash?: string } = {}) {
    const rec: { written?: Record<string, unknown>; flag?: { where: unknown; data: Record<string, unknown> } } = {};
    const profileRow = {
      ...row,
      idNumberHash: opts.storedIdHash ?? null,
      rider: opts.kycStatus ? { kycStatus: opts.kycStatus } : row.rider,
    };
    const tx = {
      profile: {
        update: async (a: { data: Record<string, unknown> }) => ((rec.written = a.data), { id: "p1" }),
        count: async () => dupCount,
      },
      rider: {
        updateMany: async (a: { where: unknown; data: Record<string, unknown> }) => ((rec.flag = a), { count: 1 }),
      },
    };
    const { svc } = make(baseEnv, {
      $transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
      // Serves both the DS-11 ID-lock pre-check and the trailing getProfile read.
      profile: { findUnique: async () => profileRow },
    });
    return { svc, rec };
  }

  it("writes the national ID onto the account record when provided (0·6)", async () => {
    const { svc, rec } = makeUpdate();
    await svc.updateProfile("p1", { firstName: "Chipo", lastName: "Marufu", idNumber: "63-123456-A-42" });
    // The raw national ID is never persisted: id_number is ciphertext + a dedup hash (LR8).
    expect(rec.written).toMatchObject({ firstName: "Chipo", lastName: "Marufu", idNumberHash: pii.hashId("63-123456-A-42") });
    expect(pii.isEncrypted(rec.written?.idNumber as string)).toBe(true);
    expect(pii.decryptId(rec.written?.idNumber as string)).toBe("63-123456-A-42");
  });

  it("leaves idNumber untouched on a name-only update (never clears a stored value, no dup recompute)", async () => {
    const { svc, rec } = makeUpdate();
    await svc.updateProfile("p1", { firstName: "Chipo", lastName: "Marufu" });
    expect(rec.written).not.toHaveProperty("idNumber");
    // No idNumber change → the A-04 flag is not recomputed/written.
    expect(rec.flag).toBeUndefined();
  });

  it("DS-11: recomputes the A-04 duplicate-ID flag = true when the new ID collides with another account", async () => {
    const { svc, rec } = makeUpdate(1);
    await svc.updateProfile("p1", { firstName: "Chipo", lastName: "Marufu", idNumber: "63-123456-A-42" });
    expect(rec.flag).toEqual({ where: { profileId: "p1" }, data: { duplicateIdFlag: true } });
  });

  it("DS-11: clears the A-04 flag when the new ID is unique (launder-back is caught too)", async () => {
    const { svc, rec } = makeUpdate(0);
    await svc.updateProfile("p1", { firstName: "Chipo", lastName: "Marufu", idNumber: "63-999999-Z-01" });
    expect(rec.flag).toEqual({ where: { profileId: "p1" }, data: { duplicateIdFlag: false } });
  });

  it("DS-11 lock: blocks a KYC-verified rider from CHANGING their national ID (locked post-verification)", async () => {
    const { svc, rec } = makeUpdate(0, { kycStatus: "verified", storedIdHash: pii.hashId("63-111111-A-11") });
    await expect(
      svc.updateProfile("p1", { firstName: "Chipo", lastName: "Marufu", idNumber: "63-222222-B-22" }),
    ).rejects.toThrow(/locked after verification/i);
    // Rejected before any write — no profile update, no flag recompute.
    expect(rec.written).toBeUndefined();
    expect(rec.flag).toBeUndefined();
  });

  it("DS-11 lock: a verified rider RE-SENDING the same ID is a no-op change, not a block", async () => {
    const { svc, rec } = makeUpdate(0, { kycStatus: "verified", storedIdHash: pii.hashId("63-111111-A-11") });
    await expect(
      svc.updateProfile("p1", { firstName: "Chipo", lastName: "Marufu", idNumber: "63-111111-A-11" }),
    ).resolves.toBeDefined();
    // Same hash → allowed; the write still runs.
    expect(rec.written).toMatchObject({ idNumberHash: pii.hashId("63-111111-A-11") });
  });

  it("DS-11 lock: a NOT-yet-verified rider may still change their ID (only verified is frozen)", async () => {
    const { svc, rec } = makeUpdate(0, { kycStatus: "pending", storedIdHash: pii.hashId("63-111111-A-11") });
    await expect(
      svc.updateProfile("p1", { firstName: "Chipo", lastName: "Marufu", idNumber: "63-222222-B-22" }),
    ).resolves.toBeDefined();
    expect(rec.written).toMatchObject({ idNumberHash: pii.hashId("63-222222-B-22") });
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

  it("caps concurrent wrong-guess verifies at MAX_OTP_ATTEMPTS (TOCTOU)", async () => {
    // Fire many concurrent verifies with wrong codes against one live OTP. Because each verify
    // atomically consumes an attempt before comparing, only the first 5 can reach the compare and
    // return "invalid"; every later request is locked out — a stale attempts==0 gate would instead
    // let all of them compare and defeat the 5-attempt cap.
    const { svc, store } = make(baseEnv, fakePrisma());
    await store.put("+263770000030", tokens.hash("654321"), 300);
    const results = await Promise.allSettled(
      Array.from({ length: 20 }, () => svc.verifyOtp("+263770000030", "000000")),
    );
    const reasons = results.map((r) =>
      r.status === "rejected" ? (r.reason as Error).message : "resolved",
    );
    expect(reasons.filter((m) => /invalid code/i.test(m))).toHaveLength(5);
    expect(reasons.filter((m) => /too many/i.test(m))).toHaveLength(15);
    expect(reasons.some((m) => m === "resolved")).toBe(false);
    // The record is cleared once locked.
    expect(await store.get("+263770000030")).toBeNull();
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

describe("AuthService.verifyOtp — post-verify retry grace (§6)", () => {
  const profileRow = { id: "p1", role: "customer", firstName: "" };
  /** Grace-path prisma: upsert for the first verify, findUnique (plain read) for grace retries,
   *  and session ids that increment so each mint is provably a FRESH session. */
  const gracePrisma = () => {
    let sessions = 0;
    return {
      profile: { upsert: async () => profileRow, findUnique: async () => profileRow },
      session: { create: async () => ({ id: `s${++sessions}` }) },
    };
  };

  it("a retry with the same correct code after a successful verify mints a fresh session, not 'expired'", async () => {
    const { svc, store } = make(baseEnv, gracePrisma());
    await store.put("+263770000040", tokens.hash("654321"), 300);
    const first = await svc.verifyOtp("+263770000040", "654321");
    // The live record is consumed — before the grace record, this retry was "expired".
    expect(await store.get("+263770000040")).toBeNull();
    const retry = await svc.verifyOtp("+263770000040", "654321");
    expect(retry).toMatchObject({ profileId: "p1", role: "customer", needsProfile: true });
    // A fresh session, not a replay of the first one's tokens.
    expect(retry.refreshToken).toMatch(/^s2\./);
    expect(retry.refreshToken).not.toBe(first.refreshToken);
    // The grace record is deliberately not consumed: a second racing retry also heals (each mint
    // is an independent session — sessions are already multi-device).
    const retry2 = await svc.verifyOtp("+263770000040", "654321");
    expect(retry2.refreshToken).toMatch(/^s3\./);
  });

  it("a wrong code during the grace window gets the EXACT no-grace error (no oracle)", async () => {
    const { svc, store } = make(baseEnv, gracePrisma());
    await store.put("+263770000041", tokens.hash("654321"), 300);
    await svc.verifyOtp("+263770000041", "654321");
    const graceMiss = await svc.verifyOtp("+263770000041", "111111").catch((e: Error) => e);
    // Baseline: same wrong code against a phone with no grace record at all.
    const noGrace = await svc.verifyOtp("+263770000049", "111111").catch((e: Error) => e);
    expect(graceMiss).toBeInstanceOf(Error);
    expect((graceMiss as Error).message).toBe("Code expired or never requested");
    expect((graceMiss as Error).message).toBe((noGrace as Error).message);
    expect((graceMiss as { status?: number }).status).toBe((noGrace as { status?: number }).status);
  });

  it("the grace record expires after its 60s TTL → back to 'expired'", async () => {
    vi.useFakeTimers();
    try {
      const { svc, store } = make(baseEnv, gracePrisma());
      await store.put("+263770000042", tokens.hash("654321"), 300);
      await svc.verifyOtp("+263770000042", "654321");
      vi.advanceTimersByTime(61_000);
      await expect(svc.verifyOtp("+263770000042", "654321")).rejects.toThrow(/expired or never/i);
    } finally {
      vi.useRealTimers();
    }
  });

  it("falls through to 'expired' if the profile is somehow missing — a grace hit never creates an account", async () => {
    const prisma = {
      profile: { upsert: async () => profileRow, findUnique: async () => null },
      session: { create: async () => ({ id: "s1" }) },
    };
    const { svc, store } = make(baseEnv, prisma);
    await store.put("+263770000043", tokens.hash("654321"), 300);
    await svc.verifyOtp("+263770000043", "654321");
    await expect(svc.verifyOtp("+263770000043", "654321")).rejects.toThrow(/expired or never/i);
  });

  it("records 'grace_ok' (not 'ok') on a grace-path mint", async () => {
    const { svc, store, metrics } = make(baseEnv, gracePrisma());
    await store.put("+263770000044", tokens.hash("654321"), 300);
    await svc.verifyOtp("+263770000044", "654321");
    expect(metrics.recordOtpVerify).toHaveBeenLastCalledWith(expect.any(Number), "ok");
    await svc.verifyOtp("+263770000044", "654321");
    expect(metrics.recordOtpVerify).toHaveBeenLastCalledWith(expect.any(Number), "grace_ok");
  });

  it("lockout leaves NO grace record — the correct code after a lockout is still 'expired', never a session", async () => {
    // The 5-attempt cap on a LIVE record is untouched (see the TOCTOU test above); the grace
    // record is only written after a successful compare, so a locked-out code grants nothing.
    const { svc, store } = make(baseEnv, gracePrisma());
    await store.put("+263770000045", tokens.hash("654321"), 300);
    for (let i = 0; i < 5; i++) await store.incrAttempts("+263770000045");
    await expect(svc.verifyOtp("+263770000045", "654321")).rejects.toThrow(/too many/i);
    await expect(svc.verifyOtp("+263770000045", "654321")).rejects.toThrow(/expired or never/i);
  });

  it("caps grace-path guesses per phone — over the ceiling even the correct code stays 'expired' (no oracle)", async () => {
    // The grace record carries no attempt counter by design, so a per-phone fixed-window ceiling
    // bounds guessing while the code lingers. Burn the ceiling on wrong guesses (each the normal
    // "expired" miss)...
    const { svc, store } = make(baseEnv, gracePrisma());
    await store.put("+263770000046", tokens.hash("654321"), 300);
    await svc.verifyOtp("+263770000046", "654321"); // live verify → writes the grace record
    for (let i = 0; i < 5; i++) {
      await expect(svc.verifyOtp("+263770000046", "000000")).rejects.toThrow(/expired or never/i);
    }
    // ...and the next attempt — even bearing the CORRECT code — no longer mints a session; it falls
    // through to the exact same "expired" error, so the ceiling is a hard cap with no oracle.
    await expect(svc.verifyOtp("+263770000046", "654321")).rejects.toThrow(/expired or never/i);
  });

  it("a legit timeout-retry with the correct code stays under the ceiling (heals, not capped)", async () => {
    // A couple of re-sends of the same correct code (the flaky-link scenario the grace path exists
    // for) are well within the ceiling — each still mints a fresh session.
    const { svc, store } = make(baseEnv, gracePrisma());
    await store.put("+263770000047", tokens.hash("654321"), 300);
    await svc.verifyOtp("+263770000047", "654321");
    await expect(svc.verifyOtp("+263770000047", "654321")).resolves.toMatchObject({ profileId: "p1" });
    await expect(svc.verifyOtp("+263770000047", "654321")).resolves.toMatchObject({ profileId: "p1" });
  });
});

describe("AuthService.refresh", () => {
  const future = new Date(Date.now() + 60_000);
  const past = new Date(Date.now() - 60_000);

  function sessionPrisma(row: Record<string, unknown> | null) {
    return {
      session: {
        findUnique: async () => row,
        // Rotation revokes atomically via updateMany (WHERE revokedAt IS NULL) → { count }.
        updateMany: async () => ({ count: 1 }),
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
    let revokeWhere: Record<string, unknown> | undefined;
    const prisma = {
      session: {
        findUnique: async () => row,
        updateMany: async (a: { where: Record<string, unknown> }) => { revokeWhere = a.where; return { count: 1 }; },
        create: async () => ({ id: "rotated" }),
      },
    };
    const { svc } = make(baseEnv, prisma);
    const res = await svc.refresh("sid.secret");
    // Revocation is a guarded compare-and-swap on the still-un-revoked row, not a blind update.
    expect(revokeWhere).toMatchObject({ id: "sid", revokedAt: null });
    expect(res.refreshToken).toMatch(/^rotated\./);
  });

  it("rejects a concurrent double-rotate (guarded revoke claims zero rows) instead of minting two sessions", async () => {
    const row = { id: "sid", profileId: "p1", refreshTokenHash: tokens.hash("secret"), revokedAt: null, expiresAt: future, profile: { role: "customer" } };
    let created = 0;
    const prisma = {
      session: {
        findUnique: async () => row, // read still sees it un-revoked (advisory)
        updateMany: async () => ({ count: 0 }), // but the other request already rotated it
        create: async () => { created++; return { id: "rotated" }; },
      },
    };
    const { svc } = make(baseEnv, prisma);
    await expect(svc.refresh("sid.secret")).rejects.toThrow(/invalid or expired/i);
    expect(created).toBe(0); // no second session minted from the reused token
  });
});

describe("AuthService.logout", () => {
  it("reports revoked=false when no live session matched", async () => {
    const { svc } = make(baseEnv, { session: { updateMany: async () => ({ count: 0 }) } });
    expect(await svc.logout("sid", "pid")).toEqual({ revoked: false });
  });

  it("reports revoked=true when a live session was revoked", async () => {
    const { svc } = make(baseEnv, { session: { updateMany: async () => ({ count: 1 }) } });
    expect(await svc.logout("sid", "pid")).toEqual({ revoked: true });
  });
});
