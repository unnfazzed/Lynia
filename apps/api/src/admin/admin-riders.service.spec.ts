import { ACTIVE_RIDE_STATUSES } from "@lynia/shared";
import { describe, expect, it, vi } from "vitest";
import type { StorageAdapter } from "../adapters/storage/storage.interface";
import { PrismaService } from "../prisma/prisma.service";
import { PiiCryptoService } from "../common/pii-crypto.service";
import type { Env } from "../config/env";
import { AdminRidersService } from "./admin-riders.service";

/** Real crypto with a fixed test key so hashId(...) matches the values the service computes. */
const pii = new PiiCryptoService({ PII_ENCRYPTION_KEY: "test-pii-key-0123456789abcdefghij" } as Env);
/** Every test except the getKycReview photo ones is off the storage path entirely. */
const noStorage = { createReadUrl: async () => "unused://" } as unknown as StorageAdapter;

/** Decimal-like stub — Prisma returns Decimal objects whose `.toString()`/`.toFixed()` we serialize. */
const dec = (s: string) => ({ toString: () => s, toFixed: (_n: number) => s });

describe("AdminRidersService.listRiders", () => {
  const riderRow = (over: Record<string, unknown> = {}) => ({
    profileId: "r1",
    bikeReg: "ABZ 1",
    kycStatus: "pending",
    kycRef: "sess_1",
    idVerified: false,
    isOnline: false,
    ratingAvg: 0,
    ratingCount: 0,
    tripsCount: 0,
    cancelStrikes: 0,
    cooldownUntil: null,
    profile: { firstName: "Tendai", lastName: "M", phone: "+263782000001" },
    ...over,
  });

  it("filters by kyc status and MASKS the phone when the rider isn't on a live order (A-03)", async () => {
    let where: unknown;
    const prisma = {
      rider: {
        findMany: async (args: { where: unknown }) => {
          where = args.where;
          return [riderRow()];
        },
      },
      // No order in a reveal-status window ⇒ the phone must be masked.
      order: { findMany: async () => [] },
    };
    const svc = new AdminRidersService(prisma as unknown as PrismaService, pii, noStorage);
    const rows = await svc.listRiders("pending");
    expect(where).toEqual({ kycStatus: "pending" });
    expect(rows[0]).toMatchObject({ profileId: "r1", name: "Tendai M", kycStatus: "pending" });
    // Masked: country code + last 4 kept, middle bulleted — never the full number.
    expect(rows[0]!.phone).toBe("+263•••••0001");
    expect(rows[0]!.phone).not.toContain("78200");
  });

  it("REVEALS the full phone when the rider is a party on a LIVE order right now", async () => {
    let orderWhere: { status?: { in: string[] } } = {};
    const prisma = {
      rider: { findMany: async () => [riderRow()] },
      // The rider is currently on a live order → reveal the real number for ops to call them.
      order: {
        findMany: async (args: { where: { status?: { in: string[] } } }) => {
          orderWhere = args.where;
          return [{ riderId: "r1" }];
        },
      },
    };
    const svc = new AdminRidersService(prisma as unknown as PrismaService, pii, noStorage);
    const rows = await svc.listRiders();
    expect(rows[0]!.phone).toBe("+263782000001");
    // The reveal set MUST be live-only (ACTIVE_RIDE_STATUSES) — NOT the terminal-inclusive
    // PHONE_REVEAL_STATUSES, which would unmask any rider who ever completed one order forever (A-03).
    expect(orderWhere.status?.in).toEqual(ACTIVE_RIDE_STATUSES);
    for (const terminal of ["completed", "delivered", "undelivered"]) {
      expect(orderWhere.status?.in).not.toContain(terminal);
    }
  });

  it("returns all riders when no filter is given", async () => {
    let where: unknown = "unset";
    const prisma = {
      rider: { findMany: async (args: { where: unknown }) => { where = args.where; return []; } },
      order: { findMany: async () => [] },
    };
    const svc = new AdminRidersService(prisma as unknown as PrismaService, pii, noStorage);
    await svc.listRiders();
    expect(where).toEqual({});
  });
});

