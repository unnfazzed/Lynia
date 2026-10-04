import { afterEach, describe, expect, it, vi } from "vitest";
import { RESTAURANTS_AUTO_ACCEPT } from "@lynia/shared";
import type { Env } from "../config/env";
import type { NotificationsService } from "../notifications/notifications.service";
import type { PrismaService } from "../prisma/prisma.service";
import { TokenService } from "../auth/token.service";
import type { TrackingGateway } from "../tracking/tracking.gateway";
import type { PaymentRail } from "../adapters/payments/payment-rail.interface";
import type { FoodDebtService } from "./food-debt.service";
import { confirmKitchen, editOrderItems } from "./food-order-ops";
import { FoodOrderService } from "./food-order.service";
import { harareWallClock } from "./harare-clock";
import { withMembershipShim } from "./testing/membership-shim";

// Auto-accept (docs/plans/2026-09-30-restaurant-auto-accept.md) and its five safeguards.

const tokens = new TokenService({ JWT_SIGNING_SECRET: "auto-accept-test-secret-0123456789", ACCESS_TTL_SECONDS: 900 } as Env);
const pushes: Array<{ profileIds: string[]; title: string; body: string }> = [];
const notifications = {
  notifyProfiles: async (profileIds: string[], msg: { title: string; body: string }) => {
    pushes.push({ profileIds, ...msg });
  },
} as unknown as NotificationsService;
const queueChanges: string[] = [];
const gateway = {
  emitFoodQueueChanged: (_m: string, orderId: string) => queueChanges.push(orderId),
  isMerchantOnline: async () => true,
} as unknown as TrackingGateway;
const rail = { initiate: async () => ({ status: "pending" }), confirm: async () => ({ status: "pending" }) } as unknown as PaymentRail;

function build(methods: Record<string, unknown>, debt: Partial<FoodDebtService> = {}) {
  pushes.length = 0;
  queueChanges.length = 0;
  const prisma = withMembershipShim({ profile: { findUnique: async () => ({ onHold: false, cashBanned: false, rider: null }) }, customerBalanceEntry: { findMany: async () => [] }, ...methods } as Record<string, unknown>);
  prisma.$transaction = async (cb: (tx: unknown) => unknown) => cb(prisma);
  const svc = new FoodOrderService(
    prisma as unknown as PrismaService,
    tokens,
    notifications,
    { openDebtIfNeeded: async () => {}, ...debt } as unknown as FoodDebtService,
    gateway,
    rail,
  );
  return { svc, prisma };
}

const CBD = { lat: -17.8292, lng: 31.0522 };
const AVONDALE = { lat: -17.8003, lng: 31.0335 };
const dish = { id: "d1", merchantId: "m1", name: "Sadza & Chicken", priceUsd: 5, isDraft: false, outOfStockUntil: null };
const ORDER_BODY = {
  items: [{ dishId: "d1", quantity: 1 }],
  dropoff: { point: AVONDALE, landmark: "Avondale", contactPhone: "+263779999999" },
  paymentMethod: "cash" as const,
};

function placeWith(merchantOver: Record<string, unknown>) {
  let created: Record<string, unknown> | undefined;
  const { svc } = build({
    order: {
      findFirst: async () => null,
      create: async ({ data }: { data: Record<string, unknown> }) => {
        created = data;
        return { ...data, id: "o1", merchantItems: [], pickupCodeAttempts: 0, noShowCallTimestamps: [], opsNoAnswerAt: [] };
      },
    },
    merchant: { findFirst: async () => ({ id: "m1", location: { point: CBD, landmark: "CBD" }, closedUntil: null, hours: null, autoAccept: false, busyMode: false, prepBaselineMinutes: null, ...merchantOver }) },
    merchantDish: { findMany: async () => [dish] },
  });
  return { svc, created: () => created };
}

afterEach(() => vi.useRealTimers());

