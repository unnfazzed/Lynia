import { Prisma } from "@prisma/client";
import { describe, expect, it, vi } from "vitest";
import type { Env } from "../config/env";
import type { KycVendor } from "../kyc/kyc-vendor";
import { StubKycVendor } from "../kyc/kyc-vendor";
import { PrismaService } from "../prisma/prisma.service";
import { PiiCryptoService } from "../common/pii-crypto.service";
import { canGoOnline, onlineRefusalReason, RiderService } from "./rider.service";

/** Real crypto with a fixed test key so hashId(...) is deterministic across the assertions below. */
const pii = new PiiCryptoService({ PII_ENCRYPTION_KEY: "test-pii-key-0123456789abcdefghij" } as Env);

describe("canGoOnline (rider gating, §5d)", () => {
  it("allows only verified riders online", () => {
    expect(canGoOnline("verified")).toBe(true);
  });
  it("blocks pending, failed and expired riders", () => {
    expect(canGoOnline("pending")).toBe(false);
    expect(canGoOnline("failed")).toBe(false);
    expect(canGoOnline("expired")).toBe(false);
  });
});

/** setOnline evicts the offline rider from the geo index and drains the "notify me" waiting list on
 *  online — no-op stubs keep these unit tests off Redis + push. */
const trackingStub = {
  evictFromGeo: async () => {},
  claimNotifyWaitersNear: async () => [],
  clearNotifyWaiters: async () => {},
  // heartbeat (wave-2 W3): position refresh is a no-op here; the probe reads "no waiters" so the
  // beat-drain stays off unless a test wires its own tracking stub with spies.
  recordFix: async () => {},
  hasNotifyWaiters: async () => false,
} as unknown as import("../tracking/tracking.service").TrackingService;
const notificationsStub = {
  notifyRidersAvailable: async () => new Set<string>(),
  notifyProfiles: async () => {},
} as unknown as import("../notifications/notifications.service").NotificationsService;
// Standing-demotion funnel: adminSetKyc / applyKycResult call gateway.evictRiderFromSupply post-commit on
// any non-verified decision (Class-B). No-op stub — the eviction-path assertions use their own spy.
const gatewayStub = {
  evictRiderFromSupply: async () => {},
} as unknown as import("../tracking/tracking.gateway").TrackingGateway;

function svc(prisma: Partial<Record<string, unknown>>, env: Partial<Env>, vendor: KycVendor = new StubKycVendor()) {
  const p = prisma as Record<string, unknown>;
  // adminSetKyc now wraps its read+update+audit in a callback `$transaction`; give the fake one that
  // runs the callback against itself (or returns an array, the becomeRider form) unless a test set its own.
  if (!p.$transaction) {
    p.$transaction = async (arg: unknown) =>
      typeof arg === "function" ? (arg as (tx: unknown) => unknown)(p) : arg;
  }
  // adminSetKyc takes a `SELECT … FOR UPDATE` row lock via $executeRaw before its read (fix 3) — the
  // return is ignored there. setOnline's go-online CAS (KB-HEARTBEAT-MARGIN) is ALSO a $executeRaw now
  // (raw so the heartbeat stamp is DB now()), and it reads the affected-row count: 1 ⇒ the standing
  // guard matched ⇒ online. Default to 1 (matched) unless a test overrides it to simulate a CAS miss.
  if (!p.$executeRaw) p.$executeRaw = async () => 1;
  return new RiderService(p as unknown as PrismaService, env as Env, vendor, pii, trackingStub, gatewayStub, notificationsStub);
}

describe("RiderService.becomeRider", () => {
  it("409s if already registered as a rider", async () => {
    const s = svc({ rider: { findUnique: async () => ({ profileId: "p1" }) } }, { KYC_MODE: "auto" });
    await expect(s.becomeRider("p1", { bikeReg: "ABZ 1", photoUrl: "kyc/p1/photo.jpg" })).rejects.toThrow(/already registered/i);
  });

  // BH-04: the mobile client special-cases this exact conflict as "my earlier submit already
  // landed, the response just got lost" (a lost-response retry) rather than a generic failure — it
  // needs a stable machine-readable `reason`, not just the human message, to branch on.
  it("409 carries a stable machine-readable reason for the mobile client's lost-response retry path", async () => {
    const s = svc({ rider: { findUnique: async () => ({ profileId: "p1" }) } }, { KYC_MODE: "auto" });
    try {
      await s.becomeRider("p1", { bikeReg: "ABZ 1", photoUrl: "kyc/p1/photo.jpg" });
      throw new Error("expected becomeRider to throw");
    } catch (e) {
      expect((e as { getResponse: () => unknown }).getResponse()).toMatchObject({ reason: "already_rider" });
    }
  });

  it("400s if the photo key is not under the caller's own kyc namespace (no cross-user key)", async () => {
    const s = svc({ rider: { findUnique: async () => null } }, { KYC_MODE: "auto" });
    await expect(
      s.becomeRider("p1", { bikeReg: "ABZ 1", photoUrl: "kyc/victim/photo.jpg" }),
    ).rejects.toThrow(/invalid photo key/i);
  });

  it("auto mode submits to the vendor and returns the verification url", async () => {
    let submitted: string | undefined;
    const vendor: KycVendor = {
      submit: async (riderId) => {
        submitted = riderId;
        return { ref: "sess_1", status: "pending", url: "https://verify.didit.me/sess_1" };
      },
    };
    const prisma = {
      rider: { findUnique: async () => null, create: async () => ({}) },
      profile: { update: async () => ({}), findUnique: async () => ({ idNumberHash: pii.hashId("63-1-A") }), count: async () => 0 },
      $transaction: async () => [],
    };
    const s = svc(prisma, { KYC_MODE: "auto" }, vendor);
    const res = await s.becomeRider("p1", { bikeReg: "ABZ 1", photoUrl: "kyc/p1/photo.jpg" });
    expect(submitted).toBe("p1");
    expect(res).toEqual({ kycStatus: "pending", mode: "auto", verificationUrl: "https://verify.didit.me/sess_1" });
  });

  it("stub provider in auto mode auto-verifies the rider so it can go online (QA/test)", async () => {
    let created: Record<string, unknown> | undefined;
    const prisma = {
      rider: {
        findUnique: async () => null,
        create: async (args: { data: Record<string, unknown> }) => {
          created = args.data;
          return {};
        },
      },
      profile: { update: async () => ({}), findUnique: async () => ({ idNumberHash: pii.hashId("63-1-A") }), count: async () => 0 },
      $transaction: async (ops: unknown[]) => ops,
    };
    const s = svc(prisma, { KYC_MODE: "auto", KYC_PROVIDER: "stub" }, new StubKycVendor());
    const res = await s.becomeRider("p1", { bikeReg: "ABZ 1", photoUrl: "kyc/p1/photo.jpg" });
    expect(res.kycStatus).toBe("verified");
    // A unique ID → not flagged.
    expect(created).toMatchObject({ kycStatus: "verified", idVerified: true, duplicateIdFlag: false });
  });

  // One-ID-one-account (2026-07-26): a national ID already on another LIVE account hard-blocks rider
  // onboarding — the ban-evasion second-SIM path (banned original can't self-erase, so it stays live
  // and keeps blocking). Refused BEFORE vendor.submit, so no paid Didit session is ever minted for it.
  it("409s (id_in_use) when the national ID is already on another LIVE account — no vendor call, no rider row", async () => {
    let created = false;
    let submitted = false;
    const vendor: KycVendor = {
      submit: async () => {
        submitted = true;
        return { ref: "sess_x", status: "pending" };
      },
    };
    const prisma = {
      rider: {
        findUnique: async () => null,
        create: async () => {
          created = true;
          return {};
        },
      },
      profile: {
        update: async () => ({}),
        findUnique: async () => ({ idNumberHash: pii.hashId("63-123456-A-42") }),
        count: async (args: { where: Record<string, unknown> }) => {
          // The BLOCK count is the live one — it must exclude erased tombstones and self.
          expect(args.where).toMatchObject({
            idNumberHash: pii.hashId("63-123456-A-42"),
            id: { not: "p1" },
            NOT: { phone: { startsWith: "erased:" } },
          });
          return 1;
        },
      },
      $transaction: async (ops: unknown[]) => ops,
    };
    const s = svc(prisma, { KYC_MODE: "auto" }, vendor);
    try {
      await s.becomeRider("p1", { bikeReg: "ABZ 1", photoUrl: "kyc/p1/photo.jpg" });
      throw new Error("expected becomeRider to throw");
    } catch (e) {
      // Stable machine-readable reason (BH-04 pattern) so the client can special-case it.
      expect((e as { getResponse: () => unknown }).getResponse()).toMatchObject({ reason: "id_in_use" });
    }
    expect(submitted).toBe(false);
    expect(created).toBe(false);
  });

  it("allows + flags (A-04) when the only ID collision is an ERASED tombstone — the returning-user shape", async () => {
    let created: Record<string, unknown> | undefined;
    const prisma = {
      rider: {
        findUnique: async () => null,
        create: async (args: { data: Record<string, unknown> }) => {
          created = args.data;
          return {};
        },
      },
      profile: {
        update: async () => ({}),
        findUnique: async () => ({ idNumberHash: pii.hashId("63-123456-A-42") }),
        // Live count (has the erased-exclusion NOT clause) → 0; reviewer-flag count (all accounts,
        // incl. tombstones) → 1. DS15-02b keeps the hash on erasure precisely for this signal.
        count: async (args: { where: Record<string, unknown> }) => ("NOT" in args.where ? 0 : 1),
      },
      $transaction: async (ops: unknown[]) => ops,
    };
    const s = svc(prisma, { KYC_MODE: "auto", KYC_PROVIDER: "stub" }, new StubKycVendor());
    const res = await s.becomeRider("p1", { bikeReg: "ABZ 1", photoUrl: "kyc/p1/photo.jpg" });
    // Onboarding succeeds — a returning user must not be locked out of their own identity — but the
    // reviewer flag is set, so applyKycResult still holds an auto-verify for human review (DOC-16-05).
    expect(res.kycStatus).toBe("verified");
    expect(created).toMatchObject({ duplicateIdFlag: true });
  });

  it("400s when the profile has no national ID yet — rider onboarding requires it (one-ID-one-account)", async () => {
    let created = false;
    const prisma = {
      rider: {
        findUnique: async () => null,
        create: async () => {
          created = true;
          return {};
        },
      },
      profile: {
        update: async () => ({}),
        findUnique: async () => ({ idNumberHash: null }),
        count: async () => 0,
      },
      $transaction: async (ops: unknown[]) => ops,
    };
    const s = svc(prisma, { KYC_MODE: "auto", KYC_PROVIDER: "stub" }, new StubKycVendor());
    // An ID-less rider would reach vendor KYC entirely undeduped — the stock client always writes the
    // ID via completeProfile first, so only a raw API caller ever sees this.
    await expect(s.becomeRider("p1", { bikeReg: "ABZ 1", photoUrl: "kyc/p1/photo.jpg" })).rejects.toThrow(
      /add your national id/i,
    );
    expect(created).toBe(false);
  });

  it("manual mode skips the vendor and returns no url", async () => {
    const vendor: KycVendor = {
      submit: async () => { throw new Error("vendor must not be called in manual mode"); },
    };
    const prisma = {
      rider: { findUnique: async () => null, create: async () => ({}) },
      profile: { update: async () => ({}), findUnique: async () => ({ idNumberHash: pii.hashId("63-1-A") }), count: async () => 0 },
      $transaction: async () => [],
    };
    const s = svc(prisma, { KYC_MODE: "manual" }, vendor);
    const res = await s.becomeRider("p1", { bikeReg: "ABZ 1", photoUrl: "kyc/p1/photo.jpg" });
    expect(res).toEqual({ kycStatus: "pending", mode: "manual", verificationUrl: undefined });
  });

  it("maps a concurrent-create P2002 to a 409, not a raw 500 (DS13-06)", async () => {
    // The findUnique pre-check races a parallel become; the rider PK is the real guard. Its P2002 must
    // surface as the same ConflictException the pre-check raises, not leak as an unhandled 500.
    const p2002 = new Prisma.PrismaClientKnownRequestError("Unique constraint failed", {
      code: "P2002",
      clientVersion: "test",
    });
    const prisma = {
      rider: { findUnique: async () => null, create: async () => ({}) },
      profile: { update: async () => ({}), findUnique: async () => ({ idNumberHash: pii.hashId("63-1-A") }), count: async () => 0 },
      // The create transaction loses the race and throws a P2002.
      $transaction: async () => { throw p2002; },
    };
    const s = svc(prisma, { KYC_MODE: "auto", KYC_PROVIDER: "stub" }, new StubKycVendor());
    await expect(s.becomeRider("p1", { bikeReg: "ABZ 1", photoUrl: "kyc/p1/photo.jpg" })).rejects.toThrow(
      /already a rider/i,
    );
  });

  it("surfaces a vendor outage as a 503 and creates no rider row", async () => {
    let created = false;
    const vendor: KycVendor = { submit: async () => { throw new Error("didit 502"); } };
    const prisma = {
      rider: { findUnique: async () => null, create: async () => { created = true; return {}; } },
      profile: { update: async () => ({}), findUnique: async () => ({ idNumberHash: pii.hashId("63-1-A") }), count: async () => 0 },
      $transaction: async (ops: unknown[]) => ops,
    };
    const s = svc(prisma, { KYC_MODE: "auto" }, vendor);
    await expect(s.becomeRider("p1", { bikeReg: "ABZ 1", photoUrl: "kyc/p1/photo.jpg" })).rejects.toThrow(
      /couldn't start id verification/i,
    );
    expect(created).toBe(false);
  });
});