describe("AdminRidersService.getKycReview (A-04 duplicate ID)", () => {
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
    const svc = new AdminRidersService(prisma as unknown as PrismaService, pii, noStorage);
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
    const svc = new AdminRidersService(prisma as unknown as PrismaService, pii, noStorage);
    const r = (await svc.getKycReview("r1"))!;
    expect(queried).toBe(false);
    expect(r.duplicateIdAccounts).toEqual([]);
    expect(r.duplicateIdFlag).toBe(false);
  });
});

describe("AdminRidersService.getKycReview — document photo (BUG-HUNT)", () => {
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
    const svc = new AdminRidersService(prisma as unknown as PrismaService, pii, { createReadUrl } as unknown as StorageAdapter);

    const r = (await svc.getKycReview("r1"))!;

    expect(createReadUrl).toHaveBeenCalledWith("kyc/r1/photo.jpg", expect.any(Number));
    expect(r.photoUrl).toBe("https://signed.example/kyc/r1/photo.jpg?ttl=900");
  });

  it("returns null (not the raw object key) when the rider has no photo yet", async () => {
    const createReadUrl = vi.fn();
    const prisma = { rider: { findUnique: async () => riderRow({ photoUrl: null }) }, profile: { findMany: async () => [] } };
    const svc = new AdminRidersService(prisma as unknown as PrismaService, pii, { createReadUrl } as unknown as StorageAdapter);

    const r = (await svc.getKycReview("r1"))!;

    expect(createReadUrl).not.toHaveBeenCalled();
    expect(r.photoUrl).toBeNull();
  });

  it("degrades to null instead of failing the whole review when signing throws", async () => {
    const prisma = { rider: { findUnique: async () => riderRow() }, profile: { findMany: async () => [] } };
    const failingStorage = { createReadUrl: async () => { throw new Error("GCS down"); } } as unknown as StorageAdapter;
    const svc = new AdminRidersService(prisma as unknown as PrismaService, pii, failingStorage);

    const r = (await svc.getKycReview("r1"))!;

    expect(r.photoUrl).toBeNull();
    expect(r.name).toBe("Tendai M"); // the rest of the review still loads
  });
});

