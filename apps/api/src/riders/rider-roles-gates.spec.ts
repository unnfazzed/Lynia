import { describe, expect, it, vi } from "vitest";
import type { Env } from "../config/env";
import type { KycVendor } from "../kyc/kyc-vendor";
import { StubKycVendor } from "../kyc/kyc-vendor";
import { PiiCryptoService } from "../common/pii-crypto.service";
import { PrismaService } from "../prisma/prisma.service";
import { RiderService } from "./rider.service";
import { CompleteProfile } from "./riders.controller";

/**
 * Who may become a biker, and what the go-online writes re-check (rider roles + gates review,
 * 2026-10-12). Kept apart from rider.service.spec.ts so the KYC work landing there in parallel doesn't
 * collide with these.
 */

const pii = new PiiCryptoService({ PII_ENCRYPTION_KEY: "test-pii-key-0123456789abcdefghij" } as Env);
const trackingStub = {
  evictFromGeo: async () => {},
  claimNotifyWaitersNear: async () => [],
  clearNotifyWaiters: async () => {},
  recordFix: async () => {},
  hasNotifyWaiters: async () => false,
} as unknown as import("../tracking/tracking.service").TrackingService;
const notificationsStub = { notifyRidersAvailable: async () => new Set<string>(), notifyProfiles: async () => {} } as unknown as import("../notifications/notifications.service").NotificationsService;
const gatewayStub = { evictRiderFromSupply: async () => {} } as unknown as import("../tracking/tracking.gateway").TrackingGateway;

function svc(prisma: Record<string, unknown>, env: Partial<Env>, vendor: KycVendor = new StubKycVendor()) {
  if (!prisma.$transaction) {
    prisma.$transaction = async (arg: unknown) => (typeof arg === "function" ? (arg as (tx: unknown) => unknown)(prisma) : arg);
  }
  if (!prisma.$executeRaw) prisma.$executeRaw = async () => 1;
  return new RiderService(prisma as unknown as PrismaService, env as Env, vendor, pii, trackingStub, gatewayStub, notificationsStub);
}

// Harare CBD: going online needs a position inside the service area (FS-7).
const HARARE = { lat: -17.83, lng: 31.05 };
const responseOf = (e: unknown) => (e as { getResponse: () => Record<string, unknown> }).getResponse();
const statusOf = (e: unknown) => (e as { getStatus: () => number }).getStatus();

async function caught(p: Promise<unknown>): Promise<unknown> {
  try {
    await p;
  } catch (e) {
    return e;
  }
  throw new Error("expected a rejection");
}

