import { randomUUID } from "node:crypto";
import { Logger, UnauthorizedException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { Env } from "../config/env";
import type { KycPendingStateService } from "../kyc/kyc-pending-state.service";
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
  // Bounds how long a rotated refresh token can be replayed into its unused successor (see replayRotation).
  SESSION_RETENTION_DAYS: 30,
  OTP_TTL_SECONDS: 300,
  OTP_CHANNEL: "console",
  // The send caps are env-driven, so they must be present here or every limiter reads `undefined`
  // for its max and silently stops capping — which would make the cap tests pass for the wrong reason.
  // These mirror the schema defaults in config/env.ts.
  OTP_RL_PHONE_MAX: 5,
  OTP_RL_IP_MAX: 20,
  OTP_RL_GLOBAL_MAX: 500,
  OTP_RL_DEVICE_SIGNUP_MAX: 3,
} as Env;

const tokens = new TokenService(baseEnv);

/** Spy metrics fake — OTP-verify recording is best-effort; keep tests off the OTel path. */
/** getProfile's KYC pending-state derivation (P0-1 / D6). None of these specs call getProfile, so it
 *  is never invoked — this exists to satisfy the constructor, and answers the safe default if it ever is. */
const fakeKycPendingState = () => ({ get: async () => "unfinished" as const }) as unknown as KycPendingStateService;

const fakeMetrics = () =>
  ({
    startTimer: () => () => 0,
    recordOtpVerify: vi.fn(),
    incOtpRequested: vi.fn(),
    incIdentityNewDeviceVerify: vi.fn(),
  }) as unknown as MetricsService;