describe("AdminRidersService.getRiderDetail (D-2)", () => {
  const riderRow = (over: Record<string, unknown> = {}) => ({
    profileId: "r1",
    bikeReg: "ABZ 1",
    kycStatus: "verified",
    isOnline: true,
    ratingAvg: 4.75,
    ratingCount: 12,
    tripsCount: 30,
    cancelStrikes: 1,
    cooldownUntil: null,
    accountStatus: "active",
    suspendReason: null,
    onHold: false,
    reliabilityScore: 82,
    profile: { firstName: "Tendai", lastName: "M", phone: "+263782000001", createdAt: new Date("2026-01-15T00:00:00Z") },
    ...over,
  });
  const prismaFor = (rider: unknown, liveCount: number, reports: Array<Record<string, unknown>> = []) => ({
    rider: { findUnique: async () => rider },
    report: {
      count: async () => reports.length,
      findMany: async () => reports,
    },
    order: {
      count: async () => liveCount,
      groupBy: async () => [
        { status: "completed", _count: { _all: 24 } },
        { status: "cancelled", _count: { _all: 6 } },
      ],
      findMany: async () => [
        {
          id: "o9",
          status: "completed",
          proposedFare: dec("4.00"),
          agreedFare: dec("4.50"),
          pickup: { landmark: "CBD" },
          dropoff: { landmark: "Mount Pleasant" },
          createdAt: new Date("2026-06-20T00:00:00Z"),
        },
      ],
    },
  });

  it("returns null when the id isn't a rider", async () => {
    const svc = new AdminRidersService({ rider: { findUnique: async () => null } } as unknown as PrismaService, pii, noStorage);
    expect(await svc.getRiderDetail("nope")).toBeNull();
  });

  it("MASKS the phone off a live order and projects stats + trail (A-03)", async () => {
    const svc = new AdminRidersService(prismaFor(riderRow(), 0) as unknown as PrismaService, pii, noStorage);
    const r = (await svc.getRiderDetail("r1"))!;
    expect(r.phone).toBe("+263•••••0001");
    expect(r.rating).toBe("4.8");
    expect(r.trips).toBe(30);
    expect(r.strikes).toBe(1);
    expect(r.status).toBe("online");
    expect(r.completion).toBe("80%"); // 24 completed / 30 total
    expect(r.trail[0]).toMatchObject({ id: "o9", route: "CBD → Mount Pleasant", fare: "4.50", when: "2026-06-20" });
  });

  it("REVEALS the phone when the rider is on a live order, and reports cooldown", async () => {
    const cooldownUntil = new Date(Date.now() + 90 * 60 * 1000);
    const svc = new AdminRidersService(prismaFor(riderRow({ isOnline: false, cooldownUntil }), 1) as unknown as PrismaService, pii, noStorage);
    const r = (await svc.getRiderDetail("r1"))!;
    expect(r.phone).toBe("+263782000001");
    expect(r.status).toBe("cooldown");
    expect(r.cooldown).toMatch(/h .*m|m$/);
  });

  it("reports the A-04 account state over the activity derivation, with the stored reason", async () => {
    // A suspended rider who happens to be flagged online in the stale row: account state wins.
    const suspended = riderRow({ accountStatus: "suspended", suspendReason: "safety report", isOnline: true });
    const svc = new AdminRidersService(prismaFor(suspended, 0) as unknown as PrismaService, pii, noStorage);
    const r = (await svc.getRiderDetail("r1"))!;
    expect(r.status).toBe("suspended");
    expect(r.suspendReason).toBe("safety report");

    const banned = riderRow({ accountStatus: "banned", suspendReason: "fraud", isOnline: false });
    const svc2 = new AdminRidersService(prismaFor(banned, 0) as unknown as PrismaService, pii, noStorage);
    const r2 = (await svc2.getRiderDetail("r1"))!;
    expect(r2.status).toBe("banned");
    expect(r2.suspendReason).toBe("fraud");
  });

  it("reports on_hold for an active rider the reliability engine has locked out, with the score", async () => {
    // Distinct from suspended/banned (an admin action) — accountStatus stays "active" while onHold=true.
    const held = riderRow({ onHold: true, reliabilityScore: 42, isOnline: true });
    const svc = new AdminRidersService(prismaFor(held, 0) as unknown as PrismaService, pii, noStorage);
    const r = (await svc.getRiderDetail("r1"))!;
    expect(r.status).toBe("on_hold");
    expect(r.reliabilityScore).toBe(42);
  });

  it("omits reliabilityScore when the rider isn't on_hold", async () => {
    const svc = new AdminRidersService(prismaFor(riderRow(), 0) as unknown as PrismaService, pii, noStorage);
    const r = (await svc.getRiderDetail("r1"))!;
    expect(r.reliabilityScore).toBeUndefined();
  });

  it("counts the rider's Report rows and lists the recent ones (repeat-offender signal)", async () => {
    const reports = [
      { id: "rep1", reason: "unsafe", note: "cut me off", createdAt: new Date("2026-06-25T00:00:00Z") },
      { id: "rep2", reason: "rude", note: null, createdAt: new Date("2026-06-24T00:00:00Z") },
    ];
    const svc = new AdminRidersService(prismaFor(riderRow(), 0, reports) as unknown as PrismaService, pii, noStorage);
    const r = (await svc.getRiderDetail("r1"))! as unknown as {
      reports: number;
      reportLog: Array<{ date: string; text: string; issueId?: string }>;
    };
    expect(r.reports).toBe(2);
    // Reason label + free-text note when present; label only otherwise.
    expect(r.reportLog[0]).toEqual({ date: "2026-06-25", text: "Unsafe behaviour — cut me off", issueId: "rep1" });
    expect(r.reportLog[1]).toEqual({ date: "2026-06-24", text: "Rude or hostile", issueId: "rep2" });
  });
});

