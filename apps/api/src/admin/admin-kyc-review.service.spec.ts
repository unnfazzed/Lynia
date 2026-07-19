import { describe, expect, it, vi } from "vitest";
import type { StorageAdapter } from "../adapters/storage/storage.interface";
import { PrismaService } from "../prisma/prisma.service";
import { PiiCryptoService } from "../common/pii-crypto.service";
import type { Env } from "../config/env";
import { AdminKycReviewService } from "./admin-kyc-review.service";

/** Real crypto with a fixed test key so hashId(...) matches the values the service computes. */
const pii = new PiiCryptoService({ PII_ENCRYPTION_KEY: "test-pii-key-0123456789abcdefghij" } as Env);
/** Every test except the photo ones is off the storage path entirely. */
const noStorage = { createReadUrl: async () => "unused://" } as unknown as StorageAdapter;

describe("AdminKycReviewService.getKycReview (A-04 duplicate ID)", () => {
  const riderRow = (over: Record<string, unknown> = {}) => ({
    profileId: "r1",
    bikeReg: "ABZ 1",
    kycStatus: "pending",
    kycRef: "sess_1",
    kycAttempts: 0,
    kycDeclineReason: null,
    idVerified: false,
    duplicateIdFlag: true,
    updatedAt: new Date("2026-07-01T00:00:00Z"),
    profile: {
      firstName: "Tendai",
      lastName: "M",
      phone: "+263782000001",
      idNumber: "63-123456-A-42",
      idNumberHash: pii.hashId("63-123456-A-42"),
    },
    ...over,
  });

  it("returns the masked colliding accounts sharing the national ID", async () => {
    let where: unknown;
    const prisma = {
      rider: { findUnique: async () => riderRow() },
      profile: {
        findMany: async (args: { where: unknown }) => {
          where = args.where;
          return [
            {
              id: "p2",
              firstName: "Banned",
              lastName: "Rider",
              phone: "+263782000999",
              role: "rider",
              rider: { kycStatus: "verified", accountStatus: "banned" },
            },
            {
              id: "p3",
              firstName: "Some",
              lastName: "Customer",
              phone: "+263782000888",
              role: "customer",
              rider: null,
            },
          ];
        },
      },
    };
    const svc = new AdminKycReviewService(prisma as unknown as PrismaService, pii, noStorage);
    const r = (await svc.getKycReview("r1"))!;
    // Only OTHER accounts with the same ID are queried — matched on the HMAC hash, not the raw number.
    expect(where).toMatchObject({ idNumberHash: pii.hashId("63-123456-A-42"), id: { not: "r1" } });
    expect(r.duplicateIdFlag).toBe(true);
    expect(r.duplicateIdAccounts).toHaveLength(2);
    // Phones masked (A-03); a banned rider surfaces its standing so the reviewer catches ban-evasion.
    expect(r.duplicateIdAccounts[0]).toMatchObject({
      id: "p2",
      name: "Banned Rider",
      role: "rider",
      accountStatus: "banned",
      kycStatus: "verified",
    });
    expect(r.duplicateIdAccounts[0]!.phone).toBe("+263•••••0999");
    // A non-rider collision (customer) reports null rider fields.
    expect(r.duplicateIdAccounts[1]).toMatchObject({ id: "p3", role: "customer", kycStatus: null, accountStatus: null });
  });

  it("skips the collision query and returns an empty set when the applicant has no ID", async () => {
    let queried = false;
    const prisma = {
      rider: { findUnique: async () => riderRow({ duplicateIdFlag: false, profile: { firstName: "No", lastName: "Id", phone: "+263782000001", idNumber: null } }) },
      profile: { findMany: async () => { queried = true; return []; } },
    };
    const svc = new AdminKycReviewService(prisma as unknown as PrismaService, pii, noStorage);
    const r = (await svc.getKycReview("r1"))!;
    expect(queried).toBe(false);
    expect(r.duplicateIdAccounts).toEqual([]);
    expect(r.duplicateIdFlag).toBe(false);
  });
});

describe("AdminKycReviewService.getKycReview — document photo (BUG-HUNT)", () => {
  const riderRow = (over: Record<string, unknown> = {}) => ({
    profileId: "r1",
    bikeReg: "ABZ 1",
    kycStatus: "pending",
    kycRef: "sess_1",
    kycAttempts: 0,
    kycDeclineReason: null,
    idVerified: false,
    duplicateIdFlag: false,
    updatedAt: new Date("2026-07-01T00:00:00Z"),
    photoUrl: "kyc/r1/photo.jpg",
    profile: { firstName: "Tendai", lastName: "M", phone: "+263782000001", idNumber: null, idNumberHash: null },
    ...over,
  });

  it("mints a signed read URL from the stored object key — the reviewer can actually see the document", async () => {
    const createReadUrl = vi.fn(async (key: string, ttl: number) => `https://signed.example/${key}?ttl=${ttl}`);
    const prisma = { rider: { findUnique: async () => riderRow() }, profile: { findMany: async () => [] } };
    const svc = new AdminKycReviewService(prisma as unknown as PrismaService, pii, { createReadUrl } as unknown as StorageAdapter);

    const r = (await svc.getKycReview("r1"))!;

    expect(createReadUrl).toHaveBeenCalledWith("kyc/r1/photo.jpg", expect.any(Number));
    expect(r.photoUrl).toBe("https://signed.example/kyc/r1/photo.jpg?ttl=900");
  });

  it("returns null (not the raw object key) when the rider has no photo yet", async () => {
    const createReadUrl = vi.fn();
    const prisma = { rider: { findUnique: async () => riderRow({ photoUrl: null }) }, profile: { findMany: async () => [] } };
    const svc = new AdminKycReviewService(prisma as unknown as PrismaService, pii, { createReadUrl } as unknown as StorageAdapter);

    const r = (await svc.getKycReview("r1"))!;

    expect(createReadUrl).not.toHaveBeenCalled();
    expect(r.photoUrl).toBeNull();
  });

  it("degrades to null instead of failing the whole review when signing throws", async () => {
    const prisma = { rider: { findUnique: async () => riderRow() }, profile: { findMany: async () => [] } };
    const failingStorage = { createReadUrl: async () => { throw new Error("GCS down"); } } as unknown as StorageAdapter;
    const svc = new AdminKycReviewService(prisma as unknown as PrismaService, pii, failingStorage);

    const r = (await svc.getKycReview("r1"))!;

    expect(r.photoUrl).toBeNull();
    expect(r.name).toBe("Tendai M"); // the rest of the review still loads
  });
});
