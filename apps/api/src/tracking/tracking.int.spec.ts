/**
 * Geo query proof (ET6). Runs against a real PostGIS database in CI (needs DATABASE_URL).
 * Exercises the raw SQL that unit tests can't reach: updateRiderLocation (ST_MakePoint/geog write)
 * and nearbyRiders (ST_DWithin radius filter + ST_Distance ordering over the GiST geog index).
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Env } from "../config/env";
import { PrismaService } from "../prisma/prisma.service";
import { TrackingService } from "./tracking.service";

const prisma = new PrismaService();
// REDIS_URL unset: recordFix/updateRiderLocation exercise the direct PG geo write (no throttle).
const tracking = new TrackingService({ REDIS_URL: undefined } as Env, prisma);

// Harare CBD. ~0.01° of latitude ≈ 1.11 km, so the offsets below give predictable distances.
const CENTER = { lat: -17.8292, lng: 31.0522 };

async function clean(): Promise<void> {
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
