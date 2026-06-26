/**
 * Delivery-lifecycle proof. Runs against a real PostGIS database in CI (needs DATABASE_URL).
 * Drives a full trip assigned → … → completed through the guarded transitions, and proves the
 * CAS guards reject out-of-order/wrong-actor moves and that `delivered` frees the rider.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { TokenService } from "../auth/token.service";
import type { Env } from "../config/env";
import { StubKycVendor } from "../kyc/kyc-vendor";
import { MatchingService } from "../matching/matching.service";
import { PrismaService } from "../prisma/prisma.service";
import { RiderService } from "../riders/rider.service";
import type { TrackingGateway } from "../tracking/tracking.gateway";
import { OrderLifecycleService } from "./order-lifecycle.service";

const prisma = new PrismaService();
const tokens = new TokenService({ JWT_SIGNING_SECRET: "int-test-secret-0123456789", ACCESS_TTL_SECONDS: 900 } as Env);
const matching = new MatchingService(prisma, tokens);
const gateway = { emitOrderStatus: () => undefined } as unknown as TrackingGateway;
// No onModuleInit() → no Redis queue; scheduleAutoClose() no-ops, which is what we want under test.
const lifecycle = new OrderLifecycleService({} as Env, prisma, tokens, gateway);
const riders = new RiderService(prisma, {} as Env, new StubKycVendor());

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
    data: { role: "customer", firstName: "Tariro", lastName: "C", phone: `c_${crypto.randomUUID()}` },
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
    data: { profileId: p.id, bikeReg: "ABZ 0000", photoUrl: "x", kycStatus: "verified", isOnline: true, lastHeartbeatAt: new Date() },
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

/** Assign a fresh order to a rider and return { orderId, deliveryCode }. */
async function assign(customerId: string, riderId: string): Promise<{ orderId: string; deliveryCode: string }> {
  const orderId = await makeOpenOrder(customerId);
  const offerId = await makeOffer(orderId, riderId);
  const sel = await matching.selectOffer(orderId, offerId, customerId);
  return { orderId, deliveryCode: sel.deliveryCode };
}

async function statusOf(orderId: string): Promise<string> {
  const o = await prisma.order.findUniqueOrThrow({ where: { id: orderId }, select: { status: true } });
  return o.status;
}

beforeAll(async () => {
  await prisma.$connect();
});
afterAll(async () => {
  await clean();
  await prisma.$disconnect();
});
beforeEach(clean);