function make(env: Env, prisma: Partial<Record<string, unknown>>, kycPendingState = fakeKycPendingState()) {
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
    kycPendingState,
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

describe("AuthService — Play-review demo account (§7.1)", () => {
  const demoEnv = { ...baseEnv, DEMO_OTP_PHONE: "+263770000777", DEMO_OTP_CODE: "846201" } as Env;
  const profileRow = { id: "demo1", role: "customer", firstName: "" };
  const demoPrisma = () => ({
    profile: { findUnique: async () => ({ ...profileRow, sessions: [] }), upsert: async () => profileRow },
    session: { create: async () => ({ id: "s-demo" }) },
  });

  it("requestOtp on the demo number never sends, never stores, and never echoes a code", async () => {
    let sent = 0;
    const sender = new ConsoleOtpSender();
    vi.spyOn(sender, "send").mockImplementation(async () => { sent++; });
    const store = new InMemoryOtpStore();
    const svc = new AuthService(demoEnv, demoPrisma() as unknown as PrismaService, new TokenService(demoEnv), store, sender, fakeMetrics(), pii, fakeKycPendingState());
    const res = await svc.requestOtp("+263770000777", "9.9.9.9");
    expect(res).toEqual({ sent: true, channel: "console", deliveryChannel: "sms" }); // no devCode key, ever
    expect(sent).toBe(0); // BSP/SMS never invoked
    expect(await store.get("+263770000777")).toBeNull(); // no OTP record written
  });

  it("verifyOtp mints a real session for the demo number with the fixed code", async () => {
    const { svc } = make(demoEnv, demoPrisma());
    const res = await svc.verifyOtp("+263770000777", "846201", "ua", "dev-1");
    expect(res).toMatchObject({ profileId: "demo1", role: "customer" });
    expect(res.accessToken).toBeTruthy();
    expect(res.refreshToken).toContain(".");
  });

  it("verifyOtp rejects a wrong code on the demo number as a normal invalid code (no oracle)", async () => {
    const { svc } = make(demoEnv, demoPrisma());
    await expect(svc.verifyOtp("+263770000777", "000000", "ua", "dev-1")).rejects.toThrow(/invalid code/i);
  });

  it("accepts the demo number typed in local/international forms (normalized both sides)", async () => {
    const { svc } = make(demoEnv, demoPrisma());
    await expect(svc.verifyOtp("0770000777", "846201", "ua", "dev-1")).resolves.toBeTruthy();
  });

  it("caps guesses at the demo number per-phone (10/hr) so a fixed code can't be brute-forced across IPs", async () => {
    const { svc } = make(demoEnv, demoPrisma());
    // 10 wrong guesses are allowed (each an 'invalid code'); the 11th is throttled regardless of the
    // code — this cap is per-phone, so rotating source IPs (the route throttle's key) can't evade it.
    for (let i = 0; i < 10; i++) {
      await expect(svc.verifyOtp("+263770000777", "000000")).rejects.toThrow(/invalid code/i);
    }
    await expect(svc.verifyOtp("+263770000777", "846201")).rejects.toThrow(/too many/i);
  });

  it("is completely inert when the demo vars are unset — demo code is just a wrong guess", async () => {
    const { svc, store } = make(baseEnv, demoPrisma());
    // With no demo configured, the number is ordinary: no stored code → 'expired', not a demo login.
    await expect(svc.verifyOtp("+263770000777", "846201")).rejects.toThrow(/expired or never/i);
    expect(await store.get("+263770000777")).toBeNull();
  });

  it("does not treat a non-demo number as the demo account even when demo is armed", async () => {
    const { svc } = make(demoEnv, demoPrisma());
    // A different number with the demo code must NOT sign in — it has no stored OTP, so it 'expired'.
    await expect(svc.verifyOtp("+263779999999", "846201")).rejects.toThrow(/expired or never/i);
  });

  // A profile carries exactly ONE role, so the app demo (rider/customer) and the merchant kitchen
  // demo can never be the same number. DEMO_OTP_PHONE is therefore a LIST: every entry is its own
  // reserved identity sharing the one fixed code.
  describe("multiple reserved demo numbers", () => {
    const multiEnv = { ...baseEnv, DEMO_OTP_PHONE: "+263770000777,0770000001", DEMO_OTP_CODE: "846201" } as Env;

    it("signs in on every listed number", async () => {
      for (const phone of ["+263770000777", "+263770000001"]) {
        const { svc } = make(multiEnv, demoPrisma());
        await expect(svc.verifyOtp(phone, "846201", "ua", "dev-1")).resolves.toBeTruthy();
      }
    });

    it("normalizes each entry, so a list entry written in local form matches an international sign-in", async () => {
      const { svc } = make(multiEnv, demoPrisma());
      // "0770000001" is configured in LOCAL form; the caller arrives in international form.
      await expect(svc.verifyOtp("+263770000001", "846201", "ua", "dev-1")).resolves.toBeTruthy();
    });

    it("still refuses a number that is not on the list", async () => {
      const { svc } = make(multiEnv, demoPrisma());
      await expect(svc.verifyOtp("+263779999999", "846201")).rejects.toThrow(/expired or never/i);
    });

    it("never sends on any listed number (each short-circuits before the sender)", async () => {
      // Mirrors the single-number case above: the demo branch returns before the rate limiters, the
      // OTP store and the sender, so no SMS/BSP call is made and no code is ever echoed.
      for (const [typed, normalized] of [
        ["+263770000777", "+263770000777"],
        ["0770000001", "+263770000001"],
      ]) {
        let sent = 0;
        const sender = new ConsoleOtpSender();
        vi.spyOn(sender, "send").mockImplementation(async () => { sent++; });
        const store = new InMemoryOtpStore();
        const svc = new AuthService(multiEnv, demoPrisma() as unknown as PrismaService, new TokenService(multiEnv), store, sender, fakeMetrics(), pii, fakeKycPendingState());
        const res = await svc.requestOtp(typed, "1.1.1.1");
        expect(res).toEqual({ sent: true, channel: "console", deliveryChannel: "sms" }); // no devCode key, ever
        expect(sent).toBe(0);
        expect(await store.get(normalized)).toBeNull();
      }
    });

    it("caps guesses PER phone — one listed number's budget does not spend another's", async () => {
      const { svc } = make(multiEnv, demoPrisma());
      for (let i = 0; i < 10; i++) {
        await expect(svc.verifyOtp("+263770000777", "000000")).rejects.toThrow(/invalid code/i);
      }
      await expect(svc.verifyOtp("+263770000777", "846201")).rejects.toThrow(/too many/i);
      // The second demo number is untouched by the first's exhausted budget.
      await expect(svc.verifyOtp("+263770000001", "846201", "ua", "dev-1")).resolves.toBeTruthy();
    });
  });
});

describe("AuthService phone identity is E.164-normalized", () => {
  it("request in local form + verify in international form resolve to one account", async () => {
    let upsertWhere: { phone?: string } = {};
    const prisma = {
      profile: {
        findUnique: async () => ({ id: "p9", role: "customer", firstName: "", sessions: [] }),
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
    idNumber: null,
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

  // BH-03: KYC_MODE is a global deploy config, not a per-rider column — surfaced on the rider
  // object so the mobile client can tell "pending, waiting on a browser vendor flow" (auto) apart from
  // "pending, waiting on manual ops review, no browser step exists" (manual) instead of always
  // assuming auto, which showed manual-mode riders a "finish it in the browser" dead end.
  it("surfaces the deploy-wide KYC_MODE on the rider object", async () => {
    const { svc } = make({ ...baseEnv, KYC_MODE: "manual" } as Env, { profile: { findUnique: async () => riderRow } });
    const me = await svc.getProfile("p2");
    expect(me.rider).toMatchObject({ kycMode: "manual" });
  });

  // The account record's national ID goes back to its own owner IN FULL (owner instruction
  // 2026-08-16), so the Account screen can draw it. It is stored encrypted, which means the round
  // trip — not just the field's presence — is what has to hold: a select that forgot to decrypt
  // would return `v1:…` base64 and the screen would render ciphertext at the user.
  it("returns the caller's own national ID decrypted, in full", async () => {
    const stored = pii.encryptId("63-123456-A-42");
    expect(stored).toMatch(/^v1:/); // guard the fixture: a plaintext row would make this test vacuous
    const { svc } = make(baseEnv, { profile: { findUnique: async () => ({ ...customerRow, idNumber: stored }) } });
    const me = await svc.getProfile("p1");
    expect(me.idNumber).toBe("63-123456-A-42");
  });

  // A customer can register name-only, so "no ID on the account" is a normal state, not an error —
  // the screen draws no ID line at all rather than an empty or "null" one.
  it("returns idNumber:null for an account that never supplied one", async () => {
    const { svc } = make(baseEnv, { profile: { findUnique: async () => customerRow } });
    await expect(svc.getProfile("p1")).resolves.toMatchObject({ idNumber: null });
  });

  it("404s when the profile is missing", async () => {
    const { svc } = make(baseEnv, { profile: { findUnique: async () => null } });
    await expect(svc.getProfile("nope")).rejects.toThrow(/not found/i);
  });
});

describe("AuthService.updateProfile", () => {
  const row = { id: "p1", role: "customer", firstName: "Chipo", lastName: "Marufu", phone: "+263771111111", email: null, photoUrl: null, ordersCount: 0, rider: null };

  // The write now runs in a $transaction (DS-11): profile.update + a duplicate-ID recompute that
  // persists the A-04 flag on the rider row. `dupCount` = how many OTHER accounts share the new ID
  // (INCLUDING erased tombstones — the reviewer-flag count); `opts.liveDupCount` = how many LIVE
  // accounts share it (the one-ID-one-account hard-block count, distinguishable by its erased-excluding
  // NOT clause). `opts.kycStatus`/`opts.storedIdHash` drive the post-verification ID-lock pre-check.
  function makeUpdate(dupCount = 0, opts: { kycStatus?: string; storedIdHash?: string; writeCount?: number; liveDupCount?: number } = {}) {
    const rec: { written?: Record<string, unknown>; flag?: { where: unknown; data: Record<string, unknown> } } = {};
    const profileRow = {
      ...row,
      idNumberHash: opts.storedIdHash ?? null,
      rider: opts.kycStatus ? { kycStatus: opts.kycStatus } : row.rider,
    };
    const tx = {
      // The one-ID-one-account claim path takes a pg advisory xact lock before its live count.
      $executeRaw: async () => 0,
      profile: {
        // Name-only edits (no idNumber) still take the plain update path...
        update: async (a: { data: Record<string, unknown> }) => ((rec.written = a.data), { id: "p1" }),
        // ...but an ID write goes through the guarded CAS updateMany (Fix 2). `writeCount` lets a test
        // simulate the race where the KYC webhook committed `verified` mid-write → 0 rows matched.
        updateMany: async (a: { data: Record<string, unknown> }) => ((rec.written = a.data), { count: opts.writeCount ?? 1 }),
        count: async (a: { where: Record<string, unknown> }) => ("NOT" in a.where ? (opts.liveDupCount ?? 0) : dupCount),
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

  it("DS-11: recomputes the A-04 flag = true when the new ID collides with an ERASED account (returning user)", async () => {
    // Live count 0 (only a tombstone carries the ID) → the write is allowed; the reviewer flag still sets.
    const { svc, rec } = makeUpdate(1, { liveDupCount: 0 });
    await svc.updateProfile("p1", { firstName: "Chipo", lastName: "Marufu", idNumber: "63-123456-A-42" });
    expect(rec.flag).toEqual({ where: { profileId: "p1" }, data: { duplicateIdFlag: true } });
  });

  // One-ID-one-account (2026-07-26): an ID already on another LIVE account is refused at the write.
  it("409s (id_in_use) when the new ID is already on another LIVE account — nothing written", async () => {
    const { svc, rec } = makeUpdate(1, { liveDupCount: 1 });
    try {
      await svc.updateProfile("p1", { firstName: "Chipo", lastName: "Marufu", idNumber: "63-123456-A-42" });
      throw new Error("expected updateProfile to throw");
    } catch (e) {
      expect((e as { getResponse: () => unknown }).getResponse()).toMatchObject({ reason: "id_in_use" });
    }
    expect(rec.written).toBeUndefined();
    expect(rec.flag).toBeUndefined();
  });

  it("re-sending the caller's own stored ID skips the live-block (no new claim — legacy dupes stay idempotent)", async () => {
    // Even with a live collision present, stored hash === incoming hash means no new claim is being
    // made, so the write must not start 409ing (a legacy pre-policy duplicate resending their own ID).
    const { svc, rec } = makeUpdate(1, { liveDupCount: 1, storedIdHash: pii.hashId("63-123456-A-42") });
    await expect(
      svc.updateProfile("p1", { firstName: "Chipo", lastName: "Marufu", idNumber: "63-123456-A-42" }),
    ).resolves.toBeDefined();
    expect(rec.written).toMatchObject({ idNumberHash: pii.hashId("63-123456-A-42") });
    // The reviewer flag still reflects the collision.
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

  // Fix 2: the check-then-write race. The pre-check reads a not-yet-verified status, but the KYC webhook
  // commits `verified` before this write lands — the guarded updateMany then matches 0 rows and re-asserts
  // the freeze, so a stale iteration can't slip a new ID past it.
  it("Fix 2: re-asserts the freeze at write time — 0 rows matched (webhook verified mid-write) → blocked", async () => {
    const { svc } = makeUpdate(0, { kycStatus: "pending", storedIdHash: pii.hashId("63-111111-A-11"), writeCount: 0 });
    await expect(
      svc.updateProfile("p1", { firstName: "Chipo", lastName: "Marufu", idNumber: "63-222222-B-22" }),
    ).rejects.toThrow(/locked after verification/i);
  });
});

describe("AuthService.verifyOtp", () => {
  const profileRow = { id: "p1", role: "customer", firstName: "" };
  // findUnique now runs on EVERY verify (it used to sit behind `if (deviceId)`), so the shared fake
  // must answer it. Defaulting to an existing profile makes the default case SIGN-IN, which needs no
  // device id; the signup-specific tests below override it to null and pass one explicitly.
  const fakePrisma = () => ({
    profile: { findUnique: async () => ({ ...profileRow, sessions: [] }), upsert: async () => profileRow },
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

  it("KB-IDENTITY-BINDING L1: records the device id on the minted session", async () => {
    let created: Record<string, unknown> | undefined;
    const prisma = {
      profile: { findUnique: async () => null, upsert: async () => profileRow },
      session: { create: async (args: { data: Record<string, unknown> }) => { created = args.data; return { id: "s1" }; } },
    };
    const { svc, store } = make(baseEnv, prisma);
    await store.put("+263770000040", tokens.hash("654321"), 300);
    await svc.verifyOtp("+263770000040", "654321", "ua", "device-abc");
    expect(created!.deviceId).toBe("device-abc");
  });

  it("KB-IDENTITY-BINDING L1: throttles NEW-account creation per device (over the daily cap → 429)", async () => {
    // findUnique → null makes every verify a fresh SIGNUP; the per-device cap (RL.deviceSignup.max=3)
    // lets 3 through, then the 4th signup from the SAME device is rejected.
    const prisma = {
      profile: { findUnique: async () => null, upsert: async () => profileRow },
      session: { create: async () => ({ id: "s1" }) },
    };
    const { svc, store } = make(baseEnv, prisma);
    const device = "one-handset";
    for (let i = 0; i < 3; i++) {
      await store.put(`+26377000005${i}`, tokens.hash("654321"), 300);
      await expect(svc.verifyOtp(`+26377000005${i}`, "654321", "ua", device)).resolves.toBeTruthy();
    }
    await store.put("+263770000059", tokens.hash("654321"), 300);
    await expect(svc.verifyOtp("+263770000059", "654321", "ua", device)).rejects.toThrow(/too many/i);
  });

  it("the device sign-up cap's 429 carries reason device_signup_cap; the per-phone send cap's does not", async () => {
    // The merchant web names this cap ("This device has added 3 new people today") and must not say so
    // for the route's per-IP verify throttle or the send caps, which answer with the same 429 + message.
    const prisma = {
      profile: { findUnique: async () => null, upsert: async () => profileRow },
      session: { create: async () => ({ id: "s1" }) },
    };
    const { svc, store } = make(baseEnv, prisma);
    for (let i = 0; i < 3; i++) {
      await store.put(`+26377000007${i}`, tokens.hash("654321"), 300);
      await svc.verifyOtp(`+26377000007${i}`, "654321", "ua", "shared-tablet");
    }
    await store.put("+263770000079", tokens.hash("654321"), 300);
    const capped = await svc.verifyOtp("+263770000079", "654321", "ua", "shared-tablet").catch((e: unknown) => e);
    expect(capped).toMatchObject({ status: 429 });
    expect((capped as { getResponse(): unknown }).getResponse()).toEqual({
      statusCode: 429,
      message: "Too many requests — try again later",
      reason: "device_signup_cap",
    });

    for (let i = 0; i < 5; i++) await svc.requestOtp("+263770000078", "9.9.9.9");
    const sendCapped = await svc.requestOtp("+263770000078", "9.9.9.9").catch((e: unknown) => e);
    expect(sendCapped).toMatchObject({ status: 429 });
    expect((sendCapped as { getResponse(): unknown }).getResponse()).toBe("Too many requests — try again later");
  });

  it("KB-IDENTITY-BINDING L1: does NOT throttle an EXISTING account (the cap is signup-only, not sign-in)", async () => {
    // An existing account signing in from a shared device many times is NOT a signup → never throttled.
    const prisma = {
      profile: { findUnique: async () => ({ id: "p1", sessions: [] }), upsert: async () => profileRow },
      session: { create: async () => ({ id: "s1" }) },
    };
    const { svc, store } = make(baseEnv, prisma);
    for (let i = 0; i < 6; i++) {
      await store.put(`+26377000006${i}`, tokens.hash("654321"), 300);
      await expect(svc.verifyOtp(`+26377000006${i}`, "654321", "ua", "shared-device")).resolves.toBeTruthy();
    }
  });

  // The per-device signup cap used to sit behind `if (deviceId)`, which made it opt-out: sending a
  // random id got you capped, sending none skipped the check entirely (CodeQL js/user-controlled-bypass).
  // Creating an account now REQUIRES the header, so omitting it can no longer buy uncapped signups.
  it("KB-IDENTITY-BINDING L1: rejects NEW-account creation with no device id (the cap can't be opted out of)", async () => {
    const prisma = {
      profile: { findUnique: async () => null, upsert: async () => profileRow },
      session: { create: async () => ({ id: "s1" }) },
    };
    const { svc, store } = make(baseEnv, prisma);
    await store.put("+263770000070", tokens.hash("654321"), 300);
    // 400, not 429: the request is malformed. Conflating it with the rate limit would make a genuine
    // cap-hit indistinguishable from a broken client.
    await expect(svc.verifyOtp("+263770000070", "654321")).rejects.toMatchObject({ status: 400 });
  });

  // Scoped to CREATION deliberately. Someone already registered must never be locked out by a client
  // that stops sending the header — only new accounts are gated.
  it("KB-IDENTITY-BINDING L1: still signs in an EXISTING account with no device id", async () => {
    const { svc, store } = make(baseEnv, fakePrisma());
    await store.put("+263770000071", tokens.hash("654321"), 300);
    await expect(svc.verifyOtp("+263770000071", "654321")).resolves.toMatchObject({ profileId: "p1" });
  });

  // L0 recycle detection used to read `if (deviceId && !known)`, so a client that simply omitted the
  // header skipped it entirely — one dropped header silenced the SIM-recycle alarm, the same
  // "non-compliance is rewarded" shape as the signup cap above. Absence of an id is not evidence of a
  // known device, so it is flagged, tagged `absent` to keep it separable from a genuinely new id.
  it("KB-IDENTITY-BINDING L0: flags an EXISTING account verifying with NO device id (fail-safe, not skipped)", async () => {
    const { svc, store, metrics } = make(baseEnv, fakePrisma());
    await store.put("+263770000072", tokens.hash("654321"), 300);
    await svc.verifyOtp("+263770000072", "654321");
    // sessions: [] ⇒ newest = 0 ⇒ dormant, which is right: an account with no session history has
    // certainly not been used inside the 90d window.
    expect(metrics.incIdentityNewDeviceVerify).toHaveBeenCalledWith(true, "absent");
  });

  it("KB-IDENTITY-BINDING L0: a RECOGNISED device on an existing account is not flagged", async () => {
    const prisma = {
      profile: {
        findUnique: async () => ({ id: "p1", sessions: [{ deviceId: "known-device", createdAt: new Date() }] }),
        upsert: async () => profileRow,
      },
      session: { create: async () => ({ id: "s1" }) },
    };
    const { svc, store, metrics } = make(baseEnv, prisma);
    await store.put("+263770000073", tokens.hash("654321"), 300);
    await svc.verifyOtp("+263770000073", "654321", "ua", "known-device");
    expect(metrics.incIdentityNewDeviceVerify).not.toHaveBeenCalled();
  });

  // An empty/whitespace header must mean "absent", never "the device whose id is the empty string" —
  // otherwise every such caller shares one identity: they collide in the per-device signup cap and can
  // match each other's stored sessions.
  it("KB-IDENTITY-BINDING: treats a blank device id as absent, not as a shared device identity", async () => {
    const prisma = {
      profile: { findUnique: async () => null, upsert: async () => profileRow },
      session: { create: async () => ({ id: "s1" }) },
    };
    const { svc, store } = make(baseEnv, prisma);
    await store.put("+263770000074", tokens.hash("654321"), 300);
    // Blank ⇒ absent ⇒ the signup gate rejects it, exactly as a missing header does.
    await expect(svc.verifyOtp("+263770000074", "654321", "ua", "   ")).rejects.toMatchObject({ status: 400 });
  });

  it("KB-IDENTITY-BINDING: never persists a blank device id on the session", async () => {
    let created: Record<string, unknown> | undefined;
    const prisma = {
      profile: { findUnique: async () => ({ id: "p1", sessions: [] }), upsert: async () => profileRow },
      session: { create: async (args: { data: Record<string, unknown> }) => { created = args.data; return { id: "s1" }; } },
    };
    const { svc, store } = make(baseEnv, prisma);
    await store.put("+263770000075", tokens.hash("654321"), 300);
    await svc.verifyOtp("+263770000075", "654321", "ua", "  ");
    expect(created!.deviceId).toBeNull();
  });

  it("records otp_verify_duration with the mapped result label on every exit path", async () => {
    const expired = make(baseEnv, fakePrisma());
    await expect(expired.svc.verifyOtp("+263770000020", "123456")).rejects.toThrow();
    expect(expired.metrics.recordOtpVerify).toHaveBeenLastCalledWith(expect.any(Number), "expired", "econet");

    const locked = make(baseEnv, fakePrisma());
    await locked.store.put("+263770000021", tokens.hash("123456"), 300);
    for (let i = 0; i < 5; i++) await locked.store.incrAttempts("+263770000021");
    await expect(locked.svc.verifyOtp("+263770000021", "123456")).rejects.toThrow();
    expect(locked.metrics.recordOtpVerify).toHaveBeenLastCalledWith(expect.any(Number), "locked", "econet");

    const invalid = make(baseEnv, fakePrisma());
    await invalid.store.put("+263770000022", tokens.hash("111111"), 300);
    await expect(invalid.svc.verifyOtp("+263770000022", "222222")).rejects.toThrow();
    expect(invalid.metrics.recordOtpVerify).toHaveBeenLastCalledWith(expect.any(Number), "invalid", "econet");

    const ok = make(baseEnv, fakePrisma());
    await ok.store.put("+263770000023", tokens.hash("654321"), 300);
    await ok.svc.verifyOtp("+263770000023", "654321");
    expect(ok.metrics.recordOtpVerify).toHaveBeenLastCalledWith(expect.any(Number), "ok", "econet");
  });

  it("clears needsProfile once the profile has a name", async () => {
    const prisma = {
      profile: {
        findUnique: async () => ({ id: "p2", role: "rider", firstName: "Tendai", sessions: [] }),
        upsert: async () => ({ id: "p2", role: "rider", firstName: "Tendai" }),
      },
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
   *  and session ids that increment so each mint is provably a FRESH session. The `sessions: []`
   *  on the profile read mirrors the real `select` — the device check now runs on every verify of an
   *  existing account, so an absent array here is a shape mismatch with production, not a shortcut. */
  const gracePrisma = () => {
    let sessions = 0;
    return {
      profile: { upsert: async () => profileRow, findUnique: async () => ({ ...profileRow, sessions: [] }) },
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
    // findUnique stays null throughout, so the live verify is a SIGNUP and needs a device id. The
    // point of the test is the SECOND call: the grace path finding no profile must fall through to
    // "expired" rather than minting an account from a grace hit.
    await svc.verifyOtp("+263770000043", "654321", "ua", "device-grace");
    await expect(svc.verifyOtp("+263770000043", "654321")).rejects.toThrow(/expired or never/i);
  });

  it("records 'grace_ok' (not 'ok') on a grace-path mint", async () => {
    const { svc, store, metrics } = make(baseEnv, gracePrisma());
    await store.put("+263770000044", tokens.hash("654321"), 300);
    await svc.verifyOtp("+263770000044", "654321");
    expect(metrics.recordOtpVerify).toHaveBeenLastCalledWith(expect.any(Number), "ok", "econet");
    await svc.verifyOtp("+263770000044", "654321");
    expect(metrics.recordOtpVerify).toHaveBeenLastCalledWith(expect.any(Number), "grace_ok", "econet");
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

describe("AuthService — bird-verify channel (end-to-end through requestOtp/verifyOtp)", () => {
  const birdEnv = { ...baseEnv, OTP_CHANNEL: "bird-verify", BIRD_VERIFY_API_KEY: "bk_eu1_testkey" } as Env;
  const profileRow = { id: "p1", role: "customer", firstName: "" };
  const fakePrisma = () => ({
    profile: { findUnique: async () => ({ ...profileRow, sessions: [] }), upsert: async () => profileRow },
    session: { create: async () => ({ id: "s1" }) },
  });

  /** Swap global fetch for the duration of fn, then restore (even on throw) — mirrors bird-verify.spec.ts. */
  async function withFetch<T>(f: typeof fetch, fn: () => Promise<T>): Promise<T> {
    const orig = globalThis.fetch;
    globalThis.fetch = f;
    try {
      return await fn();
    } finally {
      globalThis.fetch = orig;
    }
  }

  it("requestOtp calls Bird Verify's create endpoint and returns the channel Bird actually used", async () => {
    const { svc } = make(birdEnv, fakePrisma());
    const fetchMock = (async () =>
      new Response(JSON.stringify({ id: "vrf_1", last_channel: "whatsapp" }), { status: 200 })) as unknown as typeof fetch;
    const res = await withFetch(fetchMock, () => svc.requestOtp("+263770000080", "1.1.1.1"));
    expect(res).toEqual({ sent: true, channel: "bird-verify", deliveryChannel: "whatsapp" });
  });

  it("verifyOtp mints a session on a successful Bird check", async () => {
    const { svc } = make(birdEnv, fakePrisma());
    const fetchMock = (async () => new Response(JSON.stringify({ success: true }), { status: 200 })) as unknown as typeof fetch;
    const res = await withFetch(fetchMock, () => svc.verifyOtp("+263770000081", "123456", "ua", "device-1"));
    expect(res).toMatchObject({ profileId: "p1", role: "customer" });
    expect(res.accessToken).toBeTruthy();
  });

  it("verifyOtp maps Bird's attempts_exhausted to the same 'too many' error as the local engine", async () => {
    const { svc } = make(birdEnv, fakePrisma());
    const fetchMock = (async () =>
      new Response(JSON.stringify({ success: false, reason: "attempts_exhausted" }), { status: 200 })) as unknown as typeof fetch;
    await expect(withFetch(fetchMock, () => svc.verifyOtp("+263770000082", "000000"))).rejects.toThrow(/too many/i);
  });

  it("verifyOtp maps a wrong code to the same 'invalid code' error as the local engine", async () => {
    const { svc } = make(birdEnv, fakePrisma());
    const fetchMock = (async () =>
      new Response(JSON.stringify({ success: false, reason: "incorrect_code" }), { status: 200 })) as unknown as typeof fetch;
    await expect(withFetch(fetchMock, () => svc.verifyOtp("+263770000083", "000000"))).rejects.toThrow(/invalid code/i);
  });

  // The Bird-specific retry shape: a client that timed out on a successful check retries with the SAME
  // code; Bird 404s the second check (already final), and this must heal via the SAME post-verify grace
  // the local engine relies on (§6) — not a hard "expired" that strands the user needing a whole new OTP.
  it("a retry after a successful Bird check (Bird now 404s it) heals via the grace path instead of failing", async () => {
    const { svc } = make(birdEnv, fakePrisma());
    let calls = 0;
    const fetchMock = (async () => {
      calls++;
      return calls === 1
        ? new Response(JSON.stringify({ success: true }), { status: 200 })
        : new Response("", { status: 404 });
    }) as unknown as typeof fetch;
    const first = await withFetch(fetchMock, () => svc.verifyOtp("+263770000084", "123456"));
    const retry = await withFetch(fetchMock, () => svc.verifyOtp("+263770000084", "123456"));
    expect(retry).toMatchObject({ profileId: "p1", role: "customer" });
    // A fresh session, not a crash and not "expired" — the exact point of the engine-agnostic grace.
    expect(retry.refreshToken).not.toBe(first.refreshToken);
  });

  it("a genuinely expired/never-requested Bird verification (404, no prior success) is a real 'expired' error", async () => {
    const { svc } = make(birdEnv, fakePrisma());
    const fetchMock = (async () => new Response("", { status: 404 })) as unknown as typeof fetch;
    await expect(withFetch(fetchMock, () => svc.verifyOtp("+263770000085", "123456"))).rejects.toThrow(/expired or never/i);
  });

  it("a Bird outage (5xx) surfaces as a real error, never a silent 'invalid code' against the user's attempt budget", async () => {
    const { svc } = make(birdEnv, fakePrisma());
    const fetchMock = (async () => new Response("boom", { status: 500 })) as unknown as typeof fetch;
    const err = await withFetch(fetchMock, () => svc.verifyOtp("+263770000086", "123456")).catch((e: Error) => e);
    expect(err).toBeInstanceOf(Error);
    expect((err as Error).message).not.toMatch(/invalid code/i);
  });
});

interface SessionRow {
  id: string;
  profileId: string;
  refreshTokenHash: string;
  revokedAt: Date | null;
  rotatedToId: string | null;
  expiresAt: Date;
}

/**
 * A tiny in-memory `session` table with the semantics refresh() and logout() rely on: the compare-and-
 * swap revoke (`updateMany … WHERE revokedAt IS NULL`), create, the rotatedToId link, profile-scoped
 * lookups and an interactive `$transaction`. Faithful enough to drive rotation → lost response → replay
 * end to end; true concurrency (row locks) is proven against Postgres in refresh-rotation.int.spec.ts.
 */
function sessionTable(riderStanding?: string) {
  const rows = new Map<string, SessionRow>();
  const profile: { role: string; rider: { accountStatus: string } | null } = riderStanding
    ? { role: "rider", rider: { accountStatus: riderStanding } }
    : { role: "customer", rider: null };
  let creates = 0;
  const matches = (row: SessionRow, where: Record<string, unknown>) =>
    Object.entries(where).every(([k, v]) => (row as unknown as Record<string, unknown>)[k] === v);
  const session = {
    findUnique: vi.fn(async ({ where }: { where: { id: string } }) => {
      const row = rows.get(where.id);
      return row ? { ...row, profile } : null;
    }),
    findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => {
      const row = [...rows.values()].find((r) => matches(r, where));
      return row ? { ...row } : null;
    }),
    updateMany: vi.fn(async ({ where, data }: { where: Record<string, unknown>; data: Partial<SessionRow> }) => {
      const row = typeof where.id === "string" ? rows.get(where.id) : undefined;
      if (!row || !matches(row, where)) return { count: 0 };
      Object.assign(row, data);
      return { count: 1 };
    }),
    update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<SessionRow> }) => {
      const row = rows.get(where.id);
      if (!row) throw new Error(`no session ${where.id}`);
      Object.assign(row, data);
      return { ...row };
    }),
    create: vi.fn(async ({ data }: { data: Omit<SessionRow, "id" | "revokedAt" | "rotatedToId"> }) => {
      creates++;
      const row: SessionRow = { id: randomUUID(), revokedAt: null, rotatedToId: null, ...data };
      rows.set(row.id, row);
      return { id: row.id };
    }),
  };
  const prisma = {
    session,
    // Interactive transaction with real rollback: a throw restores every row as it was.
    $transaction: vi.fn(async (fn: (tx: { session: typeof session }) => Promise<unknown>) => {
      const snapshot = [...rows.values()].map((r) => ({ ...r }));
      try {
        return await fn({ session });
      } catch (err) {
        rows.clear();
        for (const r of snapshot) rows.set(r.id, r);
        throw err;
      }
    }),
  };
  /** Seed a session the client holds `token` for. */
  function seed(over: Partial<SessionRow> = {}) {
    const id = randomUUID();
    const secret = tokens.randomToken();
    rows.set(id, { id, profileId: "p1", refreshTokenHash: tokens.hash(secret), revokedAt: null, rotatedToId: null, expiresAt: inAYear(), ...over });
    return { id, secret, token: `${id}.${secret}` };
  }
  return { rows, prisma, profile, seed, created: () => creates };
}

const inAYear = () => new Date(Date.now() + 365 * 86_400_000);
const idOf = (token: string) => token.slice(0, token.indexOf("."));

describe("AuthService.refresh", () => {
  it("rejects a malformed token (no dot)", async () => {
    const t = sessionTable();
    const { svc } = make(baseEnv, t.prisma);
    await expect(svc.refresh("no-dot-token")).rejects.toThrow(/malformed/i);
  });

  it("rejects a session id that isn't a UUID as malformed — without a database round trip", async () => {
    const t = sessionTable();
    const { svc } = make(baseEnv, t.prisma);
    await expect(svc.refresh("sid.secret")).rejects.toThrow(/malformed/i);
    expect(t.prisma.session.findUnique).not.toHaveBeenCalled();
  });

  it("rejects when the session is not found", async () => {
    const t = sessionTable();
    const { svc } = make(baseEnv, t.prisma);
    await expect(svc.refresh(`${randomUUID()}.secret`)).rejects.toThrow(/invalid or expired/i);
  });

  // The sign-out-on-a-DB-blip bug: the lookup used to `.catch(() => null)`, turning a pool timeout or a
  // failover into "unknown session" → 401, which every client treats as a revocation (session wiped,
  // back to OTP). It must surface as the unexpected error it is → a 5xx the client treats as transient.
  it("a database failure during the lookup propagates as an error — NOT a 401 that signs the user out", async () => {
    const t = sessionTable();
    const { token } = t.seed();
    t.prisma.session.findUnique.mockRejectedValueOnce(new Error("Connection terminated unexpectedly"));
    const { svc } = make(baseEnv, t.prisma);
    const err = await svc.refresh(token).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(Error);
    expect(err).not.toBeInstanceOf(UnauthorizedException);
    expect((err as Error).message).toMatch(/connection terminated/i);
  });

  it("a database failure while answering a replay propagates too — never a 401", async () => {
    const t = sessionTable();
    const old = t.seed();
    const { svc } = make(baseEnv, t.prisma);
    await svc.refresh(old.token); // rotated; the client "loses" this response
    t.prisma.session.findUnique
      .mockImplementationOnce(async ({ where }) => ({ ...t.rows.get(where.id)!, profile: t.profile }))
      .mockRejectedValueOnce(new Error("read timeout"));
    const err = await svc.refresh(old.token).catch((e: unknown) => e);
    expect(err).not.toBeInstanceOf(UnauthorizedException);
    expect((err as Error).message).toMatch(/read timeout/);
  });

  it("rejects a session revoked by logout (no successor link)", async () => {
    const t = sessionTable();
    const { token } = t.seed({ revokedAt: new Date(Date.now() - 1_000) });
    const { svc } = make(baseEnv, t.prisma);
    await expect(svc.refresh(token)).rejects.toThrow(/invalid or expired/i);
  });

  it("rejects an expired session", async () => {
    const t = sessionTable();
    const { token } = t.seed({ expiresAt: new Date(Date.now() - 60_000) });
    const { svc } = make(baseEnv, t.prisma);
    await expect(svc.refresh(token)).rejects.toThrow(/invalid or expired/i);
  });

  it("rejects a mismatched refresh secret", async () => {
    const t = sessionTable();
    const { id } = t.seed();
    const { svc } = make(baseEnv, t.prisma);
    await expect(svc.refresh(`${id}.${tokens.randomToken()}`)).rejects.toThrow(/invalid or expired/i);
  });

  it("FRAUD P2-3: rejects refresh for a banned rider (standing backstop) — no token renewal", async () => {
    const t = sessionTable("banned");
    const { token } = t.seed();
    const { svc } = make(baseEnv, t.prisma);
    await expect(svc.refresh(token)).rejects.toThrow(/not active/i);
    // The standing gate fires before rotation — no successor session is minted for a banned rider.
    expect(t.created()).toBe(0);
  });

  it("FRAUD P2-3: rejects refresh for a suspended rider too", async () => {
    const t = sessionTable("suspended");
    const { token } = t.seed();
    const { svc } = make(baseEnv, t.prisma);
    await expect(svc.refresh(token)).rejects.toThrow(/not active/i);
  });

  it("allows refresh for an active rider (standing backstop is not over-broad)", async () => {
    const t = sessionTable("active");
    const { token } = t.seed();
    const { svc } = make(baseEnv, t.prisma);
    await expect(svc.refresh(token)).resolves.toMatchObject({ refreshToken: expect.stringContaining(".") });
  });

  it("rotates a valid session: revoke (CAS) + mint + link in one transaction, successor secret derived", async () => {
    const t = sessionTable();
    const old = t.seed();
    const { svc } = make(baseEnv, t.prisma);
    const res = await svc.refresh(old.token);

    const succId = idOf(res.refreshToken);
    // The successor's secret is derived from the presented token, so this exact rotation can be answered
    // again if its response is lost.
    expect(res.refreshToken).toBe(`${succId}.${tokens.successorSecret(old.id, old.secret)}`);
    expect(t.rows.get(succId)).toMatchObject({ revokedAt: null, refreshTokenHash: tokens.hash(tokens.successorSecret(old.id, old.secret)) });
    // Revoked AND linked to the successor — atomically, inside the transaction.
    expect(t.rows.get(old.id)).toMatchObject({ revokedAt: expect.any(Date), rotatedToId: succId });
    expect(t.prisma.$transaction).toHaveBeenCalledTimes(1);
    // Revocation is a guarded compare-and-swap on the still-un-revoked row, not a blind update.
    expect(t.prisma.session.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: old.id, revokedAt: null } }));
    expect(res.expiresIn).toBe(900);
  });

  it("a failure while minting the successor rolls the whole rotation back — the client's token still works", async () => {
    const t = sessionTable();
    const old = t.seed();
    t.prisma.session.create.mockRejectedValueOnce(new Error("insert failed"));
    const { svc } = make(baseEnv, t.prisma);

    const err = await svc.refresh(old.token).catch((e: unknown) => e);
    expect(err).not.toBeInstanceOf(UnauthorizedException); // a 5xx the client retries, never a sign-out
    // The revoke didn't survive the failed transaction, so the token the client holds isn't burned.
    expect(t.rows.get(old.id)).toMatchObject({ revokedAt: null, rotatedToId: null });
    await expect(svc.refresh(old.token)).resolves.toMatchObject({ refreshToken: expect.stringContaining(".") });
  });

  it("a CAS lost to a LOGOUT (revoked, no successor) is rejected and mints nothing", async () => {
    const t = sessionTable();
    const old = t.seed();
    const snapshot = { ...t.rows.get(old.id)!, profile: t.profile };
    // The first (advisory) read still sees it live; by the CAS a logout has revoked it with no link.
    t.prisma.session.findUnique.mockImplementationOnce(async () => {
      t.rows.get(old.id)!.revokedAt = new Date();
      return snapshot;
    });
    const { svc } = make(baseEnv, t.prisma);
    await expect(svc.refresh(old.token)).rejects.toThrow(/invalid or expired/i);
    expect(t.created()).toBe(0);
  });
});

/**
 * A rotation whose response never reaches the client — a dropped link, the client's 15s timeout on a slow
 * network, the app killed or the phone switched off before the new token was saved — leaves the client
 * holding the rotated token. Before, that was forgiven for 60s (RT-GRACE); any later and the user was
 * signed out and sent back through OTP. Now the rotated token is answered with the SAME successor for as
 * long as that successor stays unused.
 */
describe("AuthService.refresh — replaying a rotation whose response was lost", () => {
  it("re-presenting a rotated token hands back the SAME successor — and mints no new session", async () => {
    const t = sessionTable();
    const old = t.seed();
    const { svc } = make(baseEnv, t.prisma);
    const first = await svc.refresh(old.token); // response lost in flight
    const rows = t.rows.size;

    const retry = await svc.refresh(old.token);
    const again = await svc.refresh(old.token);
    expect(retry.refreshToken).toBe(first.refreshToken);
    expect(again.refreshToken).toBe(first.refreshToken);
    // A fresh access token each time, but never another session: replay can't multiply sessions.
    expect(retry.accessToken).toEqual(expect.any(String));
    expect(t.rows.size).toBe(rows);
    expect(t.created()).toBe(1);
  });

  it("still works long after the old 60s window — the phone was off overnight", async () => {
    const t = sessionTable();
    const old = t.seed();
    const { svc } = make(baseEnv, t.prisma);
    const first = await svc.refresh(old.token);
    t.rows.get(old.id)!.revokedAt = new Date(Date.now() - 20 * 3_600_000); // rotated 20h ago

    await expect(svc.refresh(old.token)).resolves.toMatchObject({ refreshToken: first.refreshToken });
  });

  it("the replayed successor works normally, and the old token dies once the client uses it", async () => {
    const t = sessionTable();
    const old = t.seed();
    const { svc } = make(baseEnv, t.prisma);
    await svc.refresh(old.token);
    const replayed = await svc.refresh(old.token);

    const next = await svc.refresh(replayed.refreshToken); // the client moves on with the successor
    expect(next.refreshToken).not.toBe(replayed.refreshToken);
    // The chain advanced: presenting the original token now is a replay of a dead token — reuse detection.
    await expect(svc.refresh(old.token)).rejects.toThrow(/invalid or expired/i);
  });

  it("does NOT replay once the successor was revoked (sign-out or an admin revoke of the live head)", async () => {
    const t = sessionTable();
    const old = t.seed();
    const { svc } = make(baseEnv, t.prisma);
    const first = await svc.refresh(old.token);
    t.rows.get(idOf(first.refreshToken))!.revokedAt = new Date();

    await expect(svc.refresh(old.token)).rejects.toThrow(/invalid or expired/i);
  });

  it("covers a phone that was off for most of two weeks…", async () => {
    const t = sessionTable();
    const old = t.seed();
    const { svc } = make(baseEnv, t.prisma);
    const first = await svc.refresh(old.token);
    t.rows.get(old.id)!.revokedAt = new Date(Date.now() - 13 * 86_400_000);

    await expect(svc.refresh(old.token)).resolves.toMatchObject({ refreshToken: first.refreshToken });
  });

  it("…but not beyond the 14-day replay window", async () => {
    const t = sessionTable();
    const old = t.seed();
    const { svc } = make(baseEnv, t.prisma);
    await svc.refresh(old.token);
    t.rows.get(old.id)!.revokedAt = new Date(Date.now() - 15 * 86_400_000);

    await expect(svc.refresh(old.token)).rejects.toThrow(/invalid or expired/i);
  });

  // The window is its own constant — raising retention for audit reasons must not widen it — but it is
  // clamped DOWN to a shorter retention, past which the rotated row is purged anyway.
  it("is clamped to a shorter session-retention setting, never widened by a longer one", async () => {
    const t = sessionTable();
    const old = t.seed();
    const { svc: shortRetention } = make({ ...baseEnv, SESSION_RETENTION_DAYS: 7 } as Env, t.prisma);
    const first = await shortRetention.refresh(old.token);
    t.rows.get(old.id)!.revokedAt = new Date(Date.now() - 8 * 86_400_000);
    await expect(shortRetention.refresh(old.token)).rejects.toThrow(/invalid or expired/i);

    const { svc: longRetention } = make({ ...baseEnv, SESSION_RETENTION_DAYS: 365 } as Env, t.prisma);
    t.rows.get(old.id)!.revokedAt = new Date(Date.now() - 20 * 86_400_000);
    await expect(longRetention.refresh(old.token)).rejects.toThrow(/invalid or expired/i);
    t.rows.get(old.id)!.revokedAt = new Date(Date.now() - 6 * 86_400_000);
    await expect(longRetention.refresh(old.token)).resolves.toMatchObject({ refreshToken: first.refreshToken });
  });

  it("never hands back a successor that belongs to another profile", async () => {
    const t = sessionTable();
    const old = t.seed();
    const { svc } = make(baseEnv, t.prisma);
    const first = await svc.refresh(old.token);
    t.rows.get(idOf(first.refreshToken))!.profileId = "someone-else";

    await expect(svc.refresh(old.token)).rejects.toThrow(/invalid or expired/i);
  });

  it("logs a rotated token that comes back after its successor was used — the only reuse signal there is", async () => {
    const warn = vi.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    try {
      const t = sessionTable();
      const old = t.seed();
      const { svc } = make(baseEnv, t.prisma);
      const successor = await svc.refresh(old.token);
      await svc.refresh(successor.refreshToken); // the client moved on

      await expect(svc.refresh(old.token)).rejects.toThrow(/invalid or expired/i);
      expect(warn).toHaveBeenCalledWith(expect.stringMatching(/possible token reuse/));
    } finally {
      warn.mockRestore();
    }
  });

  it("fails closed when the retention window is not configured", async () => {
    const t = sessionTable();
    const old = t.seed();
    const { svc } = make({ ...baseEnv, SESSION_RETENTION_DAYS: undefined } as unknown as Env, t.prisma);
    await svc.refresh(old.token);

    await expect(svc.refresh(old.token)).rejects.toThrow(/invalid or expired/i);
  });

  it("never replays for a banned rider — the standing gate comes first", async () => {
    const t = sessionTable("active");
    const old = t.seed();
    const { svc } = make(baseEnv, t.prisma);
    await svc.refresh(old.token);

    const banned = sessionTable("banned");
    for (const [id, row] of t.rows) banned.rows.set(id, row);
    const { svc: svcAfterBan } = make(baseEnv, banned.prisma);
    await expect(svcAfterBan.refresh(old.token)).rejects.toThrow(/not active/i);
  });

  it("the loser of a concurrent double-rotate gets the SAME successor as the winner", async () => {
    const t = sessionTable();
    const old = t.seed();
    const { svc } = make(baseEnv, t.prisma);
    // The loser read the row before the winner committed (advisory read sees it live)…
    const staleRead = { ...t.rows.get(old.id)!, profile: t.profile };
    const winner = await svc.refresh(old.token);
    t.prisma.session.findUnique.mockImplementationOnce(async () => staleRead);

    // …so it reaches the CAS, claims zero rows, and is answered from the winner's committed link.
    const loser = await svc.refresh(old.token);
    expect(loser.refreshToken).toBe(winner.refreshToken);
    expect(t.created()).toBe(1);
  });

  describe("a successor rotated before secrets were derived (legacy random secret)", () => {
    function legacyRotated(agoMs: number) {
      const t = sessionTable();
      const succ = t.seed(); // random secret: not derivable from the old token
      const old = t.seed({ revokedAt: new Date(Date.now() - agoMs), rotatedToId: succ.id });
      return { t, old, succ };
    }

    it("keeps the original 60s grace: a fresh independent session inside the window", async () => {
      const { t, old, succ } = legacyRotated(5_000);
      const { svc } = make(baseEnv, t.prisma);
      const res = await svc.refresh(old.token);
      expect(idOf(res.refreshToken)).not.toBe(succ.id);
      expect(t.created()).toBe(1);
    });

    it("rejects outside the 60s window, exactly as before", async () => {
      const { t, old } = legacyRotated(61_000);
      const { svc } = make(baseEnv, t.prisma);
      await expect(svc.refresh(old.token)).rejects.toThrow(/invalid or expired/i);
      expect(t.created()).toBe(0);
    });
  });
});

describe("AuthService.logout", () => {
  it("reports revoked=false when no live session matched", async () => {
    const t = sessionTable();
    const { svc } = make(baseEnv, t.prisma);
    expect(await svc.logout(randomUUID(), "p1")).toEqual({ revoked: false });
  });

  it("reports revoked=true when a live session was revoked", async () => {
    const t = sessionTable();
    const s = t.seed();
    const { svc } = make(baseEnv, t.prisma);
    expect(await svc.logout(s.id, "p1")).toEqual({ revoked: true });
    expect(t.rows.get(s.id)!.revokedAt).toBeInstanceOf(Date);
  });

  // A sign-out sent with an expired access token refreshes first, so the id the client derived from its
  // refresh token is already rotated away by the time logout runs. That used to revoke nothing, leaving
  // the live successor valid (and replayable from the signed-out token) for a year.
  it("given an already-rotated session id, revokes the chain's LIVE HEAD", async () => {
    const t = sessionTable();
    const old = t.seed();
    const { svc } = make(baseEnv, t.prisma);
    const live = await svc.refresh(old.token);

    expect(await svc.logout(old.id, "p1")).toEqual({ revoked: true });
    expect(t.rows.get(idOf(live.refreshToken))!.revokedAt).toBeInstanceOf(Date);
    // Neither the live token nor the signed-out one can renew any more.
    await expect(svc.refresh(live.refreshToken)).rejects.toThrow(/invalid or expired/i);
    await expect(svc.refresh(old.token)).rejects.toThrow(/invalid or expired/i);
  });

  it("never follows a chain into another profile's sessions", async () => {
    const t = sessionTable();
    const old = t.seed();
    const { svc } = make(baseEnv, t.prisma);
    const live = await svc.refresh(old.token);

    expect(await svc.logout(old.id, "someone-else")).toEqual({ revoked: false });
    expect(t.rows.get(idOf(live.refreshToken))!.revokedAt).toBeNull();
  });
});

/**
 * P0-1 / D6 — `kycPendingState` on getMe. A `pending` check is one server state but two situations on
 * screen: with the vendor (nothing for the rider to do) vs opened-and-backed-out (their move). These
 * assert the derivation runs on exactly the riders it should, and is skipped on the ones it shouldn't
 * — each needless call is real vendor latency on the poll of a rider stuck behind the gate.
 */
describe("AuthService.getProfile — kycPendingState (P0-1 / D6)", () => {
  const autoEnv = { ...baseEnv, KYC_MODE: "auto" } as Env;

  /** Records which refs the derivation was asked about, so "was it even called" is assertable. */
  function spyPendingState(answer: "in_flight" | "unfinished" = "in_flight") {
    const asked: (string | null | undefined)[] = [];
    const svc = {
      get: async (ref: string | null | undefined) => {
        asked.push(ref);
        return answer;
      },
    } as unknown as KycPendingStateService;
    return { svc, asked };
  }

  const profileWithRider = (rider: Record<string, unknown> | null) => ({
    profile: {
      findUnique: async () => ({
        id: "p1",
        role: "rider",
        firstName: "T",
        lastName: "R",
        phone: "+263770000001",
        email: null,
        photoUrl: null,
        ordersCount: 0,
        onHold: false,
        idNumber: null,
        rider,
      }),
    },
  });

  const pendingRider = {
    bikeReg: "ABZ 1234",
    kycStatus: "pending",
    ratingAvg: 0,
    ratingCount: 0,
    tripsCount: 0,
    isOnline: false,
    kycDeclineReason: null,
    kycAttempts: 0,
    kycSessionToken: "tok_live",
    kycSessionUrl: "https://verify.didit.me/sess_live",
    kycRef: "sess_live",
    cancelStrikes: 0,
  };

  it("derives the state for an auto-mode pending rider and returns it", async () => {
    const spy = spyPendingState("in_flight");
    const { svc } = make(autoEnv, profileWithRider(pendingRider), spy.svc);
    const me = await svc.getProfile("p1");
    expect(me.rider?.kycPendingState).toBe("in_flight");
    expect(spy.asked).toEqual(["sess_live"]);
  });

  it("skips the derivation for a verified rider — nothing to resume", async () => {
    const spy = spyPendingState();
    const { svc } = make(autoEnv, profileWithRider({ ...pendingRider, kycStatus: "verified" }), spy.svc);
    const me = await svc.getProfile("p1");
    expect(me.rider?.kycPendingState).toBeNull();
    expect(spy.asked).toHaveLength(0);
  });

  // Manual mode has no vendor session to ask about — pending there means "ops are reviewing it", and
  // the app branches on kycMode before ever reading this. Calling the vendor would be pure latency.
  it("skips the derivation in manual KYC mode", async () => {
    const spy = spyPendingState();
    const { svc } = make({ ...baseEnv, KYC_MODE: "manual" } as Env, profileWithRider(pendingRider), spy.svc);
    const me = await svc.getProfile("p1");
    expect(me.rider?.kycPendingState).toBeNull();
    expect(spy.asked).toHaveLength(0);
  });

  // adminSetKyc("pending") is a RESET: it clears the session token and url but keeps kycRef. Deriving
  // from the ref alone would answer with the state of the session the admin just set aside — if that
  // reads "in flight", the rider sits on an actionless screen waiting for a check nobody is running.
  it("skips the derivation after an admin pending-reset, which leaves kycRef but no live session", async () => {
    const spy = spyPendingState("in_flight");
    const reset = { ...pendingRider, kycSessionToken: null, kycSessionUrl: null };
    const { svc } = make(autoEnv, profileWithRider(reset), spy.svc);
    const me = await svc.getProfile("p1");
    expect(me.rider?.kycPendingState).toBeNull();
    expect(spy.asked).toHaveLength(0);
  });

  // Same rule for a session minted before the token was captured (pre-#840 rows): there is nothing to
  // re-enter, so the rider owes the next tap whatever the vendor would say about the old session.
  it("skips the derivation when the session has a ref but no token", async () => {
    const spy = spyPendingState("in_flight");
    const { svc } = make(autoEnv, profileWithRider({ ...pendingRider, kycSessionToken: null }), spy.svc);
    expect((await svc.getProfile("p1")).rider?.kycPendingState).toBeNull();
    expect(spy.asked).toHaveLength(0);
  });

  it("is absent for a non-rider account", async () => {
    const spy = spyPendingState();
    const { svc } = make(autoEnv, profileWithRider(null), spy.svc);
    const me = await svc.getProfile("p1");
    expect(me.rider).toBeNull();
    expect(spy.asked).toHaveLength(0);
  });

  // kycRef is selected purely as the derivation's input. It is a vendor session id, not something the
  // rider app has any use for, so it must not ride along on the payload.
  it("never leaks the vendor session ref onto the payload", async () => {
    const spy = spyPendingState();
    const { svc } = make(autoEnv, profileWithRider(pendingRider), spy.svc);
    const me = await svc.getProfile("p1");
    expect(me.rider).not.toHaveProperty("kycRef");
  });
});
