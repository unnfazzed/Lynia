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
  it("reports how many riders matched the kycRef", async () => {
    const s = svc({ rider: { updateMany: async () => ({ count: 1 }) } }, {});
    expect(await s.applyKycResult("sess_1", "verified")).toEqual({ updated: 1 });
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