describe("RiderService.completeProfile (A-04 duplicate-ID signal)", () => {
  const data = { firstName: "Chipo", lastName: "M", idNumber: "63-123456-A-42" };

  // One-ID-one-account (2026-07-26): claiming an ID that's already on another LIVE account is refused
  // outright — this is the write-path gate that keeps a second-SIM signup from ever holding a banned
  // account's national ID (the banned original can't self-erase, so it stays live and keeps blocking).
  it("409s (id_in_use) when the ID is already on another LIVE account — nothing written", async () => {
    let wrote = false;
    const prisma = {
      profile: {
        findUnique: async () => ({ idNumberHash: null, rider: null }),
        updateMany: async () => {
          wrote = true;
          return { count: 1 };
        },
        count: async (args: { where: Record<string, unknown> }) => {
          // The block count is the live one: excludes self and erased tombstones.
          expect(args.where).toMatchObject({
            idNumberHash: pii.hashId("63-123456-A-42"),
            id: { not: "p1" },
            NOT: { phone: { startsWith: "erased:" } },
          });
          return 1;
        },
      },
      rider: { updateMany: async () => ({ count: 0 }) },
    };
    const s = svc(prisma, { KYC_MODE: "auto" });
    try {
      await s.completeProfile("p1", data);
      throw new Error("expected completeProfile to throw");
    } catch (e) {
      expect((e as { getResponse: () => unknown }).getResponse()).toMatchObject({ reason: "id_in_use" });
    }
    expect(wrote).toBe(false);
  });

  it("allows an ID whose only collision is an ERASED tombstone (returning user) and persists the A-04 flag", async () => {
    let updated: Record<string, unknown> | undefined;
    let flag: { where: unknown; data: Record<string, unknown> } | undefined;
    const prisma = {
      profile: {
        // Fix 2: completeProfile reads the existing profile to enforce the post-verification ID
        // freeze. A fresh signup (no rider row / not verified) passes the guard untouched.
        findUnique: async () => ({ idNumberHash: null, rider: null }),
        // Fix 2: the ID-writing update is a CAS updateMany that re-asserts the freeze atomically.
        updateMany: async (args: { data: Record<string, unknown> }) => {
          updated = args.data;
          return { count: 1 };
        },
        // Live (block) count has the erased-exclusion NOT clause → 0; the reviewer-flag count sees the
        // tombstone (DS15-02b keeps its hash for exactly this signal) → 1.
        count: async (args: { where: Record<string, unknown> }) => ("NOT" in args.where ? 0 : 1),
      },
      rider: {
        updateMany: async (args: { where: unknown; data: Record<string, unknown> }) => {
          flag = args;
          return { count: 1 };
        },
      },
    };
    const s = svc(prisma, { KYC_MODE: "auto" });
    expect(await s.completeProfile("p1", data)).toEqual({ ok: true });
    // The raw ID is never written: id_number is ciphertext, plus the dedup hash.
    expect(updated).toMatchObject({ firstName: "Chipo", lastName: "M", idNumberHash: pii.hashId("63-123456-A-42") });
    expect(pii.isEncrypted(updated?.idNumber as string)).toBe(true);
    expect(pii.decryptId(updated?.idNumber as string)).toBe("63-123456-A-42");
    // DS-11 parity: the reviewer flag is recomputed and persisted on the rider row in the same tx.
    expect(flag).toEqual({ where: { profileId: "p1" }, data: { duplicateIdFlag: true } });
  });

  it("unique ID → writes and clears the A-04 flag", async () => {
    let flag: Record<string, unknown> | undefined;
    const prisma = {
      profile: {
        findUnique: async () => ({ idNumberHash: null, rider: null }),
        updateMany: async () => ({ count: 1 }),
        count: async () => 0,
      },
      rider: {
        updateMany: async (args: { data: Record<string, unknown> }) => {
          flag = args.data;
          return { count: 1 };
        },
      },
    };
    const s = svc(prisma, { KYC_MODE: "auto" });
    expect(await s.completeProfile("p1", data)).toEqual({ ok: true });
    expect(flag).toEqual({ duplicateIdFlag: false });
  });

  // Fix 2: the KYC-freeze bypass. PATCH /auth/me already blocks a verified rider from swapping their
  // national ID; this sibling route (PATCH /riders/profile → completeProfile) previously had NO guard,
  // so a banned rider could launder in a different ID through it. Both routes must enforce it identically.
  it("blocks a verified rider from changing their frozen national ID (anti-ban-evasion)", async () => {
    let wrote = false;
    const prisma = {
      profile: {
        // Verified rider whose stored ID hash differs from the incoming one → a genuine CHANGE.
        findUnique: async () => ({ idNumberHash: "some-other-stored-hash", rider: { kycStatus: "verified" } }),
        update: async () => {
          wrote = true;
          return {};
        },
        count: async () => 0,
      },
    };
    const s = svc(prisma, { KYC_MODE: "auto" });
    await expect(s.completeProfile("p1", data)).rejects.toThrow(/locked after verification/i);
    // The frozen ID must never be overwritten.
    expect(wrote).toBe(false);
  });

  it("allows a verified rider to re-submit the SAME ID (idempotent, not a change)", async () => {
    let wrote = false;
    let liveCounted = false;
    const prisma = {
      profile: {
        // Same hash as the incoming ID → not a change → allowed through the freeze guard.
        findUnique: async () => ({ idNumberHash: pii.hashId("63-123456-A-42"), rider: { kycStatus: "verified" } }),
        updateMany: async () => {
          wrote = true;
          return { count: 1 };
        },
        // Resending your own stored ID makes no new claim → the one-ID-one-account live-block is
        // skipped entirely (a legacy pre-policy duplicate must not start 409ing its own resends);
        // only the A-04 flag recompute (no NOT clause) runs.
        count: async (args: { where: Record<string, unknown> }) => {
          if ("NOT" in args.where) liveCounted = true;
          return 0;
        },
      },
      rider: { updateMany: async () => ({ count: 1 }) },
    };
    const s = svc(prisma, { KYC_MODE: "auto" });
    expect(await s.completeProfile("p1", data)).toEqual({ ok: true });
    expect(wrote).toBe(true);
    expect(liveCounted).toBe(false);
  });

  // Fix 2: the check-then-write race. The pre-check reads a non-verified status, but the KYC webhook
  // commits `verified` before the write lands — the CAS updateMany then matches 0 rows and re-asserts the
  // freeze, so a stale iteration can't slip a new ID past the freeze.
  it("re-asserts the freeze at write time: 0 rows matched (webhook verified mid-write) → still blocked", async () => {
    const prisma = {
      profile: {
        // Pre-check sees a NOT-yet-verified rider → passes the fast-path guard...
        findUnique: async () => ({ idNumberHash: "old-hash", rider: { kycStatus: "pending" } }),
        // ...but by write time the webhook has flipped it to verified, so the guarded updateMany matches
        // nothing (the NOT(verified AND changing) predicate now excludes the row).
        updateMany: async () => ({ count: 0 }),
        count: async () => 0,
      },
    };
    const s = svc(prisma, { KYC_MODE: "auto" });
    await expect(s.completeProfile("p1", data)).rejects.toThrow(/locked after verification/i);
  });
});

