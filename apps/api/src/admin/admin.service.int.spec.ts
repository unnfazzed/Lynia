/**
 * Plan §5 C5: proves the utilization() raw SQL (day bucketing, orderType split, active-rider
 * denominator, NULLIF-guarded ratios) against a real Postgres — a mocked $queryRaw in the unit spec
 * can't reach any of that logic. Runs in CI (needs DATABASE_URL); see vitest.int.config.ts.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Env } from "../config/env";
import { PrismaService } from "../prisma/prisma.service";
import { AdminService } from "./admin.service";

const prisma = new PrismaService();
const admin = new AdminService(prisma, {} as unknown as Env);

async function clean(): Promise<void> {
  await prisma.orderEvent.deleteMany({});
  await prisma.order.deleteMany({});
  await prisma.rider.deleteMany({});
  await prisma.profile.deleteMany({});
}

async function makeCustomer(): Promise<string> {
  const p = await prisma.profile.create({
    data: { role: "customer", firstName: "Cust", lastName: "C", phone: `c_${crypto.randomUUID()}` },
    select: { id: true },
  });
  return p.id;
}

/** A rider with no online state / heartbeat unless given one. */
async function makeRider(lastHeartbeatAt?: Date): Promise<string> {
  const p = await prisma.profile.create({
    data: { role: "rider", firstName: "Rider", lastName: "R", phone: `r_${crypto.randomUUID()}` },
    select: { id: true },
  });
  await prisma.rider.create({
    data: { profileId: p.id, bikeReg: "ABZ 0000", photoUrl: "x", kycStatus: "verified", lastHeartbeatAt },
  });
  return p.id;
}

/** An order for `riderId` with one `assigned` OrderEvent stamped at `assignedAt`. Created straight
 *  into a terminal `completed` status (rather than left `assigned`) so a test rider can carry more
 *  than one of these — `one_active_ride` is a partial unique index on `orders.rider_id` that only
 *  excludes terminal statuses, and utilization() reads the historical OrderEvent log, not the
 *  order's current status, so the terminal status here doesn't change what's under test. */
async function makeAssignment(
  customerId: string,
  riderId: string,
  orderType: "parcel" | "merchant",
  assignedAt: Date,
): Promise<void> {
  const o = await prisma.order.create({
    data: {
      customerId,
      riderId,
      orderType,
      pickup: { landmark: "A", contactPhone: "+263771111111" } as never,
      dropoff: { landmark: "B", contactPhone: "+263772222222" } as never,
      itemDesc: "Item",
      suggestedFare: 2,
      proposedFare: 2,
      status: "completed",
      completedAt: assignedAt,
    },
    select: { id: true },
  });
  await prisma.orderEvent.create({ data: { orderId: o.id, status: "assigned", createdAt: assignedAt } });
}

function daysAgo(n: number, hour = 10): Date {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - n);
  d.setUTCHours(hour, 0, 0, 0);
  return d;
}

beforeAll(async () => {
  await prisma.$connect();
});
afterAll(async () => {
  await clean();
  await prisma.$disconnect();
});
beforeEach(clean);

describe("AdminService.utilization (real Postgres)", () => {
  it("splits assignments by orderType and derives per-vertical ratios off the SAME fleet-wide denominator", async () => {
    const customer = await makeCustomer();
    const riderA = await makeRider();
    const riderB = await makeRider();

    // Two days ago: rider A takes a parcel, rider B takes a merchant order. 2 active riders.
    await makeAssignment(customer, riderA, "parcel", daysAgo(2));
    await makeAssignment(customer, riderB, "merchant", daysAgo(2));
    // Yesterday: rider A alone takes two parcels. 1 active rider.
    await makeAssignment(customer, riderA, "parcel", daysAgo(1, 9));
    await makeAssignment(customer, riderA, "parcel", daysAgo(1, 15));

    const rows = await admin.utilization(3);
    expect(rows).toHaveLength(3);
    const byDay = new Map(rows.map((r) => [r.day, r]));

    const twoDaysAgo = byDay.get(daysAgo(2).toISOString().slice(0, 10))!;
    expect(twoDaysAgo).toMatchObject({
      assignments: 2,
      express: 1,
      merchant: 1,
      activeRiders: 2,
      ridesPerActiveRider: 1,
      expressRidesPerActiveRider: 0.5,
      merchantRidesPerActiveRider: 0.5,
      heartbeatArmIncluded: false,
    });

    const yesterday = byDay.get(daysAgo(1).toISOString().slice(0, 10))!;
    expect(yesterday).toMatchObject({
      assignments: 2,
      express: 2,
      merchant: 0,
      activeRiders: 1,
      ridesPerActiveRider: 2,
      expressRidesPerActiveRider: 2,
      merchantRidesPerActiveRider: 0,
    });
  });

  it("folds the heartbeat arm into TODAY only, and reports null ratios (never a divide-by-zero) on a dry day", async () => {
    const customer = await makeCustomer();
    const assigned = await makeRider();
    await makeRider(new Date()); // online-only rider: heartbeat today, no assignment ever

    await makeAssignment(customer, assigned, "merchant", daysAgo(0, 1));

    const rows = await admin.utilization(2);
    const today = rows.find((r) => r.heartbeatArmIncluded)!;
    // Active riders today = {assigned (via assignment), onlineOnly (via heartbeat)} = 2.
    expect(today).toMatchObject({ assignments: 1, express: 0, merchant: 1, activeRiders: 2 });
    expect(today.merchantRidesPerActiveRider).toBe(0.5);

    const dry = rows.find((r) => !r.heartbeatArmIncluded)!;
    expect(dry).toMatchObject({ assignments: 0, activeRiders: 0 });
    expect(dry.ridesPerActiveRider).toBeNull();
    expect(dry.expressRidesPerActiveRider).toBeNull();
    expect(dry.merchantRidesPerActiveRider).toBeNull();
  });
});
