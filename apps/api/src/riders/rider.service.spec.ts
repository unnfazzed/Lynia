import { COMMISSION, freeJobsLeft } from "@lynia/shared";
import { ConflictException, InternalServerErrorException } from "@nestjs/common";
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

  describe("attach-time photo verification (C1 / E8)", () => {
    const livePrisma = () => ({
      rider: { findUnique: async () => null, create: vi.fn(async () => ({})) },
      profile: { update: async () => ({}), findUnique: async () => ({ idNumberHash: pii.hashId("63-1-A") }), count: async () => 0 },
      $transaction: vi.fn(async (ops: unknown[]) => ops),
    });
    const withVerifier = (prisma: Record<string, unknown>, verify: (key: string, kind: string) => Promise<unknown>, vendor: KycVendor) =>
      new RiderService(prisma as unknown as PrismaService, { KYC_MODE: "auto" } as Env, vendor, pii, trackingStub, gatewayStub, notificationsStub, {
        verify: vi.fn(verify),
      } as unknown as import("../adapters/storage/upload-verifier").UploadVerifier);

    it("verifies the KYC photo as kind `kyc` before submitting to the vendor", async () => {
      const order: string[] = [];
      const vendor: KycVendor = { submit: async () => (order.push("submit"), { ref: "s", status: "pending", url: "u" }) };
      const s = withVerifier(livePrisma(), async (key, kind) => order.push(`verify:${key}:${kind}`), vendor);
      await s.becomeRider("p1", { bikeReg: "ABZ 1", photoUrl: "kyc/p1/photo.jpg" });
      expect(order).toEqual(["verify:kyc/p1/photo.jpg:kyc", "submit"]);
    });

    it("a rejected photo (422) blocks onboarding: no paid vendor session, no rider row", async () => {
      const submit = vi.fn();
      const prisma = livePrisma();
      const { UnprocessableEntityException } = await import("@nestjs/common");
      const s = withVerifier(prisma, async () => { throw new UnprocessableEntityException({ reason: "upload_bad_content" }); }, { submit } as unknown as KycVendor);
      await expect(s.becomeRider("p1", { bikeReg: "ABZ 1", photoUrl: "kyc/p1/photo.jpg" })).rejects.toThrow(UnprocessableEntityException);
      expect(submit).not.toHaveBeenCalled();
      expect(prisma.$transaction).not.toHaveBeenCalled();
    });

    it("no photo (optional since 2026-10-02): nothing to verify, the vendor session still opens and the row stores null", async () => {
      const verify = vi.fn(async () => ({}));
      const prisma = livePrisma();
      const submit = vi.fn(async () => ({ ref: "s", status: "pending" as const, url: "u" }));
      const s = withVerifier(prisma, verify, { submit } as unknown as KycVendor);
      await s.becomeRider("p1", {});
      expect(verify).not.toHaveBeenCalled();
      expect(submit).toHaveBeenCalledTimes(1);
      expect(prisma.rider.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ photoUrl: null }) }));
    });

    it("never verifies (and so never deletes) a key outside the caller's namespace", async () => {
      const verify = vi.fn(async () => ({}));
      const s = withVerifier(livePrisma(), verify, new StubKycVendor());
      await expect(s.becomeRider("p1", { bikeReg: "ABZ 1", photoUrl: "kyc/victim/photo.jpg" })).rejects.toThrow(/invalid photo key/i);
      expect(verify).not.toHaveBeenCalled();
    });
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

  // D-75 (owner 2026-10-03): new riders no longer type their national ID before the ID check — the
  // number is confirmed from the check afterwards (applyKycResult adopts the vendor-verified number and
  // dedupes it there). Before D-75 this 400'd "Add your national ID to your profile…".
  it("D-75: registers a rider with NO national ID on the profile — the vendor session opens, nothing to dedupe yet", async () => {
    const create = vi.fn(async () => ({}));
    const count = vi.fn(async () => 0);
    const submit = vi.fn(async () => ({ ref: "sess_1", status: "pending" as const, url: "https://verify.didit.me/sess_1", token: "tok" }));
    const prisma = {
      rider: { findUnique: async () => null, create },
      profile: { update: async () => ({}), findUnique: async () => ({ idNumberHash: null }), count },
      $transaction: async (ops: unknown[]) => ops,
    };
    const s = svc(prisma, { KYC_MODE: "auto", KYC_PROVIDER: "didit" }, { submit } as unknown as KycVendor);
    const res = await s.becomeRider("p1", {});
    expect(res).toEqual({ kycStatus: "pending", mode: "auto", verificationUrl: "https://verify.didit.me/sess_1", sessionToken: "tok" });
    expect(submit).toHaveBeenCalledTimes(1);
    // No ID → no collision query (there is nothing to key it on) and no reviewer flag.
    expect(count).not.toHaveBeenCalled();
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ kycStatus: "pending", duplicateIdFlag: false }) }));
  });

  it("D-75: an account that already carries a typed ID is still refused on a LIVE collision before any paid session", async () => {
    // The same one-ID-one-account guard as before D-75, kept for accounts with an ID on file (added in
    // Account, or a pre-D-75 sign-up) — see the id_in_use test above for the full shape.
    const submit = vi.fn();
    const prisma = {
      rider: { findUnique: async () => null, create: vi.fn() },
      profile: { update: async () => ({}), findUnique: async () => ({ idNumberHash: pii.hashId("63-123456-A-42") }), count: async () => 1 },
      $transaction: async (ops: unknown[]) => ops,
    };
    const s = svc(prisma, { KYC_MODE: "auto" }, { submit } as unknown as KycVendor);
    const err = await s.becomeRider("p1", {}).then(
      () => null,
      (e: unknown) => e,
    );
    expect((err as { getResponse: () => unknown }).getResponse()).toMatchObject({ reason: "id_in_use" });
    expect(submit).not.toHaveBeenCalled();
  });

  it("404s (not a raw FK 500) when the caller's profile is gone", async () => {
    const prisma = {
      rider: { findUnique: async () => null, create: vi.fn() },
      profile: { update: async () => ({}), findUnique: async () => null, count: async () => 0 },
      $transaction: async (ops: unknown[]) => ops,
    };
    await expect(svc(prisma, { KYC_MODE: "manual" }).becomeRider("p1", {})).rejects.toThrow(/profile not found/i);
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

  it("registers a rider with no bike plate (D-55: the plate is added later) — stores null", async () => {
    const create = vi.fn(async () => ({}));
    const prisma = {
      rider: { findUnique: async () => null, create },
      profile: { update: async () => ({}), findUnique: async () => ({ idNumberHash: pii.hashId("63-1-A") }), count: async () => 0 },
      $transaction: async (arg: unknown) => (Array.isArray(arg) ? arg : []),
    };
    const s = svc(prisma, { KYC_MODE: "manual" });
    await s.becomeRider("p1", { photoUrl: "kyc/p1/photo.jpg" });
    const written = JSON.stringify(create.mock.calls);
    expect(written).toContain('"bikeReg":null');
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

  /**
   * `force` — the device's veto on the resume path.
   *
   * The resume guard can prove a session exists; it cannot prove the token still opens. Didit's
   * expiry is silent (no webhook), so the row stays perfectly resumable-looking forever, and a rider
   * whose token expired gets it handed back on every tap. Only the client that watched the SDK reject
   * it knows better, so the client is what says so.
   */
  it("force skips the resume path and mints, even though the stored session still looks live", async () => {
    let submitCalls = 0;
    const vendor: KycVendor = {
      submit: async () => {
        submitCalls += 1;
        return { ref: "sess_new", status: "pending", url: "https://verify.didit.me/sess_new", token: "tok_new" };
      },
    };
    let data: Record<string, unknown> | undefined;
    const prisma = {
      rider: {
        // Exactly the row the test above resumes from — same fixture, opposite outcome.
        findUnique: async () => ({ kycStatus: "pending", kycAttempts: 0, kycRef: "sess_live", kycSessionToken: "tok_live", kycSessionUrl: "https://verify.didit.me/sess_live" }),
        updateMany: async (args: { data: Record<string, unknown> }) => {
          data = args.data;
          return { count: 1 };
        },
      },
    };
    const s = svc(prisma, { KYC_MODE: "auto", KYC_PROVIDER: "didit" }, vendor);
    expect(await s.retryKyc("p1", { force: true })).toMatchObject({ sessionToken: "tok_new" });
    expect(submitCalls).toBe(1);
    // The dead credentials are REPLACED, not merely bypassed — otherwise the next non-forced tap
    // would resume the expired session all over again.
    expect(data).toMatchObject({ kycRef: "sess_new", kycSessionToken: "tok_new" });
  });

  it("defaults to resuming — an older client that sends no force is unchanged", async () => {
    let submitCalls = 0;
    const vendor: KycVendor = {
      submit: async () => {
        submitCalls += 1;
        return { ref: "sess_new", status: "pending", url: "https://x", token: "tok_new" };
      },
    };
    const prisma = {
      rider: {
        findUnique: async () => ({ kycStatus: "pending", kycAttempts: 0, kycRef: "sess_live", kycSessionToken: "tok_live", kycSessionUrl: "https://verify.didit.me/sess_live" }),
        updateMany: async () => ({ count: 1 }),
      },
    };
    const s = svc(prisma, { KYC_MODE: "auto", KYC_PROVIDER: "didit" }, vendor);
    // No opts at all, and force: false — both must take the free path.
    expect(await s.retryKyc("p1")).toMatchObject({ sessionToken: "tok_live" });
    expect(await s.retryKyc("p1", { force: false })).toMatchObject({ sessionToken: "tok_live" });
    expect(submitCalls).toBe(0);
  });

  // force is a resume override, NOT a lock override: it must not become a way to buy a third attempt
  // past the A-02 two-attempt limit.
  it("force still respects the two-attempt lock", async () => {
    let submitCalls = 0;
    const vendor: KycVendor = {
      submit: async () => {
        submitCalls += 1;
        return { ref: "sess_new", status: "pending", url: "https://x", token: "tok_new" };
      },
    };
    const prisma = {
      rider: {
        findUnique: async () => ({ kycStatus: "failed", kycAttempts: 2, kycRef: "sess_old", kycSessionToken: null, kycSessionUrl: null }),
        updateMany: async () => ({ count: 1 }),
      },
    };
    const s = svc(prisma, { KYC_MODE: "auto", KYC_PROVIDER: "didit" }, vendor);
    await expect(s.retryKyc("p1", { force: true })).rejects.toThrow(/locked/i);
    expect(submitCalls).toBe(0);
  });

  // Manual mode has no vendor session to force a replacement for; forcing must not conjure one.
  it("force is inert in manual mode", async () => {
    let submitCalls = 0;
    const vendor: KycVendor = {
      submit: async () => {
        submitCalls += 1;
        return { ref: "sess_new", status: "pending" };
      },
    };
    const prisma = {
      rider: {
        findUnique: async () => ({ kycStatus: "pending", kycAttempts: 0, kycRef: "sess_live", kycSessionToken: "tok_live", kycSessionUrl: "https://x" }),
        updateMany: async () => ({ count: 1 }),
      },
    };
    const s = svc(prisma, { KYC_MODE: "manual", KYC_PROVIDER: "didit" }, vendor);
    expect(await s.retryKyc("p1", { force: true })).toEqual({ kycStatus: "pending", mode: "manual" });
    expect(submitCalls).toBe(0);
  });

  /**
   * The claim that authorises a forced mint. `force` is a CLIENT ASSERTION that bypasses the only
   * thing keeping a pending rider from buying paid sessions, so it is claimed rather than trusted —
   * and claimed BEFORE the vendor is called, because a post-hoc check lets two racing requests both
   * pay and only then discover one of them should not have.
   */
  it("refuses a second force inside the window and falls back to the free resume", async () => {
    let submitCalls = 0;
    const vendor: KycVendor = {
      submit: async () => {
        submitCalls += 1;
        return { ref: "sess_new", status: "pending", url: "https://x", token: "tok_new" };
      },
    };
    const prisma = {
      rider: {
        findUnique: async () => ({ kycStatus: "pending", kycAttempts: 0, kycRef: "sess_live", kycSessionToken: "tok_live", kycSessionUrl: "https://verify.didit.me/sess_live" }),
        // count 0 = the claim was NOT won (already forced inside the window).
        updateMany: async () => ({ count: 0 }),
      },
    };
    const s = svc(prisma, { KYC_MODE: "auto", KYC_PROVIDER: "didit" }, vendor);
    // Degraded, never refused: a 429 here would strand a rider whose session really is dead.
    expect(await s.retryKyc("p1", { force: true })).toMatchObject({ sessionToken: "tok_live" });
    expect(submitCalls).toBe(0);
  });

  it("claims before calling the vendor, so a lost race never pays", async () => {
    const order: string[] = [];
    const vendor: KycVendor = {
      submit: async () => {
        order.push("submit");
        return { ref: "sess_new", status: "pending", url: "https://x", token: "tok_new" };
      },
    };
    const prisma = {
      rider: {
        findUnique: async () => ({ kycStatus: "pending", kycAttempts: 0, kycRef: "sess_live", kycSessionToken: "tok_live", kycSessionUrl: "https://x" }),
        updateMany: async (args: { data: Record<string, unknown> }) => {
          order.push("kycForcedAt" in args.data ? "claim" : "write");
          return { count: 1 };
        },
      },
    };
    const s = svc(prisma, { KYC_MODE: "auto", KYC_PROVIDER: "didit" }, vendor);
    await s.retryKyc("p1", { force: true });
    // The claim is first. If it ever moves after the submit, a lost race has already been billed.
    expect(order[0]).toBe("claim");
    expect(order).toContain("submit");
    expect(order.indexOf("claim")).toBeLessThan(order.indexOf("submit"));
  });

  it("claims on a window predicate, not a bare flag — an old force can be re-claimed", async () => {
    let where: Record<string, unknown> | undefined;
    const vendor: KycVendor = {
      submit: async () => ({ ref: "sess_new", status: "pending", url: "https://x", token: "tok_new" }),
    };
    const prisma = {
      rider: {
        findUnique: async () => ({ kycStatus: "pending", kycAttempts: 0, kycRef: "sess_live", kycSessionToken: "tok_live", kycSessionUrl: "https://x" }),
        updateMany: async (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
          if ("kycForcedAt" in args.data) where = args.where;
          return { count: 1 };
        },
      },
    };
    const s = svc(prisma, { KYC_MODE: "auto", KYC_PROVIDER: "didit" }, vendor);
    await s.retryKyc("p1", { force: true });
    // never-forced OR forced-longer-ago-than-the-window — a permanent flag would lock a rider out of
    // every future genuine expiry for the life of the account.
    expect(where).toMatchObject({ profileId: "p1" });
    expect(where?.OR).toEqual([{ kycForcedAt: null }, { kycForcedAt: { lt: expect.any(Date) } }]);
  });

  /**
   * A claim that bought nothing is given back. Taking it before `vendor.submit()` is what stops a
   * lost race paying — but it also means a vendor rejection leaves the rider holding a spent claim
   * and no replacement, so every later tap falls to the resume path and re-opens the very token the
   * SDK already rejected. That is the trap `force` exists to escape.
   */
  it("releases the claim when the vendor rejects, so the next tap can force again", async () => {
    const vendor: KycVendor = {
      submit: async () => {
        throw new Error("didit down");
      },
    };
    const writes: Array<Record<string, unknown>> = [];
    const prisma = {
      rider: {
        findUnique: async () => ({ kycStatus: "pending", kycAttempts: 0, kycRef: "sess_live", kycSessionToken: "tok_live", kycSessionUrl: "https://x", kycForcedAt: null }),
        updateMany: async (args: { data: Record<string, unknown> }) => {
          writes.push(args.data);
          return { count: 1 };
        },
      },
    };
    const s = svc(prisma, { KYC_MODE: "auto", KYC_PROVIDER: "didit" }, vendor);
    await expect(s.retryKyc("p1", { force: true })).rejects.toThrow(/Couldn't restart/i);

    const forcedWrites = writes.filter((w) => "kycForcedAt" in w);
    expect(forcedWrites).toHaveLength(2);
    expect(forcedWrites[0]?.kycForcedAt).toBeInstanceOf(Date); // claimed
    expect(forcedWrites[1]?.kycForcedAt).toBeNull(); // released back to what it was
  });

  it("releases back to the PREVIOUS value, not blindly to null", async () => {
    const previous = new Date("2026-08-20T10:00:00.000Z");
    const vendor: KycVendor = {
      submit: async () => {
        throw new Error("didit down");
      },
    };
    const writes: Array<Record<string, unknown>> = [];
    const prisma = {
      rider: {
        // Forced once long ago (outside the window, so the claim is winnable again).
        findUnique: async () => ({ kycStatus: "pending", kycAttempts: 0, kycRef: "sess_live", kycSessionToken: "tok_live", kycSessionUrl: "https://x", kycForcedAt: previous }),
        updateMany: async (args: { data: Record<string, unknown> }) => {
          writes.push(args.data);
          return { count: 1 };
        },
      },
    };
    const s = svc(prisma, { KYC_MODE: "auto", KYC_PROVIDER: "didit" }, vendor);
    await expect(s.retryKyc("p1", { force: true })).rejects.toThrow(/Couldn't restart/i);
    // Nulling here would hand back a claim the rider never had, re-opening the cost hole.
    expect(writes.filter((w) => "kycForcedAt" in w).at(-1)?.kycForcedAt).toBe(previous);
  });

  // The claim CASes on the snapshot retryKyc read, for the same reason the rotation does: findUnique
  // takes no row lock, so a terminal webhook can land in between. Without it that race wins the claim
  // and pays for a session the rotation then refuses to store.
  it("loses the claim when a webhook resolved the rider between the read and the claim", async () => {
    let submitCalls = 0;
    const vendor: KycVendor = {
      submit: async () => {
        submitCalls += 1;
        return { ref: "sess_new", status: "pending", url: "https://x", token: "tok_new" };
      },
    };
    const prisma = {
      rider: {
        findUnique: async () => ({ kycStatus: "pending", kycAttempts: 0, kycRef: "sess_live", kycSessionToken: "tok_live", kycSessionUrl: "https://verify.didit.me/sess_live", kycForcedAt: null }),
        // count 0 = the CAS matched nothing: the row moved under us.
        updateMany: async () => ({ count: 0 }),
      },
    };
    const s = svc(prisma, { KYC_MODE: "auto", KYC_PROVIDER: "didit" }, vendor);
    await s.retryKyc("p1", { force: true });
    expect(submitCalls).toBe(0);
  });

  it("claims against the observed kycRef/status/attempts, not just the profile", async () => {
    let where: Record<string, unknown> | undefined;
    const vendor: KycVendor = {
      submit: async () => ({ ref: "sess_new", status: "pending", url: "https://x", token: "tok_new" }),
    };
    const prisma = {
      rider: {
        findUnique: async () => ({ kycStatus: "pending", kycAttempts: 1, kycRef: "sess_live", kycSessionToken: "tok_live", kycSessionUrl: "https://x", kycForcedAt: null }),
        updateMany: async (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
          if ("kycForcedAt" in args.data && args.where.OR) where = args.where;
          return { count: 1 };
        },
      },
    };
    const s = svc(prisma, { KYC_MODE: "auto", KYC_PROVIDER: "didit" }, vendor);
    await s.retryKyc("p1", { force: true });
    expect(where).toMatchObject({ profileId: "p1", kycRef: "sess_live", kycStatus: "pending", kycAttempts: 1 });
  });

  it("does not even attempt the claim when force is absent", async () => {
    let claims = 0;
    const vendor: KycVendor = {
      submit: async () => ({ ref: "sess_new", status: "pending", url: "https://x", token: "tok_new" }),
    };
    const prisma = {
      rider: {
        findUnique: async () => ({ kycStatus: "pending", kycAttempts: 0, kycRef: "sess_live", kycSessionToken: "tok_live", kycSessionUrl: "https://x" }),
        updateMany: async (args: { data: Record<string, unknown> }) => {
          if ("kycForcedAt" in args.data) claims += 1;
          return { count: 1 };
        },
      },
    };
    const s = svc(prisma, { KYC_MODE: "auto", KYC_PROVIDER: "didit" }, vendor);
    await s.retryKyc("p1");
    // An ordinary resume must not burn the rider's one forced replacement.
    expect(claims).toBe(0);
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
    const s = svc(
      { rider: { findUnique: async () => ({ kycStatus: "failed", kycAttempts: 1 }), updateMany: async () => ({ count: 1 }) } },
      { KYC_MODE: "manual" },
      vendor,
    );
    // BH-03: `mode` must be present even on this early return — the mobile client uses it to tell
    // "no verificationUrl because manual review is expected" apart from "no verificationUrl because
    // something went wrong" (resolveKycRetryFeedback). Without it a manual-mode rider saw a false error
    // on every retry tap.
    expect(await s.retryKyc("p1")).toEqual({ kycStatus: "pending", mode: "manual" });
  });

  // E2E 2026-10-05 FS-2: production runs KYC_MODE=manual. A declined rider's retry answered `pending` but
  // wrote nothing, so the row stayed `failed` — outside the admin queue (`listRiders("pending")`).
  it.each(["failed", "expired"] as const)("manual mode: a retry from %s really puts the rider back in the pending queue (CAS on the observed state)", async (from) => {
    const writes: Array<{ where: unknown; data: unknown }> = [];
    const prisma = {
      rider: {
        findUnique: async () => ({ kycStatus: from, kycAttempts: 1, kycRef: null, kycSessionToken: null, kycSessionUrl: null, kycForcedAt: null }),
        updateMany: async (args: { where: unknown; data: unknown }) => {
          writes.push(args);
          return { count: 1 };
        },
      },
    };
    const s = svc(prisma, { KYC_MODE: "manual", KYC_PROVIDER: "didit" });
    expect(await s.retryKyc("p1")).toEqual({ kycStatus: "pending", mode: "manual" });
    expect(writes).toEqual([
      {
        where: { profileId: "p1", kycStatus: from, kycAttempts: 1 },
        data: { kycStatus: "pending", idVerified: false, kycSessionToken: null, kycSessionUrl: null },
      },
    ]);
    // kycResolvedAt is deliberately NOT cleared (as an admin `pending` reset): a stale webhook stays stale.
    expect(writes[0].data).not.toHaveProperty("kycResolvedAt");
    // A retry is not a decline — the A-02 counter is untouched (D4).
    expect(writes[0].data).not.toHaveProperty("kycAttempts");
  });

  it("manual mode: an already-pending rider's retry writes nothing", async () => {
    const prisma = {
      rider: {
        findUnique: async () => ({ kycStatus: "pending", kycAttempts: 0 }),
        updateMany: async () => {
          throw new Error("a pending rider is already in the queue — nothing to write");
        },
      },
    };
    const s = svc(prisma, { KYC_MODE: "manual" });
    expect(await s.retryKyc("p1")).toEqual({ kycStatus: "pending", mode: "manual" });
  });

  it("manual mode: 409s when an admin decision lands between the read and the reopen (CAS = 0 rows)", async () => {
    const prisma = {
      rider: {
        findUnique: async () => ({ kycStatus: "failed", kycAttempts: 1 }),
        updateMany: async () => ({ count: 0 }),
      },
    };
    const s = svc(prisma, { KYC_MODE: "manual" });
    await expect(s.retryKyc("p1")).rejects.toThrow(/just changed/i);
  });
});

describe("RiderService.setOnline", () => {
  // E2E 2026-10-05 FS-7: going online needs a position now, so the eligible paths send one (central Harare).
  const HARARE = { lat: -17.83, lng: 31.05 };

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
    expect(await s.setOnline("p1", true, HARARE)).toEqual({ online: true });
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
      await s.setOnline("p1", true, HARARE);
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

  it("refuses going online without a location (location_required) — no write, no drain (E2E 2026-10-05 FS-7)", async () => {
    let wrote = false;
    const prisma = {
      rider: {
        findUnique: async () => ({ kycStatus: "verified", accountStatus: "active", onHold: false, cooldownUntil: null }),
      },
      $executeRaw: async () => {
        wrote = true;
        return 1;
      },
    };
    let drained = false;
    const tracking = {
      evictFromGeo: async () => {},
      claimNotifyWaitersNear: async () => { drained = true; return []; },
      clearNotifyWaiters: async () => {},
    } as unknown as import("../tracking/tracking.service").TrackingService;
    const notifications = { notifyRidersAvailable: async () => new Set<string>() } as unknown as import("../notifications/notifications.service").NotificationsService;
    const s = new RiderService(prisma as unknown as PrismaService, {} as Env, new StubKycVendor(), pii, tracking, gatewayStub, notifications);
    let threw: unknown;
    try {
      await s.setOnline("p1", true);
    } catch (e) {
      threw = e;
    }
    // A machine-readable reason for the app, and a human sentence for an older build that can't read it.
    expect((threw as { getStatus: () => number }).getStatus()).toBe(403);
    expect((threw as { getResponse: () => { reason: string; message: string } }).getResponse()).toEqual({
      reason: "location_required",
      message: expect.stringMatching(/location/i),
    });
    await new Promise((r) => setTimeout(r, 0));
    // Never flipped online (the old behaviour: "Online" from anywhere, never a job), never drained.
    expect(wrote).toBe(false);
    expect(drained).toBe(false);
  });

  it("an ineligible rider without a location still sees their standing refusal, not location_required", async () => {
    const s = svc({ rider: { findUnique: async () => ({ kycStatus: "verified", accountStatus: "suspended", onHold: false, cooldownUntil: null }) } }, {});
    await expect(s.setOnline("p1", true)).rejects.toMatchObject({ response: { reason: "suspended" } });
  });

  it("lets any rider go offline regardless of verification", async () => {
    const prisma = {
      rider: { findUnique: async () => ({ kycStatus: "pending" }), update: async () => ({}) },
    };
    const s = svc(prisma, {});
    // No coordinates: going OFFLINE never needs a position (FS-7 gates only the online transition).
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
    expect(await s.setOnline("p1", true, HARARE)).toEqual({ online: true });
  });

  it("refuses going online outside the service corridor (out_of_area) when a location is sent", async () => {
    const s = svc(
      { rider: { findUnique: async () => ({ kycStatus: "verified", accountStatus: "active", onHold: false, cooldownUntil: null }) } },
      {},
    );
    // Null Island — far outside the service area.
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

  it("allows going online in a satellite town (Norton, outside the old 25 km disc)", async () => {
    const prisma = {
      rider: {
        findUnique: async () => ({ kycStatus: "verified", accountStatus: "active", onHold: false, cooldownUntil: null }),
        updateMany: async () => ({ count: 1 }),
      },
    };
    const s = svc(prisma, {});
    expect(await s.setOnline("p1", true, { lat: -17.8833, lng: 30.7 })).toEqual({ online: true });
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

describe("onlineRefusalReason — D-70 commission-free first jobs", () => {
  const base = { kycStatus: "verified", accountStatus: "active", onHold: false, cooldownUntil: null };
  it("a new rider with free jobs left is NOT top-up gated at a $0 balance, even with commission live", () => {
    expect(onlineRefusalReason({ ...base, commissionActive: true, commissionBalance: 0, freeJobsLeft: COMMISSION.freeFirstJobs })).toBeNull();
    expect(onlineRefusalReason({ ...base, commissionActive: true, commissionBalance: 0, freeJobsLeft: 1 })).toBeNull();
  });
  it("the gate returns once the free jobs are used up", () => {
    expect(onlineRefusalReason({ ...base, commissionActive: true, commissionBalance: 0, freeJobsLeft: 0 })).toBe("commission_low_balance");
    expect(onlineRefusalReason({ ...base, commissionActive: true, commissionBalance: 2, freeJobsLeft: 0 })).toBeNull();
  });
  it("free jobs never waive a STANDING reason", () => {
    expect(onlineRefusalReason({ ...base, accountStatus: "suspended", commissionActive: true, commissionBalance: 0, freeJobsLeft: 5 })).toBe("suspended");
    expect(onlineRefusalReason({ ...base, kycStatus: "pending", freeJobsLeft: 5 })).toBe("kyc");
  });
  it("freeJobsLeft derives from completed jobs: 0 trips → 5, 4 → 1, 5+ → 0 (cancels never count — tripsCount only moves on completion)", () => {
    expect(freeJobsLeft(0)).toBe(5);
    expect(freeJobsLeft(null)).toBe(5);
    expect(freeJobsLeft(4)).toBe(1);
    expect(freeJobsLeft(5)).toBe(0);
    expect(freeJobsLeft(312)).toBe(0);
  });
});

describe("RiderService.setOnline — D-70 commission-free first jobs", () => {
  const HARARE = { lat: -17.83, lng: 31.05 };
  function onlineSvc(tripsCount: number, balance: number) {
    const prisma = {
      rider: { findUnique: async () => ({ kycStatus: "verified", accountStatus: "active", onHold: false, cooldownUntil: null, tripsCount }) },
      commissionAccount: { findUnique: async () => ({ balance }) },
    };
    return svc(prisma, { COMMISSION_RATE_PCT: 10 } as Partial<Env>);
  }
  it("a newly verified rider (0 jobs, $0 balance) goes online with commission live", async () => {
    expect(await onlineSvc(0, 0).setOnline("p1", true, HARARE)).toEqual({ online: true });
  });
  it("a rider on their 5th free job (4 completed) still goes online at $0", async () => {
    expect(await onlineSvc(4, 0).setOnline("p1", true, HARARE)).toEqual({ online: true });
  });
  it("after the 5th completed job a $0 rider meets the top-up gate again", async () => {
    await expect(onlineSvc(5, 0).setOnline("p1", true, HARARE)).rejects.toMatchObject({ response: { reason: "commission_low_balance" } });
  });
  it("an existing rider past the allowance is gated exactly as before", async () => {
    await expect(onlineSvc(80, 1.5).setOnline("p1", true, HARARE)).rejects.toMatchObject({ response: { reason: "commission_low_balance" } });
    expect(await onlineSvc(80, 2).setOnline("p1", true, HARARE)).toEqual({ online: true });
  });
});

describe("RiderService.applyKycResult", () => {
  // The rider's account already carries a national ID — every rider onboarded before D-75 does (it was
  // required at become). An account with NONE on file takes the D-75 path (adopt / hold), tested below.
  const ON_FILE = { profile: { idNumberHash: pii.hashId("63-1-A") } };

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
        findFirst: async () => ({ profileId: "p1", ...ON_FILE }),
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

  it("D-80 F6: an `expired` webhook stamps the ID's expiry day — the document's when earlier, else the lapse day", async () => {
    let data: Record<string, unknown> | undefined;
    const stored = new Date("2026-10-02T00:00:00Z");
    const mk = (kycIdExpiresOn: Date | null) => ({
      rider: {
        updateMany: async (args: { data: Record<string, unknown> }) => {
          data = args.data;
          return { count: 1 };
        },
        findFirst: async () => ({ profileId: "p1", kycAttempts: 0, kycIdExpiresOn }),
      },
    });
    await svc(mk(stored), {}).applyKycResult("sess_1", "expired", new Date("2026-10-05T14:30:00Z"));
    expect(data?.kycIdExpiresOn).toBe(stored);
    await svc(mk(null), {}).applyKycResult("sess_1", "expired", new Date("2026-10-05T14:30:00Z"));
    expect((data?.kycIdExpiresOn as Date).toISOString()).toBe("2026-10-05T00:00:00.000Z");
  });

  it("D-80 F6: a `verified` webhook stores the document's expiry day when the decision carries one", async () => {
    let data: Record<string, unknown> | undefined;
    const prisma = {
      rider: {
        updateMany: async (args: { data: Record<string, unknown> }) => {
          data = args.data;
          return { count: 1 };
        },
        findFirst: async () => ({ profileId: "p1", kycAttempts: 0, duplicateIdFlag: false, kycResolvedAt: null, profile: { idNumberHash: "h" } }),
      },
      auditLog: { create: async () => ({}) },
    };
    const expires = new Date("2031-03-04T00:00:00Z");
    await svc(prisma, {}).applyKycResult("sess_1", "verified", new Date(), null, null, expires);
    expect(data?.kycIdExpiresOn).toBe(expires);
    await svc(prisma, {}).applyKycResult("sess_1", "failed", new Date(), "other", null, expires);
    expect(data).not.toHaveProperty("kycIdExpiresOn");
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
        findFirst: async () => ({ profileId: "p1", ...ON_FILE }),
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
        findFirst: async () => ({ profileId: "p1", ...ON_FILE }),
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
        findFirst: async () => ({ profileId: "p1", duplicateIdFlag: true, ...ON_FILE }),
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
        findFirst: async () => ({ profileId: "p1", duplicateIdFlag: false, ...ON_FILE }),
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
  // D-75 additions: `typedHash: null` is an account with no national ID on file (every new rider since
  // D-75); `adoptCount` is the profile CAS's row count, `onFileAfter` what a re-read then finds, and
  // `adoptP2002` makes the first N adoption writes hit the live-ID unique index. `rec.calls` is the
  // order of the writes/locks/reads, `rec.adopt` every adoption write, `rec.raw` every raw statement.
  function docPrisma(
    over: {
      typedHash?: string | null;
      profileHits?: number;
      riderHits?: number;
      duplicateIdFlag?: boolean;
      kycResolvedAt?: Date | null;
      adoptCount?: number;
      onFileAfter?: string | null;
      adoptP2002?: number;
    } = {},
  ) {
    const rec: {
      data?: Record<string, unknown>;
      audit?: Record<string, unknown>;
      adopt: { where: Record<string, unknown>; data: Record<string, unknown> }[];
      raw: { sql: string; values: unknown[] }[];
      calls: string[];
      transactions: number;
    } = { adopt: [], raw: [], calls: [], transactions: 0 };
    let p2002Left = over.adoptP2002 ?? 0;
    const prisma: Record<string, unknown> = {
      // A faithful-enough interactive transaction: the callback runs against the same fake, and a throw
      // inside rejects the whole unit (Postgres would roll every write in it back).
      $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
        rec.transactions += 1;
        rec.calls.push("begin");
        return fn(prisma);
      },
      $executeRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
        const sql = strings.join("?");
        rec.raw.push({ sql, values });
        rec.calls.push(sql.includes("pg_advisory_xact_lock") ? "advisory" : "row-lock");
        return 1;
      },
      rider: {
        updateMany: async (args: { data: Record<string, unknown> }) => {
          rec.calls.push("decision");
          rec.data = args.data;
          return { count: 1 };
        },
        findFirst: async () => {
          rec.calls.push("read");
          return {
            profileId: "p1",
            duplicateIdFlag: over.duplicateIdFlag ?? false,
            kycAttempts: 0,
            kycResolvedAt: over.kycResolvedAt ?? null,
            profile: { idNumberHash: over.typedHash === undefined ? pii.hashId("63-123456-A-42") : over.typedHash },
          };
        },
        count: async () => over.riderHits ?? 0,
      },
      profile: {
        count: async () => over.profileHits ?? 0,
        updateMany: async (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
          rec.calls.push("adopt");
          rec.adopt.push(args);
          if (p2002Left > 0) {
            p2002Left -= 1;
            throw new Prisma.PrismaClientKnownRequestError("Unique constraint failed on the fields: (`id_number_hash`)", {
              code: "P2002",
              clientVersion: "test",
            });
          }
          return { count: over.adoptCount ?? 1 };
        },
        findUnique: async () => ({ idNumberHash: over.onFileAfter ?? null }),
      },
      auditLog: {
        create: async (args: { data: Record<string, unknown> }) => {
          rec.calls.push("audit");
          rec.audit = args.data;
          return {};
        },
      },
    };
    return { prisma, rec };
  }

  it("IR26-04: a verified doc number matching the typed ID (across punctuation) auto-verifies and persists the hash", async () => {
    const { prisma, rec } = docPrisma();
    // Vendor returns the same physical number unpunctuated — pii.hashId normalizes, so they collide.
    await svc(prisma, {}).applyKycResult("sess_1", "verified", new Date(), null, "63123456A42");
    expect(rec.data).toMatchObject({ kycStatus: "verified", idVerified: true, verifiedIdHash: pii.hashId("63-123456-A-42") });
  });

  it("D-70: a verified doc number is ALSO stored encrypted (normalised) for the ID prefill — never in plaintext", async () => {
    const { prisma, rec } = docPrisma();
    await svc(prisma, {}).applyKycResult("sess_1", "verified", new Date(), null, "63-123456-a-42");
    const stored = rec.data?.verifiedIdNumber as string;
    expect(typeof stored).toBe("string");
    expect(stored).not.toContain("63123456");
    expect(stored.startsWith("v1:")).toBe(true);
    expect(pii.decryptId(stored)).toBe("63123456A42");
  });

  it("D-70: no document number → nothing stored for the prefill", async () => {
    const { prisma, rec } = docPrisma();
    await svc(prisma, {}).applyKycResult("sess_1", "verified", new Date(), null, null);
    expect(rec.data).not.toHaveProperty("verifiedIdNumber");
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

  // D-75 (owner 2026-10-03): new riders no longer type their national ID before the check — "the
  // number is confirmed from the check afterwards". Before D-75 an account with no ID on file was a
  // legacy rider and was held here as `verified_id_mismatch`; now the vendor-verified number becomes the
  // account's national ID, deduped exactly like a typed one.
  it("D-75: with NO national ID on file, a clean verification adopts the vendor number onto the profile and verifies", async () => {
    const { prisma, rec } = docPrisma({ typedHash: null });
    await svc(prisma, {}).applyKycResult("sess_1", "verified", new Date(), null, "63-123456-a-42");
    expect(rec.data).toMatchObject({ kycStatus: "verified", idVerified: true, verifiedIdHash: pii.hashId("63-123456-A-42") });
    expect(rec.audit).toMatchObject({ action: "rider.kyc_approve", target: "p1" });
    // The adoption: a CAS that only fills an EMPTY slot, with a typed ID's normalisation, encryption and hash.
    expect(rec.adopt).toHaveLength(1);
    expect(rec.adopt[0]!.where).toEqual({ id: "p1", idNumberHash: null });
    expect(rec.adopt[0]!.data.idNumberHash).toBe(pii.hashId("63123456A42"));
    const stored = rec.adopt[0]!.data.idNumber as string;
    expect(stored.startsWith("v1:")).toBe(true);
    expect(stored).not.toContain("63123456");
    expect(pii.decryptId(stored)).toBe("63123456A42");
  });

  it("D-75: the adoption commits in the SAME transaction as the verification, after the locks and before the decision", async () => {
    const { prisma, rec } = docPrisma({ typedHash: null });
    await svc(prisma, {}).applyKycResult("sess_1", "verified", new Date(), null, "63123456A42");
    expect(rec.transactions).toBe(1);
    expect(rec.calls.slice(0, 6)).toEqual(["begin", "advisory", "row-lock", "read", "adopt", "decision"]);
    // The advisory lock is the number's, keyed exactly like the ID-writing routes' (hashtext of the hash).
    expect(rec.raw[0]!.sql).toContain("pg_advisory_xact_lock(hashtext(");
    expect(rec.raw[0]!.values).toEqual([pii.hashId("63-123456-A-42")]);
  });

  it("D-75: a vendor number on another account's profile (live OR erased) still holds the rider — no adoption", async () => {
    const { prisma, rec } = docPrisma({ typedHash: null, profileHits: 1 });
    await svc(prisma, {}).applyKycResult("sess_1", "verified", new Date(), null, "63123456A42");
    expect(rec.data).not.toHaveProperty("kycStatus");
    expect(rec.data).not.toHaveProperty("idVerified");
    // Held for the collision alone — before D-75 this read verified_id_mismatch+verified_id_collision.
    expect(rec.audit).toMatchObject({ action: "rider.kyc_review_required", reasonCode: "verified_id_collision" });
    expect(rec.adopt).toHaveLength(0);
    // The vendor hash is still persisted on the rider row, so later applicants collide with it too.
    expect(rec.data).toMatchObject({ verifiedIdHash: pii.hashId("63-123456-A-42") });
  });

  it("D-75: a vendor number another RIDER already verified holds the rider too — no adoption", async () => {
    const { prisma, rec } = docPrisma({ typedHash: null, riderHits: 1 });
    await svc(prisma, {}).applyKycResult("sess_1", "verified", new Date(), null, "63123456A42");
    expect(rec.data).not.toHaveProperty("kycStatus");
    expect(rec.audit).toMatchObject({ reasonCode: "verified_id_collision" });
    expect(rec.adopt).toHaveLength(0);
  });

  it("D-75: a rider flagged duplicateIdFlag is held and nothing is adopted", async () => {
    const { prisma, rec } = docPrisma({ typedHash: null, duplicateIdFlag: true });
    await svc(prisma, {}).applyKycResult("sess_1", "verified", new Date(), null, "63123456A42");
    expect(rec.data).not.toHaveProperty("kycStatus");
    expect(rec.audit).toMatchObject({ reasonCode: "duplicate_id_flag" });
    expect(rec.adopt).toHaveLength(0);
  });

  it("D-75: no ID on file AND no document number in the decision → verified fail-open, audit-flagged verified_id_missing (never held hostage)", async () => {
    // extractDiditDocumentNumber is fail-open by design: a verify must not be parked in review because a
    // payload lacked the number — a held rider's only way forward is another paid session.
    const { prisma, rec } = docPrisma({ typedHash: null });
    await svc(prisma, {}).applyKycResult("sess_1", "verified", new Date(), null, null);
    expect(rec.data).toMatchObject({ kycStatus: "verified", idVerified: true });
    expect(rec.audit).toMatchObject({ action: "rider.kyc_approve", reasonCode: "verified_id_missing" });
    expect(rec.adopt).toHaveLength(0);
    // No number → no advisory lock to take.
    expect(rec.raw.some((r) => r.sql.includes("pg_advisory_xact_lock"))).toBe(false);
  });

  it("D-75: an account WITH an ID on file keeps the mismatch check and is never overwritten by the vendor number", async () => {
    const { prisma, rec } = docPrisma();
    await svc(prisma, {}).applyKycResult("sess_1", "verified", new Date(), null, "63-999999-Z-99");
    expect(rec.data).not.toHaveProperty("kycStatus");
    expect(rec.audit).toMatchObject({ reasonCode: "verified_id_mismatch" });
    expect(rec.adopt).toHaveLength(0);
    // And a matching number verifies without touching the profile either.
    const match = docPrisma();
    await svc(match.prisma, {}).applyKycResult("sess_1", "verified", new Date(), null, "63123456A42");
    expect(match.rec.data).toMatchObject({ kycStatus: "verified" });
    expect(match.rec.adopt).toHaveLength(0);
  });

  it("D-75: a stale or replayed decision adopts nothing (the CAS it would ride on won't apply)", async () => {
    const eventAt = new Date("2026-10-03T10:00:00Z");
    const { prisma, rec } = docPrisma({ typedHash: null, kycResolvedAt: new Date("2026-10-03T11:00:00Z") });
    await svc(prisma, {}).applyKycResult("sess_1", "verified", eventAt, null, "63123456A42");
    expect(rec.adopt).toHaveLength(0);
    // An exact replay (same eventAt) is not newer either.
    const replay = docPrisma({ typedHash: null, kycResolvedAt: eventAt });
    await svc(replay.prisma, {}).applyKycResult("sess_1", "verified", eventAt, null, "63123456A42");
    expect(replay.rec.adopt).toHaveLength(0);
  });

  it("D-75: failed and expired decisions never adopt a number", async () => {
    for (const status of ["failed", "expired"] as const) {
      const { prisma, rec } = docPrisma({ typedHash: null });
      await svc(prisma, {}).applyKycResult("sess_1", status, new Date(), status === "failed" ? "face_mismatch" : null, "63123456A42");
      expect(rec.adopt).toHaveLength(0);
      expect(rec.data).toMatchObject({ kycStatus: status });
    }
  });

  it("D-75: a DIFFERENT number that landed on the account mid-check (CAS lost) is held as a mismatch, not verified", async () => {
    const { prisma, rec } = docPrisma({ typedHash: null, adoptCount: 0, onFileAfter: pii.hashId("63-999999-Z-99") });
    await svc(prisma, {}).applyKycResult("sess_1", "verified", new Date(), null, "63123456A42");
    expect(rec.adopt).toHaveLength(1);
    expect(rec.data).not.toHaveProperty("kycStatus");
    expect(rec.audit).toMatchObject({ action: "rider.kyc_review_required", reasonCode: "verified_id_mismatch" });
  });

  it("D-75: the SAME number already on the account when the CAS lost still verifies", async () => {
    const { prisma, rec } = docPrisma({ typedHash: null, adoptCount: 0, onFileAfter: pii.hashId("63-123456-A-42") });
    await svc(prisma, {}).applyKycResult("sess_1", "verified", new Date(), null, "63123456A42");
    expect(rec.data).toMatchObject({ kycStatus: "verified", idVerified: true });
  });

  it("D-75: the live-ID unique index refusing the adoption doesn't crash the webhook — re-applied once, held for review", async () => {
    // A writer that skips the advisory lock claimed the number between the count and the write: the
    // IR26-05 backstop P2002s. The decision is re-run with adoption off and the rider is held.
    const { prisma, rec } = docPrisma({ typedHash: null, adoptP2002: 1 });
    await expect(svc(prisma, {}).applyKycResult("sess_1", "verified", new Date(), null, "63123456A42")).resolves.toEqual({ updated: 1 });
    expect(rec.transactions).toBe(2);
    expect(rec.adopt).toHaveLength(1);
    expect(rec.data).not.toHaveProperty("kycStatus");
    expect(rec.data).not.toHaveProperty("idVerified");
    expect(rec.audit).toMatchObject({ action: "rider.kyc_review_required", reasonCode: "verified_id_collision" });
  });

  it("D-75: a P2002 that did NOT come from the adoption still propagates (no blanket retry)", async () => {
    const { prisma, rec } = docPrisma();
    const p2002 = new Prisma.PrismaClientKnownRequestError("Unique constraint failed", { code: "P2002", clientVersion: "test" });
    (prisma.rider as { updateMany: unknown }).updateMany = async () => {
      throw p2002;
    };
    await expect(svc(prisma, {}).applyKycResult("sess_1", "verified", new Date(), null, "63123456A42")).rejects.toBe(p2002);
    expect(rec.transactions).toBe(1);
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
        findFirst: async () => ({ profileId: "p1", ...ON_FILE }),
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

// D-75 item 2 (IR26-09): a result the webhook HOLDS for a human (Didit's In Review, a Didit approval in the
// face-match review band) stores the number Didit read from the document, so the reviewer sees it and a
// hand approval adopts it. It resolves nothing, and never overwrites a number a resolved decision wrote.
describe("RiderService.recordHeldVerifiedId", () => {
  const NUMBER = "63-123456-a-42";
  const HASH = pii.hashId("63123456A42");
  const OTHER = "63-999999-Z-99";

  /** Records the transaction boundary, every raw statement (the advisory lock) and the one write. */
  function recPrisma(count = 1) {
    const rec: {
      calls: string[];
      raw: { sql: string; values: unknown[] }[];
      where?: Record<string, unknown>;
      data?: Record<string, unknown>;
    } = { calls: [], raw: [] };
    const prisma: Record<string, unknown> = {
      $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
        rec.calls.push("begin");
        const out = await fn(prisma);
        rec.calls.push("commit");
        return out;
      },
      $executeRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
        const sql = strings.join("?");
        rec.raw.push({ sql, values });
        rec.calls.push(sql.includes("pg_advisory_xact_lock") ? "advisory" : "raw");
        return 1;
      },
      rider: {
        updateMany: async (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
          rec.calls.push("write");
          rec.where = args.where;
          rec.data = args.data;
          return { count };
        },
      },
      // Writes this method must never make: they're recorded so a test can prove they didn't happen.
      profile: {
        updateMany: async () => {
          rec.calls.push("profile-write");
          return { count: 1 };
        },
      },
      auditLog: {
        create: async () => {
          rec.calls.push("audit");
          return {};
        },
      },
    };
    return { prisma, rec };
  }

  it("stores the hash and the encrypted, normalised number on the undecided check named by kycRef, and nothing else", async () => {
    const { prisma, rec } = recPrisma();
    expect(await svc(prisma, {}).recordHeldVerifiedId("sess_1", NUMBER)).toEqual({ updated: 1 });
    // Only while the rider's CURRENT check is undecided. Every decision stamps kycResolvedAt, and retryKyc
    // and erasure move or null kycRef, so a decided, replaced or erased check matches no row.
    expect(rec.where).toEqual({ kycRef: "sess_1", kycStatus: "pending", kycResolvedAt: null });
    // Two fields. The decision isn't resolved, so status, idVerified, kycResolvedAt, the decline reason, the
    // attempt counter and the session credentials keep their values.
    expect(Object.keys(rec.data ?? {}).sort()).toEqual(["verifiedIdHash", "verifiedIdNumber"]);
    expect(rec.data?.verifiedIdHash).toBe(HASH);
    const stored = rec.data?.verifiedIdNumber as string;
    expect(stored.startsWith("v1:")).toBe(true);
    expect(stored).not.toContain("63123456");
    expect(pii.decryptId(stored)).toBe("63123456A42");
  });

  it("takes the number's advisory lock before the write, in one transaction (IR26-04: other claimers see it)", async () => {
    const { prisma, rec } = recPrisma();
    await svc(prisma, {}).recordHeldVerifiedId("sess_1", NUMBER);
    expect(rec.calls).toEqual(["begin", "advisory", "write", "commit"]);
    // The key every writer of this national ID takes: hashtext of its HMAC hash.
    expect(rec.raw[0]!.sql).toContain("pg_advisory_xact_lock(hashtext(");
    expect(rec.raw[0]!.values).toEqual([HASH]);
  });

  it("adopts nothing, audits nothing, notifies no one and demotes no one: only a decision does", async () => {
    const { prisma, rec } = recPrisma();
    const notifyProfiles = vi.fn(async () => {});
    const evictRiderFromSupply = vi.fn(async () => {});
    const s = new RiderService(
      prisma as unknown as PrismaService,
      {} as Env,
      new StubKycVendor(),
      pii,
      trackingStub,
      { evictRiderFromSupply } as unknown as import("../tracking/tracking.gateway").TrackingGateway,
      { ...notificationsStub, notifyProfiles } as unknown as import("../notifications/notifications.service").NotificationsService,
    );
    await s.recordHeldVerifiedId("sess_1", NUMBER);
    expect(rec.calls).not.toContain("profile-write");
    expect(rec.calls).not.toContain("audit");
    expect(notifyProfiles).not.toHaveBeenCalled();
    expect(evictRiderFromSupply).not.toHaveBeenCalled();
  });

  it("reports updated:0, without throwing, when no undecided check has the ref", async () => {
    const { prisma } = recPrisma(0);
    await expect(svc(prisma, {}).recordHeldVerifiedId("sess_gone", NUMBER)).resolves.toEqual({ updated: 0 });
  });

  // The tests below run the REAL applyKycResult, adminSetKyc and recordHeldVerifiedId against one rider
  // and profile held in memory. The fake evaluates each rider write's `where` as Postgres would for these
  // predicates (equality, IS NULL, `< t`), so they pin what each delivery ORDER leaves on file, not only
  // the shape of a where clause.
  type Row = {
    profileId: string;
    kycRef: string | null;
    kycStatus: "pending" | "verified" | "failed" | "expired";
    idVerified: boolean;
    kycResolvedAt: Date | null;
    kycAttempts: number;
    kycDeclineReason: string | null;
    duplicateIdFlag: boolean;
    verifiedIdHash: string | null;
    verifiedIdNumber: string | null;
    kycSessionToken: string | null;
    kycSessionUrl: string | null;
    isOnline: boolean;
  };
  function rowPrisma(init: Partial<Row> = {}, opts: { collisions?: number } = {}) {
    const row: Row = {
      profileId: "p1",
      kycRef: "sess_1",
      kycStatus: "pending",
      idVerified: false,
      kycResolvedAt: null,
      kycAttempts: 0,
      kycDeclineReason: null,
      duplicateIdFlag: false,
      verifiedIdHash: null,
      verifiedIdNumber: null,
      kycSessionToken: null,
      kycSessionUrl: null,
      isOnline: false,
      ...init,
    };
    // No national ID on file: every rider onboarded since D-75.
    const profile: { idNumber: string | null; idNumberHash: string | null } = { idNumber: null, idNumberHash: null };
    const audit: Record<string, unknown>[] = [];
    const fields = row as unknown as Record<string, unknown>;
    const matches = (where: Record<string, unknown>): boolean =>
      Object.entries(where).every(([k, v]) => {
        if (k === "OR") return (v as Record<string, unknown>[]).some(matches);
        if (k === "kycResolvedAt" && v !== null && typeof v === "object") {
          return row.kycResolvedAt !== null && row.kycResolvedAt < (v as { lt: Date }).lt;
        }
        if (!["profileId", "kycRef", "kycStatus", "kycResolvedAt"].includes(k)) throw new Error(`rowPrisma: unsupported where key ${k}`);
        return fields[k] === v;
      });
    const apply = (data: Record<string, unknown>) => {
      for (const [k, v] of Object.entries(data)) {
        fields[k] = v !== null && typeof v === "object" && "increment" in v ? (fields[k] as number) + (v as { increment: number }).increment : v;
      }
    };
    const view = () => ({ ...row, profile: { idNumberHash: profile.idNumberHash } });
    const prisma: Record<string, unknown> = {
      $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(prisma),
      $executeRaw: async () => 1,
      rider: {
        findFirst: async ({ where }: { where: Record<string, unknown> }) => (matches(where) ? view() : null),
        findUnique: async ({ where }: { where: Record<string, unknown> }) => (matches(where) ? view() : null),
        updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
          if (!matches(where)) return { count: 0 };
          apply(data);
          return { count: 1 };
        },
        update: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
          if (!matches(where)) throw new Error("rowPrisma: no such rider");
          apply(data);
          return { kycAttempts: row.kycAttempts };
        },
        // OTHER riders carrying the number (the rider's own row is excluded by every caller).
        count: async () => opts.collisions ?? 0,
      },
      profile: {
        count: async () => opts.collisions ?? 0,
        updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
          if (where.idNumberHash !== null || profile.idNumberHash !== null) return { count: 0 };
          profile.idNumber = data.idNumber as string;
          profile.idNumberHash = data.idNumberHash as string;
          return { count: 1 };
        },
        findUnique: async () => ({ idNumberHash: profile.idNumberHash }),
      },
      auditLog: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          audit.push(data);
          return {};
        },
      },
    };
    return { prisma, row, profile, audit };
  }

  it("the point: a band-held rider approved by hand adopts the stored number instead of being flagged verified_id_missing", async () => {
    const { prisma, row, profile, audit } = rowPrisma();
    const s = svc(prisma, {});
    // A Didit approval whose face match fell in the review band: held (still pending), its number stored.
    expect(await s.recordHeldVerifiedId("sess_1", NUMBER)).toEqual({ updated: 1 });
    expect(row).toMatchObject({ kycStatus: "pending", idVerified: false, kycResolvedAt: null, verifiedIdHash: HASH });
    expect(profile.idNumberHash).toBeNull(); // nothing adopted by the held result itself
    // The reviewer approves by hand, and the account adopts the number the check read.
    await s.adminSetKyc("p1", "verified", null, "admin:ops");
    expect(row).toMatchObject({ kycStatus: "verified", idVerified: true });
    expect(profile.idNumberHash).toBe(HASH);
    expect(pii.decryptId(profile.idNumber)).toBe("63123456A42");
    expect(audit.at(-1)).toMatchObject({ action: "rider.kyc_approve", target: "p1", reasonCode: null });
  });

  it("out of order: a held result delivered AFTER its check's decision never overwrites the decision's number", async () => {
    const { prisma, row, profile } = rowPrisma();
    const s = svc(prisma, {});
    // The resolved Approved lands first, and adopts its number.
    expect(await s.applyKycResult("sess_1", "verified", new Date("2026-10-04T08:00:00Z"), null, "63-123456-A-42")).toEqual({ updated: 1 });
    expect(row).toMatchObject({ kycStatus: "verified", verifiedIdHash: HASH });
    // Then a delayed or retried held result for the same check, with a different read of the document. Didit
    // re-signs a retry with a fresh dispatch time, so no timestamp can order it. It stores nothing.
    expect(await s.recordHeldVerifiedId("sess_1", OTHER)).toEqual({ updated: 0 });
    expect(row.verifiedIdHash).toBe(HASH);
    expect(pii.decryptId(row.verifiedIdNumber)).toBe("63123456A42");
    expect(profile.idNumberHash).toBe(HASH);
  });

  it("in order: the decision that follows a held result writes and adopts its own number", async () => {
    const { prisma, row, profile } = rowPrisma();
    const s = svc(prisma, {});
    await s.recordHeldVerifiedId("sess_1", OTHER);
    expect(row.verifiedIdHash).toBe(pii.hashId(OTHER));
    await s.applyKycResult("sess_1", "verified", new Date(), null, "63-123456-A-42");
    expect(row).toMatchObject({ kycStatus: "verified", idVerified: true, verifiedIdHash: HASH });
    expect(profile.idNumberHash).toBe(HASH);
  });

  it("a verify held for review (IR26-04) decides the check: a held result after it keeps that decision's number", async () => {
    // The vendor number collides with another account, so the verified webhook holds the rider (pending)
    // but stamps kycResolvedAt and stores its own number.
    const { prisma, row } = rowPrisma({}, { collisions: 1 });
    const s = svc(prisma, {});
    await s.applyKycResult("sess_1", "verified", new Date(), null, "63-123456-A-42");
    expect(row).toMatchObject({ kycStatus: "pending", verifiedIdHash: HASH });
    expect(row.kycResolvedAt).not.toBeNull();
    expect(await s.recordHeldVerifiedId("sess_1", OTHER)).toEqual({ updated: 0 });
    expect(row.verifiedIdHash).toBe(HASH);
  });

  it("E2E 2026-10-05 FS-11: a duplicate-ID hold keeps the finished session, so the rider reads 'in review' and a retry resumes it for free", async () => {
    const live = { kycSessionToken: "tok_live", kycSessionUrl: "https://verify.didit.me/sess_1" };
    const { prisma, row } = rowPrisma({ duplicateIdFlag: true, ...live });
    let minted = 0;
    const vendor: KycVendor = {
      submit: async () => {
        minted += 1;
        return { ref: "sess_2", status: "pending", url: "https://verify.didit.me/sess_2", token: "tok_2" };
      },
    };
    const s = svc(prisma, { KYC_MODE: "auto", KYC_PROVIDER: "didit" }, vendor);
    await s.applyKycResult("sess_1", "verified", new Date(), null, "63-123456-A-42");
    // Held: still pending, decided at the vendor, credentials kept (getProfile derives in_flight from them,
    // the way it does for a Didit In Review hold).
    expect(row).toMatchObject({ kycStatus: "pending", idVerified: false, ...live });
    expect(row.kycResolvedAt).not.toBeNull();
    // A tap on retry re-opens the same check — it never buys a second paid session for a finished one.
    expect(await s.retryKyc("p1")).toEqual({ kycStatus: "pending", mode: "auto", verificationUrl: live.kycSessionUrl, sessionToken: live.kycSessionToken });
    expect(minted).toBe(0);
    expect(row.kycRef).toBe("sess_1");
    // The review's own decision is what retires the credentials.
    await s.adminSetKyc("p1", "verified", null, "admin:ops");
    expect(row).toMatchObject({ kycStatus: "verified", kycSessionToken: null, kycSessionUrl: null });
  });

  it("a decision that is NOT held still clears the session credentials", async () => {
    for (const status of ["verified", "failed"] as const) {
      const { prisma, row } = rowPrisma({ kycSessionToken: "tok_live", kycSessionUrl: "https://verify.didit.me/sess_1" });
      await svc(prisma, {}).applyKycResult("sess_1", status, new Date(), null, status === "verified" ? "63-123456-A-42" : null);
      expect(row).toMatchObject({ kycStatus: status, kycSessionToken: null, kycSessionUrl: null });
    }
  });

  it("after a hand approval or decline, a held result stores nothing", async () => {
    for (const status of ["verified", "failed"] as const) {
      const { prisma, row } = rowPrisma();
      const s = svc(prisma, {});
      await s.adminSetKyc("p1", status, status === "failed" ? "document_unreadable" : null, "admin:ops");
      expect(await s.recordHeldVerifiedId("sess_1", NUMBER)).toEqual({ updated: 0 });
      expect(row.verifiedIdHash).toBeNull();
      expect(row.verifiedIdNumber).toBeNull();
    }
  });

  it("a check retryKyc replaced matches no row; the new check's held result replaces the old check's number", async () => {
    // retryKyc rotated sess_1 → sess_2. The old check stored a number before it was replaced.
    const { prisma, row } = rowPrisma({ kycRef: "sess_2", verifiedIdHash: pii.hashId(OTHER), verifiedIdNumber: pii.encryptId("63999999Z99") });
    const s = svc(prisma, {});
    expect(await s.recordHeldVerifiedId("sess_1", NUMBER)).toEqual({ updated: 0 });
    expect(row.verifiedIdHash).toBe(pii.hashId(OTHER));
    // The latest check's number wins, as it does when a decision writes it.
    expect(await s.recordHeldVerifiedId("sess_2", NUMBER)).toEqual({ updated: 1 });
    expect(row.verifiedIdHash).toBe(HASH);
    expect(pii.decryptId(row.verifiedIdNumber)).toBe("63123456A42");
  });

  it("only a pending rider: a verified row with no resolution stamp (the stub provider's instant pass) stores nothing", async () => {
    const { prisma, row } = rowPrisma({ kycStatus: "verified", idVerified: true, kycResolvedAt: null });
    expect(await svc(prisma, {}).recordHeldVerifiedId("sess_1", NUMBER)).toEqual({ updated: 0 });
    expect(row.verifiedIdHash).toBeNull();
  });

  it("an erased account (erasure nulls kycRef) stores nothing: the scrubbed number stays scrubbed, the hash stays", async () => {
    const { prisma, row } = rowPrisma({ kycRef: null, verifiedIdHash: HASH, verifiedIdNumber: null });
    expect(await svc(prisma, {}).recordHeldVerifiedId("sess_1", OTHER)).toEqual({ updated: 0 });
    expect(row.verifiedIdNumber).toBeNull();
    expect(row.verifiedIdHash).toBe(HASH);
  });

  it("never touches the decision: every other field keeps its value, the session credentials included", async () => {
    // A resubmission (attempt 2) mid-check: the live session must stay resumable, and the board keeps
    // reading it as "with Didit".
    const { prisma, row } = rowPrisma({
      kycAttempts: 1,
      kycDeclineReason: "document_unreadable",
      kycSessionToken: "tok_live",
      kycSessionUrl: "https://verify.example/s/1",
    });
    const before = { ...row };
    await svc(prisma, {}).recordHeldVerifiedId("sess_1", NUMBER);
    expect({ ...row, verifiedIdHash: null, verifiedIdNumber: null }).toEqual(before);
  });

  it("a replay is idempotent, and a later held result for the same undecided check replaces the earlier read", async () => {
    const { prisma, row } = rowPrisma();
    const s = svc(prisma, {});
    await s.recordHeldVerifiedId("sess_1", NUMBER);
    await s.recordHeldVerifiedId("sess_1", NUMBER);
    expect(row.verifiedIdHash).toBe(HASH);
    // No decision has spoken for this check yet, so the latest read is the one the reviewer sees and
    // a hand approval adopts.
    await s.recordHeldVerifiedId("sess_1", OTHER);
    expect(row.verifiedIdHash).toBe(pii.hashId(OTHER));
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

describe("RiderService.adminSetKyc — D-75: a hand approval settles the national ID", () => {
  // D-75 follow-up: an approval by hand (an admin's, and so every approval in manual mode) adopts the
  // number the ID check verified, as the verified webhook does. Shared harness: a pending rider whose
  // account has NO national ID on file (every new rider since D-75) and whose ID check verified NUMBER,
  // stored by the webhook encrypted (D-70) with its hash (IR26-04). Overrides:
  //  - `onFile`: the national ID hash already on the profile;
  //  - `vendorHash` / `vendorNumber`: what the webhook stored (null: nothing);
  //  - `liveProfiles` / `liveRiders` / `erasedProfiles`: OTHER accounts carrying the number, on a live
  //    profile, as a live rider's vendor-verified hash, or on an erased tombstone;
  //  - `adoptCount` / `onFileAfter`: the adoption CAS's row count, and what a re-read then finds;
  //  - `adoptP2002` / `decisionP2002`: the adoption write, or the decision write, hits a unique index;
  //  - `lockedRead`: what the row-locked read returns when the ID facts moved after the first read.
  // `rec.calls` orders the reads, locks and writes; `rec.counts` keeps every collision count's `where`.
  const NUMBER = "63123456A42";
  const HASH = pii.hashId(NUMBER);
  const OTHER = pii.hashId("63-999999-Z-99");
  const VENDOR_CIPHERTEXT = pii.encryptId(NUMBER);

  type Row = {
    profileId: string;
    kycAttempts: number;
    kycStatus: string;
    kycResolvedAt: Date | null;
    verifiedIdHash: string | null;
    verifiedIdNumber: string | null;
    profile: { idNumberHash: string | null };
  };

  const p2002 = () =>
    new Prisma.PrismaClientKnownRequestError("Unique constraint failed on the fields: (`id_number_hash`)", {
      code: "P2002",
      clientVersion: "test",
    });

  function approvalPrisma(
    over: {
      onFile?: string | null;
      vendorHash?: string | null;
      vendorNumber?: string | null;
      liveProfiles?: number;
      liveRiders?: number;
      erasedProfiles?: number;
      adoptCount?: number;
      onFileAfter?: string | null;
      adoptP2002?: boolean;
      decisionP2002?: boolean;
      lockedRead?: Partial<Row>;
    } = {},
  ) {
    const first: Row = {
      profileId: "p1",
      kycAttempts: 0,
      kycStatus: "pending",
      kycResolvedAt: null,
      verifiedIdHash: over.vendorHash === undefined ? HASH : over.vendorHash,
      verifiedIdNumber: over.vendorNumber === undefined ? VENDOR_CIPHERTEXT : over.vendorNumber,
      profile: { idNumberHash: over.onFile ?? null },
    };
    const rec: {
      data?: Record<string, unknown>;
      audit?: Record<string, unknown>;
      adopt: { where: Record<string, unknown>; data: Record<string, unknown> }[];
      counts: { model: string; where: Record<string, unknown> }[];
      raw: { sql: string; values: unknown[] }[];
      calls: string[];
      transactions: number;
    } = { adopt: [], counts: [], raw: [], calls: [], transactions: 0 };
    const prisma: Record<string, unknown> = {
      $transaction: async (fn: (tx: unknown) => Promise<unknown>) => {
        rec.transactions += 1;
        return fn(prisma);
      },
      $executeRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
        const sql = strings.join("?");
        rec.raw.push({ sql, values });
        rec.calls.push(sql.includes("pg_advisory_xact_lock") ? "advisory" : "row-lock");
        return 1;
      },
      rider: {
        findUnique: async () => {
          const locked = rec.calls.includes("row-lock");
          rec.calls.push(locked ? "locked-read" : "first-read");
          return locked ? { ...first, ...over.lockedRead } : first;
        },
        update: async (args: { data: Record<string, unknown> }) => {
          rec.calls.push("decision");
          if (over.decisionP2002) throw p2002();
          rec.data = args.data;
          return { kycAttempts: 0 };
        },
        count: async (args: { where: Record<string, unknown> }) => {
          rec.counts.push({ model: "rider", where: args.where });
          return over.liveRiders ?? 0;
        },
      },
      profile: {
        // A live-scoped count carries the `NOT erased:` filter; an unscoped one also sees tombstones.
        count: async (args: { where: Record<string, unknown> }) => {
          rec.counts.push({ model: "profile", where: args.where });
          const live = over.liveProfiles ?? 0;
          return "NOT" in args.where ? live : live + (over.erasedProfiles ?? 0);
        },
        updateMany: async (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
          rec.calls.push("adopt");
          rec.adopt.push(args);
          if (over.adoptP2002) throw p2002();
          return { count: over.adoptCount ?? 1 };
        },
        findUnique: async () => ({ idNumberHash: over.onFileAfter ?? null }),
      },
      auditLog: {
        create: async (args: { data: Record<string, unknown> }) => {
          rec.calls.push("audit");
          rec.audit = args.data;
          return {};
        },
      },
    };
    return { prisma, rec };
  }

  const approve = (prisma: Record<string, unknown>) => svc(prisma, {}).adminSetKyc("p1", "verified", null, "alice@corp.com");

  /** The rejection of an approval that must be refused; an approval that goes through fails the test. */
  const refusal = (p: Promise<unknown>) =>
    p.then(
      () => {
        throw new Error("expected the approval to be refused");
      },
      (e: unknown) => e,
    );

  const reasonOf = (e: unknown) => ((e as ConflictException).getResponse() as { reason?: string }).reason;

  it("D-75: with no national ID on file, approving adopts the number the ID check verified, and verifies", async () => {
    const { prisma, rec } = approvalPrisma();
    const res = await approve(prisma);
    expect(res).toMatchObject({ profileId: "p1", kycStatus: "verified", locked: false });
    expect(rec.data).toMatchObject({ kycStatus: "verified", idVerified: true, duplicateIdFlag: false });
    // A CAS that only fills an EMPTY slot, with a typed ID's normalisation, encryption and hash.
    expect(rec.adopt).toHaveLength(1);
    expect(rec.adopt[0]!.where).toEqual({ id: "p1", idNumberHash: null });
    expect(rec.adopt[0]!.data.idNumberHash).toBe(HASH);
    const stored = rec.adopt[0]!.data.idNumber as string;
    expect(stored.startsWith("v1:")).toBe(true);
    expect(stored).not.toContain(NUMBER);
    expect(pii.decryptId(stored)).toBe(NUMBER);
    // Encrypted afresh (a new IV), never the rider row's ciphertext copied across.
    expect(stored).not.toBe(VENDOR_CIPHERTEXT);
    // An adoption is an ordinary approval in the audit trail: no flag.
    expect(rec.audit).toMatchObject({ actor: "alice@corp.com", action: "rider.kyc_approve", target: "p1", reasonCode: null });
  });

  it("D-75: the approval takes the number's advisory lock before the row lock, and adopts before the decision, in one transaction", async () => {
    const { prisma, rec } = approvalPrisma();
    await approve(prisma);
    expect(rec.transactions).toBe(1);
    expect(rec.calls).toEqual(["first-read", "advisory", "row-lock", "locked-read", "adopt", "decision", "audit"]);
    // The number's lock, keyed exactly like the webhook's and the ID-writing routes' (hashtext of the hash).
    expect(rec.raw[0]!.sql).toContain("pg_advisory_xact_lock(hashtext(");
    expect(rec.raw[0]!.values).toEqual([HASH]);
  });

  it("D-75: refuses with a 409 when the number is on another LIVE account's profile — nothing adopted, nothing approved, no audit row", async () => {
    const { prisma, rec } = approvalPrisma({ liveProfiles: 1 });
    const e = await refusal(approve(prisma));
    expect(e).toBeInstanceOf(ConflictException);
    expect((e as ConflictException).getResponse()).toMatchObject({
      reason: "verified_id_in_use",
      message: expect.stringContaining("already on another live account"),
    });
    expect(rec.adopt).toHaveLength(0);
    expect(rec.data).toBeUndefined();
    expect(rec.audit).toBeUndefined();
  });

  it("D-75: refuses when another live rider's ID check verified the same number (the vendor-hash axis)", async () => {
    const { prisma, rec } = approvalPrisma({ liveRiders: 1 });
    expect(reasonOf(await refusal(approve(prisma)))).toBe("verified_id_in_use");
    expect(rec.adopt).toHaveLength(0);
    expect(rec.data).toBeUndefined();
  });

  it("D-75: an erased tombstone carrying the number doesn't refuse (a returning user): adopted, with the A-04 reviewer flag set", async () => {
    const { prisma, rec } = approvalPrisma({ erasedProfiles: 1 });
    await approve(prisma);
    expect(rec.adopt).toHaveLength(1);
    // IR26-03 parity: the ID write recomputes duplicateIdFlag, so a later auto-verify is held (DOC-16-05).
    expect(rec.data).toMatchObject({ kycStatus: "verified", duplicateIdFlag: true });
    // The refusal counted LIVE accounts only, on both axes: erased:<id> tombstones were left out.
    const live = { NOT: { phone: { startsWith: "erased:" } } };
    expect(rec.counts).toEqual(
      expect.arrayContaining([
        { model: "profile", where: { idNumberHash: HASH, id: { not: "p1" }, ...live } },
        { model: "rider", where: { verifiedIdHash: HASH, profileId: { not: "p1" }, profile: live } },
      ]),
    );
  });

  it("D-75: the live-ID unique index refusing the adoption is the same 409, not a 500", async () => {
    // A writer that skipped the advisory lock claimed the number between the count and the write.
    const { prisma, rec } = approvalPrisma({ adoptP2002: true });
    expect(reasonOf(await refusal(approve(prisma)))).toBe("verified_id_in_use");
    expect(rec.adopt).toHaveLength(1);
    expect(rec.data).toBeUndefined();
  });

  it("D-75: a P2002 that did NOT come from an adoption still propagates", async () => {
    const { prisma } = approvalPrisma({ onFile: HASH, decisionP2002: true });
    const e = await refusal(approve(prisma));
    expect(e).toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
    expect(e).not.toBeInstanceOf(ConflictException);
  });

  it("D-75: no national ID and no vendor number (manual mode, or a decision that carried none): approved, audit-flagged verified_id_missing", async () => {
    const { prisma, rec } = approvalPrisma({ vendorHash: null, vendorNumber: null });
    await approve(prisma);
    expect(rec.data).toMatchObject({ kycStatus: "verified", idVerified: true });
    expect(rec.data).not.toHaveProperty("duplicateIdFlag");
    expect(rec.audit).toMatchObject({ action: "rider.kyc_approve", reasonCode: "verified_id_missing" });
    expect(rec.adopt).toHaveLength(0);
    // No number: no lock to take and nothing to count.
    expect(rec.calls).not.toContain("advisory");
    expect(rec.counts).toHaveLength(0);
  });

  it("D-75: a vendor hash whose number is gone (scrubbed, or pre-D-70) still refuses a live collision, and otherwise approves flagged verified_id_missing", async () => {
    const colliding = approvalPrisma({ vendorNumber: null, liveProfiles: 1 });
    expect(reasonOf(await refusal(approve(colliding.prisma)))).toBe("verified_id_in_use");
    const clean = approvalPrisma({ vendorNumber: null });
    await approve(clean.prisma);
    expect(clean.rec.data).toMatchObject({ kycStatus: "verified" });
    expect(clean.rec.adopt).toHaveLength(0);
    expect(clean.rec.audit).toMatchObject({ reasonCode: "verified_id_missing" });
  });

  it("D-75: an account that already has a national ID is approved exactly as before: no lock, no count, no adoption, no flag", async () => {
    // Even one that disagrees with the check (IR26-04): the review screen flags that and the reviewer decides.
    const { prisma, rec } = approvalPrisma({ onFile: OTHER });
    await approve(prisma);
    expect(rec.data).toMatchObject({ kycStatus: "verified", idVerified: true });
    expect(rec.data).not.toHaveProperty("duplicateIdFlag");
    expect(rec.calls).toEqual(["first-read", "row-lock", "locked-read", "decision", "audit"]);
    expect(rec.counts).toHaveLength(0);
    expect(rec.audit).toMatchObject({ reasonCode: null });
  });

  it("D-75: a DIFFERENT national ID landing on the account during the approval (lost CAS) refuses as review_stale", async () => {
    const { prisma, rec } = approvalPrisma({ adoptCount: 0, onFileAfter: OTHER });
    const e = await refusal(approve(prisma));
    expect((e as ConflictException).getResponse()).toMatchObject({
      reason: "review_stale",
      message: expect.stringContaining("Reload the page"),
    });
    expect(rec.data).toBeUndefined();
    expect(rec.audit).toBeUndefined();
  });

  it("D-75: the SAME number landing during the approval (lost CAS) still approves, as an ID already on file", async () => {
    const { prisma, rec } = approvalPrisma({ adoptCount: 0, onFileAfter: HASH });
    await approve(prisma);
    expect(rec.data).toMatchObject({ kycStatus: "verified" });
    expect(rec.data).not.toHaveProperty("duplicateIdFlag");
    expect(rec.audit).toMatchObject({ reasonCode: null });
  });

  it("D-75: ID facts that moved between the read that took the lock and the locked read refuse as review_stale", async () => {
    // A new decision with a different number landed: the lock held is not that number's.
    const moved = approvalPrisma({ lockedRead: { verifiedIdHash: OTHER } });
    expect(reasonOf(await refusal(approve(moved.prisma)))).toBe("review_stale");
    expect(moved.rec.adopt).toHaveLength(0);
    // A decision with a number landed where there was none: nothing was locked for it.
    const appeared = approvalPrisma({ vendorHash: null, vendorNumber: null, lockedRead: { verifiedIdHash: HASH, verifiedIdNumber: VENDOR_CIPHERTEXT } });
    expect(reasonOf(await refusal(approve(appeared.prisma)))).toBe("review_stale");
    // A national ID that isn't the locked number landed on the account: a mismatch the reviewer hasn't seen.
    const landed = approvalPrisma({ lockedRead: { profile: { idNumberHash: OTHER } } });
    expect(reasonOf(await refusal(approve(landed.prisma)))).toBe("review_stale");
    // The locked number itself landing is fine: approved as an ID on file.
    const same = approvalPrisma({ lockedRead: { profile: { idNumberHash: HASH } } });
    await approve(same.prisma);
    expect(same.rec.data).toMatchObject({ kycStatus: "verified" });
    expect(same.rec.adopt).toHaveLength(0);
  });

  it("D-75: never adopts a stored number that doesn't match its hash (fails closed)", async () => {
    const { prisma, rec } = approvalPrisma({ vendorNumber: pii.encryptId("63-999999-Z-99") });
    expect(await refusal(approve(prisma))).toBeInstanceOf(InternalServerErrorException);
    expect(rec.adopt).toHaveLength(0);
    expect(rec.data).toBeUndefined();
  });

  it("D-75: decline, expire and reset never lock, count or adopt", async () => {
    for (const status of ["failed", "expired", "pending"] as const) {
      const { prisma, rec } = approvalPrisma();
      await svc(prisma, {}).adminSetKyc("p1", status, status === "failed" ? "face_mismatch" : null, "alice@corp.com");
      expect(rec.calls).toEqual(["row-lock", "locked-read", "decision", "audit"]);
      expect(rec.counts).toHaveLength(0);
      expect(rec.adopt).toHaveLength(0);
      expect(rec.audit?.reasonCode).toBe(status === "failed" ? "face_mismatch" : null);
    }
  });
});

/**
 * Startup review 2026-10-06 — the rider ID-check fixes on the server side.
 *
 * R-1: "Finish verifying" resumed a session the vendor had already declared dead (Abandoned / Expired),
 *      forever: the web lanes can't see expiry, so the client never sends `force`. The server can.
 * R-3: a check held for a human read as in flight; a held rider's retry could buy a fresh paid session.
 * R-4: the shared pending-state cache is invalidated / primed whenever the session's state moves.
 * R-10: a double-tap race's P2002 now carries the same `already_rider` reason as the pre-check.
 */
describe("RiderService — ID-check session lifecycle (startup review 2026-10-06)", () => {
  const LIVE = {
    kycStatus: "pending",
    kycAttempts: 0,
    kycRef: "sess_old",
    kycSessionToken: "tok_old",
    kycSessionUrl: "https://verify.didit.me/sess_old",
    kycForcedAt: null,
  };
  type States = import("../kyc/kyc-pending-state.service").KycPendingStateService;
  /** A fake of the shared cache: scripted class for `read`, and a log of every read / invalidate / prime. */
  function fakeStates(cls: "in_flight" | "unfinished" | "held" | "dead" = "unfinished") {
    const log: string[] = [];
    const states = {
      read: vi.fn(async (ref: string) => {
        log.push(`read:${ref}`);
        return cls;
      }),
      invalidate: vi.fn((ref: string) => {
        log.push(`invalidate:${ref}`);
      }),
      prime: vi.fn((ref: string, status: string) => {
        log.push(`prime:${ref}:${status}`);
      }),
    };
    return { states: states as unknown as States, log };
  }
  function withStates(prisma: Record<string, unknown>, vendor: KycVendor, states: States) {
    if (!prisma.$transaction) {
      prisma.$transaction = async (arg: unknown) => (typeof arg === "function" ? (arg as (tx: unknown) => unknown)(prisma) : arg);
    }
    if (!prisma.$executeRaw) prisma.$executeRaw = async () => 1;
    return new RiderService(
      prisma as unknown as PrismaService,
      { KYC_MODE: "auto", KYC_PROVIDER: "didit" } as Env,
      vendor,
      pii,
      trackingStub,
      gatewayStub,
      notificationsStub,
      undefined,
      states,
    );
  }
  const minting = () => {
    const submit = vi.fn(async () => ({ ref: "sess_new", status: "pending" as const, url: "https://verify.didit.me/sess_new", token: "tok_new" }));
    return { vendor: { submit } as KycVendor, submit };
  };
  type Write = { where: Record<string, unknown>; data: Record<string, unknown> };

  it("R-1: a session the WEBHOOK reported dead is not resumed — the credential is retired and a fresh one minted", async () => {
    const { vendor, submit } = minting();
    const writes: Write[] = [];
    const prisma = {
      rider: {
        findUnique: async () => ({ ...LIVE, kycVendorStatus: "Expired" }),
        updateMany: async (args: Write) => {
          writes.push(args);
          return { count: 1 };
        },
      },
    };
    const res = await withStates(prisma, vendor, fakeStates("in_flight").states).retryKyc("p1");
    expect(res).toMatchObject({ verificationUrl: "https://verify.didit.me/sess_new", sessionToken: "tok_new" });
    expect(submit).toHaveBeenCalledTimes(1);
    // First the CAS that retires exactly the credential we read, then the rotation.
    expect(writes[0]).toEqual({
      where: { profileId: "p1", kycStatus: "pending", kycRef: "sess_old", kycSessionToken: "tok_old" },
      data: { kycSessionToken: null, kycSessionUrl: null },
    });
    expect(writes[1]?.data).toMatchObject({ kycRef: "sess_new", kycSessionToken: "tok_new", kycVendorStatus: null, kycVendorStatusAt: null });
  });

  it("R-1: with no webhook, ONE cached vendor read that says dead is enough to mint", async () => {
    const { vendor, submit } = minting();
    const { states, log } = fakeStates("dead");
    const prisma = { rider: { findUnique: async () => ({ ...LIVE, kycVendorStatus: null }), updateMany: async () => ({ count: 1 }) } };
    await withStates(prisma, vendor, states).retryKyc("p1");
    expect(submit).toHaveBeenCalledTimes(1);
    expect(log[0]).toBe("read:sess_old");
  });

  it("R-1: a webhook status that isn't dead still gets the read — a lost Expired webhook can't bring the loop back", async () => {
    const { vendor, submit } = minting();
    const prisma = { rider: { findUnique: async () => ({ ...LIVE, kycVendorStatus: "In Progress" }), updateMany: async () => ({ count: 1 }) } };
    await withStates(prisma, vendor, fakeStates("dead").states).retryKyc("p1");
    expect(submit).toHaveBeenCalledTimes(1);
  });

  it("R-1: a double tap on a dead session buys ONE session — the loser of the retire CAS gets a 409, never a vendor call", async () => {
    const { vendor, submit } = minting();
    const prisma = { rider: { findUnique: async () => ({ ...LIVE, kycVendorStatus: "Abandoned" }), updateMany: async () => ({ count: 0 }) } };
    await expect(withStates(prisma, vendor, fakeStates().states).retryKyc("p1")).rejects.toThrow(/just changed/i);
    expect(submit).not.toHaveBeenCalled();
  });

  it("a session the vendor still holds open is resumed for free, and its cached state dropped (R-4)", async () => {
    const { vendor, submit } = minting();
    const { states, log } = fakeStates("unfinished");
    const updateMany = vi.fn(async () => ({ count: 1 }));
    const prisma = { rider: { findUnique: async () => ({ ...LIVE, kycVendorStatus: null }), updateMany } };
    expect(await withStates(prisma, vendor, states).retryKyc("p1")).toMatchObject({
      sessionToken: "tok_old",
      verificationUrl: "https://verify.didit.me/sess_old",
    });
    expect(submit).not.toHaveBeenCalled();
    expect(updateMany).not.toHaveBeenCalled();
    expect(log).toEqual(["read:sess_old", "invalidate:sess_old"]);
  });

  it("R-3: a held check with no live session refuses a retry — never a paid mint for someone in review", async () => {
    for (const held of ["In Review", "Approved"]) {
      const { vendor, submit } = minting();
      const updateMany = vi.fn(async () => ({ count: 1 }));
      const noSession = { ...LIVE, kycSessionToken: null, kycSessionUrl: null };
      const prisma = { rider: { findUnique: async () => ({ ...noSession, kycVendorStatus: held }), updateMany } };
      let caught: unknown;
      try {
        await withStates(prisma, vendor, fakeStates().states).retryKyc("p1");
      } catch (e) {
        caught = e;
      }
      expect(caught).toBeInstanceOf(ConflictException);
      expect((caught as ConflictException).getResponse()).toMatchObject({ reason: "kyc_in_review" });
      expect(submit).not.toHaveBeenCalled();
      expect(updateMany).not.toHaveBeenCalled();
    }
  });

  it("R-3 + FS-11: a held check that kept its session resumes it for free (vendor read: not dead)", async () => {
    const { vendor, submit } = minting();
    const prisma = { rider: { findUnique: async () => ({ ...LIVE, kycVendorStatus: "Approved" }), updateMany: vi.fn() } };
    expect(await withStates(prisma, vendor, fakeStates("in_flight").states).retryKyc("p1")).toMatchObject({ sessionToken: "tok_old" });
    expect(submit).not.toHaveBeenCalled();
  });

  it("R-10: the double-tap race's P2002 carries `already_rider`, like the pre-check", async () => {
    const p2002 = new Prisma.PrismaClientKnownRequestError("unique", { code: "P2002", clientVersion: "x" });
    const prisma = {
      rider: { findUnique: async () => null, create: () => ({}) },
      profile: { update: () => ({}), findUnique: async () => ({ idNumberHash: null }), count: async () => 0 },
      $transaction: async () => {
        throw p2002;
      },
    };
    const s = svc(prisma, { KYC_MODE: "auto", KYC_PROVIDER: "didit" }, { submit: async () => ({ ref: "s", status: "pending", url: "https://x" }) });
    let caught: unknown;
    try {
      await s.becomeRider("p1", {});
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ConflictException);
    expect((caught as ConflictException).getResponse()).toMatchObject({ reason: "already_rider" });
  });

  describe("recordKycVendorStatus", () => {
    it("stores the status on the CURRENT undecided session, monotonic on the event time, and primes the cache", async () => {
      const writes: Write[] = [];
      const { states, log } = fakeStates();
      const prisma = {
        rider: {
          updateMany: async (a: Write) => {
            writes.push(a);
            return { count: 1 };
          },
        },
      };
      const at = new Date("2026-10-06T10:00:00Z");
      expect(await withStates(prisma, minting().vendor, states).recordKycVendorStatus("sess_1", "In Review", at)).toEqual({ updated: 1 });
      expect(writes[0]?.where).toEqual({ kycRef: "sess_1", kycStatus: "pending", OR: [{ kycVendorStatusAt: null }, { kycVendorStatusAt: { lt: at } }] });
      // A hold keeps its credentials (only the review is outstanding).
      expect(writes[0]?.data).toEqual({ kycVendorStatus: "In Review", kycVendorStatusAt: at });
      expect(log).toEqual(["prime:sess_1:In Review"]);
    });

    it("a DEAD session loses its credentials in the same write, so the next retry mints", async () => {
      for (const dead of ["Abandoned", "Expired", "Kyc Expired"]) {
        const writes: Write[] = [];
        const prisma = {
          rider: {
            updateMany: async (a: Write) => {
              writes.push(a);
              return { count: 1 };
            },
          },
        };
        await withStates(prisma, minting().vendor, fakeStates().states).recordKycVendorStatus("sess_1", dead, new Date());
        expect(writes[0]?.data).toMatchObject({ kycVendorStatus: dead, kycSessionToken: null, kycSessionUrl: null });
      }
    });

    it("a stale or foreign delivery (no row) primes nothing", async () => {
      const { states, log } = fakeStates();
      const prisma = { rider: { updateMany: async () => ({ count: 0 }) } };
      expect(await withStates(prisma, minting().vendor, states).recordKycVendorStatus("sess_x", "Expired", new Date())).toEqual({ updated: 0 });
      expect(log).toEqual([]);
    });
  });

  it("R-3: applyKycResult's hold for review records the vendor's Approved (read as held); a decision clears it", async () => {
    const run = async (flagged: boolean) => {
      const writes: Write[] = [];
      const { states, log } = fakeStates();
      const prisma = {
        rider: {
          updateMany: async (a: Write) => {
            writes.push(a);
            return { count: 1 };
          },
          findFirst: async () => ({ profileId: "p1", duplicateIdFlag: flagged, profile: { idNumberHash: pii.hashId("63-1-A") } }),
        },
        auditLog: { create: async () => ({}) },
      };
      const at = new Date("2026-10-06T10:00:00Z");
      await withStates(prisma, minting().vendor, states).applyKycResult("sess_1", "verified", at);
      return { data: writes[0]?.data, log, at };
    };
    const held = await run(true);
    expect(held.data).toMatchObject({ kycVendorStatus: "Approved", kycVendorStatusAt: held.at });
    expect(held.data).not.toHaveProperty("kycStatus");
    expect(held.log).toEqual(["invalidate:sess_1"]);
    const decided = await run(false);
    expect(decided.data).toMatchObject({ kycStatus: "verified", kycVendorStatus: null, kycVendorStatusAt: null });
  });

  it("R-3: an admin pending RESET clears the stored vendor status — the rider starts afresh, not on the review wall", async () => {
    const updates: Array<Record<string, unknown>> = [];
    const prisma = {
      rider: {
        findUnique: async () => ({
          profileId: "p1",
          kycAttempts: 0,
          kycStatus: "pending",
          kycResolvedAt: new Date(),
          verifiedIdHash: null,
          verifiedIdNumber: null,
          profile: { idNumberHash: null },
        }),
        update: async (a: { data: Record<string, unknown> }) => {
          updates.push(a.data);
          return { kycAttempts: 0 };
        },
      },
      auditLog: { create: async () => ({}) },
    };
    await svc(prisma, { KYC_MODE: "auto" }).adminSetKyc("p1", "pending", null, "ops@lynia");
    expect(updates[0]).toMatchObject({ kycStatus: "pending", kycVendorStatus: null, kycVendorStatusAt: null, kycSessionToken: null });
  });

  it("R-4: noteKycLaunched drops the cached state of a pending rider's session and changes nothing", async () => {
    const { states, log } = fakeStates();
    const updateMany = vi.fn();
    const prisma = { rider: { findUnique: async () => ({ kycRef: "sess_1", kycStatus: "pending" }), updateMany } };
    expect(await withStates(prisma, minting().vendor, states).noteKycLaunched("p1")).toEqual({ ok: true });
    expect(log).toEqual(["invalidate:sess_1"]);
    expect(updateMany).not.toHaveBeenCalled();
  });
});
