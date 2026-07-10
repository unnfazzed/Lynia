import { describe, expect, it, vi } from "vitest";
import { TokenService } from "../auth/token.service";
import type { Env } from "../config/env";
import type { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";
import type { TrackingGateway } from "../tracking/tracking.gateway";
import type { OrdersService } from "./orders.service";
import { OrderLifecycleService } from "./order-lifecycle.service";

const tokens = new TokenService({ JWT_SIGNING_SECRET: "lifecycle-test-secret-0123456789", ACCESS_TTL_SECONDS: 900 } as Env);
/** Push is fire-and-forget; a no-op stub keeps the lifecycle unit tests off the notification path. */
const noopNotifications = { notifyOrderStatus: async () => {} } as unknown as NotificationsService;

/** Fake Prisma where `$transaction(cb)` runs the callback against the same fake (tx === prisma). */
function build(methods: Record<string, unknown>) {
  const emits: Array<[string, string]> = [];
  const jobCancelled: Array<[string, boolean]> = [];
  const rebroadcasts: Array<[string, string]> = [];
  const gateway = {
    emitOrderStatus: (id: string, s: string) => emits.push([id, s]),
    emitJobCancelled: (id: string, collected: boolean) => jobCancelled.push([id, collected]),
    emitOrderRebroadcast: (oldId: string, newId: string) => rebroadcasts.push([oldId, newId]),
  };
  // F-01 re-broadcast announce is best-effort push — spy so tests can assert it fired without a socket.
  const orders = { announceOpenOrder: vi.fn(async () => {}) };
  const prisma = { ...methods } as Record<string, unknown>;
  prisma.$transaction = async (cb: (tx: unknown) => unknown) => cb(prisma);
  // Rider aggregate mutations take a `SELECT … FOR UPDATE` row lock via $executeRaw before their
  // read-modify-write; give the fake a no-op unless a test overrides it.
  if (!prisma.$executeRaw) prisma.$executeRaw = async () => 0;
  const svc = new OrderLifecycleService(
    {} as Env,
    prisma as unknown as PrismaService,
    tokens,
    gateway as unknown as TrackingGateway,
    noopNotifications,
    orders as unknown as OrdersService,
  );
  return { svc, emits, jobCancelled, rebroadcasts, orders, prisma };
}

describe("OrderLifecycleService.advance", () => {
  it("404s for a missing order", async () => {
    const { svc } = build({ order: { findUnique: async () => null } });
    await expect(svc.advance("o1", "r1", "confirmed")).rejects.toThrow(/not found/i);
  });

  it("403s when the caller is not the assigned rider", async () => {
    const { svc } = build({ order: { findUnique: async () => ({ status: "assigned", riderId: "r1" }) } });
    await expect(svc.advance("o1", "other", "confirmed")).rejects.toThrow(/assigned rider/i);
  });

  it("409s when the order is not in the expected prior state", async () => {
    const { svc } = build({ order: { findUnique: async () => ({ status: "assigned", riderId: "r1" }) } });
    // picked_up requires en_route_pickup; the order is only `assigned`
    await expect(svc.advance("o1", "r1", "picked_up")).rejects.toThrow(/not en_route_pickup/i);
  });

  it("advances assigned → confirmed, stamps the timestamp, and pushes the status", async () => {
    let data: Record<string, unknown> | undefined;
    const { svc, emits } = build({
      order: {
        findUnique: async () => ({ status: "assigned", riderId: "r1" }),
        updateMany: async (args: { data: Record<string, unknown> }) => { data = args.data; return { count: 1 }; },
      },
      orderEvent: { create: async () => ({}) },
    });
    expect(await svc.advance("o1", "r1", "confirmed")).toEqual({ orderId: "o1", status: "confirmed" });
    expect(data).toMatchObject({ status: "confirmed" });
    expect(data!.confirmedAt).toBeInstanceOf(Date);
    expect(emits).toEqual([["o1", "confirmed"]]);
  });
});

describe("OrderLifecycleService.confirmDelivery", () => {
  // confirmDelivery reads the row via a FOR UPDATE $queryRaw (snake_case columns).
  const row = (over: Record<string, unknown> = {}) => [
    { status: "en_route_dropoff", rider_id: "r1", otp_hash: tokens.hash("123456"), delivery_otp_attempts: 0, ...over },
  ];

  it("409s when the order is not ready for delivery", async () => {
    const { svc } = build({ $queryRaw: async () => row({ status: "picked_up" }) });
    await expect(svc.confirmDelivery("o1", "r1", "123456")).rejects.toThrow(/not ready/i);
  });

  it("locks after too many wrong attempts", async () => {
    const { svc } = build({ $queryRaw: async () => row({ delivery_otp_attempts: 5 }) });
    await expect(svc.confirmDelivery("o1", "r1", "123456")).rejects.toThrow(/too many attempts/i);
  });

  it("rejects a wrong code and increments the attempt counter", async () => {
    let incremented = false;
    const { svc } = build({
      $queryRaw: async () => row({ otp_hash: tokens.hash("111111") }),
      order: {
        update: async (a: { data?: Record<string, unknown> }) => {
          if (a.data?.deliveryOtpAttempts) incremented = true;
          return {};
        },
      },
    });
    // 4·b1: the wrong-code error now carries the remaining attempt count (5 max − 1 used = 4 left).
    await expect(svc.confirmDelivery("o1", "r1", "222222")).rejects.toThrow(/4 attempts left/i);
    expect(incremented).toBe(true);
  });

  it("tells the rider no attempts are left on the final wrong guess", async () => {
    const { svc } = build({
      // Fourth attempt already recorded (0-indexed: 4 used) — this wrong guess is the 5th and last.
      $queryRaw: async () => row({ otp_hash: tokens.hash("111111"), delivery_otp_attempts: 4 }),
      order: { update: async () => ({}) },
    });
    await expect(svc.confirmDelivery("o1", "r1", "222222")).rejects.toThrow(/no attempts left/i);
  });

  it("accepts the correct code and marks the order delivered", async () => {
    const { svc, emits } = build({
      $queryRaw: async () => row(),
      order: { update: async () => ({}) },
      orderEvent: { create: async () => ({}) },
    });
    expect(await svc.confirmDelivery("o1", "r1", "123456")).toEqual({ orderId: "o1", status: "delivered" });
    expect(emits).toEqual([["o1", "delivered"]]);
  });
});

describe("OrderLifecycleService.rate", () => {
  it("409s when the order is not awaiting a rating", async () => {
    const { svc } = build({ order: { findUnique: async () => ({ status: "assigned", customerId: "c1", riderId: "r1" }) } });
    await expect(svc.rate("o1", "c1", 5)).rejects.toThrow(/awaiting a rating/i);
  });

  it("403s when the caller is not the customer", async () => {
    const { svc } = build({ order: { findUnique: async () => ({ status: "delivered", customerId: "c1", riderId: "r1" }) } });
    await expect(svc.rate("o1", "other", 5)).rejects.toThrow(/not your order/i);
  });

  it("completes the order and updates the rider's running average", async () => {
    let riderData: Record<string, unknown> | undefined;
    const { svc, emits } = build({
      order: {
        findUnique: async () => ({ status: "delivered", customerId: "c1", riderId: "r1" }),
        updateMany: async () => ({ count: 1 }),
      },
      rating: { create: async () => ({}) },
      orderEvent: { create: async () => ({}) },
      rider: {
        findUnique: async () => ({ ratingAvg: 4.0, ratingCount: 2, tripsCount: 5, reliabilityScore: 90, onHold: false }),
        update: async (args: { data: Record<string, unknown> }) => { riderData = args.data; return {}; },
      },
    });
    expect(await svc.rate("o1", "c1", 5)).toEqual({ orderId: "o1", status: "completed" });
    // (4.0*2 + 5) / 3 = 4.333...
    expect(riderData!.ratingAvg).toBeCloseTo(4.3333, 3);
    expect(riderData).toMatchObject({ ratingCount: 3, tripsCount: 6 });
    // Q2: a good rating (> LOW_RATING_AT) is a clean completion → +RECOVER_PER_COMPLETION (90 → 92).
    expect(riderData).toMatchObject({ reliabilityScore: 92, onHold: false });
    expect(emits).toEqual([["o1", "completed"]]);
  });

  it("Q2: a low rating (<= LOW_RATING_AT) penalises the rider and can trip on_hold", async () => {
    let riderData: Record<string, unknown> | undefined;
    const { svc } = build({
      order: {
        findUnique: async () => ({ status: "delivered", customerId: "c1", riderId: "r1" }),
        updateMany: async () => ({ count: 1 }),
      },
      rating: { create: async () => ({}) },
      orderEvent: { create: async () => ({}) },
      rider: {
        // 68 is already below ON_HOLD_CLEAR_AT(70); a -lowRating(10) → 58 < ON_HOLD_BELOW(60) trips on_hold.
        findUnique: async () => ({ ratingAvg: 5, ratingCount: 1, tripsCount: 3, reliabilityScore: 68, onHold: false }),
        update: async (args: { data: Record<string, unknown> }) => { riderData = args.data; return {}; },
      },
    });
    await svc.rate("o1", "c1", 2);
    expect(riderData).toMatchObject({ reliabilityScore: 58, onHold: true });
  });
});

describe("OrderLifecycleService.rateSender", () => {
  it("404s for a missing order", async () => {
    const { svc } = build({ order: { findUnique: async () => null } });
    await expect(svc.rateSender("o1", "r1", 5)).rejects.toThrow(/not found/i);
  });

  it("403s when the caller is not the assigned rider", async () => {
    const { svc } = build({ order: { findUnique: async () => ({ status: "delivered", riderId: "r1" }) } });
    await expect(svc.rateSender("o1", "other", 5)).rejects.toThrow(/not your order/i);
  });

  it("409s when the order is not awaiting a rating", async () => {
    const { svc } = build({ order: { findUnique: async () => ({ status: "assigned", riderId: "r1" }) } });
    await expect(svc.rateSender("o1", "r1", 5)).rejects.toThrow(/awaiting a rating/i);
  });

  it("409s when the sender was already rated", async () => {
    const { svc } = build({
      order: { findUnique: async () => ({ status: "delivered", riderId: "r1" }) },
      rating: { findUnique: async () => ({ id: "sr1" }) },
    });
    await expect(svc.rateSender("o1", "r1", 5)).rejects.toThrow(/already rated/i);
  });

  it("records the rating without changing the order status (delivered)", async () => {
    let created: Record<string, unknown> | undefined;
    const { svc, emits } = build({
      order: { findUnique: async () => ({ status: "delivered", riderId: "r1" }) },
      rating: {
        findUnique: async () => null,
        create: async (args: { data: Record<string, unknown> }) => { created = args.data; return {}; },
      },
    });
    expect(await svc.rateSender("o1", "r1", 4, "cash was short")).toEqual({ orderId: "o1", status: "delivered" });
    expect(created).toMatchObject({ orderId: "o1", byProfileId: "r1", score: 4, comment: "cash was short" });
    // Recorded-only: it never emits a status change (unlike the customer's rate()).
    expect(emits).toEqual([]);
  });

  it("still records after the customer's rate() closed the order to completed", async () => {
    const { svc } = build({
      order: { findUnique: async () => ({ status: "completed", riderId: "r1" }) },
      rating: { findUnique: async () => null, create: async () => ({}) },
    });
    expect(await svc.rateSender("o1", "r1", 5)).toEqual({ orderId: "o1", status: "completed" });
  });
});

describe("OrderLifecycleService.completeOrder (auto-close)", () => {
  it("completes a delivered order and recovers reliability (clean unrated completion, Q2)", async () => {
    let riderData: Record<string, unknown> | undefined;
    const { svc, emits } = build({
      order: {
        updateMany: async () => ({ count: 1 }),
        findUnique: async () => ({ riderId: "r1" }),
      },
      orderEvent: { create: async () => ({}) },
      rider: {
        findUnique: async () => ({ reliabilityScore: 95, onHold: false }),
        update: async (a: { data: Record<string, unknown> }) => { riderData = a.data; return {}; },
      },
    });
    expect(await svc.completeOrder("o1")).toEqual({ completed: true });
    // +RECOVER_PER_COMPLETION (95 → 97), alongside the trips increment; clamps at MAX(100) elsewhere.
    expect(riderData).toMatchObject({ tripsCount: { increment: 1 }, reliabilityScore: 97, onHold: false });
    expect(emits).toEqual([["o1", "completed"]]);
  });

  it("is a no-op when the order is not delivered (idempotent)", async () => {
    const { svc, emits } = build({ order: { updateMany: async () => ({ count: 0 }) } });
    expect(await svc.completeOrder("o1")).toEqual({ completed: false });
    expect(emits).toEqual([]);
  });
});

describe("OrderLifecycleService.reconcileStaleDeliveries", () => {
  it("closes every stale delivered order (the Redis-independent backstop)", async () => {
    const { svc } = build({
      order: {
        findMany: async () => [{ id: "o1" }, { id: "o2" }],
        updateMany: async () => ({ count: 1 }),
        findUnique: async () => ({ riderId: "r1" }),
      },
      orderEvent: { create: async () => ({}) },
      rider: { findUnique: async () => ({ reliabilityScore: 100, onHold: false }), update: async () => ({}) },
    });
    expect(await svc.reconcileStaleDeliveries()).toEqual({ closed: 2 });
  });
});

describe("OrderLifecycleService.rotateDeliveryCode", () => {
  it("issues a fresh 6-digit code and resets the attempt counter", async () => {
    let data: Record<string, unknown> | undefined;
    const { svc } = build({
      order: {
        findUnique: async () => ({ customerId: "c1", status: "en_route_dropoff" }),
        update: async (args: { data: Record<string, unknown> }) => { data = args.data; return {}; },
      },
    });
    const res = await svc.rotateDeliveryCode("o1", "c1");
    expect(res.deliveryCode).toMatch(/^\d{6}$/);
    expect(data).toMatchObject({ deliveryOtpAttempts: 0 });
    expect(data!.otpHash).toBe(tokens.hash(res.deliveryCode));
  });

  it("403s for a non-owner", async () => {
    const { svc } = build({ order: { findUnique: async () => ({ customerId: "c1", status: "assigned" }) } });
    await expect(svc.rotateDeliveryCode("o1", "other")).rejects.toThrow(/not your order/i);
  });
});

describe("OrderLifecycleService.cancel", () => {
  const order = (over: Record<string, unknown> = {}) => ({ status: "assigned", customerId: "c1", riderId: "r1", collectedAt: null, ...over });
  // A cancellable fake: findUnique serves both the guard read and cloneForRebroadcast's source read;
  // order.create clones the re-broadcast row; rider.* serves the strike path.
  const cancellable = (extra: Record<string, unknown> = {}) => ({
    order: {
      findUnique: async () => order(),
      updateMany: async () => ({ count: 1 }),
      create: async () => ({ id: "rebroadcast-1" }),
    },
    orderEvent: { create: async () => ({}) },
    offer: { updateMany: async () => ({ count: 0 }) },
    ...extra,
  });

  it("403s for a third party", async () => {
    const { svc } = build({ order: { findUnique: async () => order() } });
    await expect(svc.cancel("o1", "stranger")).rejects.toThrow(/not your order/i);
  });

  it("lets the customer cancel before pickup and tells the assigned rider (collected:false)", async () => {
    const { svc, emits, jobCancelled } = build(cancellable());
    const res = await svc.cancel("o1", "c1", "changed my mind");
    expect(res).toMatchObject({ status: "cancelled", cancelledBy: "customer", cooldownUntil: null });
    expect(emits).toEqual([["o1", "cancelled"]]);
    // C3: a rider was already assigned pre-pickup → job:cancelled with collected:false (back to board).
    expect(jobCancelled).toEqual([["o1", false]]);
  });

  it("customer cancel AFTER pickup pushes job:cancelled with collected:true (hand-back path)", async () => {
    const { svc, jobCancelled } = build(
      // Customer may cancel at any live status; collectedAt set ⇒ post-pickup.
      cancellable({
        order: {
          findUnique: async () => order({ status: "en_route_dropoff", collectedAt: new Date() }),
          updateMany: async () => ({ count: 1 }),
          create: async () => ({ id: "rebroadcast-1" }),
        },
      }),
    );
    const res = await svc.cancel("o1", "c1");
    expect(res.cancelledBy).toBe("customer");
    expect(jobCancelled).toEqual([["o1", true]]);
  });

  it("blocks a RIDER cancel once the parcel is collected (post-pickup is undelivered, not cancel)", async () => {
    const { svc } = build({ order: { findUnique: async () => order({ status: "picked_up" }) } });
    await expect(svc.cancel("o1", "r1")).rejects.toThrow(/can't be cancelled anymore/i);
  });

  it("counts a rider cancel as a strike (below the limit) and re-broadcasts a new open order (F-01)", async () => {
    let riderData: Record<string, unknown> | undefined;
    const { svc, orders, jobCancelled, rebroadcasts } = build(
      cancellable({
        rider: {
          findUnique: async () => ({ cancelStrikes: 0, reliabilityScore: 80, onHold: false }),
          update: async (a: { data: Record<string, unknown> }) => { riderData = a.data; return {}; },
        },
      }),
    );
    const res = await svc.cancel("o1", "r1");
    expect(res.cancelledBy).toBe("rider");
    expect(res.cooldownUntil).toBeNull();
    // Q2: a rider cancel is always pre-pickup → -prePickupCancel(5) folded into the strike update (80 → 75).
    expect(riderData).toMatchObject({ cancelStrikes: 1, reliabilityScore: 75, onHold: false });
    // F-01: exactly one new open order announced; a rider cancel never fires job:cancelled.
    expect(orders.announceOpenOrder).toHaveBeenCalledTimes(1);
    expect(orders.announceOpenOrder).toHaveBeenCalledWith("rebroadcast-1");
    expect(jobCancelled).toEqual([]);
    // F-01 re-attach: the OLD (cancelled) order's room is told to move to the NEW order id, so the
    // customer lands on the fresh auction instead of the dead cancelled terminal.
    expect(rebroadcasts).toEqual([["o1", "rebroadcast-1"]]);
  });

  it("puts the rider on cooldown and forces them offline at the strike limit", async () => {
    let riderData: Record<string, unknown> | undefined;
    const { svc } = build(
      cancellable({
        rider: {
          findUnique: async () => ({ cancelStrikes: 2 }), // → 3, the limit
          update: async (a: { data: Record<string, unknown> }) => { riderData = a.data; return {}; },
        },
      }),
    );
    const res = await svc.cancel("o1", "r1");
    expect(res.cooldownUntil).toBeInstanceOf(Date);
    expect(riderData).toMatchObject({ cancelStrikes: 0, isOnline: false });
    expect(riderData!.cooldownUntil).toBeInstanceOf(Date);
  });
});

describe("OrderLifecycleService.markUndelivered", () => {
  const row = (over: Record<string, unknown> = {}) => ({ status: "picked_up", riderId: "r1", ...over });

  it("404s for a missing order", async () => {
    const { svc } = build({ order: { findUnique: async () => null } });
    await expect(svc.markUndelivered("o1", "r1", "unreachable")).rejects.toThrow(/not found/i);
  });

  it("403s when the caller is not the assigned rider", async () => {
    const { svc } = build({ order: { findUnique: async () => row() } });
    await expect(svc.markUndelivered("o1", "other", "unreachable")).rejects.toThrow(/assigned rider/i);
  });

  it("409s before pickup — a hand-off can only fail post-pickup", async () => {
    const { svc } = build({ order: { findUnique: async () => row({ status: "en_route_pickup" }) } });
    await expect(svc.markUndelivered("o1", "r1", "unreachable")).rejects.toThrow(/after the parcel is picked up/i);
  });

  it("marks undelivered post-pickup, stamps the reason + time, and pushes the status", async () => {
    let data: Record<string, unknown> | undefined;
    const { svc, emits } = build({
      order: {
        findUnique: async () => row({ status: "en_route_dropoff" }),
        updateMany: async (a: { data: Record<string, unknown> }) => { data = a.data; return { count: 1 }; },
      },
      orderEvent: { create: async () => ({}) },
      // `refused` is a recipient fault → NO reliability hit, so no rider read/update is expected here.
      rider: {
        findUnique: async () => { throw new Error("refused must not touch reliability"); },
        update: async () => { throw new Error("refused must not touch reliability"); },
      },
    });
    expect(await svc.markUndelivered("o1", "r1", "refused")).toEqual({ orderId: "o1", status: "undelivered" });
    expect(data).toMatchObject({ status: "undelivered", undeliveredReason: "refused" });
    expect(data!.undeliveredAt).toBeInstanceOf(Date);
    // C6: the failed hand-off is recorded so the customer's terminal shows a real attempt count, not 0.
    expect(data!.deliveryAttempts).toEqual({ increment: 1 });
    expect(emits).toEqual([["o1", "undelivered"]]);
  });

  it("Q2: a breakdown (post-pickup bail) applies -postPickupCancel to reliability", async () => {
    let riderData: Record<string, unknown> | undefined;
    const { svc } = build({
      order: {
        findUnique: async () => row({ status: "en_route_dropoff" }),
        updateMany: async () => ({ count: 1 }),
      },
      orderEvent: { create: async () => ({}) },
      rider: {
        findUnique: async () => ({ reliabilityScore: 90, onHold: false }),
        update: async (a: { data: Record<string, unknown> }) => { riderData = a.data; return {}; },
      },
    });
    await svc.markUndelivered("o1", "r1", "breakdown");
    // -postPickupCancel(15): 90 → 75.
    expect(riderData).toMatchObject({ reliabilityScore: 75, onHold: false });
  });

  it("Q2: an unreachable recipient (no-show) applies -noShow to reliability", async () => {
    let riderData: Record<string, unknown> | undefined;
    const { svc } = build({
      order: {
        findUnique: async () => row({ status: "en_route_dropoff" }),
        updateMany: async () => ({ count: 1 }),
      },
      orderEvent: { create: async () => ({}) },
      rider: {
        findUnique: async () => ({ reliabilityScore: 70, onHold: false }),
        update: async (a: { data: Record<string, unknown> }) => { riderData = a.data; return {}; },
      },
    });
    await svc.markUndelivered("o1", "r1", "unreachable");
    // -noShow(15): 70 → 55 < ON_HOLD_BELOW(60) → trips on_hold.
    expect(riderData).toMatchObject({ reliabilityScore: 55, onHold: true });
  });
});