describe("delivery lifecycle", () => {
  it("drives a full trip assigned → completed and updates the rider's rating", async () => {
    const customer = await makeCustomer();
    const rider = await makeRider();
    const { orderId, deliveryCode } = await assign(customer, rider);

    await lifecycle.advance(orderId, rider, "confirmed");
    await lifecycle.advance(orderId, rider, "en_route_pickup");
    await lifecycle.advance(orderId, rider, "picked_up");
    await lifecycle.advance(orderId, rider, "en_route_dropoff");
    expect(await statusOf(orderId)).toBe("en_route_dropoff");

    await lifecycle.confirmDelivery(orderId, rider, deliveryCode);
    expect(await statusOf(orderId)).toBe("delivered");

    await lifecycle.rate(orderId, customer, 5, "fast and friendly");
    expect(await statusOf(orderId)).toBe("completed");

    const r = await prisma.rider.findUniqueOrThrow({ where: { profileId: rider }, select: { ratingCount: true, ratingAvg: true, tripsCount: true } });
    expect(r.ratingCount).toBe(1);
    expect(r.ratingAvg).toBe(5);
    expect(r.tripsCount).toBe(1);
    const rating = await prisma.rating.findUnique({ where: { orderId } });
    expect(rating?.score).toBe(5);
  });

  it("guards reject skipping a step and a non-assigned rider", async () => {
    const customer = await makeCustomer();
    const rider = await makeRider();
    const other = await makeRider();
    const { orderId } = await assign(customer, rider);

    // Skipping straight to picked_up (needs en_route_pickup) is rejected.
    await expect(lifecycle.advance(orderId, rider, "picked_up")).rejects.toThrow();
    // A different rider cannot advance the order.
    await expect(lifecycle.advance(orderId, other, "confirmed")).rejects.toThrow(/assigned rider/i);
    expect(await statusOf(orderId)).toBe("assigned");
  });

  it("rejects a wrong delivery code, counts the attempt, and accepts the right one", async () => {
    const customer = await makeCustomer();
    const rider = await makeRider();
    const { orderId, deliveryCode } = await assign(customer, rider);
    for (const to of ["confirmed", "en_route_pickup", "picked_up", "en_route_dropoff"] as const) {
      await lifecycle.advance(orderId, rider, to);
    }

    const wrong = deliveryCode === "000000" ? "111111" : "000000";
    await expect(lifecycle.confirmDelivery(orderId, rider, wrong)).rejects.toThrow(/incorrect/i);
    const after = await prisma.order.findUniqueOrThrow({ where: { id: orderId }, select: { deliveryOtpAttempts: true } });
    expect(after.deliveryOtpAttempts).toBe(1); // persisted despite the throw

    await lifecycle.confirmDelivery(orderId, rider, deliveryCode);
    expect(await statusOf(orderId)).toBe("delivered");
  });

  it("auto-close completes a delivered-but-unrated order and frees the rider", async () => {
    const customer = await makeCustomer();
    const rider = await makeRider();
    const { orderId, deliveryCode } = await assign(customer, rider);
    for (const to of ["confirmed", "en_route_pickup", "picked_up", "en_route_dropoff"] as const) {
      await lifecycle.advance(orderId, rider, to);
    }
    await lifecycle.confirmDelivery(orderId, rider, deliveryCode);

    expect(await lifecycle.completeOrder(orderId)).toEqual({ completed: true });
    expect(await statusOf(orderId)).toBe("completed");
    expect(await lifecycle.completeOrder(orderId)).toEqual({ completed: false }); // idempotent

    // delivered/completed leave one_active_ride, so the same rider can take a new order.
    const second = await assign(customer, rider);
    expect(await statusOf(second.orderId)).toBe("assigned");
  });

  it("a customer cancel frees the order and the rider", async () => {
    const customer = await makeCustomer();
    const rider = await makeRider();
    const { orderId } = await assign(customer, rider);

    const res = await lifecycle.cancel(orderId, customer, "changed plans");
    expect(res).toMatchObject({ status: "cancelled", cancelledBy: "customer" });
    expect(await statusOf(orderId)).toBe("cancelled");

    // cancelled leaves one_active_ride → the rider can be assigned again.
    const next = await assign(customer, rider);
    expect(await statusOf(next.orderId)).toBe("assigned");
  });

  it("three rider cancels trigger a cooldown that blocks going online", async () => {
    const customer = await makeCustomer();
    const rider = await makeRider();
    for (let i = 0; i < 3; i++) {
      const { orderId } = await assign(customer, rider);
      await lifecycle.cancel(orderId, rider, "cannot make it");
    }

    const r = await prisma.rider.findUniqueOrThrow({
      where: { profileId: rider },
      select: { cancelStrikes: true, cooldownUntil: true, isOnline: true },
    });
    expect(r.cancelStrikes).toBe(0); // reset at the limit
    expect(r.cooldownUntil).not.toBeNull();
    expect(r.isOnline).toBe(false); // forced offline

    await expect(riders.setOnline(rider, true)).rejects.toThrow(/cooldown/i);
  });

  it("concurrent advance of the same step assigns exactly one winner (guarded CAS)", async () => {
    const customer = await makeCustomer();
    const rider = await makeRider();
    const { orderId } = await assign(customer, rider);

    const results = await Promise.allSettled([
      lifecycle.advance(orderId, rider, "confirmed"),
      lifecycle.advance(orderId, rider, "confirmed"),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    expect(await statusOf(orderId)).toBe("confirmed");
  });

  it("serializes OTP attempts so concurrent wrong guesses cannot bypass the lockout", async () => {
    const customer = await makeCustomer();
    const rider = await makeRider();
    const { orderId, deliveryCode } = await assign(customer, rider);
    for (const to of ["confirmed", "en_route_pickup", "picked_up", "en_route_dropoff"] as const) {
      await lifecycle.advance(orderId, rider, to);
    }

    const wrong = deliveryCode === "000000" ? "111111" : "000000";
    const tries = await Promise.allSettled(
      Array.from({ length: 8 }, () => lifecycle.confirmDelivery(orderId, rider, wrong)),
    );
    expect(tries.every((t) => t.status === "rejected")).toBe(true);

    const after = await prisma.order.findUniqueOrThrow({ where: { id: orderId }, select: { deliveryOtpAttempts: true } });
    expect(after.deliveryOtpAttempts).toBe(5); // exactly the cap — the FOR UPDATE lock prevents over-counting/bypass
    expect(await statusOf(orderId)).toBe("en_route_dropoff"); // never wrongly delivered
  });
});
