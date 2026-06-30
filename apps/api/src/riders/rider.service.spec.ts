import { describe, expect, it } from "vitest";
import type { Env } from "../config/env";
import type { KycVendor } from "../kyc/kyc-vendor";
import { StubKycVendor } from "../kyc/kyc-vendor";
import { PrismaService } from "../prisma/prisma.service";
import { canGoOnline, RiderService } from "./rider.service";

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
  return new RiderService(prisma as unknown as PrismaService, env as Env, vendor);
}

describe("RiderService.becomeRider", () => {
  it("409s if already registered as a rider", async () => {
    const s = svc({ rider: { findUnique: async () => ({ profileId: "p1" }) } }, { KYC_MODE: "auto" });
    await expect(s.becomeRider("p1", { bikeReg: "ABZ 1", photoUrl: "x" })).rejects.toThrow(/already registered/i);
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
      profile: { update: async () => ({}) },
      $transaction: async () => [],
    };
    const s = svc(prisma, { KYC_MODE: "auto" }, vendor);
    const res = await s.becomeRider("p1", { bikeReg: "ABZ 1", photoUrl: "x" });
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
      profile: { update: async () => ({}) },
      $transaction: async (ops: unknown[]) => ops,
    };
    const s = svc(prisma, { KYC_MODE: "auto", KYC_PROVIDER: "stub" }, new StubKycVendor());
    const res = await s.becomeRider("p1", { bikeReg: "ABZ 1", photoUrl: "x" });
    expect(res.kycStatus).toBe("verified");
    expect(created).toMatchObject({ kycStatus: "verified", idVerified: true });
  });

  it("manual mode skips the vendor and returns no url", async () => {
    const vendor: KycVendor = {
      submit: async () => { throw new Error("vendor must not be called in manual mode"); },
    };
    const prisma = {
      rider: { findUnique: async () => null, create: async () => ({}) },
      profile: { update: async () => ({}) },
      $transaction: async () => [],
    };
    const s = svc(prisma, { KYC_MODE: "manual" }, vendor);
    const res = await s.becomeRider("p1", { bikeReg: "ABZ 1", photoUrl: "x" });
    expect(res).toEqual({ kycStatus: "pending", mode: "manual", verificationUrl: undefined });
  });

  it("surfaces a vendor outage as a 503 and creates no rider row", async () => {
    let created = false;
    const vendor: KycVendor = { submit: async () => { throw new Error("didit 502"); } };
    const prisma = {
      rider: { findUnique: async () => null, create: async () => { created = true; return {}; } },
      profile: { update: async () => ({}) },
      $transaction: async (ops: unknown[]) => ops,
    };
    const s = svc(prisma, { KYC_MODE: "auto" }, vendor);
    await expect(s.becomeRider("p1", { bikeReg: "ABZ 1", photoUrl: "x" })).rejects.toThrow(
      /couldn't start id verification/i,
    );
    expect(created).toBe(false);
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
        findUnique: async () => ({ kycStatus: "verified" }),
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
    const s = svc({ rider: { findUnique: async () => ({ kycStatus: "verified", cooldownUntil: future }) } }, {});
    await expect(s.setOnline("p1", true)).rejects.toThrow(/cooldown/i);
  });

  it("allows going online once the cooldown has passed", async () => {
    const past = new Date(Date.now() - 60_000);
    const s = svc(
      { rider: { findUnique: async () => ({ kycStatus: "verified", cooldownUntil: past }), update: async () => ({}) } },
      {},
    );
    expect(await s.setOnline("p1", true)).toEqual({ online: true });
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

describe("RiderService.adminSetKyc", () => {
  it("404s for an unknown rider", async () => {
    const s = svc({ rider: { findUnique: async () => null } }, {});
    await expect(s.adminSetKyc("p1", "verified")).rejects.toThrow(/rider not found/i);
  });

  it("sets idVerified when the status is verified", async () => {
    let data: Record<string, unknown> | undefined;
    const prisma = {
      rider: {
        findUnique: async () => ({ profileId: "p1" }),
        update: async (args: { data: Record<string, unknown> }) => { data = args.data; return {}; },
      },
    };
    const s = svc(prisma, {});
    const res = await s.adminSetKyc("p1", "verified");
    expect(res).toEqual({ profileId: "p1", kycStatus: "verified" });
    expect(data).toMatchObject({ kycStatus: "verified", idVerified: true });
  });
});
