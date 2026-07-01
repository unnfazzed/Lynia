/**
 * Geo query proof (ET6). Runs against a real PostGIS database in CI (needs DATABASE_URL).
 * Exercises the raw SQL that unit tests can't reach: updateRiderLocation (ST_MakePoint/geog write)
 * and nearbyRiders (ST_DWithin radius filter + ST_Distance ordering over the GiST geog index).
 */
import type { CreateOrderRequest } from "@lynia/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { OfferExpiryService } from "../matching/offer-expiry.service";
import type { NotificationsService } from "../notifications/notifications.service";
import type { Env } from "../config/env";
import { OrdersService } from "../orders/orders.service";
import type { TrackingGateway } from "./tracking.gateway";
import { PrismaService } from "../prisma/prisma.service";
import { TrackingService } from "./tracking.service";

const prisma = new PrismaService();
// REDIS_URL unset: recordFix/updateRiderLocation exercise the direct PG geo write (no throttle).
const tracking = new TrackingService({ REDIS_URL: undefined } as Env, prisma);

// Harare CBD. ~0.01° of latitude ≈ 1.11 km, so the offsets below give predictable distances.
const CENTER = { lat: -17.8292, lng: 31.0522 };

async function clean(): Promise<void> {
  await prisma.order.deleteMany({});
  await prisma.rider.deleteMany({});
  await prisma.profile.deleteMany({});
}

/** A rider with a chosen online state and no position yet (geog NULL until located). */
async function makeRider(isOnline: boolean): Promise<string> {
  const p = await prisma.profile.create({
    data: { role: "rider", firstName: "Rider", lastName: "R", phone: `r_${crypto.randomUUID()}` },
    select: { id: true },
  });
  await prisma.rider.create({
    data: { profileId: p.id, bikeReg: "ABZ 0000", photoUrl: "x", kycStatus: "verified", isOnline },
  });
  return p.id;
}

beforeAll(async () => {
  await prisma.$connect();
});
afterAll(async () => {
  await clean();
  await prisma.$disconnect();
});
beforeEach(clean);

describe("TrackingService geo queries (ET6)", () => {
  it("updateRiderLocation persists lat/lng (and a queryable geog point)", async () => {
    const rider = await makeRider(true);
    await tracking.updateRiderLocation(rider, CENTER.lat, CENTER.lng);

    const row = await prisma.rider.findUniqueOrThrow({
      where: { profileId: rider },
      select: { currentLat: true, currentLng: true, lastHeartbeatAt: true },
    });
    expect(row.currentLat).toBeCloseTo(CENTER.lat, 5);
    expect(row.currentLng).toBeCloseTo(CENTER.lng, 5);
    expect(row.lastHeartbeatAt).not.toBeNull();

    // The point is now reachable by the radius query from the same spot (distance ~0 m).
    const hits = await tracking.nearbyRiders(CENTER.lat, CENTER.lng, 100);
    expect(hits.map((h) => h.profileId)).toContain(rider);
    expect(hits.find((h) => h.profileId === rider)!.distanceM).toBeLessThan(1);
  });

  it("returns online, in-radius riders ordered nearest-first", async () => {
    const near = await makeRider(true); // ~0.33 km north
    const far = await makeRider(true); // ~1.66 km north (still inside 3 km)
    await tracking.updateRiderLocation(near, CENTER.lat + 0.003, CENTER.lng);
    await tracking.updateRiderLocation(far, CENTER.lat + 0.015, CENTER.lng);

    const hits = await tracking.nearbyRiders(CENTER.lat, CENTER.lng, 3000);

    expect(hits.map((h) => h.profileId)).toEqual([near, far]);
    expect(hits[0]!.distanceM).toBeLessThan(hits[1]!.distanceM);
  });

  it("excludes riders outside the radius", async () => {
    const inside = await makeRider(true); // ~0.33 km
    const outside = await makeRider(true); // ~11 km — beyond a 3 km query
    await tracking.updateRiderLocation(inside, CENTER.lat + 0.003, CENTER.lng);
    await tracking.updateRiderLocation(outside, CENTER.lat + 0.1, CENTER.lng);

    const ids = (await tracking.nearbyRiders(CENTER.lat, CENTER.lng, 3000)).map((h) => h.profileId);
    expect(ids).toContain(inside);
    expect(ids).not.toContain(outside);
  });

  it("excludes offline riders even when in range", async () => {
    const offline = await makeRider(false);
    await tracking.updateRiderLocation(offline, CENTER.lat, CENTER.lng);

    const ids = (await tracking.nearbyRiders(CENTER.lat, CENTER.lng, 3000)).map((h) => h.profileId);
    expect(ids).not.toContain(offline);
  });

  it("excludes online riders with no position (NULL geog)", async () => {
    const located = await makeRider(true);
    const noGeog = await makeRider(true); // online but never located
    await tracking.updateRiderLocation(located, CENTER.lat, CENTER.lng);

    const ids = (await tracking.nearbyRiders(CENTER.lat, CENTER.lng, 3000)).map((h) => h.profileId);
    expect(ids).toContain(located);
    expect(ids).not.toContain(noGeog);
  });
});