describe("becomeRider — who may become a biker", () => {
  const prismaFor = (profile: { firstName: string; role: string }) => {
    const create = vi.fn(async () => ({}));
    const update = vi.fn(async () => ({}));
    return {
      create,
      update,
      prisma: {
        rider: { findUnique: async () => null, create },
        profile: { update, findUnique: async () => ({ ...profile, idNumberHash: null }), count: async () => 0 },
        $transaction: async (ops: unknown[]) => ops,
      } as Record<string, unknown>,
    };
  };

  it("refuses an ADMIN profile with 403 role_not_allowed — before any paid session or role flip", async () => {
    const submit = vi.fn(async () => ({ ref: "s", status: "pending" as const, url: "u" }));
    const { prisma, create, update } = prismaFor({ firstName: "Ops", role: "admin" });
    const e = await caught(svc(prisma, { KYC_MODE: "auto", KYC_PROVIDER: "didit" }, { submit }).becomeRider("p1", {}));
    expect(statusOf(e)).toBe(403);
    expect(responseOf(e)).toMatchObject({ reason: "role_not_allowed" });
    expect(submit).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });

  it("leaves a MERCHANT-role profile alone (merchant access reads memberships, not role)", async () => {
    const { prisma, create } = prismaFor({ firstName: "Chipo", role: "merchant" });
    await expect(svc(prisma, { KYC_MODE: "manual" }).becomeRider("p1", {})).resolves.toMatchObject({ kycStatus: "pending" });
    expect(create).toHaveBeenCalled();
  });

  it.each(["", "   "])("refuses a blank first name (%j) with 400 name_required — no paid session", async (firstName) => {
    const submit = vi.fn(async () => ({ ref: "s", status: "pending" as const, url: "u" }));
    const { prisma, create } = prismaFor({ firstName, role: "customer" });
    const e = await caught(svc(prisma, { KYC_MODE: "auto", KYC_PROVIDER: "didit" }, { submit }).becomeRider("p1", {}));
    expect(statusOf(e)).toBe(400);
    expect(responseOf(e)).toMatchObject({ reason: "name_required" });
    expect(typeof responseOf(e).message).toBe("string");
    expect(submit).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it("PATCH /riders/profile trims names, so whitespace is a blank name, not a valid one", () => {
    expect(CompleteProfile.safeParse({ firstName: "   ", lastName: "K", idNumber: "63-1-A" }).success).toBe(false);
    expect(CompleteProfile.parse({ firstName: "  Rudo ", lastName: " K ", idNumber: "63-1-A" })).toMatchObject({ firstName: "Rudo", lastName: "K" });
  });
});

describe("go-online writes re-check KYC and cooldown, not just account standing", () => {
  it("setOnline's CAS asserts kyc_status = 'verified' and no live cooldown", async () => {
    let sql = "";
    const prisma = {
      rider: { findUnique: async () => ({ kycStatus: "verified", accountStatus: "active", onHold: false, cooldownUntil: null, tripsCount: 0 }) },
      $executeRaw: async (strings: TemplateStringsArray) => {
        sql = strings.join("?");
        return 1;
      },
    };
    await svc(prisma, {}).setOnline("p1", true, HARARE);
    expect(sql).toContain("kyc_status = 'verified'");
    expect(sql).toContain("cooldown_until IS NULL OR cooldown_until <= now()");
  });

  it("a KYC lapse landing between the gate read and the write refuses with reason kyc_expired, never goes online", async () => {
    let reads = 0;
    const prisma = {
      rider: {
        findUnique: async () =>
          reads++ === 0
            ? { kycStatus: "verified", accountStatus: "active", onHold: false, cooldownUntil: null, tripsCount: 0 }
            : { kycStatus: "expired", accountStatus: "active", onHold: false, cooldownUntil: null },
      },
      $executeRaw: async () => 0, // the CAS now misses on kyc_status
    };
    const e = await caught(svc(prisma, {}).setOnline("p1", true, HARARE));
    expect(statusOf(e)).toBe(403);
    expect(responseOf(e)).toMatchObject({ reason: "kyc_expired" });
  });

  it("the heartbeat's guarded UPDATE carries the same KYC + cooldown predicate", async () => {
    let sql = "";
    const prisma = {
      rider: { findUnique: vi.fn() },
      $executeRaw: async (strings: TemplateStringsArray) => {
        sql = strings.join("?");
        return 1;
      },
    };
    await svc(prisma, {}).heartbeat("p1");
    expect(sql).toContain("kyc_status = 'verified'");
    expect(sql).toContain("cooldown_until IS NULL OR cooldown_until <= now()");
  });
});

describe("retryKyc refusals carry a reason code", () => {
  it("already verified → 409 { reason: already_verified, message }", async () => {
    const e = await caught(svc({ rider: { findUnique: async () => ({ kycStatus: "verified" }) } }, { KYC_MODE: "auto" }).retryKyc("p1"));
    expect(statusOf(e)).toBe(409);
    expect(responseOf(e)).toEqual({ reason: "already_verified", message: "Already verified" });
  });

  it("locked after two attempts → 403 { reason: kyc_locked, message }", async () => {
    const e = await caught(svc({ rider: { findUnique: async () => ({ kycStatus: "failed", kycAttempts: 2 }) } }, { KYC_MODE: "auto" }).retryKyc("p1"));
    expect(statusOf(e)).toBe(403);
    expect(responseOf(e)).toMatchObject({ reason: "kyc_locked" });
    expect(responseOf(e).message).toMatch(/locked after two attempts/);
  });
});
