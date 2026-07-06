import { describe, expect, it } from "vitest";
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
  it("blocks pending and failed riders", () => {
    expect(canGoOnline("pending")).toBe(false);
    expect(canGoOnline("failed")).toBe(false);
  });
});

function svc(prisma: Partial<Record<string, unknown>>, env: Partial<Env>, vendor: KycVendor = new StubKycVendor()) {
  return new RiderService(prisma as unknown as PrismaService, env as Env, vendor, pii);
}

describe("RiderService.becomeRider", () => {
  it("409s if already registered as a rider", async () => {
    const s = svc({ rider: { findUnique: async () => ({ profileId: "p1" }) } }, { KYC_MODE: "auto" });
    await expect(s.becomeRider("p1", { bikeReg: "ABZ 1", photoUrl: "kyc/p1/photo.jpg" })).rejects.toThrow(/already registered/i);
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
      profile: { update: async () => ({}), findUnique: async () => ({ idNumber: "63-1-A" }), count: async () => 0 },
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
      profile: { update: async () => ({}), findUnique: async () => ({ idNumber: "63-1-A" }), count: async () => 0 },
      $transaction: async (ops: unknown[]) => ops,
    };
    const s = svc(prisma, { KYC_MODE: "auto", KYC_PROVIDER: "stub" }, new StubKycVendor());
    const res = await s.becomeRider("p1", { bikeReg: "ABZ 1", photoUrl: "kyc/p1/photo.jpg" });
    expect(res.kycStatus).toBe("verified");
    // A unique ID → not flagged.
    expect(created).toMatchObject({ kycStatus: "verified", idVerified: true, duplicateIdFlag: false });
  });

  it("flags (does not reject) a rider whose national ID already sits on another account (A-04)", async () => {
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
        // Another account already carries this ID — matched on the HMAC hash, not the raw number.
        count: async (args: { where: Record<string, unknown> }) => {
          expect(args.where).toMatchObject({ idNumberHash: pii.hashId("63-123456-A-42"), id: { not: "p1" } });
          return 1;
        },
      },
      $transaction: async (ops: unknown[]) => ops,
    };
    const s = svc(prisma, { KYC_MODE: "auto", KYC_PROVIDER: "stub" }, new StubKycVendor());
    const res = await s.becomeRider("p1", { bikeReg: "ABZ 1", photoUrl: "kyc/p1/photo.jpg" });
    // Onboarding still succeeds — flag, don't block.
    expect(res.kycStatus).toBe("verified");
    expect(created).toMatchObject({ duplicateIdFlag: true });
  });

  it("does not flag when the account has no national ID yet (A-04)", async () => {
    let created: Record<string, unknown> | undefined;
    let counted = false;
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
        findUnique: async () => ({ idNumber: null }),
        count: async () => {
          counted = true;
          return 0;
        },
      },
      $transaction: async (ops: unknown[]) => ops,
    };
    const s = svc(prisma, { KYC_MODE: "auto", KYC_PROVIDER: "stub" }, new StubKycVendor());
    await s.becomeRider("p1", { bikeReg: "ABZ 1", photoUrl: "kyc/p1/photo.jpg" });
    // No ID → nothing to collide on; the count query is skipped entirely.
    expect(counted).toBe(false);
    expect(created).toMatchObject({ duplicateIdFlag: false });
  });

  it("manual mode skips the vendor and returns no url", async () => {
    const vendor: KycVendor = {
      submit: async () => { throw new Error("vendor must not be called in manual mode"); },
    };
    const prisma = {
      rider: { findUnique: async () => null, create: async () => ({}) },
      profile: { update: async () => ({}), findUnique: async () => ({ idNumber: "63-1-A" }), count: async () => 0 },
      $transaction: async () => [],
    };
    const s = svc(prisma, { KYC_MODE: "manual" }, vendor);
    const res = await s.becomeRider("p1", { bikeReg: "ABZ 1", photoUrl: "kyc/p1/photo.jpg" });
    expect(res).toEqual({ kycStatus: "pending", mode: "manual", verificationUrl: undefined });
  });

  it("surfaces a vendor outage as a 503 and creates no rider row", async () => {
    let created = false;
    const vendor: KycVendor = { submit: async () => { throw new Error("didit 502"); } };
    const prisma = {
      rider: { findUnique: async () => null, create: async () => { created = true; return {}; } },
      profile: { update: async () => ({}), findUnique: async () => ({ idNumber: "63-1-A" }), count: async () => 0 },
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

  it("writes the profile and succeeds even when the ID is a duplicate (flag, never block)", async () => {
    let updated: Record<string, unknown> | undefined;
    const prisma = {
      profile: {
        update: async (args: { data: Record<string, unknown> }) => {
          updated = args.data;
          return {};
        },
        count: async (args: { where: Record<string, unknown> }) => {
          expect(args.where).toMatchObject({ idNumberHash: pii.hashId("63-123456-A-42"), id: { not: "p1" } });
          return 2;
        },
      },
    };
    const s = svc(prisma, { KYC_MODE: "auto" });
    expect(await s.completeProfile("p1", data)).toEqual({ ok: true });
    // The raw ID is never written: id_number is ciphertext, plus the dedup hash.
    expect(updated).toMatchObject({ firstName: "Chipo", lastName: "M", idNumberHash: pii.hashId("63-123456-A-42") });
    expect(pii.isEncrypted(updated?.idNumber as string)).toBe(true);
    expect(pii.decryptId(updated?.idNumber as string)).toBe("63-123456-A-42");
  });

  it("does not run the collision query when the ID is unique", async () => {
    let counted = false;
    const prisma = {
      profile: {
        update: async () => ({}),
        count: async () => {
          counted = true;
          return 0;
        },
      },
    };
    const s = svc(prisma, { KYC_MODE: "auto" });
    expect(await s.completeProfile("p1", data)).toEqual({ ok: true });
    expect(counted).toBe(true);
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
    const prisma = {
      rider: {
        findUnique: async () => ({ kycStatus: "failed" }),
        update: async (args: { data: Record<string, unknown> }) => {
          data = args.data;
          return {};
        },
      },
    };
    const s = svc(prisma, { KYC_MODE: "auto", KYC_PROVIDER: "didit" }, vendor);
    expect(await s.retryKyc("p1")).toEqual({ kycStatus: "pending", verificationUrl: "https://verify.didit.me/sess_new" });
    // New ref, reset to pending, and kycResolvedAt cleared so the fresh webhook resolves it.
    expect(data).toMatchObject({ kycStatus: "pending", idVerified: false, kycRef: "sess_new", kycResolvedAt: null });
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
        update: async () => ({}),
      },
    };
    const s = svc(prisma, { KYC_MODE: "auto", KYC_PROVIDER: "didit" }, vendor);
    expect(await s.retryKyc("p1")).toEqual({ kycStatus: "pending", verificationUrl: "https://verify.didit.me/sess_2" });
  });

  it("leaves a manual-mode rider pending without calling the vendor", async () => {
    const vendor: KycVendor = {
      submit: async () => {
        throw new Error("vendor must not be called in manual mode");
      },
    };
    const s = svc({ rider: { findUnique: async () => ({ kycStatus: "failed" }) } }, { KYC_MODE: "manual" }, vendor);
    expect(await s.retryKyc("p1")).toEqual({ kycStatus: "pending" });
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

  it("lets a verified rider go online", async () => {
    let data: Record<string, unknown> | undefined;
    const prisma = {
      rider: {
        findUnique: async () => ({ kycStatus: "verified", accountStatus: "active", onHold: false }),
        update: async (args: { data: Record<string, unknown> }) => { data = args.data; return {}; },
      },
    };
    const s = svc(prisma, {});
    expect(await s.setOnline("p1", true)).toEqual({ online: true });
    expect(data).toMatchObject({ isOnline: true });
    expect(data!.lastHeartbeatAt).toBeInstanceOf(Date);
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
          update: async () => ({}),
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
        update: async () => ({}),
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

describe("onlineRefusalReason (pure online-gate, Q2)", () => {
  const base = { kycStatus: "verified", accountStatus: "active", onHold: false, cooldownUntil: null };
  it("returns null when every precondition passes", () => {
    expect(onlineRefusalReason(base)).toBeNull();
  });
  it("prioritises kyc → banned → suspended → on_hold → cooldown", () => {
    expect(onlineRefusalReason({ ...base, kycStatus: "pending" })).toBe("kyc");
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
      },
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
    const s = svc({ rider: { updateMany: async () => ({ count: 0 }) } }, {});
    expect(await s.applyKycResult("sess_x", "failed", new Date())).toEqual({ updated: 0 });
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
});
