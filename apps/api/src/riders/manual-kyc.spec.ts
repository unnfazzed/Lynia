import "reflect-metadata";
import { describe, expect, it, vi } from "vitest";
import { KYC_DECLINE_CLASS, KYC_DECLINE_REASON_LABELS, KYC_PHOTO_RETAKE_REASONS } from "@lynia/shared";
import type { StorageAdapter } from "../adapters/storage/storage.interface";
import type { UploadVerifier } from "../adapters/storage/upload-verifier";
import type { OwnerAlertsService } from "../owner-alerts/owner-alerts.service";
import type { PrismaService } from "../prisma/prisma.service";
import { licenceExpired, onlineRefusalReason } from "./online-gate";
import { RiderProfileService, UpdateRiderProfile } from "./rider-profile.service";

/** D-122 (manual KYC, owner 2026-11-04): document photos, typed licence, the owner's Telegram alert. */
function build(rider: Record<string, unknown>, licenceHolders = 0) {
  const row: Record<string, unknown> = {
    photoUrl: null,
    bikeReg: null,
    plateStatus: "none",
    kycStatus: "pending",
    kycAttempts: 0,
    kycIdFrontKey: null,
    kycLicenceKey: null,
    kycSelfieIdKey: null,
    kycDocsAlertedAt: null,
    licenceNumber: null,
    licenceExpiresOn: null,
    profile: { firstName: "Tendai" },
    ...rider,
  };
  const prisma = {
    rider: {
      findUnique: vi.fn(async () => ({ ...row })),
      count: vi.fn(async () => licenceHolders),
      update: vi.fn(async (a: { data: Record<string, unknown> }) => Object.assign(row, a.data)),
    },
    auditLog: { create: vi.fn(async () => ({})) },
  } as Record<string, unknown>;
  prisma.$transaction = async (cb: (tx: unknown) => unknown) => cb(prisma);
  const verify = vi.fn(async () => ({ size: 1, contentType: "image/jpeg" }));
  const deleteObject = vi.fn(async () => {});
  const notify = vi.fn();
  const svc = new RiderProfileService(
    prisma as unknown as PrismaService,
    { verify } as unknown as UploadVerifier,
    { deleteObject } as unknown as StorageAdapter,
    { notify } as unknown as OwnerAlertsService,
  );
  return { svc, row, verify, deleteObject, notify, prisma };
}

describe("UpdateRiderProfile: D-122 fields", () => {
  it("accepts document keys, a licence number (normalized) and a real calendar date", () => {
    // D-135: spaces are dropped, so "ab 12345" and "AB12345" are one licence for the duplicate check.
    expect(UpdateRiderProfile.parse({ licenceNumber: "  ab  12345 " })).toEqual({ licenceNumber: "AB12345" });
    expect(UpdateRiderProfile.safeParse({ licenceNumber: " a b " }).success).toBe(false);
    expect(UpdateRiderProfile.safeParse({ licenceExpiresOn: "2027-02-28" }).success).toBe(true);
    expect(UpdateRiderProfile.safeParse({ licenceExpiresOn: "2027-02-31" }).success).toBe(false);
    expect(UpdateRiderProfile.safeParse({ idFrontKey: "kyc/r1/a.jpg" }).success).toBe(true);
  });
});

