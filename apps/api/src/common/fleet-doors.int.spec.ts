/**
 * Own bikers (docs/designs/own-bikers.md, D-117), T2: the doors in front of the database guard, on a real PostGIS
 * (needs DATABASE_URL). The guard (fleet-guards.int.spec.ts) refuses an out-of-scope assignment at commit; these
 * prove an Own biker is never SHOWN, PUSHED or RUNG for public work in the first place, and that a fleet job never
 * shows up as public work. The raw SQL here is what the unit specs can't reach.
 */
import type { CreateOrderRequest } from "@lynia/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Env } from "../config/env";
import type { OfferExpiryService } from "../matching/offer-expiry.service";
import type { NotificationsService } from "../notifications/notifications.service";
import { MetricsService } from "../observability/metrics.service";
import { OrdersService } from "../orders/orders.service";
import { PrismaService } from "../prisma/prisma.service";
import type { TrackingGateway } from "../tracking/tracking.gateway";
import { TrackingService } from "../tracking/tracking.service";

const prisma = new PrismaService();
// No Redis: nearbyRiders takes its PG leg, the one with the full predicate.
const tracking = new TrackingService({ REDIS_URL: undefined } as Env, prisma, new MetricsService());
const orders = new OrdersService(prisma, {} as OfferExpiryService, tracking, {} as NotificationsService, {} as TrackingGateway);

const CENTER = { lat: -17.8292, lng: 31.0522 };

async function clean(): Promise<void> {
  await prisma.orderEvent.deleteMany({});
  await prisma.offer.deleteMany({});
  await prisma.order.deleteMany({});
  await prisma.rider.deleteMany({});
  await prisma.ownerFleet.deleteMany({});
  await prisma.merchant.deleteMany({});
  await prisma.profile.deleteMany({});
}

async function profile(role: "customer" | "rider" | "merchant"): Promise<string> {
  const p = await prisma.profile.create({ data: { role, firstName: "T", lastName: role, phone: `x_${crypto.randomUUID()}` }, select: { id: true } });
  return p.id;
}

async function fleet(): Promise<{ ownerId: string; branchId: string }> {
  const ownerId = await profile("merchant");
  await prisma.ownerFleet.create({ data: { ownerProfileId: ownerId, enabled: true, rideFee: 1.5 } });
  const m = await prisma.merchant.create({ data: { name: "Chicken Inn Avondale", ownerProfileId: ownerId }, select: { id: true } });
  return { ownerId, branchId: m.id };
}

/** A verified biker at CENTER, online (fresh heartbeat) or offline; public unless given a fleet. */
async function biker(opts: { online: boolean; fleet?: { ownerId: string; branchId: string } }): Promise<string> {
  const id = await profile("rider");
  await prisma.rider.create({
    data: {
      profileId: id,
      bikeReg: "ABZ 0000",
      kycStatus: "verified",
      isOnline: true,
      fleetOwnerProfileId: opts.fleet?.ownerId ?? null,
      fleetHomeMerchantId: opts.fleet?.branchId ?? null,
    },
  });
  await tracking.updateRiderLocation(id, CENTER.lat, CENTER.lng);
  if (!opts.online) await prisma.rider.update({ where: { profileId: id }, data: { isOnline: false } });
  return id;
}

/** An open parcel at CENTER; with `fleetBranch` it is that branch's (merchant-owned) fleet job. */
async function openParcel(fleetBranch?: string): Promise<string> {
  const customerId = await profile("customer");
  const o = await prisma.order.create({
    data: {
      customerId,
      merchantId: fleetBranch ?? null,
      pickup: { point: CENTER, landmark: "Avondale", contactPhone: "+263771111111" } as unknown as CreateOrderRequest["pickup"] as never,
      dropoff: { point: CENTER, landmark: "Drop", contactPhone: "+263772222222" } as never,
      itemDesc: "chicken",
      suggestedFare: 2.4,
      proposedFare: 2.5,
      status: "open_for_offers",
      ...(fleetBranch ? { fleetMerchantId: fleetBranch, fleetFee: 1.5 } : {}),
    },
    select: { id: true },
  });
  return o.id;
}

beforeAll(async () => {
  await prisma.$connect();
});
beforeEach(clean);
afterAll(async () => {
  await clean();
  await prisma.$disconnect();
});

describe("an Own biker is never shown, pushed or rung for public work", () => {
  it("nearbyRiders (pushes, food dispatch, supply counts) returns public bikers only", async () => {
    const f = await fleet();
    const pub = await biker({ online: true });
    const own = await biker({ online: true, fleet: f });
    const ids = (await tracking.nearbyRiders(CENTER.lat, CENTER.lng, 3000)).map((r) => r.profileId);
    expect(ids).toContain(pub);
    expect(ids).not.toContain(own);
  });

  it("the offline demand nudge reaches public bikers only", async () => {
    const f = await fleet();
    const pub = await biker({ online: false });
    const own = await biker({ online: false, fleet: f });
    const ids = await tracking.offlineRidersNear(CENTER.lat, CENTER.lng, 3000);
    expect(ids).toContain(pub);
    expect(ids).not.toContain(own);
  });

  it("the public board, its socket room and the demand map are closed to an Own biker", async () => {
    const f = await fleet();
    const pub = await biker({ online: true });
    const own = await biker({ online: true, fleet: f });
    expect(await tracking.isBoardEligible(pub)).toBe(true);
    expect(await tracking.isBoardEligible(own)).toBe(false);
  });
});

describe("a fleet job never shows up as public work", () => {
  it("the open-jobs board (city-wide and nearby) lists public parcels only", async () => {
    const f = await fleet();
    const pub = await openParcel();
    const own = await openParcel(f.branchId);
    const nearby = (await orders.listOpen(CENTER.lat, CENTER.lng, 3000)).map((o) => o.id);
    expect(nearby).toContain(pub);
    expect(nearby).not.toContain(own);
    const cityWide = (await orders.listOpen()).map((o) => o.id);
    expect(cityWide).toContain(pub);
    expect(cityWide).not.toContain(own);
  });

  it("the demand map counts public jobs only", async () => {
    const f = await fleet();
    // Two fleet jobs alone would make a zone (it needs 2); they must not.
    await openParcel(f.branchId);
    await openParcel(f.branchId);
    expect(await orders.demandZones(CENTER.lat, CENTER.lng)).toEqual([]);
    await openParcel();
    await openParcel();
    expect((await orders.demandZones(CENTER.lat, CENTER.lng)).length).toBe(1);
  });
});