describe("placeOrder — auto-accept", () => {
  it("skips the accept window: straight to cooking at the restaurant's usual prep time, no deadline", async () => {
    const { svc, created } = placeWith({ autoAccept: true, prepBaselineMinutes: 25 });
    await svc.placeOrder("c1", "m1", ORDER_BODY);
    expect(created()).toMatchObject({ status: "requested", merchantPhase: "preparing", autoAccepted: true, prepMinutes: 25, acceptDeadlineAt: null });
    expect(created()!.prepStartedAt).toBeInstanceOf(Date);
  });

  it("falls back to the default prep time and adds busy mode's extra minutes", async () => {
    const { svc, created } = placeWith({ autoAccept: true, busyMode: true });
    await svc.placeOrder("c1", "m1", ORDER_BODY);
    expect(created()!.prepMinutes).toBe(RESTAURANTS_AUTO_ACCEPT.defaultPrepMinutes + 10);
  });

  it("keeps the manual accept window for a restaurant without auto-accept", async () => {
    const { svc, created } = placeWith({ autoAccept: false });
    await svc.placeOrder("c1", "m1", ORDER_BODY);
    expect(created()).toMatchObject({ merchantPhase: "awaiting_accept" });
    expect(created()!.acceptDeadlineAt).toBeInstanceOf(Date);
    expect(created()!.autoAccepted).toBeUndefined();
  });

  it("a WALLET order is refused before auto-accept is weighed — wallet is retired for new orders (D-74)", async () => {
    const { svc, created } = placeWith({ autoAccept: true });
    await expect(svc.placeOrder("c1", "m1", { ...ORDER_BODY, paymentMethod: "wallet" })).rejects.toMatchObject({ response: { reason: "wallet_not_accepted" } });
    expect(created()).toBeUndefined();
  });
});

describe("placeOrder — opening hours enforced in Harare time (safeguard 3)", () => {
  // Wednesday 30 Sep 2026. Harare is UTC+2 all year.
  const HOURS = { wed: { open: "08:00", close: "22:00" } };

  it("refuses an order after closing time, and says when it opens", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-30T20:30:00Z")); // 22:30 in Harare
    const { svc } = placeWith({ hours: HOURS });
    await expect(svc.placeOrder("c1", "m1", ORDER_BODY)).rejects.toMatchObject({ response: { reason: "restaurant_closed" } });
  });

  it("accepts an order inside hours even when UTC's clock alone would read closed", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-30T06:30:00Z")); // 08:30 in Harare (06:30 UTC is before opening)
    const { svc, created } = placeWith({ hours: HOURS });
    await svc.placeOrder("c1", "m1", ORDER_BODY);
    expect(created()).toBeDefined();
  });

  it("no hours set at all reads as open (same fail-open rule as the apps)", async () => {
    const { svc, created } = placeWith({ hours: null });
    await svc.placeOrder("c1", "m1", ORDER_BODY);
    expect(created()).toBeDefined();
  });

  it("harareWallClock reads Harare's wall clock", () => {
    const wall = harareWallClock(new Date("2026-09-30T21:15:00Z"));
    expect([wall.getDay(), wall.getHours(), wall.getMinutes()]).toEqual([3, 23, 15]);
  });
});