describe("RiderProfileService: D-122 documents", () => {
  it("refuses a document key outside the biker's own namespace before verifying it", async () => {
    const { svc, verify } = build({});
    await expect(svc.updateProfile("r1", { idFrontKey: "kyc/someone-else/a.jpg" })).rejects.toThrow(/invalid document key/i);
    expect(verify).not.toHaveBeenCalled();
  });

  it("stores each slot, reports presence only, and alerts the owner once when the set is complete", async () => {
    const { svc, row, notify } = build({});
    expect((await svc.updateProfile("r1", { idFrontKey: "kyc/r1/a.jpg" })).kycDocs).toEqual({ idFront: true, licence: false, selfieId: false });
    await svc.updateProfile("r1", { licenceKey: "kyc/r1/b.jpg" });
    expect(notify).not.toHaveBeenCalled();
    await svc.updateProfile("r1", { selfieIdKey: "kyc/r1/c.jpg" });
    expect(notify).toHaveBeenCalledTimes(1);
    expect(notify.mock.calls[0][0]).toContain("Biker docs ready");
    expect(row.kycDocsAlertedAt).toBeInstanceOf(Date);
    await svc.updateProfile("r1", { selfieIdKey: "kyc/r1/d.jpg" });
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it("deletes a replaced document photo after the write", async () => {
    const { svc, deleteObject } = build({ kycLicenceKey: "kyc/r1/old.jpg" });
    await svc.updateProfile("r1", { licenceKey: "kyc/r1/new.jpg" });
    expect(deleteObject).toHaveBeenCalledWith("kyc/r1/old.jpg");
  });

  it("a declined (not locked) biker who sends a complete set again goes back to pending", async () => {
    const { svc, row, notify } = build({ kycStatus: "failed", kycAttempts: 1, kycIdFrontKey: "kyc/r1/a.jpg", kycLicenceKey: "kyc/r1/b.jpg" });
    await svc.updateProfile("r1", { selfieIdKey: "kyc/r1/c.jpg" });
    expect(row.kycStatus).toBe("pending");
    expect(notify).toHaveBeenCalledTimes(1);
  });

  it("a locked biker (2 strikes) stays declined however many photos they send", async () => {
    const { svc, row } = build({ kycStatus: "failed", kycAttempts: 2, kycIdFrontKey: "kyc/r1/a.jpg", kycLicenceKey: "kyc/r1/b.jpg" });
    await svc.updateProfile("r1", { selfieIdKey: "kyc/r1/c.jpg" });
    expect(row.kycStatus).toBe("failed");
  });

  it("a new licence expiry re-arms the 30-day reminder", async () => {
    const { svc, row } = build({ licenceRemindedAt: new Date() });
    await svc.updateProfile("r1", { licenceExpiresOn: "2028-01-31" });
    expect(row.licenceExpiresOn).toEqual(new Date("2028-01-31T00:00:00Z"));
    expect(row.licenceRemindedAt).toBeNull();
  });
});

describe("online gate: D-122 licence expiry", () => {
  const ok = { kycStatus: "verified", accountStatus: "active", onHold: false, cooldownUntil: null };
  it("a licence is valid through its expiry day and refused from the next day", () => {
    const day = new Date("2026-11-04T00:00:00Z");
    expect(licenceExpired(day, new Date("2026-11-04T23:00:00Z"))).toBe(false);
    expect(licenceExpired(day, new Date("2026-11-05T00:01:00Z"))).toBe(true);
    expect(onlineRefusalReason({ ...ok, licenceExpiresOn: day }, new Date("2026-11-06T08:00:00Z"))).toBe("licence_expired");
    expect(onlineRefusalReason({ ...ok, licenceExpiresOn: null })).toBeNull();
  });
});

describe("decline reasons: D-122", () => {
  it("the three photo reasons are labelled, fixable and reopen their slots; id_unreadable still strikes for a human", () => {
    expect(KYC_DECLINE_REASON_LABELS.photos_unreadable).toBe("Photos unreadable");
    expect(KYC_DECLINE_CLASS.selfie_unclear).toBe("fixable");
    expect(KYC_PHOTO_RETAKE_REASONS.photos_unreadable).toEqual(["idFront", "licence", "selfieId"]);
    expect(KYC_PHOTO_RETAKE_REASONS.id_unreadable).toBeUndefined();
    expect(KYC_PHOTO_RETAKE_REASONS.face_mismatch).toBeUndefined();
  });

  // D-135 (Biker sign-up v1, K3-num-dup): one licence, one account.
  it("refuses a licence number another live account holds (409 licence_in_use) and writes nothing", async () => {
    const { svc, row, prisma } = build({}, 1);
    await expect(svc.updateProfile("r1", { licenceNumber: "AB12345" })).rejects.toMatchObject({ response: { reason: "licence_in_use" } });
    expect(row.licenceNumber).toBeNull();
    const where = ((prisma.rider as { count: { mock: { calls: [{ where: Record<string, unknown> }][] } } }).count.mock.calls[0][0]).where;
    expect(where).toMatchObject({ licenceNumber: "AB12345", profileId: { not: "r1" }, profile: { NOT: { phone: { startsWith: "erased:" } } } });
  });

  it("saves a licence number nobody else holds", async () => {
    const { svc, row } = build({}, 0);
    await svc.updateProfile("r1", { licenceNumber: "AB12345" });
    expect(row.licenceNumber).toBe("AB12345");
  });
});