describe("orders.pickup_geog generated column (migration 0006) + listOpenNearby", () => {
  // OrdersService.listOpenNearby only touches this.prisma; the other collaborators are inert here.
  const orders = new OrdersService(
    prisma,
    {} as OfferExpiryService,
    tracking,
    {} as NotificationsService,
    {} as TrackingGateway,
  );

  async function makeCustomer(): Promise<string> {
    const p = await prisma.profile.create({
      data: { role: "customer", firstName: "Cust", lastName: "C", phone: `c_${crypto.randomUUID()}` },
      select: { id: true },
    });
    return p.id;
  }

  /** Insert an open order at a pickup point (or malformed pickup when point is null). Returns id. */
  async function makeOrder(customerId: string, point: { lat: number; lng: number } | null): Promise<string> {
    const pickup = point
      ? { point, landmark: "Somewhere", contactPhone: "+263771111111" }
      : { landmark: "No point", contactPhone: "+263771111111" }; // malformed → NULL pickup_geog
    const o = await prisma.order.create({
      data: {
        customerId,
        pickup: pickup as unknown as CreateOrderRequest["pickup"] as never,
        dropoff: { point: CENTER, landmark: "Drop", contactPhone: "+263772222222" } as never,
        itemDesc: "Documents",
        suggestedFare: 2.4,
        proposedFare: 2.5,
        status: "open_for_offers",
      },
      select: { id: true },
    });
    return o.id;
  }

  it("backfills a non-null pickup_geog for a well-formed pickup and NULL for a malformed one", async () => {
    const cust = await makeCustomer();
    const good = await makeOrder(cust, CENTER);
    const bad = await makeOrder(cust, null); // no pickup.point → generated column is NULL, not an error

    const rows = await prisma.$queryRaw<Array<{ id: string; has_geog: boolean }>>`
      SELECT id, pickup_geog IS NOT NULL AS has_geog FROM orders WHERE id IN (${good}::uuid, ${bad}::uuid)`;
    const byId = new Map(rows.map((r) => [r.id, r.has_geog]));
    expect(byId.get(good)).toBe(true);
    expect(byId.get(bad)).toBe(false);
  });

  it("listOpenNearby returns in-radius orders nearest-first and skips malformed pickups", async () => {
    const cust = await makeCustomer();
    const near = await makeOrder(cust, { lat: CENTER.lat + 0.003, lng: CENTER.lng }); // ~0.33 km
    const far = await makeOrder(cust, { lat: CENTER.lat + 0.015, lng: CENTER.lng }); // ~1.66 km
    await makeOrder(cust, { lat: CENTER.lat + 0.1, lng: CENTER.lng }); // ~11 km — outside 3 km
    await makeOrder(cust, null); // malformed — must not 500 the board

    const list = await orders.listOpen(CENTER.lat, CENTER.lng, 3000);
    const ids = list.map((o) => o.id);

    expect(ids).toEqual([near, far]); // nearest-first, outside-radius + malformed excluded
    // Redaction preserved on the geo path — point + landmark only, never contactPhone.
    expect(list[0]!.pickup).not.toHaveProperty("contactPhone");
    expect(JSON.stringify(list[0])).not.toContain("+263");
  });
});