describe("sweepAutoAccepted — no rider until the kitchen is confirmed (safeguard 1)", () => {
  const NOW = new Date("2026-09-30T10:00:00Z");

  it("marks orders unconfirmed for 5 minutes as urgent, once", async () => {
    let escalateWhere: Record<string, unknown> | undefined;
    const { svc } = build({
      order: {
        updateMany: async ({ where }: { where: Record<string, unknown> }) => {
          escalateWhere = where;
          return { count: 2 };
        },
        findMany: async () => [],
      },
    });
    const res = await svc.sweepAutoAccepted(NOW);
    expect(res.escalated).toBe(2);
    expect(escalateWhere).toMatchObject({ autoAccepted: true, kitchenConfirmedAt: null, kitchenEscalatedAt: null, status: "requested" });
    expect((escalateWhere!.prepStartedAt as { lt: Date }).lt.getTime()).toBe(NOW.getTime() - RESTAURANTS_AUTO_ACCEPT.escalateAfterMs);
  });

  it("cancels orders nobody confirmed within an hour and tells the customer nothing was charged", async () => {
    let abandonedWhere: Record<string, unknown> | undefined;
    const cancels: Array<{ where: Record<string, unknown>; data: Record<string, unknown> }> = [];
    const { svc } = build({
      order: {
        updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
          if (data.status === "cancelled") {
            cancels.push({ where, data });
            return { count: 1 };
          }
          return { count: 0 };
        },
        findMany: async ({ where }: { where: Record<string, unknown> }) => {
          if (where.kitchenConfirmedAt === null) {
            abandonedWhere = where;
            return [{ id: "stale", merchantId: "m1" }];
          }
          return [];
        },
        findUnique: async () => ({ customerId: "c1" }),
      },
      orderEvent: { create: async () => ({}) },
    });
    const res = await svc.sweepAutoAccepted(NOW);
    expect(res.cancelled).toBe(1);
    expect((abandonedWhere!.prepStartedAt as { lt: Date }).lt.getTime()).toBe(NOW.getTime() - RESTAURANTS_AUTO_ACCEPT.autoCancelAfterMs);
    // Guarded on still-unconfirmed, so a confirm racing the sweep wins.
    expect(cancels[0]!.where).toMatchObject({ id: "stale", status: "requested", autoAccepted: true, kitchenConfirmedAt: null });
    expect(cancels[0]!.data).toMatchObject({ status: "cancelled", rejectionReason: "kitchen_unconfirmed" });
    expect(pushes[0]).toMatchObject({ profileIds: ["c1"], body: expect.stringContaining("nothing was charged") });
    expect(queueChanges).toEqual(["stale"]);
  });

  it("only considers CONFIRMED orders for the rider search, and starts it 8 minutes before prep ends", async () => {
    let listWhere: Record<string, unknown> | undefined;
    const released: string[] = [];
    const { svc } = build({
      order: {
        updateMany: async ({ where, data }: { where: { id?: string }; data: Record<string, unknown> }) => {
          if (data.merchantPhase === "ready_for_pickup") released.push(where.id!);
          return { count: data.merchantPhase === "ready_for_pickup" ? 1 : 0 };
        },
        findMany: async ({ where }: { where: Record<string, unknown> }) => {
          listWhere = where;
          return [
            // 20 min prep started 13 min ago → ready in 7 min → inside the 8-minute lead: release.
            { id: "due", merchantId: "m1", prepStartedAt: new Date(NOW.getTime() - 13 * 60_000), prepMinutes: 20 },
            // 20 min prep started 5 min ago → ready in 15 min: too early.
            { id: "early", merchantId: "m1", prepStartedAt: new Date(NOW.getTime() - 5 * 60_000), prepMinutes: 20 },
          ];
        },
      },
    });
    const res = await svc.sweepAutoAccepted(NOW);
    expect(listWhere).toMatchObject({ autoAccepted: true, merchantPhase: "preparing", kitchenConfirmedAt: { not: null } });
    expect(released).toEqual(["due"]);
    expect(res.released).toBe(1);
    expect(queueChanges).toEqual(["due"]);
  });
});

describe("customer cancel — free until the kitchen confirms", () => {
  const order = (over: Record<string, unknown>) => ({
    id: "o1",
    customerId: "c1",
    merchantId: "m1",
    status: "requested",
    merchantPhase: "preparing",
    autoAccepted: true,
    kitchenConfirmedAt: null,
    merchantItems: [],
    pickupCodeAttempts: 0,
    noShowCallTimestamps: [],
    opsNoAnswerAt: [],
    ...over,
  });

  it("allows it while unconfirmed (guarded on still-unconfirmed)", async () => {
    let where: Record<string, unknown> | undefined;
    const { svc } = build({
      order: {
        findFirst: async () => order({}),
        findUnique: async () => order({ status: "cancelled" }),
        updateMany: async (args: { where: Record<string, unknown> }) => {
          where = args.where;
          return { count: 1 };
        },
      },
      orderEvent: { create: async () => ({}) },
    });
    await svc.cancelUnpaid("o1", "c1");
    expect(where).toMatchObject({ merchantPhase: "preparing", kitchenConfirmedAt: null });
  });

  it("refuses once the kitchen confirmed", async () => {
    const { svc } = build({ order: { findFirst: async () => order({ kitchenConfirmedAt: new Date() }) } });
    await expect(svc.cancelUnpaid("o1", "c1")).rejects.toThrow(/kitchen has started/);
  });
});

