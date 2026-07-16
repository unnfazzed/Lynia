import { ConflictException, NotFoundException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { StorageAdapter } from "../adapters/storage/storage.interface";
import type { Env } from "../config/env";
import { PrismaService } from "../prisma/prisma.service";
import type { TrackingGateway } from "../tracking/tracking.gateway";
import { PrivacyService } from "./privacy.service";

const env = { GPS_RETENTION_DAYS: 90, SESSION_RETENTION_DAYS: 30 } as Env;

/** Rider standing the DS15-02 erasure gate reads. All fields optional → sensible clean defaults. */
type RiderStanding = {
  accountStatus?: string;
  onHold?: boolean;
  cooldownUntil?: Date | null;
  kycAttempts?: number;
  photoUrl?: string | null;
  kycRef?: string | null;
};
type ProfileInput =
  | { phone: string; onHold?: boolean; photoUrl?: string | null; rider?: RiderStanding | null }
  | null;

const buildRider = (r: RiderStanding | null | undefined) =>
  r
    ? {
        accountStatus: r.accountStatus ?? "active",
        onHold: r.onHold ?? false,
        cooldownUntil: r.cooldownUntil ?? null,
        kycAttempts: r.kycAttempts ?? 0,
        photoUrl: r.photoUrl ?? null,
        kycRef: r.kycRef ?? null,
      }
    : null;

/** Captures the tx.<model>.<op> calls an eraseAccount run makes, so we can assert what was scrubbed. */
function eraseHarness(
  profile: ProfileInput,
  activeRide: boolean,
  placedOrders: Array<{ id: string; pickup: unknown; dropoff: unknown; note?: unknown; itemPhotoUrl?: unknown }> = [],
  // DS-10: the active-ride guard is now ALSO re-checked inside the transaction. Defaults to no ride in
  // the tx (the common case); set true to exercise a ride that appeared between the pre-flight read and
  // the scrub.
  txActiveRide = false,
  // DS15-02: standing is also re-read + re-asserted INSIDE the tx (TOCTOU). `txStanding` overrides that
  // in-tx read to model a ban/hold landing between the pre-flight gate and the scrub; the injected
  // storage/gateway spy the post-commit GCS purge (DS15-03) + geo eviction (DS15-05).
  extras: {
    txStanding?: { onHold?: boolean; rider?: RiderStanding | null };
    storage?: StorageAdapter;
    gateway?: TrackingGateway;
  } = {},
) {
  const preflightRider = profile ? buildRider(profile.rider) : null;
  const preflightProfile = profile
    ? { id: "p1", phone: profile.phone, photoUrl: profile.photoUrl ?? null, onHold: profile.onHold ?? false, rider: preflightRider }
    : null;
  // In-tx re-read: defaults to the pre-flight standing unless an override models a concurrent change.
  const txStanding = extras.txStanding
    ? { onHold: extras.txStanding.onHold ?? false, rider: buildRider(extras.txStanding.rider) }
    : preflightProfile
      ? { onHold: preflightProfile.onHold, rider: preflightRider }
      : null;

  const calls: Record<string, unknown> = {};
  const orderUpdates: Array<{ where: { id: string }; data: Record<string, unknown> }> = [];
  const orderUpdateManys: Array<{ where: Record<string, unknown>; data: Record<string, unknown> }> = [];
  const tx = {
    profile: {
      // DS15-02: the in-tx standing re-read.
      findUnique: vi.fn(async () => txStanding),
      update: vi.fn(async (a: unknown) => ((calls.profileUpdate = a), {})),
    },
    rider: { updateMany: vi.fn(async (a: unknown) => ((calls.riderUpdate = a), { count: 1 })) },
    // Class-C: geog + position_updated_at are nulled via raw SQL (Unsupported column). Flag the call so a
    // test can assert the rider's PostGIS position was scrubbed — not just the readable current_lat/lng.
    $executeRaw: vi.fn(async () => ((calls.rawScrub = true), 1)),
    // DOC-16-01: TopUp.phone scrub — only exercised for a rider profile.
    topUp: { updateMany: vi.fn(async (a: unknown) => ((calls.topUpUpdate = a), { count: 1 })) },
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
      // KB-POD-DISPUTE Phase A: eraseAccount nulls the rider's delivery-proof columns via updateMany.
      updateMany: vi.fn(async (a: { where: Record<string, unknown>; data: Record<string, unknown> }) => (orderUpdateManys.push(a), { count: 0 })),
    },
  };
  const prisma = {
    profile: { findUnique: async () => preflightProfile },
    order: { findFirst: async () => (activeRide ? { id: "o1" } : null) },
    $transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
  } as unknown as PrismaService;
  return { svc: new PrivacyService(prisma, env, extras.storage, extras.gateway), calls, tx, orderUpdates, orderUpdateManys };
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
    // DOC-16-01's TopUp.phone scrub is gated on isRider — give this fixture a rider row (it already
    // asserts rider-scrub behavior below) so that gate is exercised for real, not just recorded blind.
    const { svc, calls, tx } = eraseHarness({ phone: "+263771234567", rider: {} }, false);
    await expect(svc.eraseAccount("p1")).resolves.toEqual({ erased: true });

    const data = (calls.profileUpdate as { data: Record<string, unknown> }).data;
    expect(data).toMatchObject({ firstName: "Deleted", lastName: "User", email: null, idNumber: null, photoUrl: null });
    // DS15-02(b): idNumberHash is a one-way HMAC (never raw PII) and the sole duplicate-ID re-registration
    // signal — it must SURVIVE anonymisation, so it's no longer in the update payload.
    expect(data).not.toHaveProperty("idNumberHash");
    expect(data.phone).toBe("erased:p1"); // unique, non-dialable tombstone — the real number is freed
    expect((calls.riderUpdate as { data: Record<string, unknown> }).data).toMatchObject({ kycRef: null, photoUrl: "", isOnline: false, currentLat: null, currentLng: null });
    // Class-C: the rider's PostGIS `geog` position (the Unsupported column current_lat/lng alone didn't
    // reach) is scrubbed via raw SQL in the same tx — else the exact last GPS point outlived erasure.
    expect(calls.rawScrub).toBe(true);
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
    // DOC-16-01: TopUp.phone (the mobile-money number on every self-serve top-up) is the same class of
    // dialable PII as the waypoint/note phones, but lives in its own table — the profile/rider scrub above
    // never reaches it without this explicit call.
    expect(calls.topUpUpdate).toEqual({ where: { riderId: "p1", NOT: { phone: null } }, data: { phone: null } });
  });

  it("KB-POD-DISPUTE Phase A: nulls the rider's delivery-proof columns (photo/GPS/time) on erasure, scoped to riderId", async () => {
    const { svc, orderUpdateManys } = eraseHarness({ phone: "+263771234567", rider: {} }, false);
    await svc.eraseAccount("p1");
    const proofScrub = orderUpdateManys.find((u) => u.data.deliveryProofKey === null);
    expect(proofScrub).toBeDefined();
    // Scoped to orders this user was the RIDER of (their captured photo + their GPS) — not orders they placed.
    expect(proofScrub!.where).toMatchObject({ riderId: "p1" });
    expect(proofScrub!.data).toMatchObject({
      deliveryProofKey: null,
      deliveryProofLat: null,
      deliveryProofLng: null,
      deliveryProofAt: null,
    });
  });

  it("DOC-16-01: does NOT touch top_ups for a plain customer (no rider row — no TopUp rows can exist)", async () => {
    const { svc, tx } = eraseHarness({ phone: "+263771234567", rider: null }, false);
    await svc.eraseAccount("p1");
    expect(tx.topUp.updateMany).not.toHaveBeenCalled();
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

  /* ── DS15-02: self-erasure is gated on the caller's standing (no ban/hold/lock evasion) ────────── */

  // A rejected erasure must NOT anonymise: assert the tx.profile.update never fired.
  const expectRejectedNoWrite = async (
    profile: ProfileInput,
    reason: string,
    extras: { txStanding?: { onHold?: boolean; rider?: RiderStanding | null } } = {},
  ) => {
    const { svc, tx } = eraseHarness(profile, false, [], false, extras);
    let caught: unknown;
    await svc.eraseAccount("p1").catch((e) => (caught = e));
    expect(caught).toBeInstanceOf(ConflictException);
    expect((caught as ConflictException).getResponse()).toMatchObject({ reason });
    expect(tx.profile.update).not.toHaveBeenCalled();
  };

  it("refuses erasure for a BANNED rider (ban-evasion via delete-then-reregister)", async () => {
    await expectRejectedNoWrite({ phone: "+263771234567", rider: { accountStatus: "banned" } }, "account_banned");
  });

  it("refuses erasure for a SUSPENDED rider", async () => {
    await expectRejectedNoWrite({ phone: "+263771234567", rider: { accountStatus: "suspended" } }, "account_suspended");
  });

  it("refuses erasure for a rider under a (sticky VELOCITY) reliability hold — RH-01", async () => {
    await expectRejectedNoWrite({ phone: "+263771234567", rider: { onHold: true } }, "account_on_hold");
  });

  it("refuses erasure for an on-hold CUSTOMER (S·2 hold)", async () => {
    await expectRejectedNoWrite({ phone: "+263771234567", onHold: true }, "account_on_hold");
  });

  it("refuses erasure while a cancel-strike cooldown is still in the future", async () => {
    const cooldownUntil = new Date(Date.now() + 60 * 60 * 1000);
    await expectRejectedNoWrite({ phone: "+263771234567", rider: { cooldownUntil } }, "cooldown_active");
  });

  it("refuses erasure for a KYC-locked rider (two declines — A-02)", async () => {
    await expectRejectedNoWrite({ phone: "+263771234567", rider: { kycAttempts: 2 } }, "kyc_locked");
  });

  it("allows erasure when a past cooldown has elapsed (not blocked by a stale timestamp)", async () => {
    const cooldownUntil = new Date(Date.now() - 60 * 60 * 1000);
    const { svc, tx } = eraseHarness({ phone: "+263771234567", rider: { cooldownUntil } }, false);
    await expect(svc.eraseAccount("p1")).resolves.toEqual({ erased: true });
    expect(tx.profile.update).toHaveBeenCalledOnce();
  });

  it("TOCTOU: an admin ban landing AFTER the pre-flight gate but before the scrub aborts the erasure", async () => {
    // Pre-flight standing is clean (active) but the in-tx re-read sees a just-committed ban → reject,
    // nothing anonymised. Mirrors the DS-10 active-ride mid-erase abort.
    await expectRejectedNoWrite(
      { phone: "+263771234567", rider: { accountStatus: "active" } },
      "account_banned",
      { txStanding: { onHold: false, rider: { accountStatus: "banned" } } },
    );
  });

  /* ── DS15-03: right-to-erasure purges the underlying GCS objects ───────────────────────────────── */

  it("deletes the rider's KYC document + the profile photo from storage after nulling the DB pointers", async () => {
    const deleted: string[] = [];
    const storage = {
      deleteObject: vi.fn(async (key: string) => {
        deleted.push(key);
      }),
    } as unknown as StorageAdapter;
    const { svc } = eraseHarness(
      { phone: "+263771234567", photoUrl: "avatars/p1.jpg", rider: { photoUrl: "kyc/p1/doc.jpg" } },
      false,
      [],
      false,
      { storage },
    );
    await expect(svc.eraseAccount("p1")).resolves.toEqual({ erased: true });
    // Both object keys captured pre-scrub are purged; kycRef (a Didit session id, not a bucket object)
    // is NOT passed to storage.
    expect(deleted).toEqual(["avatars/p1.jpg", "kyc/p1/doc.jpg"]);
  });

  it("Class-C: nulls itemPhotoUrl on a placed order AND deletes its GCS object (surfaced by the PII manifest guard)", async () => {
    const deleted: string[] = [];
    const storage = { deleteObject: vi.fn(async (key: string) => { deleted.push(key); }) } as unknown as StorageAdapter;
    const { svc, orderUpdates } = eraseHarness(
      { phone: "+263771234567", rider: {} },
      false,
      [{ id: "o9", pickup: {}, dropoff: {}, note: null, itemPhotoUrl: "items/o9/parcel.jpg" }],
      false,
      { storage },
    );
    await expect(svc.eraseAccount("p1")).resolves.toEqual({ erased: true });
    // The DB reference is nulled on the placed order…
    const upd = orderUpdates.find((u) => u.where.id === "o9");
    expect(upd?.data).toMatchObject({ itemPhotoUrl: null });
    // …and the underlying object is purged post-commit alongside the KYC/profile photos.
    expect(deleted).toContain("items/o9/parcel.jpg");
  });

  it("skips the storage purge cleanly when the profile has no stored objects", async () => {
    const storage = { deleteObject: vi.fn(async () => {}) } as unknown as StorageAdapter;
    const { svc } = eraseHarness({ phone: "+263771234567", rider: {} }, false, [], false, { storage });
    await expect(svc.eraseAccount("p1")).resolves.toEqual({ erased: true });
    expect((storage.deleteObject as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });

  /* ── DS15-05: an erased rider is evicted from the rider:geo Redis index ─────────────────────────── */

  it("evicts an erased RIDER from the geo index post-commit (best-effort)", async () => {
    const evicted: string[] = [];
    const gateway = {
      evictRiderFromGeo: vi.fn(async (id: string) => {
        evicted.push(id);
      }),
    } as unknown as TrackingGateway;
    const { svc } = eraseHarness({ phone: "+263771234567", rider: {} }, false, [], false, { gateway });
    await expect(svc.eraseAccount("p1")).resolves.toEqual({ erased: true });
    expect(evicted).toEqual(["p1"]);
  });

  it("does NOT evict a plain CUSTOMER (no rider row) from the geo index", async () => {
    const gateway = { evictRiderFromGeo: vi.fn(async () => {}) } as unknown as TrackingGateway;
    const { svc } = eraseHarness({ phone: "+263771234567" }, false, [], false, { gateway });
    await expect(svc.eraseAccount("p1")).resolves.toEqual({ erased: true });
    expect((gateway.evictRiderFromGeo as ReturnType<typeof vi.fn>)).not.toHaveBeenCalled();
  });

  /* ── DS15-07: Order.note free-text is scrubbed on the erasing customer's own orders ─────────────── */

  it("nulls Order.note (customer-entered instructions) on the erasing profile's placed orders", async () => {
    const { svc, orderUpdates } = eraseHarness({ phone: "+263771234567" }, false, [
      // note present, no waypoint phone → still rewritten to null the note.
      { id: "o1", pickup: { point: { lat: -17.8, lng: 31.0 } }, dropoff: null, note: "Call 0771111111 if the gate's locked" },
      // Both a waypoint phone AND a note → both scrubbed in one write.
      {
        id: "o2",
        pickup: { point: { lat: -17.7, lng: 31.2 }, landmark: "Shop", contactPhone: "+263772222222" },
        dropoff: null,
        note: "Leave at reception",
      },
      // Neither a phone nor a note → no write.
      { id: "o3", pickup: { point: { lat: -17.6, lng: 31.3 } }, dropoff: null, note: null },
    ]);
    await expect(svc.eraseAccount("p1")).resolves.toEqual({ erased: true });

    expect(orderUpdates.map((u) => u.where.id)).toEqual(["o1", "o2"]);
    expect(orderUpdates[0].data).toEqual({ note: null });
    expect(orderUpdates[1].data).toMatchObject({
      note: null,
      pickup: { point: { lat: -17.7, lng: 31.2 }, landmark: "Shop", contactPhone: null },
    });
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
