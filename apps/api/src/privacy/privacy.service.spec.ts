import { ConflictException, NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { Env } from "../config/env";
import { PrismaService } from "../prisma/prisma.service";
import { PrivacyService } from "./privacy.service";

const env = { GPS_RETENTION_DAYS: 90, SESSION_RETENTION_DAYS: 30 } as Env;

/** Captures the tx.<model>.<op> calls an eraseAccount run makes, so we can assert what was scrubbed. */
function eraseHarness(
  profile: { phone: string } | null,
  activeRide: boolean,
  placedOrders: Array<{ id: string; pickup: unknown; dropoff: unknown }> = [],
  // DS-10: the active-ride guard is now ALSO re-checked inside the transaction. Defaults to no ride in
  // the tx (the common case); set true to exercise a ride that appeared between the pre-flight read and
  // the scrub.
  txActiveRide = false,
) {
  const calls: Record<string, unknown> = {};
  const orderUpdates: Array<{ where: { id: string }; data: Record<string, unknown> }> = [];
  const tx = {
    profile: { update: vi.fn(async (a: unknown) => ((calls.profileUpdate = a), {})) },
    rider: { updateMany: vi.fn(async (a: unknown) => ((calls.riderUpdate = a), { count: 1 })) },
    address: { deleteMany: vi.fn(async () => ((calls.addressDel = true), { count: 1 })) },
    deviceToken: { deleteMany: vi.fn(async () => ((calls.deviceDel = true), { count: 1 })) },
    session: { deleteMany: vi.fn(async () => ((calls.sessionDel = true), { count: 2 })) },
    orderEvent: { updateMany: vi.fn(async (a: unknown) => ((calls.eventUpdate = a), { count: 3 })) },
    // DS-01: SOS location is now scrubbed in the same transaction.
    sosEvent: { updateMany: vi.fn(async (a: unknown) => ((calls.sosUpdate = a), { count: 1 })) },
    order: {
      findFirst: vi.fn(async () => (txActiveRide ? { id: "otx" } : null)),
      findMany: vi.fn(async () => placedOrders),
      update: vi.fn(async (a: { where: { id: string }; data: Record<string, unknown> }) => (orderUpdates.push(a), {})),
    },
  };
  const prisma = {
    profile: { findUnique: async () => (profile ? { id: "p1", phone: profile.phone } : null) },
    order: { findFirst: async () => (activeRide ? { id: "o1" } : null) },
    $transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
  } as unknown as PrismaService;
  return { svc: new PrivacyService(prisma, env), calls, tx, orderUpdates };
}

describe("PrivacyService.eraseAccount", () => {
  it("404s an unknown profile", async () => {
    const { svc } = eraseHarness(null, false);
    await expect(svc.eraseAccount("nope")).rejects.toBeInstanceOf(NotFoundException);
  });

  it("refuses while a delivery is active (never strand a live ride)", async () => {
    const { svc } = eraseHarness({ phone: "+263771234567" }, true);
    await expect(svc.eraseAccount("p1")).rejects.toBeInstanceOf(ConflictException);
  });

  it("anonymises the profile, scrubs rider PII + GPS, and deletes addresses/tokens/sessions", async () => {
    const { svc, calls, tx } = eraseHarness({ phone: "+263771234567" }, false);
    await expect(svc.eraseAccount("p1")).resolves.toEqual({ erased: true });

    const data = (calls.profileUpdate as { data: Record<string, unknown> }).data;
    expect(data).toMatchObject({ firstName: "Deleted", lastName: "User", email: null, idNumber: null, idNumberHash: null, photoUrl: null });
    expect(data.phone).toBe("erased:p1"); // unique, non-dialable tombstone — the real number is freed
    expect((calls.riderUpdate as { data: Record<string, unknown> }).data).toMatchObject({ kycRef: null, photoUrl: "", isOnline: false });
    expect(calls.addressDel).toBe(true);
    expect(calls.deviceDel).toBe(true);
    expect(calls.sessionDel).toBe(true);
    expect((calls.eventUpdate as { data: Record<string, unknown> }).data).toEqual({ lat: null, lng: null });
    // DS-01: the SOS location trail is scrubbed for every SOS this profile raised, in the same tx.
    expect(calls.sosUpdate as { where: unknown; data: unknown }).toEqual({
      where: { raisedByProfileId: "p1" },
      data: { lat: null, lng: null },
    });
    expect(tx.profile.update).toHaveBeenCalledOnce();
  });

  it("re-checks the active-ride guard inside the tx and aborts if a ride appeared mid-erase (DS-10)", async () => {
    // Pre-flight read sees no ride (activeRide=false) but one exists by the time the tx runs.
    const { svc, tx } = eraseHarness({ phone: "+263771234567" }, false, [], true);
    await expect(svc.eraseAccount("p1")).rejects.toBeInstanceOf(ConflictException);
    expect(tx.profile.update).not.toHaveBeenCalled();
    expect(tx.sosEvent.updateMany).not.toHaveBeenCalled();
  });

  it("is idempotent — an already-erased (tombstoned) profile is a no-op", async () => {
    const { svc, tx } = eraseHarness({ phone: "erased:p1" }, false);
    await expect(svc.eraseAccount("p1")).resolves.toEqual({ erased: true });
    expect(tx.profile.update).not.toHaveBeenCalled();
  });

  it("scrubs contactPhone from the pickup/dropoff JSON of orders the user placed (keeps coords/landmark)", async () => {
    const { svc, orderUpdates } = eraseHarness({ phone: "+263771234567" }, false, [
      {
        id: "o1",
        pickup: { point: { lat: -17.8, lng: 31.0 }, landmark: "Gate 3", contactPhone: "+263771111111" },
        dropoff: { point: { lat: -17.9, lng: 31.1 }, landmark: "Reception", contactPhone: "+263772222222" },
      },
      // No contactPhone anywhere → nothing to strip → no write for this order.
      { id: "o2", pickup: { point: { lat: -17.7, lng: 31.2 }, landmark: "Shop" }, dropoff: null },
    ]);
    await expect(svc.eraseAccount("p1")).resolves.toEqual({ erased: true });

    // Only o1 is rewritten; o2 has no phone to scrub.
    expect(orderUpdates).toHaveLength(1);
    expect(orderUpdates[0].where).toEqual({ id: "o1" });
    expect(orderUpdates[0].data.pickup).toEqual({ point: { lat: -17.8, lng: 31.0 }, landmark: "Gate 3", contactPhone: null });
    expect(orderUpdates[0].data.dropoff).toEqual({ point: { lat: -17.9, lng: 31.1 }, landmark: "Reception", contactPhone: null });
  });
});

describe("PrivacyService.purgeExpiredData", () => {
  it("scrubs GPS + SOS coords past the window and purges long-lapsed sessions, returning counts", async () => {
    let gpsWhere: { createdAt: { lt: Date } } | undefined;
    let sosWhere: { createdAt: { lt: Date } } | undefined;
    let sessWhere: { expiresAt: { lt: Date } } | undefined;
    const prisma = {
      orderEvent: {
        updateMany: async (a: { where: { createdAt: { lt: Date } }; data: unknown }) => {
          gpsWhere = a.where;
          expect(a.data).toEqual({ lat: null, lng: null });
          return { count: 5 };
        },
      },
      // DS-01: SOS coords ride the same GPS-retention cutoff.
      sosEvent: {
        updateMany: async (a: { where: { createdAt: { lt: Date } }; data: unknown }) => {
          sosWhere = a.where;
          expect(a.data).toEqual({ lat: null, lng: null });
          return { count: 2 };
        },
      },
      session: {
        deleteMany: async (a: { where: { expiresAt: { lt: Date } } }) => ((sessWhere = a.where), { count: 7 }),
      },
    } as unknown as PrismaService;
    const svc = new PrivacyService(prisma, env);

    const now = new Date("2026-07-06T00:00:00Z");
    const res = await svc.purgeExpiredData(now);
    // gpsScrubbed now folds in the SOS coords (5 + 2).
    expect(res).toEqual({ gpsScrubbed: 7, sessionsPurged: 7 });
    // 90-day GPS cutoff (shared by order + SOS coords), 30-day session cutoff, measured back from `now`.
    expect(gpsWhere!.createdAt.lt.toISOString()).toBe(new Date("2026-04-07T00:00:00Z").toISOString());
    expect(sosWhere!.createdAt.lt.toISOString()).toBe(new Date("2026-04-07T00:00:00Z").toISOString());
    expect(sessWhere!.expiresAt.lt.toISOString()).toBe(new Date("2026-06-06T00:00:00Z").toISOString());
  });
});