describe("confirmCollected — the no-code pickup, only at the restaurant (safeguard 2)", () => {
  const row = (over: Record<string, unknown> = {}) => [
    {
      status: "en_route_pickup",
      rider_id: "r1",
      auto_accepted: true,
      merchant_id: "m1",
      merchant_payment_method: "cash",
      merchant_cash_rule: "collect_and_return",
      merchant_goods_total: 12,
      ...over,
    },
  ];
  const merchant = { findUnique: async () => ({ location: { point: CBD } }) };

  it("within 150 m: picked up, and the cash debt opens in the same transaction", async () => {
    let updated: Record<string, unknown> | undefined;
    let debtFor: Record<string, unknown> | undefined;
    const { svc } = build(
      {
        $queryRaw: async () => row(),
        merchant,
        order: { update: async ({ data }: { data: Record<string, unknown> }) => (updated = data) },
        orderEvent: { create: async () => ({}) },
      },
      { openDebtIfNeeded: async (_tx: unknown, o: Record<string, unknown>) => void (debtFor = o) } as Partial<FoodDebtService>,
    );
    // ~60 m north of the pin.
    const res = await svc.confirmCollected("o1", "r1", { lat: CBD.lat + 0.00055, lng: CBD.lng });
    expect(res).toEqual({ orderId: "o1", status: "picked_up" });
    expect(updated).toEqual({ status: "picked_up", collectedAt: expect.any(Date) });
    expect(debtFor).toMatchObject({ id: "o1", riderId: "r1", merchantGoodsTotal: 12 });
  });

  it("refuses a rider who isn't at the restaurant", async () => {
    const { svc } = build({ $queryRaw: async () => row(), merchant });
    // ~1 km away.
    await expect(svc.confirmCollected("o1", "r1", { lat: CBD.lat + 0.009, lng: CBD.lng })).rejects.toMatchObject({
      response: { reason: "not_at_restaurant" },
    });
  });

  it("refuses when the restaurant isn't on auto-accept — the pickup code applies", async () => {
    const { svc } = build({ $queryRaw: async () => row({ auto_accepted: false }), merchant });
    await expect(svc.confirmCollected("o1", "r1", CBD)).rejects.toMatchObject({ response: { reason: "code_required" } });
  });

  it("refuses anyone but the assigned rider", async () => {
    const { svc } = build({ $queryRaw: async () => row(), merchant });
    await expect(svc.confirmCollected("o1", "other", CBD)).rejects.toThrow(/assigned rider/);
  });
});

describe("phone numbers (safeguard 5)", () => {
  const base = {
    id: "o1",
    merchantId: "m1",
    customerId: "c1",
    status: "requested",
    merchantPhase: "preparing",
    merchantItems: [],
    pickupCodeAttempts: 0,
    noShowCallTimestamps: [],
    opsNoAnswerAt: [],
    autoAccepted: true,
    dropoff: { point: AVONDALE, contactPhone: "+263779999999" },
  };
  const shop = (consent: boolean) => ({ location: { point: CBD, contactPhone: "+263771234567" }, showPhoneToCustomers: consent, ownerProfile: null });

  it("the customer sees the restaurant's number only with its consent, and never the payment number on a cash order", async () => {
    const { svc } = build({ order: { findFirst: async () => ({ ...base, merchantPaymentMethod: "cash", merchant: shop(false) }) } });
    const noConsent = await svc.getMyOrder("o1", "c1");
    expect(noConsent.restaurantPhone).toBeUndefined();
    expect(noConsent.merchantPaymentPhone).toBeNull();

    const { svc: svc2 } = build({ order: { findFirst: async () => ({ ...base, merchantPaymentMethod: "cash", merchant: shop(true) }) } });
    expect((await svc2.getMyOrder("o1", "c1")).restaurantPhone).toBe("+263771234567");
  });

  it("the restaurant's own queue carries the customer's number; the customer's view doesn't need it", async () => {
    const { svc } = build({
      merchant: { findUnique: async () => ({ id: "m1" }) },
      order: { findMany: async () => [{ ...base, merchant: shop(false) }], findFirst: async () => ({ ...base, merchant: shop(false) }) },
    });
    const [queued] = await svc.listQueue("owner-1");
    expect(queued!.customerPhone).toBe("+263779999999");
    expect((await svc.getMyOrder("o1", "c1")).customerPhone).toBeUndefined();
  });

  it("Merchant v2 (D-77): the merchant's own queue carries the customer's first name only; the customer's view doesn't", async () => {
    const order = { ...base, merchant: shop(false), customer: { firstName: " Rudo " } };
    const { svc } = build({ merchant: { findUnique: async () => ({ id: "m1" }) }, order: { findMany: async () => [order], findFirst: async () => order } });
    const [queued] = await svc.listQueue("owner-1");
    expect(queued!.customerFirstName).toBe("Rudo");
    expect((await svc.getMyOrder("o1", "c1")).customerFirstName).toBeUndefined();
  });

  it("Merchant v2 (D-77): the merchant's own view carries the assigned rider's phone; the customer's doesn't", async () => {
    const rider = { profileId: "r1", bikeReg: "AFG 2231", vehicleInfo: null, ratingAvg: 4.9, ratingCount: 3, tripsCount: 9, kycStatus: "verified", photoUrl: null, profile: { firstName: "Blessing", lastName: "Moyo", phone: "+263772222222" } };
    const order = { ...base, riderId: "r1", rider, merchant: shop(false) };
    const { svc } = build({ merchant: { findUnique: async () => ({ id: "m1" }) }, order: { findMany: async () => [order], findFirst: async () => order } });
    const [queued] = await svc.listQueue("owner-1");
    expect(queued!.riderPhone).toBe("+263772222222");
    const mine = await svc.getMyOrder("o1", "c1");
    expect(mine.riderPhone).toBeUndefined();
    expect(JSON.stringify(mine)).not.toContain("+263772222222");
  });
});