describe("RiderService.retryKyc", () => {
  it("404s when the caller is not a rider", async () => {
    const s = svc({ rider: { findUnique: async () => null } }, { KYC_MODE: "auto" });
    await expect(s.retryKyc("p1")).rejects.toThrow(/not a rider/i);
  });

  it("409s when already verified", async () => {
    const s = svc({ rider: { findUnique: async () => ({ kycStatus: "verified" }) } }, { KYC_MODE: "auto" });
    await expect(s.retryKyc("p1")).rejects.toThrow(/already verified/i);
  });

  it("mints a fresh session and resets a failed rider to pending", async () => {
    let data: Record<string, unknown> | undefined;
    const vendor: KycVendor = {
      submit: async () => ({ ref: "sess_new", status: "pending", url: "https://verify.didit.me/sess_new" }),
    };
    let where: Record<string, unknown> | undefined;
    const prisma = {
      rider: {
        findUnique: async () => ({ kycStatus: "failed", kycAttempts: 1 }),
        // Fix 1: the reset is now a CAS updateMany guarded on the observed (kycStatus, kycAttempts).
        updateMany: async (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
          where = args.where;
          data = args.data;
          return { count: 1 };
        },
      },
    };
    const s = svc(prisma, { KYC_MODE: "auto", KYC_PROVIDER: "didit" }, vendor);
    expect(await s.retryKyc("p1")).toEqual({ kycStatus: "pending", mode: "auto", verificationUrl: "https://verify.didit.me/sess_new" });
    // New ref, reset to pending, and kycResolvedAt cleared so the fresh webhook resolves it.
    expect(data).toMatchObject({ kycStatus: "pending", idVerified: false, kycRef: "sess_new", kycResolvedAt: null });
    // Guarded on exactly what was read so a concurrent webhook/admin decision can't be clobbered.
    expect(where).toMatchObject({ profileId: "p1", kycStatus: "failed", kycAttempts: 1 });
  });

  // ── P0-2 / D7: resume a live session instead of minting a paid one ──────────────────────────────
  //
  // The bug this closes: retryKyc called vendor.submit() unconditionally, so every "Finish verifying"
  // tap bought a new Didit session. The rider-facing resume button is worthless if it costs a credit
  // each time, and the 5/hour route throttle capped that bleed without stopping it.

  // Caught in review of this change, and worth stating plainly: the first cut returned ONLY the token
  // on the resume path. The shipped app's resolveKycRetryFeedback reads ONLY `verificationUrl`, so a
  // resume would have rendered "Couldn't start verification — try again in a moment." on a request
  // that actually succeeded. That is the BH-03 false-error class this codebase already fixed once, and
  // it would have shipped invisibly because the API was green and the client is a separate PR.
  it("resume returns BOTH credentials — the shipped browser client reads verificationUrl, the SDK reads the token", async () => {
    const prisma = {
      rider: {
        findUnique: async () => ({
          kycStatus: "pending",
          kycAttempts: 0,
          kycRef: "sess_live",
          kycSessionToken: "tok_live",
          kycSessionUrl: "https://verify.didit.me/sess_live",
        }),
        updateMany: async () => ({ count: 1 }),
      },
    };
    const s = svc(prisma, { KYC_MODE: "auto", KYC_PROVIDER: "didit" }, { submit: async () => { throw new Error("must not mint"); } });
    const res = await s.retryKyc("p1");
    // The exact field today's app consumes, and https so its own guard passes.
    expect(res.verificationUrl).toBe("https://verify.didit.me/sess_live");
    expect(res.verificationUrl?.startsWith("https://")).toBe(true);
    expect(res.sessionToken).toBe("tok_live");
  });

  it("mints when a pending rider has a token but NO url — never returns a response the app can't act on", async () => {
    let submitCalls = 0;
    const vendor: KycVendor = {
      submit: async () => {
        submitCalls += 1;
        return { ref: "sess_new", status: "pending", url: "https://verify.didit.me/sess_new", token: "tok_new" };
      },
    };
    const prisma = {
      rider: {
        findUnique: async () => ({ kycStatus: "pending", kycAttempts: 0, kycRef: "sess_half", kycSessionToken: "tok_half", kycSessionUrl: null }),
        updateMany: async () => ({ count: 1 }),
      },
    };
    const s = svc(prisma, { KYC_MODE: "auto", KYC_PROVIDER: "didit" }, vendor);
    expect(await s.retryKyc("p1")).toMatchObject({ verificationUrl: "https://verify.didit.me/sess_new", sessionToken: "tok_new" });
    // Costs a credit, and that is the right trade: a half-populated row must not produce a reply the
    // shipped client renders as a false error.
    expect(submitCalls).toBe(1);
  });

  it("resumes a pending rider's live session — hands back the stored token, mints NOTHING", async () => {
    let submitCalls = 0;
    const vendor: KycVendor = {
      submit: async () => {
        submitCalls += 1;
        return { ref: "sess_new", status: "pending", url: "https://verify.didit.me/sess_new" };
      },
    };
    let wrote = false;
    const prisma = {
      rider: {
        findUnique: async () => ({ kycStatus: "pending", kycAttempts: 0, kycRef: "sess_live", kycSessionToken: "tok_live", kycSessionUrl: "https://verify.didit.me/sess_live" }),
        updateMany: async () => {
          wrote = true;
          return { count: 1 };
        },
      },
    };
    const s = svc(prisma, { KYC_MODE: "auto", KYC_PROVIDER: "didit" }, vendor);
    expect(await s.retryKyc("p1")).toEqual({
      kycStatus: "pending",
      mode: "auto",
      verificationUrl: "https://verify.didit.me/sess_live",
      sessionToken: "tok_live",
    });
    // The whole point: zero paid sessions, and the kycRef is untouched so the webhook still resolves
    // this rider when the check the rider is resuming eventually finishes.
    expect(submitCalls).toBe(0);
    expect(wrote).toBe(false);
  });

  it("mints when a pending rider has a ref but NO token (older session, pre-token or vendor omitted it)", async () => {
    let submitCalls = 0;
    const vendor: KycVendor = {
      submit: async () => {
        submitCalls += 1;
        return { ref: "sess_new", status: "pending", url: "https://x/sess_new", token: "tok_new" };
      },
    };
    let data: Record<string, unknown> | undefined;
    const prisma = {
      rider: {
        findUnique: async () => ({ kycStatus: "pending", kycAttempts: 0, kycRef: "sess_old", kycSessionToken: null }),
        updateMany: async (args: { data: Record<string, unknown> }) => {
          data = args.data;
          return { count: 1 };
        },
      },
    };
    const s = svc(prisma, { KYC_MODE: "auto", KYC_PROVIDER: "didit" }, vendor);
    expect(await s.retryKyc("p1")).toMatchObject({ sessionToken: "tok_new" });
    expect(submitCalls).toBe(1);
    expect(data).toMatchObject({ kycRef: "sess_new", kycSessionToken: "tok_new" });
  });

  it("does NOT resume a failed rider — a decided session cannot be reopened, so it mints", async () => {
    let submitCalls = 0;
    const vendor: KycVendor = {
      submit: async () => {
        submitCalls += 1;
        return { ref: "sess_new", status: "pending", token: "tok_new" };
      },
    };
    const prisma = {
      rider: {
        // A stale token still attached to a declined rider must never be handed back: Didit will not
        // reopen a Declined session, so resuming would give the SDK a credential it can only reject.
        findUnique: async () => ({ kycStatus: "failed", kycAttempts: 1, kycRef: "sess_dead", kycSessionToken: "tok_dead" }),
        updateMany: async () => ({ count: 1 }),
      },
    };
    const s = svc(prisma, { KYC_MODE: "auto", KYC_PROVIDER: "didit" }, vendor);
    expect(await s.retryKyc("p1")).toMatchObject({ sessionToken: "tok_new" });
    expect(submitCalls).toBe(1);
  });

  it("CLEARS a stale token when the new session carries none", async () => {
    const vendor: KycVendor = { submit: async () => ({ ref: "sess_new", status: "pending" }) };
    let data: Record<string, unknown> | undefined;
    const prisma = {
      rider: {
        findUnique: async () => ({ kycStatus: "failed", kycAttempts: 1, kycRef: "sess_dead", kycSessionToken: "tok_dead" }),
        updateMany: async (args: { data: Record<string, unknown> }) => {
          data = args.data;
          return { count: 1 };
        },
      },
    };
    const s = svc(prisma, { KYC_MODE: "auto", KYC_PROVIDER: "didit" }, vendor);
    await s.retryKyc("p1");
    // Explicit null, not an omitted key: leaving tok_dead attached would bind a dead credential to a
    // kycRef it no longer belongs to, and the next resume would hand it out.
    expect(data).toHaveProperty("kycSessionToken", null);
  });

  // ── D4: a retry is NOT an attempt ───────────────────────────────────────────────────────────────
  //
  // kycAttempts counts DECLINES — evidence about the rider's identity — and two of them lock the
  // application (A-02). An SDK that never opened (camera blocked, no network) is evidence about the
  // PHONE, so counting it would let a broken device burn both attempts and land a rider in support
  // having never been assessed. Nothing in retryKyc may touch the counter; this pins that, because
  // "a retry is an attempt" is an entirely reasonable-looking change for someone to make later.

  it("never increments kycAttempts — not on a mint, not on a resume (D4)", async () => {
    const seen: Record<string, unknown>[] = [];
    const vendor: KycVendor = { submit: async () => ({ ref: "sess_new", status: "pending", token: "tok_new" }) };

    const mintPrisma = {
      rider: {
        findUnique: async () => ({ kycStatus: "failed", kycAttempts: 1, kycRef: "sess_old", kycSessionToken: null }),
        updateMany: async (args: { data: Record<string, unknown> }) => {
          seen.push(args.data);
          return { count: 1 };
        },
      },
    };
    await svc(mintPrisma, { KYC_MODE: "auto", KYC_PROVIDER: "didit" }, vendor).retryKyc("p1");

    const resumePrisma = {
      rider: {
        findUnique: async () => ({ kycStatus: "pending", kycAttempts: 1, kycRef: "sess_live", kycSessionToken: "tok_live", kycSessionUrl: "https://verify.didit.me/sess_live" }),
        updateMany: async (args: { data: Record<string, unknown> }) => {
          seen.push(args.data);
          return { count: 1 };
        },
      },
    };
    await svc(resumePrisma, { KYC_MODE: "auto", KYC_PROVIDER: "didit" }, vendor).retryKyc("p1");

    expect(seen.length).toBeGreaterThan(0);
    for (const data of seen) expect(data).not.toHaveProperty("kycAttempts");
  });

  it("409s when the observed KYC state changed under it (CAS claims zero rows)", async () => {
    const vendor: KycVendor = {
      submit: async () => ({ ref: "sess_x", status: "pending", url: "https://verify.didit.me/sess_x" }),
    };
    const prisma = {
      rider: {
        findUnique: async () => ({ kycStatus: "failed", kycAttempts: 1 }),
        // A concurrent webhook/admin decision moved the row between the read and this write → 0 rows.
        updateMany: async () => ({ count: 0 }),
      },
    };
    const s = svc(prisma, { KYC_MODE: "auto", KYC_PROVIDER: "didit" }, vendor);
    await expect(s.retryKyc("p1")).rejects.toThrow(/just changed|refresh and try again/i);
  });

  it("returns 503 when the vendor is down on retry", async () => {
    const vendor: KycVendor = {
      submit: async () => {
        throw new Error("didit down");
      },
    };
    const s = svc(
      { rider: { findUnique: async () => ({ kycStatus: "failed" }) } },
      { KYC_MODE: "auto", KYC_PROVIDER: "didit" },
      vendor,
    );
    await expect(s.retryKyc("p1")).rejects.toThrow(/couldn't restart id verification/i);
  });

  it("A-02 lock: refuses a THIRD attempt once kycAttempts >= 2 (locked → support)", async () => {
    const vendor: KycVendor = {
      submit: async () => {
        throw new Error("vendor must not be called once locked");
      },
    };
    const s = svc(
      { rider: { findUnique: async () => ({ kycStatus: "failed", kycAttempts: 2 }) } },
      { KYC_MODE: "auto", KYC_PROVIDER: "didit" },
      vendor,
    );
    await expect(s.retryKyc("p1")).rejects.toThrow(/locked|contact support/i);
  });

  it("still allows the single resubmit after the first decline (kycAttempts = 1)", async () => {
    const vendor: KycVendor = {
      submit: async () => ({ ref: "sess_2", status: "pending", url: "https://verify.didit.me/sess_2" }),
    };
    const prisma = {
      rider: {
        findUnique: async () => ({ kycStatus: "failed", kycAttempts: 1 }),
        updateMany: async () => ({ count: 1 }),
      },
    };
    const s = svc(prisma, { KYC_MODE: "auto", KYC_PROVIDER: "didit" }, vendor);
    expect(await s.retryKyc("p1")).toEqual({ kycStatus: "pending", mode: "auto", verificationUrl: "https://verify.didit.me/sess_2" });
  });

  it("leaves a manual-mode rider pending without calling the vendor, and tells the client it's manual mode", async () => {
    const vendor: KycVendor = {
      submit: async () => {
        throw new Error("vendor must not be called in manual mode");
      },
    };
    const s = svc({ rider: { findUnique: async () => ({ kycStatus: "failed" }) } }, { KYC_MODE: "manual" }, vendor);
    // BH-03: `mode` must be present even on this early return — the mobile client uses it to tell
    // "no verificationUrl because manual review is expected" apart from "no verificationUrl because
    // something went wrong" (resolveKycRetryFeedback). Without it a manual-mode rider saw a false error
    // on every retry tap.
    expect(await s.retryKyc("p1")).toEqual({ kycStatus: "pending", mode: "manual" });
  });
});

describe("RiderService.setOnline", () => {
  it("403s when the caller is not a rider", async () => {
    const s = svc({ rider: { findUnique: async () => null } }, {});
    await expect(s.setOnline("p1", true)).rejects.toThrow(/not a rider/i);
  });

  it("403s when an unverified rider tries to go online", async () => {
    const s = svc({ rider: { findUnique: async () => ({ kycStatus: "pending" }) } }, {});
    await expect(s.setOnline("p1", true)).rejects.toThrow(/not verified/i);
  });

  it("lets a verified rider go online, stamping the heartbeat with DB now() under the standing CAS", async () => {
    let sql = "";
    const prisma = {
      rider: {
        findUnique: async () => ({ kycStatus: "verified", accountStatus: "active", onHold: false }),
      },
      // KB-HEARTBEAT-MARGIN: the go-online write is now a raw CAS so the heartbeat is DB now() (one
      // clock domain with recordFix/touchRiderHeartbeat), still guarded on standing (active + not on_hold).
      $executeRaw: async (strings: TemplateStringsArray) => {
        sql = strings.join("?");
        return 1; // affected-row count: the standing guard matched
      },
    };
    const s = svc(prisma, {});
    expect(await s.setOnline("p1", true)).toEqual({ online: true });
    expect(sql).toContain("is_online = true");
    expect(sql).toContain("last_heartbeat_at = now()");
    // The CAS re-asserts the standing the gate read — the exact defence against a suspend landing mid-write.
    expect(sql).toContain("account_status = 'active'");
    expect(sql).toContain("on_hold = false");
  });

  it("refuses to flip online when an admin suspend lands between the gate and the write (CAS = 0 rows)", async () => {
    let threw: unknown;
    // The gate read still sees the rider eligible (advisory), but the guarded write matches 0 rows
    // because a concurrent suspend already moved accountStatus off `active`; a re-read surfaces it.
    let firstRead = true;
    const prisma = {
      rider: {
        findUnique: async () => {
          if (firstRead) { firstRead = false; return { kycStatus: "verified", accountStatus: "active", onHold: false, cooldownUntil: null }; }
          return { kycStatus: "verified", accountStatus: "suspended", onHold: false, cooldownUntil: null };
        },
      },
      // The guarded raw CAS matches 0 rows because a concurrent suspend already moved accountStatus.
      $executeRaw: async () => 0,
    };
    const s = svc(prisma, {});
    try {
      await s.setOnline("p1", true);
    } catch (e) {
      threw = e;
    }
    // Not silently online — the refusal re-derives the precise standing reason (suspended).
    expect((threw as { getResponse: () => { reason: string } }).getResponse().reason).toBe("suspended");
  });

  it("drains the notify-me waiting list and pushes those customers when going online with a location (2·b1)", async () => {
    const prisma = {
      rider: {
        findUnique: async () => ({ kycStatus: "verified", accountStatus: "active", onHold: false }),
      },
      // KB-HEARTBEAT-MARGIN: go-online is a raw CAS now (DB-now() heartbeat); 1 affected row ⇒ online.
      $executeRaw: async () => 1,
    };
    let drainedAt: { lat: number; lng: number; radius: number } | null = null;
    let pushed: string[] | null = null;
    let cleared: string[] | null = null;
    const tracking = {
      evictFromGeo: async () => {},
      claimNotifyWaitersNear: async (lat: number, lng: number, radius: number) => {
        drainedAt = { lat, lng, radius };
        return [{ profileId: "cust-1" }, { profileId: "cust-2" }];
      },
      clearNotifyWaiters: async (ids: string[]) => { cleared = ids; },
    } as unknown as import("../tracking/tracking.service").TrackingService;
    const notifications = {
      // Both waiters delivered → both should be cleared from the list. Receives {profileId, orderId?} pairs.
      notifyRidersAvailable: async (waiters: Array<{ profileId: string }>) => {
        pushed = waiters.map((w) => w.profileId);
        return new Set(pushed);
      },
    } as unknown as import("../notifications/notifications.service").NotificationsService;
    const s = new RiderService(prisma as unknown as PrismaService, {} as Env, new StubKycVendor(), pii, tracking, gatewayStub, notifications);

    // Inside the Harare corridor so the online gate passes.
    expect(await s.setOnline("p1", true, { lat: -17.83, lng: 31.05 })).toEqual({ online: true });
    // The drain is fire-and-forget — let the microtask settle, then assert it pinged the waiters.
    await new Promise((r) => setTimeout(r, 0));
    expect(drainedAt).toEqual({ lat: -17.83, lng: 31.05, radius: 5000 });
    expect(pushed).toEqual(["cust-1", "cust-2"]);
    // F-18: delivered waiters are cleared from the list; a miss would be left queued.
    expect(cleared).toEqual(["cust-1", "cust-2"]);
  });

  it("leaves an UNDELIVERED notify-me waiter queued (not cleared) so the next rider re-pings — F-18 at-least-once", async () => {
    const prisma = {
      rider: {
        findUnique: async () => ({ kycStatus: "verified", accountStatus: "active", onHold: false }),
      },
      // KB-HEARTBEAT-MARGIN: go-online is a raw CAS now (DB-now() heartbeat); 1 affected row ⇒ online.
      $executeRaw: async () => 1,
    };
    let cleared: string[] | null = null;
    const tracking = {
      evictFromGeo: async () => {},
      claimNotifyWaitersNear: async () => [{ profileId: "cust-1" }, { profileId: "cust-2" }],
      clearNotifyWaiters: async (ids: string[]) => { cleared = ids; },
    } as unknown as import("../tracking/tracking.service").TrackingService;
    const notifications = {
      // cust-1 delivered, cust-2 not (no token / transient FCM failure).
      notifyRidersAvailable: async () => new Set(["cust-1"]),
    } as unknown as import("../notifications/notifications.service").NotificationsService;
    const s = new RiderService(prisma as unknown as PrismaService, {} as Env, new StubKycVendor(), pii, tracking, gatewayStub, notifications);

    await s.setOnline("p1", true, { lat: -17.83, lng: 31.05 });
    await new Promise((r) => setTimeout(r, 0));
    // Only the delivered waiter is cleared; cust-2 stays on the list for the next nearby rider.
    expect(cleared).toEqual(["cust-1"]);
  });

  it("does NOT drain the notify list when going online without a location (older client)", async () => {
    const prisma = {
      rider: {
        findUnique: async () => ({ kycStatus: "verified", accountStatus: "active", onHold: false }),
      },
      // KB-HEARTBEAT-MARGIN: go-online is a raw CAS now (DB-now() heartbeat); 1 affected row ⇒ online.
      $executeRaw: async () => 1,
    };
    let drained = false;
    const tracking = {
      evictFromGeo: async () => {},
      claimNotifyWaitersNear: async () => { drained = true; return []; },
      clearNotifyWaiters: async () => {},
    } as unknown as import("../tracking/tracking.service").TrackingService;
    const notifications = { notifyRidersAvailable: async () => new Set<string>() } as unknown as import("../notifications/notifications.service").NotificationsService;
    const s = new RiderService(prisma as unknown as PrismaService, {} as Env, new StubKycVendor(), pii, tracking, gatewayStub, notifications);
    await s.setOnline("p1", true);
    await new Promise((r) => setTimeout(r, 0));
    expect(drained).toBe(false);
  });

  it("lets any rider go offline regardless of verification", async () => {
    const prisma = {
      rider: { findUnique: async () => ({ kycStatus: "pending" }), update: async () => ({}) },
    };
    const s = svc(prisma, {});
    expect(await s.setOnline("p1", false)).toEqual({ online: false });
  });

  it("blocks going online while on a no-show cooldown", async () => {
    const future = new Date(Date.now() + 60_000);
    const s = svc(
      { rider: { findUnique: async () => ({ kycStatus: "verified", accountStatus: "active", onHold: false, cooldownUntil: future }) } },
      {},
    );
    await expect(s.setOnline("p1", true)).rejects.toThrow(/cooldown/i);
  });

  it("allows going online once the cooldown has passed", async () => {
    const past = new Date(Date.now() - 60_000);
    const s = svc(
      {
        rider: {
          findUnique: async () => ({ kycStatus: "verified", accountStatus: "active", onHold: false, cooldownUntil: past }),
          updateMany: async () => ({ count: 1 }),
        },
      },
      {},
    );
    expect(await s.setOnline("p1", true)).toEqual({ online: true });
  });

  it("refuses going online outside the service corridor (out_of_area) when a location is sent", async () => {
    const s = svc(
      { rider: { findUnique: async () => ({ kycStatus: "verified", accountStatus: "active", onHold: false, cooldownUntil: null }) } },
      {},
    );
    // Null Island — far outside the Harare corridor.
    await expect(s.setOnline("p1", true, { lat: 0, lng: 0 })).rejects.toThrow(/service area/i);
  });

  it("allows going online with a location inside the corridor", async () => {
    const prisma = {
      rider: {
        findUnique: async () => ({ kycStatus: "verified", accountStatus: "active", onHold: false, cooldownUntil: null }),
        updateMany: async () => ({ count: 1 }),
      },
    };
    const s = svc(prisma, {});
    expect(await s.setOnline("p1", true, { lat: -17.8292, lng: 31.0522 })).toEqual({ online: true });
  });

  it("refuses (reason: suspended) when the admin has suspended the account — read-only here", async () => {
    const s = svc(
      { rider: { findUnique: async () => ({ kycStatus: "verified", accountStatus: "suspended", onHold: false, cooldownUntil: null }) } },
      {},
    );
    await expect(s.setOnline("p1", true)).rejects.toThrow(/suspended/i);
  });

  it("refuses (reason: banned) with a distinct tag when the account is banned", async () => {
    let threw: unknown;
    const s = svc(
      { rider: { findUnique: async () => ({ kycStatus: "verified", accountStatus: "banned", onHold: false, cooldownUntil: null }) } },
      {},
    );
    try {
      await s.setOnline("p1", true);
    } catch (e) {
      threw = e;
    }
    // Banned surfaces its own machine-readable `reason`, not the suspended branch.
    expect((threw as { getResponse: () => { reason: string } }).getResponse().reason).toBe("banned");
  });

  it("refuses (reason: on_hold) when reliability tripped on_hold", async () => {
    let threw: unknown;
    const s = svc(
      { rider: { findUnique: async () => ({ kycStatus: "verified", accountStatus: "active", onHold: true, cooldownUntil: null }) } },
      {},
    );
    try {
      await s.setOnline("p1", true);
    } catch (e) {
      threw = e;
    }
    // The refusal carries a machine-readable `reason` the app keys off (not just the message string).
    expect((threw as { getResponse: () => { reason: string } }).getResponse().reason).toBe("on_hold");
  });
});

describe("RiderService.heartbeat (wave-2 W3 — the lightweight 20s beat)", () => {
  /** Direct construction so a test can wire its own tracking spies (svc() pins the shared stub). */
  const heartbeatSvc = (prisma: Record<string, unknown>, tracking: Record<string, unknown>) => {
    if (!prisma.$executeRaw) prisma.$executeRaw = async () => 1;
    return new RiderService(
      prisma as unknown as PrismaService,
      {} as Env,
      new StubKycVendor(),
      pii,
      tracking as unknown as import("../tracking/tracking.service").TrackingService,
      gatewayStub,
      notificationsStub,
    );
  };
  /** Let the fire-and-forget beat-drain settle so its calls are observable. */
  const flush = () => new Promise<void>((r) => setTimeout(r, 0));

  it("refreshes liveness with ONE guarded UPDATE — no standing pre-read, no commission read, no toggle", async () => {
    let sql = "";
    const findUnique = vi.fn();
    const s = svc(
      {
        rider: { findUnique },
        $executeRaw: async (strings: TemplateStringsArray) => {
          sql = strings.join("?");
          return 1;
        },
      },
      {},
    );
    expect(await s.heartbeat("p1")).toEqual({ online: true });
    // The single statement carries the WHOLE standing predicate the setOnline CAS enforces…
    expect(sql).toContain("last_heartbeat_at = now()");
    expect(sql).toContain("is_online = true");
    expect(sql).toContain("account_status = 'active'");
    expect(sql).toContain("on_hold = false");
    // …and it must never flip the online flag (a beat is not a toggle).
    expect(sql).not.toContain("is_online = true,");
    // The gate re-read runs ONLY on a miss — a healthy beat is exactly one DB statement.
    expect(findUnique).not.toHaveBeenCalled();
  });

  it("REGRESSION (standing enforcement): a rider demoted mid-shift cannot keep beating — the miss re-derives the precise refusal", async () => {
    let threw: unknown;
    const s = svc(
      {
        rider: { findUnique: async () => ({ kycStatus: "verified", accountStatus: "active", onHold: true, cooldownUntil: null }) },
        $executeRaw: async () => 0, // the guarded UPDATE matched nothing: on_hold flipped under us
      },
      {},
    );
    try {
      await s.heartbeat("p1");
    } catch (e) {
      threw = e;
    }
    expect((threw as { getResponse: () => { reason: string } }).getResponse().reason).toBe("on_hold");
  });

  it("403s generically when standing is clean but the rider simply isn't online (toggled off elsewhere)", async () => {
    const s = svc(
      {
        rider: { findUnique: async () => ({ kycStatus: "verified", accountStatus: "active", onHold: false, cooldownUntil: null }) },
        $executeRaw: async () => 0,
      },
      {},
    );
    await expect(s.heartbeat("p1")).rejects.toThrow(/go online/i);
  });

  it("403s 'not a rider' when the profile has no rider row at all", async () => {
    const s = svc({ rider: { findUnique: async () => null }, $executeRaw: async () => 0 }, {});
    await expect(s.heartbeat("p1")).rejects.toThrow(/not a rider/i);
  });

  it("persists the beat's position via recordFix, and skips the waitlist GEOSEARCH when the O(1) probe says empty", async () => {
    const recordFix = vi.fn(async () => {});
    const claimNotifyWaitersNear = vi.fn(async () => []);
    const s = heartbeatSvc(
      { rider: { findUnique: vi.fn() } },
      { recordFix, hasNotifyWaiters: async () => false, claimNotifyWaitersNear, clearNotifyWaiters: async () => {} },
    );
    expect(await s.heartbeat("p1", { lat: -17.83, lng: 31.05 })).toEqual({ online: true });
    await flush();
    expect(recordFix).toHaveBeenCalledWith("p1", -17.83, 31.05);
    expect(claimNotifyWaitersNear).not.toHaveBeenCalled(); // empty waitlist ⇒ no GEOSEARCH this beat
  });

  it("still drains waiters on a beat when the probe says someone is queued (≤20s to a ping, as before)", async () => {
    const claimNotifyWaitersNear = vi.fn(async () => []);
    const s = heartbeatSvc(
      { rider: { findUnique: vi.fn() } },
      { recordFix: async () => {}, hasNotifyWaiters: async () => true, claimNotifyWaitersNear, clearNotifyWaiters: async () => {} },
    );
    await s.heartbeat("p1", { lat: -17.83, lng: 31.05 });
    await flush();
    expect(claimNotifyWaitersNear).toHaveBeenCalledTimes(1);
  });

  it("a recordFix failure never fails the beat (position is best-effort, liveness is the point)", async () => {
    const s = heartbeatSvc(
      { rider: { findUnique: vi.fn() } },
      {
        recordFix: async () => {
          throw new Error("redis down");
        },
        hasNotifyWaiters: async () => false,
        claimNotifyWaitersNear: async () => [],
      },
    );
    expect(await s.heartbeat("p1", { lat: -17.83, lng: 31.05 })).toEqual({ online: true });
  });
});

describe("onlineRefusalReason (pure online-gate, Q2)", () => {
  const base = { kycStatus: "verified", accountStatus: "active", onHold: false, cooldownUntil: null };
  it("returns null when every precondition passes", () => {
    expect(onlineRefusalReason(base)).toBeNull();
  });
  it("prioritises kyc_expired → kyc → banned → suspended → on_hold → cooldown", () => {
    expect(onlineRefusalReason({ ...base, kycStatus: "pending" })).toBe("kyc");
    // A lapsed ID (1·b2) is reported distinctly from a first-time unverified rider.
    expect(onlineRefusalReason({ ...base, kycStatus: "expired" })).toBe("kyc_expired");
    expect(onlineRefusalReason({ ...base, accountStatus: "banned" })).toBe("banned");
    expect(onlineRefusalReason({ ...base, accountStatus: "suspended" })).toBe("suspended");
    expect(onlineRefusalReason({ ...base, onHold: true })).toBe("on_hold");
    expect(onlineRefusalReason({ ...base, cooldownUntil: new Date(Date.now() + 60_000) })).toBe("cooldown");
  });

  it("reports a banned account as its own `banned` reason (not the suspended catch-all)", () => {
    // A banned rider outranks a simultaneous on_hold/cooldown and is never mislabelled `suspended`.
    expect(onlineRefusalReason({ ...base, accountStatus: "banned", onHold: true })).toBe("banned");
  });
  it("kyc outranks a simultaneous suspend + on_hold + cooldown", () => {
    expect(
      onlineRefusalReason({ kycStatus: "failed", accountStatus: "suspended", onHold: true, cooldownUntil: new Date(Date.now() + 60_000) }),
    ).toBe("kyc");
  });
  it("treats an elapsed cooldown as passed", () => {
    expect(onlineRefusalReason({ ...base, cooldownUntil: new Date(Date.now() - 60_000) })).toBeNull();
  });

  it("blocks a below-floor rider ONLY when commission is active (never during the 0% launch)", () => {
    // Commission off (rate 0 → commissionActive false): a $0 balance never gates — the pilot is untouched.
    expect(onlineRefusalReason({ ...base, commissionActive: false, commissionBalance: 0 })).toBeNull();
    // Commission on + balance below the $2 floor → the top-up gate fires.
    expect(onlineRefusalReason({ ...base, commissionActive: true, commissionBalance: 1.5 })).toBe("commission_low_balance");
    // Commission on + balance at/above the floor → passes.
    expect(onlineRefusalReason({ ...base, commissionActive: true, commissionBalance: 2 })).toBeNull();
    // Commission on but this call site didn't load the balance (undefined) → not gated (standing-only).
    expect(onlineRefusalReason({ ...base, commissionActive: true })).toBeNull();
  });

  it("ranks the commission floor BELOW the standing reasons", () => {
    // A suspended rider who is also below the floor is reported as suspended, not commission_low_balance.
    expect(
      onlineRefusalReason({ ...base, accountStatus: "suspended", commissionActive: true, commissionBalance: 0 }),
    ).toBe("suspended");
  });
});

describe("RiderService.applyKycResult", () => {
  it("applies the status, records the event time, and guards monotonically", async () => {
    let where: Record<string, unknown> | undefined;
    let data: Record<string, unknown> | undefined;
    const eventAt = new Date("2026-06-30T10:00:00Z");
    const prisma = {
      rider: {
        updateMany: async (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
          where = args.where;
          data = args.data;
          return { count: 1 };
        },
        findFirst: async () => ({ profileId: "p1" }),
      },
      auditLog: { create: async () => ({}) },
    };
    expect(await svc(prisma, {}).applyKycResult("sess_1", "verified", eventAt)).toEqual({ updated: 1 });
    // Only applies when newer than the last resolution (replay/reorder can't downgrade a newer decision).
    expect(where).toMatchObject({
      kycRef: "sess_1",
      OR: [{ kycResolvedAt: null }, { kycResolvedAt: { lt: eventAt } }],
    });
    expect(data).toMatchObject({ kycStatus: "verified", idVerified: true, kycResolvedAt: eventAt });
  });

  it("reports updated:0 for a stale/duplicate event or unknown ref", async () => {
    // DS17-03: applyKycResult now reads current (duplicateIdFlag + kycAttempts) unconditionally before the
    // guarded updateMany; an unknown ref has no row, so findFirst returns null (count 0 → nothing applies).
    const s = svc({ rider: { updateMany: async () => ({ count: 0 }), findFirst: async () => null } }, {});
    expect(await s.applyKycResult("sess_x", "failed", new Date())).toEqual({ updated: 0 });
  });

  it("an `expired` result clears idVerified + decline reason and resets the A-02 attempt counter (1·b2)", async () => {
    let data: Record<string, unknown> | undefined;
    let evicted: string | null = null;
    const prisma = {
      rider: {
        updateMany: async (args: { data: Record<string, unknown> }) => {
          data = args.data;
          return { count: 1 };
        },
        // Class-B: applyKycResult now fetches the profileId on a lapse (expired) to evict from supply.
        findFirst: async () => ({ profileId: "p1" }),
      },
    };
    const s = svc(prisma, {});
    (s as unknown as { gateway: { evictRiderFromSupply: (id: string) => Promise<void> } }).gateway = {
      evictRiderFromSupply: async (id: string) => { evicted = id; },
    };
    expect(await s.applyKycResult("sess_1", "expired", new Date())).toEqual({ updated: 1 });
    // Not a decline: idVerified false, no decline reason, and kycAttempts reset so re-verify isn't locked.
    // Class-B demotion: also forced offline in the same write so the lapsed rider leaves the supply plane.
    expect(data).toMatchObject({ kycStatus: "expired", idVerified: false, kycDeclineReason: null, kycAttempts: 0, isOnline: false });
    // And evicted from the board + geo index post-commit via the standing-demotion funnel.
    await new Promise((r) => setTimeout(r, 0));
    expect(evicted).toBe("p1");
  });

  it("DS17-03: an `expired` webhook does NOT reset kycAttempts when the rider is already locked (kycAttempts >= 2)", async () => {
    // Race: rider declined twice by an admin (kycAttempts=2 → locked, retryKyc refuses a 3rd attempt). A
    // stale vendor session then times out and fires `expired` AFTER the admin's second decline, whose
    // monotonic guard matches. The automated reset must NOT wipe the admin-established two-decline lock —
    // otherwise the locked applicant gets a free third attempt. Only the manual adminSetKyc expire (a human
    // ops decision) resets the lock; this automated path preserves it.
    let data: Record<string, unknown> | undefined;
    const prisma = {
      rider: {
        updateMany: async (args: { data: Record<string, unknown> }) => {
          data = args.data;
          return { count: 1 };
        },
        // The `current`-state read now returns the locked count; the same mock also answers the post-update
        // profileId fetch for the supply eviction.
        findFirst: async () => ({ profileId: "p1", kycAttempts: 2 }),
      },
    };
    expect(await svc(prisma, {}).applyKycResult("sess_1", "expired", new Date())).toEqual({ updated: 1 });
    // The lock is preserved: no kycAttempts reset in the write. The rest of the expiry write is unchanged.
    expect(data).not.toHaveProperty("kycAttempts");
    expect(data).toMatchObject({ kycStatus: "expired", idVerified: false, isOnline: false });
  });

  it("DS18-04: row-locks the rider (FOR UPDATE) BEFORE the read that feeds the `expired` kycAttempts reset", async () => {
    // The `current` read's kycAttempts is baked into the updateMany's data payload (deciding whether to
    // write `kycAttempts:0`) BEFORE the write runs, and the updateMany WHERE never re-checks kycAttempts.
    // Without a row lock, a concurrent adminSetKyc second-decline committing kycAttempts=2 in the gap
    // between this read and this write would let a later `expired` webhook read the stale pre-lock count
    // (< 2), reset kycAttempts:0, and silently unlock the admin's two-decline lock — reopening DS17-03.
    // Taking `SELECT … FOR UPDATE` before the read (mirroring adminSetKyc) serializes the two transactions.
    // Assert the lock is acquired before the read AND before the write.
    const calls: string[] = [];
    const prisma = {
      $executeRaw: async () => { calls.push("lock"); return 0; },
      rider: {
        updateMany: async (args: { data: Record<string, unknown> }) => {
          calls.push("write");
          data = args.data;
          return { count: 1 };
        },
        // The locked read returns the admin-established lock (kycAttempts=2); the same mock also answers the
        // post-update profileId fetch for the supply eviction.
        findFirst: async () => { calls.push("read"); return { profileId: "p1", kycAttempts: 2 }; },
      },
    };
    let data: Record<string, unknown> | undefined;
    expect(await svc(prisma, {}).applyKycResult("sess_1", "expired", new Date())).toEqual({ updated: 1 });
    // Lock first, then the read, then the write — the ordering that closes the read-then-decide race.
    expect(calls[0]).toBe("lock");
    expect(calls.indexOf("lock")).toBeLessThan(calls.indexOf("read"));
    expect(calls.indexOf("read")).toBeLessThan(calls.indexOf("write"));
    // And because the read (now serialized behind the lock) sees kycAttempts=2, the reset is suppressed:
    // the admin's lock survives the `expired` webhook exactly as DS17-03 intends.
    expect(data).not.toHaveProperty("kycAttempts");
    expect(data).toMatchObject({ kycStatus: "expired", idVerified: false, isOnline: false });
  });

  it("F-13: a vendor DECLINE increments the A-02 counter under the monotonic guard (new decline only)", async () => {
    let where: Record<string, unknown> | undefined;
    let data: Record<string, unknown> | undefined;
    const eventAt = new Date("2026-07-01T10:00:00Z");
    const prisma = {
      rider: {
        updateMany: async (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
          where = args.where;
          data = args.data;
          return { count: 1 };
        },
        findFirst: async () => ({ profileId: "p1" }),
      },
      auditLog: { create: async () => ({}) },
    };
    expect(await svc(prisma, {}).applyKycResult("sess_1", "failed", eventAt, "score_below_threshold")).toEqual({ updated: 1 });
    // The increment rides the SAME where guard that dedupes replays/reorders: a webhook that isn't newer
    // than the last resolution matches 0 rows, so the increment never applies twice for one decline.
    expect(where).toMatchObject({ kycRef: "sess_1", OR: [{ kycResolvedAt: null }, { kycResolvedAt: { lt: eventAt } }] });
    expect(data).toMatchObject({
      kycStatus: "failed",
      idVerified: false,
      kycDeclineReason: "score_below_threshold",
      kycAttempts: { increment: 1 },
    });
  });

  it("F-13: a REPLAYED/stale decline matches 0 rows so the counter is not bumped (updated:0)", async () => {
    // The monotonic where guard (kycResolvedAt null/older than eventAt) filters an exact replay out —
    // count 0 means the row wasn't touched, so the `increment` in data never runs a second time.
    const s = svc({ rider: { updateMany: async () => ({ count: 0 }), findFirst: async () => null } }, {});
    expect(await s.applyKycResult("sess_1", "failed", new Date(), "score_below_threshold")).toEqual({ updated: 0 });
  });

  it("F-13: approve/verify does NOT touch the attempt counter", async () => {
    let data: Record<string, unknown> | undefined;
    const prisma = {
      rider: {
        updateMany: async (args: { data: Record<string, unknown> }) => {
          data = args.data;
          return { count: 1 };
        },
        findFirst: async () => ({ profileId: "p1" }),
      },
      auditLog: { create: async () => ({}) },
    };
    await svc(prisma, {}).applyKycResult("sess_1", "verified", new Date());
    expect(data).not.toHaveProperty("kycAttempts");
  });

  it("KB-FEED-SYNTH: the automated verified/failed path writes an AuditLog row with a system actor (feed synthesis)", async () => {
    let audit: Record<string, unknown> | undefined;
    const prisma = {
      rider: {
        updateMany: async () => ({ count: 1 }),
        findFirst: async () => ({ profileId: "p1" }),
      },
      auditLog: { create: async (args: { data: Record<string, unknown> }) => { audit = args.data; return {}; } },
    };
    await svc(prisma, {}).applyKycResult("sess_1", "verified", new Date(), null);
    // Same action string as the manual adminSetKyc path (so feedForUser picks both up uniformly), but a
    // clearly-automated actor so admin audit views can still distinguish webhook decisions from manual ones.
    expect(audit).toMatchObject({ actor: "system:kyc-webhook", action: "rider.kyc_approve", target: "p1" });

    // A decline writes the mirror action string.
    audit = undefined;
    await svc(prisma, {}).applyKycResult("sess_2", "failed", new Date(), "score_below_threshold");
    expect(audit).toMatchObject({ actor: "system:kyc-webhook", action: "rider.kyc_decline", target: "p1", reasonCode: "score_below_threshold" });
  });

  it("DOC-16-05: a `verified` webhook for a duplicateIdFlag rider does NOT auto-verify — held pending for manual review", async () => {
    let data: Record<string, unknown> | undefined;
    let audit: Record<string, unknown> | undefined;
    const prisma = {
      rider: {
        updateMany: async (args: { data: Record<string, unknown> }) => {
          data = args.data;
          return { count: 1 };
        },
        // Same findFirst mock answers both the pre-flag read and the post-update audit-target read —
        // duplicateIdFlag:true drives holdForReview.
        findFirst: async () => ({ profileId: "p1", duplicateIdFlag: true }),
      },
      auditLog: { create: async (args: { data: Record<string, unknown> }) => { audit = args.data; return {}; } },
    };
    const result = await svc(prisma, {}).applyKycResult("sess_1", "verified", new Date());
    expect(result).toEqual({ updated: 1 });
    // kycStatus/idVerified are NOT flipped — the rider stays pending, still in the review queue.
    expect(data).not.toHaveProperty("kycStatus");
    expect(data).not.toHaveProperty("idVerified");
    expect(data).toHaveProperty("kycResolvedAt");
    // A distinct audit action (not rider.kyc_approve) so this never masquerades as a real decision.
    expect(audit).toMatchObject({ actor: "system:kyc-webhook", action: "rider.kyc_review_required", target: "p1", reasonCode: "duplicate_id_flag" });
  });

  it("DOC-16-05: a `verified` webhook for a NON-flagged rider still auto-verifies as before", async () => {
    let data: Record<string, unknown> | undefined;
    let audit: Record<string, unknown> | undefined;
    const prisma = {
      rider: {
        updateMany: async (args: { data: Record<string, unknown> }) => {
          data = args.data;
          return { count: 1 };
        },
        findFirst: async () => ({ profileId: "p1", duplicateIdFlag: false }),
      },
      auditLog: { create: async (args: { data: Record<string, unknown> }) => { audit = args.data; return {}; } },
    };
    await svc(prisma, {}).applyKycResult("sess_1", "verified", new Date());
    expect(data).toMatchObject({ kycStatus: "verified", idVerified: true });
    expect(audit).toMatchObject({ action: "rider.kyc_approve" });
  });

  it("DOC-16-05: a duplicateIdFlag rider's `failed`/`expired` webhooks are unaffected (flag only gates auto-APPROVE)", async () => {
    let data: Record<string, unknown> | undefined;
    const prisma = {
      rider: {
        updateMany: async (args: { data: Record<string, unknown> }) => {
          data = args.data;
          return { count: 1 };
        },
        findFirst: async () => ({ profileId: "p1", duplicateIdFlag: true }),
      },
      auditLog: { create: async () => ({}) },
    };
    await svc(prisma, {}).applyKycResult("sess_1", "failed", new Date(), "score_below_threshold");
    expect(data).toMatchObject({ kycStatus: "failed", idVerified: false });
  });

  // IR26-04 vendor-document dedupe: applyKycResult keys off the document number the vendor VERIFIED,
  // not just what the applicant typed. Shared harness: an unflagged rider whose typed ID is
  // 63-123456-A-42; `profileHits`/`riderHits` simulate the two collision probes.
  function docPrisma(over: { typedHash?: string | null; profileHits?: number; riderHits?: number } = {}) {
    const rec: { data?: Record<string, unknown>; audit?: Record<string, unknown> } = {};
    const prisma = {
      rider: {
        updateMany: async (args: { data: Record<string, unknown> }) => {
          rec.data = args.data;
          return { count: 1 };
        },
        findFirst: async () => ({
          profileId: "p1",
          duplicateIdFlag: false,
          kycAttempts: 0,
          profile: { idNumberHash: over.typedHash === undefined ? pii.hashId("63-123456-A-42") : over.typedHash },
        }),
        count: async () => over.riderHits ?? 0,
      },
      profile: { count: async () => over.profileHits ?? 0 },
      auditLog: { create: async (args: { data: Record<string, unknown> }) => { rec.audit = args.data; return {}; } },
    };
    return { prisma, rec };
  }

  it("IR26-04: a verified doc number matching the typed ID (across punctuation) auto-verifies and persists the hash", async () => {
    const { prisma, rec } = docPrisma();
    // Vendor returns the same physical number unpunctuated — pii.hashId normalizes, so they collide.
    await svc(prisma, {}).applyKycResult("sess_1", "verified", new Date(), null, "63123456A42");
    expect(rec.data).toMatchObject({ kycStatus: "verified", idVerified: true, verifiedIdHash: pii.hashId("63-123456-A-42") });
  });

  it("IR26-04: a verified doc number that DISAGREES with the typed ID is held for review (typed fake, showed real)", async () => {
    const { prisma, rec } = docPrisma();
    await svc(prisma, {}).applyKycResult("sess_1", "verified", new Date(), null, "63-999999-Z-99");
    // Held: status not flipped, but the vendor hash IS persisted so future applicants collide with it.
    expect(rec.data).not.toHaveProperty("kycStatus");
    expect(rec.data).not.toHaveProperty("idVerified");
    expect(rec.data).toMatchObject({ verifiedIdHash: pii.hashId("63-999999-Z-99") });
    expect(rec.audit).toMatchObject({ action: "rider.kyc_review_required", reasonCode: "verified_id_mismatch" });
  });

  it("IR26-04: a rider with NO typed ID (legacy) cannot be corroborated — held as a mismatch", async () => {
    const { prisma, rec } = docPrisma({ typedHash: null });
    await svc(prisma, {}).applyKycResult("sess_1", "verified", new Date(), null, "63-123456-A-42");
    expect(rec.data).not.toHaveProperty("kycStatus");
    expect(rec.audit).toMatchObject({ reasonCode: "verified_id_mismatch" });
  });

  it("IR26-04: a verified doc number colliding with another PROFILE's typed hash is held (reason verified_id_collision)", async () => {
    const { prisma, rec } = docPrisma({ profileHits: 1 });
    await svc(prisma, {}).applyKycResult("sess_1", "verified", new Date(), null, "63123456A42");
    expect(rec.data).not.toHaveProperty("kycStatus");
    expect(rec.audit).toMatchObject({ action: "rider.kyc_review_required", reasonCode: "verified_id_collision" });
  });

  it("IR26-04: a verified doc number colliding with another RIDER's vendor-verified hash is held too", async () => {
    const { prisma, rec } = docPrisma({ riderHits: 1 });
    await svc(prisma, {}).applyKycResult("sess_1", "verified", new Date(), null, "63123456A42");
    expect(rec.data).not.toHaveProperty("kycStatus");
    expect(rec.audit).toMatchObject({ reasonCode: "verified_id_collision" });
  });

  it("IR26-04: no document number in the payload degrades to the pre-IR26-04 behavior (auto-verify, nothing persisted)", async () => {
    const { prisma, rec } = docPrisma();
    await svc(prisma, {}).applyKycResult("sess_1", "verified", new Date(), null, null);
    expect(rec.data).toMatchObject({ kycStatus: "verified", idVerified: true });
    expect(rec.data).not.toHaveProperty("verifiedIdHash");
  });

  it("IR26-04: a `failed` outcome ignores the document number entirely (no persist, no hold logic)", async () => {
    const { prisma, rec } = docPrisma();
    await svc(prisma, {}).applyKycResult("sess_1", "failed", new Date(), "score_below_threshold", "63-999999-Z-99");
    expect(rec.data).toMatchObject({ kycStatus: "failed" });
    expect(rec.data).not.toHaveProperty("verifiedIdHash");
  });

  it("DS15-06: the status mutation and its audit row are atomic — an audit-write failure rolls the mutation back (no committed-without-audit decision)", async () => {
    const calls: string[] = [];
    let committed = false;
    const prisma: Record<string, unknown> = {
      // Faithful interactive-transaction fake: run the callback and only mark `committed` once it
      // resolves. A throw inside propagates and rejects the whole unit — mirroring Postgres rolling the
      // updateMany back when the audit insert fails. `committed` never flipping ⇒ the mutation is undone.
      $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
        const result = await fn(prisma);
        committed = true;
        return result;
      },
      rider: {
        updateMany: async () => { calls.push("mutation"); return { count: 1 }; },
        findFirst: async () => ({ profileId: "p1" }),
      },
      auditLog: { create: async () => { calls.push("audit"); throw new Error("audit db down"); } },
    };
    // The audit insert fails INSIDE the transaction, so the whole thing rejects — the webhook sees the
    // error and retries, rather than a swallowed "success" with no audit trail (the pre-DS15-06 behavior).
    await expect(svc(prisma, {}).applyKycResult("sess_1", "verified", new Date())).rejects.toThrow(/audit db down/);
    // Critically the transaction never committed: the KYC status write is rolled back along with the
    // failed audit insert (not left in a committed-without-audit state).
    expect(committed).toBe(false);
    // Both writes ran inside the ONE transaction, so they share a rollback boundary.
    expect(calls).toEqual(["mutation", "audit"]);
  });
});

