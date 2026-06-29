/**
 * Offer-loop concurrency proof (ENG-REVIEW "2am Friday" test). Runs against a real PostGIS
 * database in CI (needs DATABASE_URL). Proves the guarded CAS and the one_active_ride index
 * actually prevent double-assignment under concurrent selection.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { Env } from "../config/env";
import { TokenService } from "../auth/token.service";
import type { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";
import { MatchingService } from "./matching.service";

const prisma = new PrismaService();
const tokens = new TokenService({ JWT_SIGNING_SECRET: "int-test-secret-0123456789", ACCESS_TTL_SECONDS: 900 } as Env);
// Push is fire-and-forget; a no-op stub keeps the concurrency proof off the notification path.
const noopNotifications = { notifyOrderStatus: async () => {} } as unknown as NotificationsService;
const matching = new MatchingService(prisma, tokens, noopNotifications);

async function clean(): Promise<void> {
  await prisma.orderEvent.deleteMany({});
  await prisma.rating.deleteMany({});
  await prisma.offer.deleteMany({});
  await prisma.order.deleteMany({});
  await prisma.rider.deleteMany({});
  await prisma.profile.deleteMany({});
}

async function makeCustomer(): Promise<string> {
  const p = await prisma.profile.create({
    data: { role: "customer", firstName: "Tendai", lastName: "M", phone: `c_${crypto.randomUUID()}` },
    select: { id: true },
  });
  return p.id;
}

async function makeRider(): Promise<string> {
  const p = await prisma.profile.create({
    data: { role: "rider", firstName: "Rider", lastName: "R", phone: `r_${crypto.randomUUID()}` },
    select: { id: true },
  });
  await prisma.rider.create({
    data: {
      profileId: p.id,
      bikeReg: "ABZ 0000",
      photoUrl: "x",
      kycStatus: "verified",
      isOnline: true,
      lastHeartbeatAt: new Date(),
    },
  });
  return p.id;
}

async function makeOpenOrder(customerId: string): Promise<string> {
  const o = await prisma.order.create({
    data: {
      customerId,
      pickup: { lat: -17.82, lng: 31.05, landmark: "CBD", contactPhone: "+263" },
      dropoff: { lat: -17.8, lng: 31.07, landmark: "Avenues", contactPhone: "+263" },
      itemDesc: "documents",
      declaredValue: 10,
      suggestedFare: 2.5,
      proposedFare: 2.5,
      status: "open_for_offers",
    },
    select: { id: true },
  });
  return o.id;
}

async function makeOffer(orderId: string, riderId: string): Promise<string> {
  const offer = await prisma.offer.create({
    data: { orderId, riderId, type: "accept", offeredFare: 2.5, etaMinutes: 6 },
    select: { id: true },
  });
  return offer.id;
}

beforeAll(async () => {
  await prisma.$connect();
});
afterAll(async () => {
  await clean();
  await prisma.$disconnect();
});
beforeEach(clean);

describe("offer loop concurrency", () => {
  it("ET1: two customers selecting the same order assign exactly one rider", async () => {
    const customer = await makeCustomer();
    const order = await makeOpenOrder(customer);
    const [r1, r2] = [await makeRider(), await makeRider()];
    const o1 = await makeOffer(order, r1);
    const o2 = await makeOffer(order, r2);

    const results = await Promise.allSettled([
      matching.selectOffer(order, o1, customer),
      matching.selectOffer(order, o2, customer),
    ]);

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);

    const assigned = await prisma.order.findUniqueOrThrow({ where: { id: order }, select: { status: true } });
    expect(assigned.status).toBe("assigned");
    const selected = await prisma.offer.count({ where: { orderId: order, status: "selected" } });
    expect(selected).toBe(1);
  });

  it("ET2: a rider selected on two orders at once is assigned to exactly one", async () => {
    const customer = await makeCustomer();
    const rider = await makeRider();
    const orderA = await makeOpenOrder(customer);
    const orderB = await makeOpenOrder(customer);
    const offerA = await makeOffer(orderA, rider);
    const offerB = await makeOffer(orderB, rider);

    const results = await Promise.allSettled([
      matching.selectOffer(orderA, offerA, customer),
      matching.selectOffer(orderB, offerB, customer),
    ]);

    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);

    const activeForRider = await prisma.order.count({
      where: { riderId: rider, status: "assigned" },
    });
    expect(activeForRider).toBe(1);
  });

  it("ET1: select vs expiry race resolves to exactly one terminal state", async () => {
    const customer = await makeCustomer();
    const order = await makeOpenOrder(customer);
    const rider = await makeRider();
    const offer = await makeOffer(order, rider);

    const [sel, exp] = await Promise.allSettled([
      matching.selectOffer(order, offer, customer),
      matching.expireOrder(order),
    ]);

    const final = await prisma.order.findUniqueOrThrow({ where: { id: order }, select: { status: true } });
    // Whoever won, the order is in exactly one consistent terminal state — never both.
    if (sel.status === "fulfilled") {
      expect(final.status).toBe("assigned");
    } else {
      expect(["expired", "assigned"]).toContain(final.status);
    }
    expect(exp.status).toBe("fulfilled"); // expire never throws; it just no-ops when select won
  });
});
