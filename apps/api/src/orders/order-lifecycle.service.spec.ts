import { describe, expect, it } from "vitest";
import { TokenService } from "../auth/token.service";
import type { Env } from "../config/env";
import { PrismaService } from "../prisma/prisma.service";
import type { TrackingGateway } from "../tracking/tracking.gateway";
import { OrderLifecycleService } from "./order-lifecycle.service";

const tokens = new TokenService({ JWT_SIGNING_SECRET: "lifecycle-test-secret-0123456789", ACCESS_TTL_SECONDS: 900 } as Env);

/** Fake Prisma where `$transaction(cb)` runs the callback against the same fake (tx === prisma). */
function build(methods: Record<string, unknown>) {
  const emits: Array<[string, string]> = [];
  const gateway = { emitOrderStatus: (id: string, s: string) => emits.push([id, s]) };
  const prisma = { ...methods } as Record<string, unknown>;
  prisma.$transaction = async (cb: (tx: unknown) => unknown) => cb(prisma);
  const svc = new OrderLifecycleService(
    {} as Env,
    prisma as unknown as PrismaService,
    tokens,
    gateway as unknown as TrackingGateway,
  );
  return { svc, emits, prisma };
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
  const base = (over: Record<string, unknown> = {}) => ({
    status: "en_route_dropoff",
    riderId: "r1",
    otpHash: tokens.hash("123456"),
    deliveryOtpAttempts: 0,
    ...over,
  });

  it("409s when the order is not ready for delivery", async () => {
    const { svc } = build({ order: { findUnique: async () => base({ status: "picked_up" }) } });
    await expect(svc.confirmDelivery("o1", "r1", "123456")).rejects.toThrow(/not ready/i);
  });

  it("locks after too many wrong attempts", async () => {
    const { svc } = build({ order: { findUnique: async () => base({ deliveryOtpAttempts: 5 }) } });
    await expect(svc.confirmDelivery("o1", "r1", "123456")).rejects.toThrow(/too many attempts/i);
  });

  it("rejects a wrong code and increments the attempt counter", async () => {
    let incremented = false;
    const { svc } = build({
      order: {
        findUnique: async () => base({ otpHash: tokens.hash("111111") }),
        update: async () => { incremented = true; return {}; },
      },
    });
    await expect(svc.confirmDelivery("o1", "r1", "222222")).rejects.toThrow(/incorrect/i);
    expect(incremented).toBe(true);
  });

  it("accepts the correct code and marks the order delivered", async () => {
    const { svc, emits } = build({
      order: {
        findUnique: async () => base(),
        updateMany: async () => ({ count: 1 }),
      },
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
        findUnique: async () => ({ ratingAvg: 4.0, ratingCount: 2, tripsCount: 5 }),
        update: async (args: { data: Record<string, unknown> }) => { riderData = args.data; return {}; },
      },
    });
    expect(await svc.rate("o1", "c1", 5)).toEqual({ orderId: "o1", status: "completed" });
    // (4.0*2 + 5) / 3 = 4.333...
    expect(riderData!.ratingAvg).toBeCloseTo(4.3333, 3);
    expect(riderData).toMatchObject({ ratingCount: 3, tripsCount: 6 });
    expect(emits).toEqual([["o1", "completed"]]);
  });
});

describe("OrderLifecycleService.completeOrder (auto-close)", () => {
  it("completes a delivered order", async () => {
    const { svc, emits } = build({
      order: {
        updateMany: async () => ({ count: 1 }),
        findUnique: async () => ({ riderId: "r1" }),
      },
      orderEvent: { create: async () => ({}) },
      rider: { update: async () => ({}) },
    });
    expect(await svc.completeOrder("o1")).toEqual({ completed: true });
    expect(emits).toEqual([["o1", "completed"]]);
  });

  it("is a no-op when the order is not delivered (idempotent)", async () => {
    const { svc, emits } = build({ order: { updateMany: async () => ({ count: 0 }) } });
    expect(await svc.completeOrder("o1")).toEqual({ completed: false });
    expect(emits).toEqual([]);
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
  const order = (over: Record<string, unknown> = {}) => ({ status: "assigned", customerId: "c1", riderId: "r1", ...over });
  const cancellable = (extra: Record<string, unknown> = {}) => ({
    order: { findUnique: async () => order(), updateMany: async () => ({ count: 1 }) },
    orderEvent: { create: async () => ({}) },
    offer: { updateMany: async () => ({ count: 0 }) },
    ...extra,
  });

  it("403s for a third party", async () => {
    const { svc } = build({ order: { findUnique: async () => order() } });
    await expect(svc.cancel("o1", "stranger")).rejects.toThrow(/not your order/i);
  });

  it("lets the customer cancel before pickup", async () => {
    const { svc, emits } = build(cancellable());
    const res = await svc.cancel("o1", "c1", "changed my mind");
    expect(res).toMatchObject({ status: "cancelled", cancelledBy: "customer", cooldownUntil: null });
    expect(emits).toEqual([["o1", "cancelled"]]);
  });

  it("blocks a customer cancel once the parcel is collected", async () => {
    const { svc } = build({ order: { findUnique: async () => order({ status: "picked_up" }) } });
    await expect(svc.cancel("o1", "c1")).rejects.toThrow(/cannot cancel a picked_up/i);
  });

  it("counts a rider cancel as a strike (below the limit)", async () => {
    let riderData: Record<string, unknown> | undefined;
    const { svc } = build(
      cancellable({
        rider: {
          findUnique: async () => ({ cancelStrikes: 0 }),
          update: async (a: { data: Record<string, unknown> }) => { riderData = a.data; return {}; },
        },
      }),
    );
    const res = await svc.cancel("o1", "r1");
    expect(res.cancelledBy).toBe("rider");
    expect(res.cooldownUntil).toBeNull();
    expect(riderData).toMatchObject({ cancelStrikes: 1 });
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