describe("food-order-ops — shared by the restaurant and ops (safeguards 1 and 4)", () => {
  const items = [
    { id: "i1", priceUsd: 5, quantity: 2, available: true },
    { id: "i2", priceUsd: 3, quantity: 1, available: true },
  ];
  const order = (over: Record<string, unknown> = {}) => ({
    id: "o1",
    customerId: "c1",
    merchantId: "m1",
    status: "requested",
    merchantPhase: "preparing",
    deliveryFee: 2.5,
    merchantItems: items,
    merchant: { name: "Mama's Kitchen" },
    ...over,
  });

  function prismaFor(o: Record<string, unknown>) {
    const itemUpdates: Array<{ id: string; data: Record<string, unknown> }> = [];
    let orderData: Record<string, unknown> | undefined;
    const prisma: Record<string, unknown> = {
      order: {
        findFirst: async () => o,
        updateMany: async ({ data }: { data: Record<string, unknown> }) => {
          orderData = data;
          return { count: 1 };
        },
      },
      merchantOrderItem: { update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => itemUpdates.push({ id: where.id, data }) },
    };
    prisma.$transaction = async (cb: (tx: unknown) => unknown) => cb(prisma);
    return { prisma: prisma as unknown as PrismaService, itemUpdates, orderData: () => orderData };
  }

  it("recomputes the totals server-side and tells the customer the new total", async () => {
    pushes.length = 0;
    const { prisma, itemUpdates, orderData } = prismaFor(order());
    // Drop the $3 line, keep 2 × $5 → $10 goods (above the $4 minimum) + $2.50 delivery.
    await editOrderItems(prisma, notifications, gateway, "o1", { lines: [{ itemId: "i2", quantity: 0 }] });
    expect(orderData()).toMatchObject({ merchantGoodsTotal: 10, agreedFare: 12.5, itemsEditedAt: expect.any(Date) });
    expect(itemUpdates).toEqual([
      { id: "i1", data: { quantity: 2, available: true } },
      { id: "i2", data: { available: false } },
    ]);
    expect(pushes[0]).toMatchObject({ profileIds: ["c1"], title: "Mama's Kitchen updated your order", body: expect.stringContaining("$12.50") });
  });

  it("D-71: a free-delivery order stays free after an edit — customer total is the goods, the share stays the fee", async () => {
    pushes.length = 0;
    const { prisma, orderData } = prismaFor(order({ merchantDeliveryShare: 2.5 }));
    await editOrderItems(prisma, notifications, gateway, "o1", { lines: [{ itemId: "i2", quantity: 0 }] });
    expect(orderData()).toMatchObject({ merchantGoodsTotal: 10, merchantDeliveryShare: 2.5, agreedFare: 10 });
    expect(pushes[0]).toMatchObject({ body: expect.stringContaining("$10.00") });
  });

  it("D-71: an edit that drops the goods below the fee caps the venue's share (the rider is never short)", async () => {
    // Keep 1 × $3 → $3 goods + $1 small-order fee = $4 goods; fee $5 → share capped at $4, customer pays $1 delivery.
    const { prisma, orderData } = prismaFor(order({ deliveryFee: 5, merchantDeliveryShare: 5 }));
    await editOrderItems(prisma, notifications, gateway, "o1", { lines: [{ itemId: "i1", quantity: 0 }] });
    expect(orderData()).toMatchObject({ merchantGoodsTotal: 4, merchantDeliveryShare: 4, agreedFare: 5 });
  });

  it("won't remove every line — that's a cancel", async () => {
    const { prisma } = prismaFor(order());
    await expect(
      editOrderItems(prisma, notifications, gateway, "o1", { lines: [{ itemId: "i1", quantity: 0 }, { itemId: "i2", quantity: 0 }] }),
    ).rejects.toMatchObject({ response: { reason: "no_items_left" } });
  });

  it("won't change the items once the rider has the food", async () => {
    const { prisma } = prismaFor(order({ status: "picked_up", merchantPhase: null }));
    await expect(editOrderItems(prisma, notifications, gateway, "o1", { lines: [{ itemId: "i1", quantity: 1 }] })).rejects.toMatchObject({
      response: { reason: "not_editable" },
    });
  });

  it("confirmKitchen only confirms a live, unconfirmed, auto-accepted order", async () => {
    let where: Record<string, unknown> | undefined;
    const prisma = {
      order: {
        updateMany: async (args: { where: Record<string, unknown> }) => {
          where = args.where;
          return { count: 1 };
        },
        findUnique: async () => ({ merchantId: "m1" }),
      },
    } as unknown as PrismaService;
    expect(await confirmKitchen(prisma, gateway, "o1", "ops")).toBe(true);
    expect(where).toMatchObject({ autoAccepted: true, kitchenConfirmedAt: null });
  });
});

