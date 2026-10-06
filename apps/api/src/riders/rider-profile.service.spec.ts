import "reflect-metadata";
import { describe, expect, it, vi } from "vitest";
import { RESERVED_AUDIT_ACTIONS } from "../admin/admin-audit.service";
import type { StorageAdapter } from "../adapters/storage/storage.interface";
import type { UploadVerifier } from "../adapters/storage/upload-verifier";
import { THROTTLE_KEY, type ThrottleOptions } from "../common/throttle.guard";
import type { PrismaService } from "../prisma/prisma.service";
import { RIDER_PROFILE_UPDATE_ACTION, RiderProfileService, UpdateRiderProfile } from "./rider-profile.service";
import { RidersController } from "./riders.controller";

function build(rider: { photoUrl: string | null; bikeReg: string | null } | null) {
  const updates: Array<Record<string, unknown>> = [];
  const audits: Array<Record<string, unknown>> = [];
  const prisma = {
    rider: {
      findUnique: vi.fn(async () => rider),
      update: vi.fn(async (a: { data: Record<string, unknown> }) => {
        updates.push(a.data);
        return {};
      }),
    },
    auditLog: {
      create: vi.fn(async (a: { data: Record<string, unknown> }) => {
        audits.push(a.data);
        return {};
      }),
    },
  } as Record<string, unknown>;
  prisma.$transaction = async (cb: (tx: unknown) => unknown) => cb(prisma);
  const verify = vi.fn(async () => ({ size: 1, contentType: "image/jpeg" }));
  const deleteObject = vi.fn(async () => {});
  const svc = new RiderProfileService(
    prisma as unknown as PrismaService,
    { verify } as unknown as UploadVerifier,
    { deleteObject } as unknown as StorageAdapter,
  );
  return { svc, updates, audits, verify, deleteObject };
}

describe("UpdateRiderProfile (PATCH /riders/me body, D-79)", () => {
  it("validates the plate like become does and stores it upper-case with single spaces", () => {
    expect(UpdateRiderProfile.parse({ bikeReg: "  aee   4471 " })).toEqual({ bikeReg: "AEE 4471" });
    expect(UpdateRiderProfile.safeParse({ bikeReg: "ab" }).success).toBe(false);
    expect(UpdateRiderProfile.safeParse({ bikeReg: "x".repeat(21) }).success).toBe(false);
  });

  it("needs at least one field and refuses unknown ones", () => {
    expect(UpdateRiderProfile.safeParse({}).success).toBe(false);
    expect(UpdateRiderProfile.safeParse({ bikeReg: "AEE 4471", kycStatus: "verified" }).success).toBe(false);
    expect(UpdateRiderProfile.safeParse({ photoUrl: "kyc/r1/a.jpg" }).success).toBe(true);
  });
});

describe("RiderProfileService.updateProfile (D-79)", () => {
  it("404s for a caller who isn't a rider", async () => {
    const { svc } = build(null);
    await expect(svc.updateProfile("r1", { bikeReg: "AEE 4471" })).rejects.toThrow(/not a rider/i);
  });

  it("refuses a photo key outside the caller's own KYC namespace, before verifying (a rejection deletes)", async () => {
    const { svc, verify, updates } = build({ photoUrl: null, bikeReg: null });
    await expect(svc.updateProfile("r1", { photoUrl: "kyc/someone-else/a.jpg" })).rejects.toThrow(/invalid photo key/i);
    expect(verify).not.toHaveBeenCalled();
    expect(updates).toEqual([]);
  });

  it("adds a first photo: verified, stored, audited", async () => {
    const { svc, verify, updates, audits, deleteObject } = build({ photoUrl: null, bikeReg: null });
    expect(await svc.updateProfile("r1", { photoUrl: "kyc/r1/a.jpg" })).toEqual({ hasPhoto: true, bikeReg: null });
    expect(verify).toHaveBeenCalledWith("kyc/r1/a.jpg", "kyc");
    expect(updates).toEqual([{ photoUrl: "kyc/r1/a.jpg" }]);
    expect(audits).toEqual([expect.objectContaining({ actor: "r1", action: RIDER_PROFILE_UPDATE_ACTION, target: "r1", reasonCode: "photo", note: null })]);
    expect(deleteObject).not.toHaveBeenCalled();
  });

  it("changing the photo removes the replaced object after the write", async () => {
    const { svc, deleteObject } = build({ photoUrl: "kyc/r1/old.jpg", bikeReg: null });
    await svc.updateProfile("r1", { photoUrl: "kyc/r1/new.jpg" });
    expect(deleteObject).toHaveBeenCalledWith("kyc/r1/old.jpg");
  });

  it("a failed verify refuses the attach and writes nothing", async () => {
    const { svc, verify, updates } = build({ photoUrl: null, bikeReg: null });
    verify.mockRejectedValueOnce(new Error("upload_bad_type"));
    await expect(svc.updateProfile("r1", { photoUrl: "kyc/r1/a.jpg" })).rejects.toThrow("upload_bad_type");
    expect(updates).toEqual([]);
  });

  it("adds or edits the plate with the old and new value in the audit note", async () => {
    const { svc, updates, audits } = build({ photoUrl: "kyc/r1/a.jpg", bikeReg: "AEE 4471" });
    expect(await svc.updateProfile("r1", { bikeReg: "AFG 2231" })).toEqual({ hasPhoto: true, bikeReg: "AFG 2231" });
    expect(updates).toEqual([{ bikeReg: "AFG 2231" }]);
    expect(audits[0]).toMatchObject({ reasonCode: "bike_reg", note: "bike_reg: AEE 4471 → AFG 2231" });
  });

  it("re-sending the same values writes nothing and logs nothing", async () => {
    const { svc, updates, audits } = build({ photoUrl: null, bikeReg: "AEE 4471" });
    expect(await svc.updateProfile("r1", { bikeReg: "AEE 4471" })).toEqual({ hasPhoto: false, bikeReg: "AEE 4471" });
    expect(updates).toEqual([]);
    expect(audits).toEqual([]);
  });

  it("the audit action is reserved so the free-text audit route can't forge it", () => {
    expect(RESERVED_AUDIT_ACTIONS.has(RIDER_PROFILE_UPDATE_ACTION)).toBe(true);
  });
});

describe("PATCH /riders/me route", () => {
  it("carries its own throttle", () => {
    const opts = Reflect.getMetadata(THROTTLE_KEY, RidersController.prototype.updateMe as object) as ThrottleOptions | undefined;
    expect(opts?.keyPrefix).toBe("rider-me");
  });
});