describe("AdminRidersService mutations (Item 1 — mutation + audit in ONE $transaction, A-01)", () => {
  interface Calls {
    riderUpdate: { where: unknown; data: Record<string, unknown> } | null;
    audit: { data: Record<string, unknown> } | null;
  }
  // A tx whose writes are recorded; $transaction runs the service callback against THIS object, so a
  // recorded riderUpdate AND a recorded audit prove both landed inside the same transaction.
  function makeTx(over: { rider?: unknown } = {}) {
    const calls: Calls = { riderUpdate: null, audit: null };
    const tx = {
      rider: {
        findUnique: async () => ("rider" in over ? over.rider : { profileId: "r1" }),
        update: async (args: Calls["riderUpdate"]) => { calls.riderUpdate = args; return {}; },
      },
      auditLog: { create: async (args: Calls["audit"]) => { calls.audit = args; return { id: "audit-9" }; } },
    };
    const prisma = { $transaction: async (fn: (t: unknown) => unknown) => fn(tx) };
    return { prisma, calls };
  }

  it("suspendRider sets accountStatus=suspended + reason AND writes the audit row atomically", async () => {
    const { prisma, calls } = makeTx();
    const svc = new AdminRidersService(prisma as unknown as PrismaService, pii, noStorage);
    const res = await svc.suspendRider("admin-1", "r1", { reason: "safety report", note: "incident #7" });
    expect(calls.riderUpdate!.data).toEqual({ accountStatus: "suspended", suspendReason: "safety report", isOnline: false });
    // The audit row committed in the SAME transaction as the state change (both non-null here).
    expect(calls.audit!.data).toMatchObject({ actor: "admin-1", action: "rider.suspend", target: "r1", reasonCode: "safety report", note: "incident #7" });
    expect(res).toEqual({ id: "r1", accountStatus: "suspended", auditId: "audit-9" });
  });

  it("banRider sets accountStatus=banned + reason and audits", async () => {
    const { prisma, calls } = makeTx();
    const svc = new AdminRidersService(prisma as unknown as PrismaService, pii, noStorage);
    await svc.banRider("admin-1", "r1", { reason: "fraud" });
    expect(calls.riderUpdate!.data).toEqual({ accountStatus: "banned", suspendReason: "fraud", isOnline: false });
    expect(calls.audit!.data).toMatchObject({ action: "rider.ban", reasonCode: "fraud", note: null });
  });

  it("liftRider returns to active, CLEARS the suspend reason + reliability hold, audits", async () => {
    // A suspended, reliability-held rider (score 55 < clear-at 70).
    const { prisma, calls } = makeTx({ rider: { accountStatus: "suspended", reliabilityScore: 55 } });
    const svc = new AdminRidersService(prisma as unknown as PrismaService, pii, noStorage);
    await svc.liftRider("admin-1", "r1", {});
    // Clears the suspension AND the on_hold lockout, raising the score to the clear threshold (the
    // only escape for on_hold, which otherwise needs online completions the hold itself blocks).
    expect(calls.riderUpdate!.data).toEqual({
      accountStatus: "active",
      suspendReason: null,
      onHold: false,
      reliabilityScore: 70,
    });
    expect(calls.audit!.data).toMatchObject({ action: "rider.lift", reasonCode: null });
  });

  it("liftRider refuses to un-ban a banned rider", async () => {
    const { prisma } = makeTx({ rider: { accountStatus: "banned", reliabilityScore: 100 } });
    const svc = new AdminRidersService(prisma as unknown as PrismaService, pii, noStorage);
    await expect(svc.liftRider("admin-1", "r1", {})).rejects.toThrow(/banned/i);
  });

  it("liftRider refuses an active (not-suspended) rider — won't erase an auto reliability hold", async () => {
    // active-but-on_hold: a lift here would silently clear the reliability penalty and reset the score.
    const { prisma, calls } = makeTx({ rider: { accountStatus: "active", reliabilityScore: 55 } });
    const svc = new AdminRidersService(prisma as unknown as PrismaService, pii, noStorage);
    await expect(svc.liftRider("admin-1", "r1", {})).rejects.toThrow(/not suspended/i);
    expect(calls.riderUpdate).toBeNull();
    expect(calls.audit).toBeNull();
  });

  it("clearHold clears onHold + raises the score to the clear threshold, audits — the only escape for an active on_hold rider", async () => {
    const { prisma, calls } = makeTx({ rider: { accountStatus: "active", onHold: true, reliabilityScore: 42 } });
    const svc = new AdminRidersService(prisma as unknown as PrismaService, pii, noStorage);
    const res = await svc.clearHold("admin-1", "r1", { reason: "reliability recovered" });
    expect(calls.riderUpdate!.data).toEqual({ onHold: false, reliabilityScore: 70 });
    expect(calls.audit!.data).toMatchObject({ action: "rider.clear_hold", reasonCode: "reliability recovered" });
    expect(res).toEqual({ id: "r1", onHold: false, auditId: "audit-9" });
  });

  it("clearHold doesn't lower a score already above the clear threshold", async () => {
    const { prisma, calls } = makeTx({ rider: { accountStatus: "active", onHold: true, reliabilityScore: 95 } });
    const svc = new AdminRidersService(prisma as unknown as PrismaService, pii, noStorage);
    await svc.clearHold("admin-1", "r1", {});
    expect(calls.riderUpdate!.data).toEqual({ onHold: false, reliabilityScore: 95 });
  });

  it("clearHold refuses a rider who isn't on hold", async () => {
    const { prisma, calls } = makeTx({ rider: { accountStatus: "active", onHold: false, reliabilityScore: 90 } });
    const svc = new AdminRidersService(prisma as unknown as PrismaService, pii, noStorage);
    await expect(svc.clearHold("admin-1", "r1", {})).rejects.toThrow(/not on hold/i);
    expect(calls.riderUpdate).toBeNull();
    expect(calls.audit).toBeNull();
  });

  it("clearHold refuses a suspended/banned rider — those use lift/ban instead", async () => {
    const { prisma, calls } = makeTx({ rider: { accountStatus: "suspended", onHold: true, reliabilityScore: 40 } });
    const svc = new AdminRidersService(prisma as unknown as PrismaService, pii, noStorage);
    await expect(svc.clearHold("admin-1", "r1", {})).rejects.toThrow(/active/i);
    expect(calls.riderUpdate).toBeNull();
    expect(calls.audit).toBeNull();
  });

  it("clearHold 404s when the id isn't a rider and writes NOTHING", async () => {
    const { prisma, calls } = makeTx({ rider: null });
    const svc = new AdminRidersService(prisma as unknown as PrismaService, pii, noStorage);
    await expect(svc.clearHold("admin-1", "nope", {})).rejects.toThrow("Rider not found");
    expect(calls.riderUpdate).toBeNull();
    expect(calls.audit).toBeNull();
  });

  it("suspendRider 404s when the id isn't a rider and writes NOTHING", async () => {
    const { prisma, calls } = makeTx({ rider: null });
    const svc = new AdminRidersService(prisma as unknown as PrismaService, pii, noStorage);
    await expect(svc.suspendRider("admin-1", "nope", { reason: "x" })).rejects.toThrow("Rider not found");
    expect(calls.riderUpdate).toBeNull();
    expect(calls.audit).toBeNull();
  });
});