describe("Merchant v2 K3 · +5 min (ledger D-77)", () => {
  const started = new Date("2026-10-04T07:10:00.000Z");
  const cooking = { id: "o1", merchantId: "m1", customerId: "c1", status: "requested", merchantPhase: "preparing", prepMinutes: 15, prepStartedAt: started, merchantItems: [], pickupCodeAttempts: 0, noShowCallTimestamps: [], opsNoAnswerAt: [], dropoff: null, merchant: { location: null, showPhoneToCustomers: false, ownerProfile: null } };

  it("adds five minutes to the prep (guarded on the value it read) and tells the customer the new time silently", async () => {
    let where: Record<string, unknown> | undefined;
    let data: Record<string, unknown> | undefined;
    const sent: Array<Record<string, unknown>> = [];
    const { svc } = build({
      merchant: { findUnique: async () => ({ id: "m1" }) },
      order: {
        findFirst: async () => cooking,
        findUnique: async () => ({ ...cooking, prepMinutes: 20 }),
        updateMany: async (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
          where = args.where;
          data = args.data;
          return { count: 1 };
        },
      },
    });
    (svc as unknown as { notifications: { notifyProfiles: (ids: string[], msg: Record<string, unknown>) => Promise<void> } }).notifications = {
      notifyProfiles: async (_ids, msg) => {
        sent.push(msg);
      },
    };
    const res = await svc.extendPrep("owner-1", "o1");
    expect(where).toMatchObject({ id: "o1", merchantPhase: "preparing", prepMinutes: 15 });
    expect(data).toEqual({ prepMinutes: 20 });
    expect(res.prepMinutes).toBe(20);
    expect(queueChanges).toEqual(["o1"]);
    expect(sent).toEqual([
      expect.objectContaining({
        silent: true,
        data: expect.objectContaining({ orderId: "o1", kind: "food_ready_time", readyAt: "2026-10-04T07:30:00.000Z" }),
      }),
    ]);
  });

  it("refuses an order that isn't cooking, and past the two-hour cap", async () => {
    const { svc } = build({ merchant: { findUnique: async () => ({ id: "m1" }) }, order: { findFirst: async () => ({ ...cooking, merchantPhase: "ready_for_pickup" }) } });
    await expect(svc.extendPrep("owner-1", "o1")).rejects.toThrow("This order isn't in prep");
    const { svc: svc2 } = build({ merchant: { findUnique: async () => ({ id: "m1" }) }, order: { findFirst: async () => ({ ...cooking, prepMinutes: 120 }) } });
    await expect(svc2.extendPrep("owner-1", "o1")).rejects.toThrow();
  });
});