describe("RiderService.adminSetKyc (A-02 decision state machine)", () => {
  it("404s for an unknown rider", async () => {
    const s = svc({ rider: { findUnique: async () => null } }, {});
    await expect(s.adminSetKyc("p1", "verified")).rejects.toThrow(/rider not found/i);
  });

  it("approve → verified + idVerified, and clears any prior decline reason", async () => {
    let data: Record<string, unknown> | undefined;
    const prisma = {
      rider: {
        findUnique: async () => ({ profileId: "p1", kycAttempts: 1 }),
        update: async (args: { data: Record<string, unknown> }) => { data = args.data; return {}; },
      },
    };
    const s = svc(prisma, {});
    const res = await s.adminSetKyc("p1", "verified");
    expect(res).toMatchObject({ profileId: "p1", kycStatus: "verified", locked: false });
    expect(data).toMatchObject({ kycStatus: "verified", idVerified: true, kycDeclineReason: null });
  });

  it("decline → failed, records the reason code, and increments kycAttempts", async () => {
    let data: Record<string, unknown> | undefined;
    const prisma = {
      rider: {
        findUnique: async () => ({ profileId: "p1", kycAttempts: 0 }),
        update: async (args: { data: Record<string, unknown> }) => {
          data = args.data;
          return { kycAttempts: 1 };
        },
      },
    };
    const s = svc(prisma, {});
    const res = await s.adminSetKyc("p1", "failed", "Selfie doesn't match the ID");
    expect(res).toMatchObject({ kycStatus: "failed", kycAttempts: 1, locked: false });
    expect(data).toMatchObject({
      kycStatus: "failed",
      idVerified: false,
      kycDeclineReason: "Selfie doesn't match the ID",
      kycAttempts: { increment: 1 },
    });
    // The human decline stamps kycResolvedAt so a later/replayed vendor webhook (monotonic on eventAt)
    // can't flip the rider back to verified over the admin's decision.
    expect(data!.kycResolvedAt).toBeInstanceOf(Date);
  });

  it("approve stamps kycResolvedAt so a stale vendor webhook can't override the manual decision", async () => {
    let data: Record<string, unknown> | undefined;
    const prisma = {
      rider: {
        findUnique: async () => ({ profileId: "p1", kycAttempts: 0 }),
        update: async (args: { data: Record<string, unknown> }) => { data = args.data; return {}; },
      },
    };
    const s = svc(prisma, {});
    await s.adminSetKyc("p1", "verified");
    expect(data).toMatchObject({ kycStatus: "verified", idVerified: true, kycDeclineReason: null });
    expect(data!.kycResolvedAt).toBeInstanceOf(Date);
  });

  it("expire (1·b2 ops backstop) → expired, clears the reason, stamps the time, and resets kycAttempts", async () => {
    let data: Record<string, unknown> | undefined;
    const prisma = {
      rider: {
        findUnique: async () => ({ profileId: "p1", kycAttempts: 1 }),
        update: async (args: { data: Record<string, unknown> }) => { data = args.data; return {}; },
      },
    };
    const s = svc(prisma, {});
    const res = await s.adminSetKyc("p1", "expired");
    // Attempt counter reset to 0 so the rider can re-verify; not locked.
    expect(res).toMatchObject({ profileId: "p1", kycStatus: "expired", kycAttempts: 0, locked: false });
    expect(data).toMatchObject({ kycStatus: "expired", idVerified: false, kycDeclineReason: null, kycAttempts: 0 });
    expect(data!.kycResolvedAt).toBeInstanceOf(Date);
  });

  it("a `pending` reset leaves kycResolvedAt untouched (it invites a fresh vendor result)", async () => {
    let data: Record<string, unknown> | undefined;
    const prisma = {
      rider: {
        findUnique: async () => ({ profileId: "p1", kycAttempts: 0 }),
        update: async (args: { data: Record<string, unknown> }) => { data = args.data; return {}; },
      },
    };
    const s = svc(prisma, {});
    await s.adminSetKyc("p1", "pending");
    expect(data).toMatchObject({ kycStatus: "pending", idVerified: false });
    expect(data!.kycResolvedAt).toBeUndefined();
  });

  it("F-14: a REPEAT of the same decline (already-failed, resolvedAt set) re-records the reason but does NOT re-increment", async () => {
    let data: Record<string, unknown> | undefined;
    const prisma = {
      rider: {
        // The rider is already sitting in a resolved `failed` state — a retried/duplicate decline action
        // (e.g. a lost HTTP response) must not double-count. No resubmit happened (kycResolvedAt still set).
        findUnique: async () => ({ profileId: "p1", kycAttempts: 1, kycStatus: "failed", kycResolvedAt: new Date("2026-07-01T09:00:00Z") }),
        update: async (args: { data: Record<string, unknown> }) => {
          data = args.data;
          return { kycAttempts: 1 };
        },
      },
    };
    const s = svc(prisma, {});
    const res = await s.adminSetKyc("p1", "failed", "Selfie doesn't match the ID");
    // Counter held at 1 (not over-locked); the reason + resolution are still re-recorded.
    expect(res).toMatchObject({ kycStatus: "failed", kycAttempts: 1, locked: false });
    expect(data).not.toHaveProperty("kycAttempts");
    expect(data).toMatchObject({ kycStatus: "failed", idVerified: false, kycDeclineReason: "Selfie doesn't match the ID" });
    expect(data!.kycResolvedAt).toBeInstanceOf(Date);
  });

  it("F-14: a decline AFTER a resubmit (kycResolvedAt cleared by retryKyc) is a genuine new attempt and DOES increment", async () => {
    let data: Record<string, unknown> | undefined;
    const prisma = {
      rider: {
        // retryKyc left `pending` and cleared kycResolvedAt on the resubmit → this is a fresh decline.
        findUnique: async () => ({ profileId: "p1", kycAttempts: 1, kycStatus: "pending", kycResolvedAt: null }),
        update: async (args: { data: Record<string, unknown> }) => {
          data = args.data;
          return { kycAttempts: 2 };
        },
      },
    };
    const s = svc(prisma, {});
    const res = await s.adminSetKyc("p1", "failed", "Suspected fraud or stolen identity");
    // Second genuine decline reaches the lock.
    expect(res).toMatchObject({ kycStatus: "failed", kycAttempts: 2, locked: true });
    expect(data).toMatchObject({ kycAttempts: { increment: 1 } });
  });

  it("a SECOND decline lands at kycAttempts >= 2 and reports locked", async () => {
    const prisma = {
      rider: {
        findUnique: async () => ({ profileId: "p1", kycAttempts: 1 }),
        update: async () => ({ kycAttempts: 2 }),
      },
    };
    const s = svc(prisma, {});
    const res = await s.adminSetKyc("p1", "failed", "Suspected fraud or stolen identity");
    expect(res).toMatchObject({ kycStatus: "failed", kycAttempts: 2, locked: true });
  });

  it("writes the audit row in the SAME transaction, attributed to the forwarded operator (A-01)", async () => {
    let auditData: Record<string, unknown> | undefined;
    const prisma = {
      rider: {
        findUnique: async () => ({ profileId: "p1", kycAttempts: 0 }),
        update: async () => ({ kycAttempts: 1 }),
      },
      auditLog: { create: async (args: { data: Record<string, unknown> }) => { auditData = args.data; return {}; } },
    };
    const s = svc(prisma, {});
    await s.adminSetKyc("p1", "failed", "face_mismatch", "alice@corp.com", "second review");
    // The decision + its audit row commit together; the actor is the real operator, not the shared token.
    expect(auditData).toMatchObject({
      actor: "alice@corp.com",
      action: "rider.kyc_decline",
      target: "p1",
      reasonCode: "face_mismatch",
      note: "second review",
    });
  });

  it("does NOT write an audit row when no operator is supplied (older callers)", async () => {
    let audited = false;
    const prisma = {
      rider: {
        findUnique: async () => ({ profileId: "p1", kycAttempts: 0 }),
        update: async () => ({}),
      },
      auditLog: { create: async () => { audited = true; return {}; } },
    };
    const s = svc(prisma, {});
    await s.adminSetKyc("p1", "verified");
    expect(audited).toBe(false);
  });

  // Fix 3: the repeat-decline guard reads kycStatus/kycResolvedAt with no row lock, so a concurrent
  // vendor-webhook decline landing between the read and the write could double-count one logical decline
  // and over-lock an honest rider. Taking a `SELECT … FOR UPDATE` on the rider row BEFORE the read makes
  // the webhook's own write serialize against this transaction. Assert the lock precedes the read.
  it("row-locks the rider (FOR UPDATE) before the read that feeds the repeat-decline guard", async () => {
    const calls: string[] = [];
    const prisma = {
      $executeRaw: async () => { calls.push("lock"); return 0; },
      rider: {
        findUnique: async () => { calls.push("read"); return { profileId: "p1", kycAttempts: 0, kycStatus: "pending", kycResolvedAt: null }; },
        update: async () => { calls.push("write"); return { kycAttempts: 1 }; },
      },
    };
    const s = svc(prisma, {});
    await s.adminSetKyc("p1", "failed", "face_mismatch");
    expect(calls).toEqual(["lock", "read", "write"]);
  });
});
