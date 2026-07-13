/**
 * Delivery-lifecycle proof. Runs against a real PostGIS database in CI (needs DATABASE_URL).
 * Drives a full trip assigned → … → completed through the guarded transitions, and proves the
 * CAS guards reject out-of-order/wrong-actor moves and that `delivered` frees the rider.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { TokenService } from "../auth/token.service";
import type { Env } from "../config/env";
import { StubKycVendor } from "../kyc/kyc-vendor";
import { PiiCryptoService } from "../common/pii-crypto.service";
import { MatchingService } from "../matching/matching.service";
import type { NotificationsService } from "../notifications/notifications.service";
import { MetricsService } from "../observability/metrics.service";
import { PrismaService } from "../prisma/prisma.service";
import { RiderService } from "../riders/rider.service";
import type { TrackingGateway } from "../tracking/tracking.gateway";
import type { OrdersService } from "./orders.service";
import { OrderLifecycleService } from "./order-lifecycle.service";

const prisma = new PrismaService();
const tokens = new TokenService({ JWT_SIGNING_SECRET: "int-test-secret-0123456789", ACCESS_TTL_SECONDS: 900 } as Env);
// Push is fire-and-forget; a no-op stub keeps the lifecycle proof off the notification path.
const noopNotifications = {
  notifyOrderStatus: async () => {},
  notifyNewOffer: async () => {},
  notifyProfiles: async () => {},
} as unknown as NotificationsService;
// Real MetricsService is NoopMeter-safe with no OTLP endpoint (every record is a cheap no-op).
// The gateway captures job:cancelled so the two-sided WS contract (C3) is asserted at integration
// level; the other emits are best-effort no-ops.
const jobCancelledEmits: Array<{ orderId: string; collected: boolean; cancelledBy: string }> = [];
const gateway = {
  emitOrderStatus: () => undefined,
  emitBidExpired: () => undefined,
  emitOrderTaken: () => undefined,
  emitJobCancelled: (orderId: string, collected: boolean, cancelledBy: string) =>
    jobCancelledEmits.push({ orderId, collected, cancelledBy }),
  emitOrderRebroadcast: () => undefined,
} as unknown as TrackingGateway;
// The no-bid-expiry supply check is best-effort push; an empty nearby list keeps it off the geo path.
const matchingTrackingStub = { nearbyRiders: async () => [] } as unknown as import("../tracking/tracking.service").TrackingService;
const matching = new MatchingService(prisma, tokens, noopNotifications, new MetricsService(), gateway, matchingTrackingStub);
// The board announce for F-01 re-broadcast is best-effort push; stub it so the proof asserts DB state
// (the new open_for_offers row) without a live socket/Redis, mirroring how notifications are stubbed.
const noopOrders = { announceOpenOrder: async () => {} } as unknown as OrdersService;
// No onModuleInit() → no Redis queue; scheduleAutoClose() no-ops, which is what we want under test.
const lifecycle = new OrderLifecycleService({} as Env, prisma, tokens, gateway, noopNotifications, noopOrders);
const trackingStub = { evictFromGeo: async () => {}, claimNotifyWaitersNear: async () => [], clearNotifyWaiters: async () => {} } as unknown as import("../tracking/tracking.service").TrackingService;
const notificationsStub = { notifyRidersAvailable: async () => {}, notifyProfiles: async () => {} } as unknown as import("../notifications/notifications.service").NotificationsService;
const riders = new RiderService(prisma, {} as Env, new StubKycVendor(), new PiiCryptoService({ PII_ENCRYPTION_KEY: "test-pii-key-0123456789abcdefghij" } as Env), trackingStub, notificationsStub);

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
    // orderId is no longer a standalone unique (migration 0015 widened it to (orderId, byProfileId)
    // for two-way rating), so query by findFirst.
    const rating = await prisma.rating.findFirst({ where: { orderId } });
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
    // 4·b1: the wrong-code error now carries the remaining attempt count instead of a bare "incorrect".
    await expect(lifecycle.confirmDelivery(orderId, rider, wrong)).rejects.toThrow(/attempts left/i);
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

// ── Phase 2 seam-contract transitions (INTERFACE-AUDIT C3/C4/C6, F-01) ──────────────────────────
describe("seam-contract transitions", () => {
  /** Drive a fresh order to the given post-assignment status and return its ids. */
  async function driveTo(customerId: string, riderId: string, target: string) {
    const { orderId, deliveryCode } = await assign(customerId, riderId);
    const steps = ["confirmed", "en_route_pickup", "picked_up", "en_route_dropoff"] as const;
    for (const to of steps) {
      await lifecycle.advance(orderId, riderId, to);
      if (to === target) break;
    }
    return { orderId, deliveryCode };
  }

  it("C6/F-02: a rider marks a post-pickup hand-off undelivered — terminal, reason persisted, rider freed", async () => {
    const customer = await makeCustomer();
    const rider = await makeRider();
    const { orderId } = await driveTo(customer, rider, "picked_up");

    const res = await lifecycle.markUndelivered(orderId, rider, "unreachable");
    expect(res).toEqual({ orderId, status: "undelivered" });

    const o = await prisma.order.findUniqueOrThrow({
      where: { id: orderId },
      select: { status: true, undeliveredReason: true, undeliveredAt: true },
    });
    expect(o.status).toBe("undelivered");
    expect(o.undeliveredReason).toBe("unreachable");
    expect(o.undeliveredAt).not.toBeNull();

    // undelivered is terminal + leaves one_active_ride → the rider can take a new job.
    const next = await assign(customer, rider);
    expect(await statusOf(next.orderId)).toBe("assigned");
  });

  it("C6: undelivered is rejected before pickup and for a non-assigned rider", async () => {
    const customer = await makeCustomer();
    const rider = await makeRider();
    const other = await makeRider();
    const { orderId } = await driveTo(customer, rider, "confirmed"); // pre-pickup

    await expect(lifecycle.markUndelivered(orderId, rider, "breakdown")).rejects.toThrow(/after the parcel is picked up/i);
    // Advance to a valid post-pickup state, then a stranger still can't mark it.
    await lifecycle.advance(orderId, rider, "en_route_pickup");
    await lifecycle.advance(orderId, rider, "picked_up");
    await expect(lifecycle.markUndelivered(orderId, other, "breakdown")).rejects.toThrow(/assigned rider/i);
    expect(await statusOf(orderId)).toBe("picked_up");
  });

  it("F-01: a rider cancel re-broadcasts EXACTLY ONE new open order and never reopens the old one", async () => {
    const customer = await makeCustomer();
    const rider = await makeRider();
    const { orderId } = await assign(customer, rider);

    const res = await lifecycle.cancel(orderId, rider, "cannot make it");
    expect(res.cancelledBy).toBe("rider");
    expect(await statusOf(orderId)).toBe("cancelled"); // old row terminal, never reopened

    const clones = await prisma.order.findMany({
      where: { rebroadcastOfId: orderId },
      select: { id: true, status: true, proposedFare: true },
    });
    expect(clones).toHaveLength(1); // exactly one new row
    expect(clones[0]!.status).toBe("open_for_offers");
    expect(clones[0]!.id).not.toBe(orderId);
    // Same price re-broadcast: assert the clone carries the SOURCE order's fare (compare the Decimals
    // by value — Prisma's Decimal.toString() drops trailing zeros, so "2.50" would be "2.5").
    const orig = await prisma.order.findUnique({ where: { id: orderId }, select: { proposedFare: true } });
    expect(clones[0]!.proposedFare.equals(orig!.proposedFare)).toBe(true);
  });

  it("C3: a rider cancel is BLOCKED once the parcel is collected (post-pickup is undelivered, not cancel)", async () => {
    const customer = await makeCustomer();
    const rider = await makeRider();
    const { orderId } = await driveTo(customer, rider, "picked_up");

    await expect(lifecycle.cancel(orderId, rider, "changed my mind")).rejects.toThrow(/can't be cancelled anymore/i);
    expect(await statusOf(orderId)).toBe("picked_up");
    // Blocked cancel ⇒ no re-broadcast row.
    expect(await prisma.order.count({ where: { rebroadcastOfId: orderId } })).toBe(0);
  });

  it("C3: post-pickup CUSTOMER cancel pushes job:cancelled with collected:true and never strikes the rider", async () => {
    const customer = await makeCustomer();
    const rider = await makeRider();
    const { orderId } = await driveTo(customer, rider, "picked_up");
    jobCancelledEmits.length = 0;

    const res = await lifecycle.cancel(orderId, customer, "changed plans");
    expect(res.cancelledBy).toBe("customer");
    expect(await statusOf(orderId)).toBe("cancelled");
    // Two-sided WS contract: the assigned rider is told, with the hand-back (collected) flag and the
    // actual actor so their terminal doesn't misattribute an ops cancel to the customer.
    expect(jobCancelledEmits).toEqual([{ orderId, collected: true, cancelledBy: "customer" }]);
    // No reliability impact from a customer cancel.
    const r = await prisma.rider.findUniqueOrThrow({ where: { profileId: rider }, select: { cancelStrikes: true } });
    expect(r.cancelStrikes).toBe(0);
    // A customer cancel does NOT re-broadcast (that's rider-cancel only).
    expect(await prisma.order.count({ where: { rebroadcastOfId: orderId } })).toBe(0);
  });

  it("C3: pre-pickup customer cancel pushes job:cancelled with collected:false", async () => {
    const customer = await makeCustomer();
    const rider = await makeRider();
    const { orderId } = await assign(customer, rider); // assigned, not collected
    jobCancelledEmits.length = 0;

    await lifecycle.cancel(orderId, customer);
    expect(jobCancelledEmits).toEqual([{ orderId, collected: false, cancelledBy: "customer" }]);
  });

  it("C4: re-issuing the delivery code resets the attempt counter and unlocks a locked-out rider", async () => {
    const customer = await makeCustomer();
    const rider = await makeRider();
    const { orderId } = await driveTo(customer, rider, "en_route_dropoff");

    // Burn all 5 attempts with a wrong code → the rider is locked out.
    for (let i = 0; i < 5; i++) {
      await expect(lifecycle.confirmDelivery(orderId, rider, "999999")).rejects.toThrow();
    }
    await expect(lifecycle.confirmDelivery(orderId, rider, "999999")).rejects.toThrow(/too many attempts/i);

    // Customer re-issues → counter reset to 0.
    const { deliveryCode: fresh } = await lifecycle.rotateDeliveryCode(orderId, customer);
    const after = await prisma.order.findUniqueOrThrow({ where: { id: orderId }, select: { deliveryOtpAttempts: true } });
    expect(after.deliveryOtpAttempts).toBe(0);

    // The fresh code now works — the lockout recovered because the counter was reset.
    await lifecycle.confirmDelivery(orderId, rider, fresh);
    expect(await statusOf(orderId)).toBe("delivered");
  });
});
