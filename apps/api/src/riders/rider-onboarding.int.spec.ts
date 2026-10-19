/**
 * Becoming a biker, end to end against a real Postgres: becomeRider → the ID check's verified webhook
 * (applyKycResult) → setOnline(true) succeeds; and a still-pending rider is refused going online. The
 * unit specs fake the go-online CAS's affected-row count, so only this proves the raw UPDATE's
 * `kyc_status = 'verified'` / cooldown predicate actually matches (and refuses) real rows.
 * Runs in CI (needs DATABASE_URL); see vitest.int.config.ts.
 */
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import type { Env } from "../config/env";
import { PiiCryptoService } from "../common/pii-crypto.service";
import type { KycVendor } from "../kyc/kyc-vendor";
import type { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";
import type { TrackingGateway } from "../tracking/tracking.gateway";
import type { TrackingService } from "../tracking/tracking.service";
import { RiderService } from "./rider.service";

const prisma = new PrismaService();
const pii = new PiiCryptoService({ PII_ENCRYPTION_KEY: "int-pii-key-0123456789abcdefghijkl" } as Env);
// A Didit-shaped vendor that hands out a unique session per sign-up and never calls back on its own:
// the test plays the webhook by calling applyKycResult with that ref.
const vendor: KycVendor = {
  submit: async () => {
    const ref = `int_${crypto.randomUUID()}`;
    return { ref, status: "pending", url: `https://verify.example/${ref}`, token: `tok_${ref}` };
  },
};
const tracking = { evictFromGeo: async () => {}, recordFix: async () => {}, hasNotifyWaiters: async () => false } as unknown as TrackingService;
const gateway = { evictRiderFromSupply: async () => {} } as unknown as TrackingGateway;
const notifications = { notifyProfiles: async () => {}, notifyRidersAvailable: async () => new Set<string>() } as unknown as NotificationsService;
const riders = new RiderService(
  prisma,
  { KYC_MODE: "auto", KYC_PROVIDER: "didit", COMMISSION_RATE_PCT: 0 } as unknown as Env,
  vendor,
  pii,
  tracking,
  gateway,
  notifications,
);

// Harare CBD: going online needs a position inside the service area (FS-7).
const HARARE = { lat: -17.83, lng: 31.05 };
const created: string[] = [];

async function makeCustomer(): Promise<string> {
  const p = await prisma.profile.create({
    // A unique Zimbabwe mobile: becoming a biker needs a +263 number (D-116).
    data: { role: "customer", firstName: "Tendai", lastName: "M", phone: `+2637${String(Math.floor(Math.random() * 1e8)).padStart(8, "0")}` },
    select: { id: true },
  });
  created.push(p.id);
  return p.id;
}

beforeAll(async () => {
  await prisma.$connect();
});
afterAll(async () => {
  // Only this file's rows: the other int specs own theirs.
  await prisma.auditLog.deleteMany({ where: { target: { in: created } } });
  await prisma.rider.deleteMany({ where: { profileId: { in: created } } });
  await prisma.profile.deleteMany({ where: { id: { in: created } } });
  await prisma.$disconnect();
});

describe("becoming a biker → verified → online (real Postgres)", () => {
  it("a customer becomes a biker, their ID check passes, and they go online", async () => {
    const id = await makeCustomer();
    const become = await riders.becomeRider(id, {});
    expect(become.kycStatus).toBe("pending");

    const row = await prisma.rider.findUniqueOrThrow({ where: { profileId: id }, select: { kycRef: true } });
    expect(row.kycRef).toBeTruthy();
    expect((await prisma.profile.findUniqueOrThrow({ where: { id }, select: { role: true } })).role).toBe("rider");

    expect(await riders.applyKycResult(row.kycRef!, "verified", new Date())).toEqual({ updated: 1 });
    expect(await riders.setOnline(id, true, HARARE)).toEqual({ online: true });

    const after = await prisma.rider.findUniqueOrThrow({ where: { profileId: id }, select: { kycStatus: true, isOnline: true, lastHeartbeatAt: true } });
    expect(after).toMatchObject({ kycStatus: "verified", isOnline: true });
    expect(after.lastHeartbeatAt).not.toBeNull();
  });

  it("a biker whose ID check is still pending is refused going online with reason kyc, and stays offline", async () => {
    const id = await makeCustomer();
    await riders.becomeRider(id, {});

    const err = await riders.setOnline(id, true, HARARE).catch((e: unknown) => e);
    expect((err as { getStatus: () => number }).getStatus()).toBe(403);
    expect((err as { getResponse: () => unknown }).getResponse()).toMatchObject({ reason: "kyc" });
    expect((await prisma.rider.findUniqueOrThrow({ where: { profileId: id }, select: { isOnline: true } })).isOnline).toBe(false);
  });

  it("the heartbeat's guarded UPDATE re-checks KYC on the real row: a lapse that left is_online set can't keep beating", async () => {
    const id = await makeCustomer();
    await riders.becomeRider(id, {});
    const { kycRef } = await prisma.rider.findUniqueOrThrow({ where: { profileId: id }, select: { kycRef: true } });
    await riders.applyKycResult(kycRef!, "verified", new Date());
    await riders.setOnline(id, true, HARARE);
    await expect(riders.heartbeat(id)).resolves.toEqual({ online: true });

    // A writer that lapses the ID without pulling the rider offline (every real lapse path does both;
    // this is the belt the CAS adds to those braces). Before 2026-10-12 the beat matched this row.
    await prisma.rider.update({ where: { profileId: id }, data: { kycStatus: "expired" } });
    const err = await riders.heartbeat(id).catch((e: unknown) => e);
    expect((err as { getResponse: () => unknown }).getResponse()).toMatchObject({ reason: "kyc_expired" });
  });
});
