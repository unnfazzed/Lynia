/**
 * D-125 delivery price ceiling (docs/plans/2026-11-05-delivery-price-ceiling.md §7 "Tests that must exist").
 */
import { describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import { recomputeMerchantDeliveryShare } from "@lynia/shared";
import type { Env } from "../config/env";
import { TokenService } from "../auth/token.service";
import type { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";
import type { TrackingGateway } from "../tracking/tracking.gateway";
import type { DispatchStrategy } from "./dispatch-strategy";
import { FoodDispatchService, ladderRound } from "./food-dispatch.service";
import { FoodOrderPlacing } from "./food-order.placing";
import type { FoodOrderHost } from "./food-order.host";
import { customerCeilingView, merchantTopUpView, withCustomerCeiling } from "./delivery-ceiling.views";
import type { OrderWithItems } from "./food-order.helpers";
import type { MerchantOrderResponse } from "@lynia/shared";
import { withMembershipShim } from "./testing/membership-shim";

const D = (n: number) => new Prisma.Decimal(n);
const tokens = new TokenService({ JWT_SIGNING_SECRET: "delivery-ceiling-test-secret-0123456789", ACCESS_TTL_SECONDS: 900 } as Env);
const orderId = "11111111-1111-4111-8111-111111111111";
const MERCHANT_ID = "33333333-3333-4333-8333-333333333333";

const pushes: Array<{ profileIds: string[]; title: string; body: string }> = [];
const notifications = {
  notifyProfiles: async (profileIds: string[], msg: { title: string; body: string }) => {
    pushes.push({ profileIds, ...msg });
  },
} as unknown as NotificationsService;
const gateway = {
  emitOrderStatus: vi.fn(),
  emitFoodOffer: vi.fn(async () => {}),
  emitDispatchOfferClosed: vi.fn(async () => {}),
  emitFoodQueueChanged: vi.fn(),
  evictFromOrderRoom: vi.fn(async () => {}),
  evictRiderFromSupply: vi.fn(async () => {}),
} as unknown as TrackingGateway;

function build(methods: Record<string, unknown>, strategy: DispatchStrategy = { pickCandidates: async () => [] }) {
  pushes.length = 0;
  const prisma = withMembershipShim({ ...methods } as Record<string, unknown>);
  prisma.$transaction = async (cb: (tx: unknown) => unknown) => cb(prisma);
  const order = prisma.order as Record<string, unknown> | undefined;
  if (order && !order.count) order.count = async () => 1;
  const attempts = (prisma.foodDispatchAttempt ??= {}) as Record<string, unknown>;
  if (!attempts.findMany) attempts.findMany = async () => [];
  if (!attempts.updateMany) attempts.updateMany = async () => ({ count: 0 });
  const svc = new FoodDispatchService(prisma as unknown as PrismaService, tokens, notifications, gateway, strategy);
  return { svc, prisma };
}

const ceilingOrder = (over: Record<string, unknown> = {}) => ({
  status: "requested",
  merchantPhase: "ready_for_pickup",
  merchantId: MERCHANT_ID,
  customerId: "cust-1",
  noRiderHoldAt: null,
  dispatchAttempt: 0,
  dispatchExcludedRiderIds: [] as string[],
  dispatchStartedAt: null,
  pickup: { point: { lat: -17.8292, lng: 31.0522 }, landmark: "Avondale Fresh" },
  dropoff: { point: { lat: -17.8016, lng: 31.0431 }, landmark: "Lanark Rd" },
  itemDesc: "5 items",
  merchantGoodsTotal: D(67),
  deliveryFee: D(2.5),
  merchantDeliveryShare: null,
  distanceKm: 2.5,
  deliveryCeiling: D(3),
  deliveryLadder: D(2.5),
  merchantTopUp: null,
  deliveryVenueFunded: false,
  deliveryRound: 0,
  substitutionRounds: [],
  ...over,
});

describe("ladderRound — one 50c step per round, capped at the ceiling", () => {
  it("round 1 keeps the starting offer; later rounds climb, then hold at the ceiling", () => {
    const o = ceilingOrder();
    expect(ladderRound(o, 1)).toMatchObject({ deliveryLadder: 2.5, deliveryFee: 2.5, agreedFare: 69.5, merchantDeliveryShare: null, deliveryRound: 1 });
    expect(ladderRound(o, 2)).toMatchObject({ deliveryLadder: 3, deliveryFee: 3, agreedFare: 70 });
    expect(ladderRound({ ...o, deliveryLadder: D(3) }, 5)).toMatchObject({ deliveryLadder: 3, deliveryFee: 3 });
  });

  it("the shop's top-up rides on top; the customer's total is unchanged", () => {
    expect(ladderRound(ceilingOrder({ deliveryLadder: D(3), merchantTopUp: D(1) }), 1)).toMatchObject({
      deliveryFee: 4,
      merchantDeliveryShare: 1,
      agreedFare: 70,
    });
  });

  it("an order without a ceiling never moves", () => {
    expect(ladderRound(ceilingOrder({ deliveryCeiling: null, deliveryLadder: null }), 3)).toBeNull();
  });

  it("property: the rider is never offered more than ceiling + top-up; the customer never owes more than goods + ceiling", () => {
    for (const ceiling of [2.5, 3, 4, 6]) {
      for (const topUp of [0, 0.5, 1, 2]) {
        let ladder = 2.5;
        for (let attempt = 1; attempt <= 12; attempt++) {
          const r = ladderRound(ceilingOrder({ deliveryCeiling: D(ceiling), deliveryLadder: D(ladder), merchantTopUp: D(topUp) }), attempt)!;
          expect(r.deliveryFee).toBeLessThanOrEqual(ceiling + topUp);
          expect(r.agreedFare).toBeLessThanOrEqual(67 + ceiling);
          ladder = r.deliveryLadder;
        }
      }
    }
  });
});

describe("FoodDispatchService — the ladder in the sweep", () => {
  it("a later round writes the climbed price and the offer push names it", async () => {
    const updateMany = vi.fn(async () => ({ count: 1 }));
    const { svc } = build(
      {
        order: { findMany: async () => [{ id: orderId }], findUnique: async () => ceilingOrder({ dispatchAttempt: 1, deliveryRound: 1 }), updateMany },
        merchant: { findUnique: async () => ({ location: { point: { lat: -17.8292, lng: 31.0522 } }, name: "Avondale Fresh", businessType: "shop" }) },
        orderEvent: { create: async () => ({}) },
        foodDispatchAttempt: { upsert: async () => ({}), findMany: async () => [], updateMany: async () => ({ count: 0 }) },
        walletAccount: { findMany: async () => [] },
      },
      { pickCandidates: async () => [{ riderId: "r1", distanceM: 500 }] },
    );
    await svc.sweepSearch();
    const calls = updateMany.mock.calls as unknown as Array<[{ data: Record<string, unknown> }]>;
    const claim = calls.map((c) => c[0].data).find((d) => d.status === "open_for_offers" || d.dispatchAttempt === 2);
    expect(claim).toMatchObject({ deliveryLadder: 3, deliveryFee: 3, agreedFare: 70, deliveryRound: 2 });
  });

  it("the hold schedules the customer's raise ask 2 minutes out", async () => {
    const updateMany = vi.fn(async () => ({ count: 1 }));
    const { svc } = build({
      order: { findMany: async () => [{ id: orderId }], findUnique: async () => ceilingOrder({ dispatchAttempt: 6 }), updateMany },
      merchant: { findUnique: async () => ({ location: { point: { lat: -17.8292, lng: 31.0522 } } }) },
    });
    const before = Date.now();
    await svc.sweepSearch();
    const data = (updateMany.mock.calls[0] as unknown as [{ data: { noRiderHoldAt: Date; deliveryAskCustomerAt: Date } }])[0].data;
    expect(data.noRiderHoldAt).toBeInstanceOf(Date);
    expect(data.deliveryAskCustomerAt.getTime()).toBeGreaterThanOrEqual(before + 120_000 - 5);
  });

  it("a free-delivery venue's hold never asks the customer", async () => {
    const updateMany = vi.fn(async () => ({ count: 1 }));
    const { svc } = build({
      order: { findMany: async () => [{ id: orderId }], findUnique: async () => ceilingOrder({ dispatchAttempt: 6, deliveryVenueFunded: true }), updateMany },
      merchant: { findUnique: async () => ({ location: { point: { lat: -17.8292, lng: 31.0522 } } }) },
    });
    await svc.sweepSearch();
    expect((updateMany.mock.calls[0] as unknown as [{ data: Record<string, unknown> }])[0].data).not.toHaveProperty("deliveryAskCustomerAt");
  });
});

describe("FoodDispatchService.topUp (M4h)", () => {
  const owner = { merchant: { findUnique: async () => ({ id: MERCHANT_ID }) } };
  function topUpWorld(order: Record<string, unknown> | null) {
    const updateMany = vi.fn(async () => ({ count: 1 }));
    const built = build({ ...owner, order: { findFirst: async () => order, updateMany } });
    return { ...built, updateMany };
  }

  it("adds to the offer, keeps the customer's price, and resumes the search", async () => {
    const { svc, updateMany } = topUpWorld({ merchantGoodsTotal: D(67), deliveryCeiling: D(3), deliveryLadder: D(3), merchantTopUp: null, deliveryVenueFunded: false });
    expect(await svc.topUp("owner-1", orderId, 1)).toEqual({ orderId, offer: 4, topUp: 1 });
    const data = (updateMany.mock.calls[0] as unknown as [{ data: Record<string, unknown> }])[0].data;
    expect(data).toMatchObject({ merchantTopUp: 1, deliveryFee: 4, merchantDeliveryShare: 1, agreedFare: 70, noRiderHoldAt: null, dispatchAttempt: 0, deliveryAskCustomerAt: null });
  });

  it("refuses a top-up above the goods total", async () => {
    const { svc } = topUpWorld({ merchantGoodsTotal: D(1.5), deliveryCeiling: D(3), deliveryLadder: D(3), merchantTopUp: null, deliveryVenueFunded: false });
    await expect(svc.topUp("owner-1", orderId, 2)).rejects.toThrow(/more than this order/i);
  });

  it("refuses an order without a ceiling", async () => {
    const { svc } = topUpWorld({ merchantGoodsTotal: D(67), deliveryCeiling: null, deliveryLadder: null, merchantTopUp: null, deliveryVenueFunded: null });
    await expect(svc.topUp("owner-1", orderId, 1)).rejects.toThrow(/can't be topped up/i);
  });
});

describe("FoodDispatchService.raiseCeiling (T11c)", () => {
  const held = { status: "requested", riderId: null, noRiderHoldAt: new Date(), merchantGoodsTotal: D(67), deliveryRecommended: D(3), deliveryCeiling: D(3), deliveryLadder: D(3), merchantTopUp: null, deliveryVenueFunded: false };
  function raiseWorld(order: Record<string, unknown>) {
    const updateMany = vi.fn(async () => ({ count: 1 }));
    const built = build({ order: { findFirst: async () => order, updateMany, findUnique: async () => ({ merchantId: MERCHANT_ID }) } });
    return { ...built, updateMany };
  }

  it("on hold: offers the new ceiling at once and searches again", async () => {
    const { svc, updateMany } = raiseWorld(held);
    await svc.raiseCeiling("cust-1", orderId, 3.5);
    const data = (updateMany.mock.calls[0] as unknown as [{ data: Record<string, unknown> }])[0].data;
    expect(data).toMatchObject({ deliveryCeiling: 3.5, deliveryLadder: 3.5, deliveryFee: 3.5, agreedFare: 70.5, noRiderHoldAt: null, dispatchAttempt: 0 });
  });

  it("during a live round: only the ceiling moves (the round's price is the one its riders saw)", async () => {
    const { svc, updateMany } = raiseWorld({ ...held, status: "open_for_offers", noRiderHoldAt: null });
    await svc.raiseCeiling("cust-1", orderId, 3.5);
    const data = (updateMany.mock.calls[0] as unknown as [{ data: Record<string, unknown> }])[0].data;
    expect(data).toEqual({ deliveryCeiling: 3.5, deliveryAskCustomerAt: null });
  });

  it("refuses above 2 × Recommended, a lower amount, an assigned order and a free-delivery venue", async () => {
    await expect(raiseWorld(held).svc.raiseCeiling("cust-1", orderId, 6.5)).rejects.toThrow(/higher delivery price/i);
    await expect(raiseWorld(held).svc.raiseCeiling("cust-1", orderId, 3)).rejects.toThrow(/higher delivery price/i);
    await expect(raiseWorld({ ...held, riderId: "r1", status: "assigned" }).svc.raiseCeiling("cust-1", orderId, 3.5)).rejects.toThrow(/already has/i);
    await expect(raiseWorld({ ...held, deliveryVenueFunded: true }).svc.raiseCeiling("cust-1", orderId, 3.5)).rejects.toThrow(/can't be raised/i);
  });
});

describe("FoodDispatchService.sweepRaiseAsks (T11c-push)", () => {
  it("pushes once with the next 50c step, never a code", async () => {
    const updateMany = vi.fn(async () => ({ count: 1 }));
    const { svc } = build({
      order: {
        findMany: async () => [{ id: orderId, customerId: "cust-1", deliveryCeiling: D(3), deliveryRecommended: D(3), merchant: { name: "Avondale Fresh" } }],
        updateMany,
      },
    });
    expect(await svc.sweepRaiseAsks()).toEqual({ asked: 1 });
    expect(pushes[0]).toMatchObject({ profileIds: ["cust-1"], title: "No biker yet for your Avondale Fresh order", body: "Raise delivery to $3.50 at most, or keep waiting." });
  });

  it("skips the push when the ceiling is already the highest", async () => {
    const { svc } = build({
      order: { findMany: async () => [{ id: orderId, customerId: "cust-1", deliveryCeiling: D(6), deliveryRecommended: D(3), merchant: null }], updateMany: async () => ({ count: 1 }) },
    });
    expect(await svc.sweepRaiseAsks()).toEqual({ asked: 0 });
    expect(pushes).toHaveLength(0);
  });
});

describe("placement — ceilingAtPlacement", () => {
  const placing = (on: boolean) => new FoodOrderPlacing({ env: { DELIVERY_CEILING_ENABLED: on ? "true" : "false" } } as unknown as FoodOrderHost) as unknown as {
    ceilingAtPlacement(req: number | undefined, km: number, free: boolean): { recommended: number; ceiling: number; ladder: number } | null;
  };

  it("the flag off, or no ceiling sent (an installed app), keeps the fixed fee", () => {
    expect(placing(false).ceilingAtPlacement(3, 2.5, false)).toBeNull();
    expect(placing(true).ceilingAtPlacement(undefined, 2.5, false)).toBeNull();
  });

  it("stores Recommended, the ceiling and the starting offer (plan §4, 2.5 km)", () => {
    expect(placing(true).ceilingAtPlacement(3, 2.5, false)).toEqual({ recommended: 3, ceiling: 3, ladder: 2.5 });
    expect(placing(true).ceilingAtPlacement(6, 2.5, false)).toEqual({ recommended: 3, ceiling: 6, ladder: 2.5 });
  });

  it("refuses a ceiling outside the bounds or off the 50c grid", () => {
    expect(() => placing(true).ceilingAtPlacement(2, 2.5, false)).toThrow(/from \$2\.50 to \$6\.00/);
    expect(() => placing(true).ceilingAtPlacement(6.5, 2.5, false)).toThrow();
    expect(() => placing(true).ceilingAtPlacement(3.25, 2.5, false)).toThrow();
  });

  it("a free-delivery venue ignores the amount sent: its ceiling is Recommended", () => {
    expect(placing(true).ceilingAtPlacement(2.5, 2.5, true)).toEqual({ recommended: 3, ceiling: 3, ladder: 2.5 });
  });
});

describe("the views — who sees which number", () => {
  const row = (over: Record<string, unknown> = {}) =>
    ({
      status: "open_for_offers",
      riderId: null,
      merchantGoodsTotal: D(67),
      deliveryFee: D(2.5),
      merchantDeliveryShare: null,
      distanceKm: 2.5,
      deliveryRecommended: D(3),
      deliveryCeiling: D(3),
      deliveryLadder: D(2.5),
      merchantTopUp: null,
      deliveryVenueFunded: false,
      deliveryAcceptedRound: null,
      deliveryAskCustomerAt: null,
      carriedBalance: [],
      ...over,
    }) as unknown as OrderWithItems;

  it("before acceptance the customer sees the ceiling and an 'at most' total", () => {
    expect(customerCeilingView(row())).toMatchObject({ recommended: 3, ceiling: 3, max: 6, totalAtMost: 70, acceptedPrice: null, saved: null, askRaise: false });
  });

  it("after acceptance: the exact price and the saving (T6p); no saving at the full ceiling (T6p-same)", () => {
    expect(customerCeilingView(row({ status: "assigned", riderId: "r1", deliveryAcceptedRound: 1 }))).toMatchObject({ acceptedPrice: 2.5, saved: 0.5 });
    expect(customerCeilingView(row({ status: "assigned", riderId: "r1", deliveryAcceptedRound: 2, deliveryFee: D(3) }))).toMatchObject({ acceptedPrice: 3, saved: null });
  });

  it("with a shop top-up the customer's delivery fee is their own part, never the rider's larger fee", () => {
    const order = row({ status: "assigned", riderId: "r1", deliveryAcceptedRound: 7, deliveryFee: D(4), merchantDeliveryShare: D(1), merchantTopUp: D(1), deliveryLadder: D(3) });
    const out = withCustomerCeiling(order, { deliveryFee: 4, merchantDeliveryShare: 1, customerDeliveryFee: 3 } as unknown as MerchantOrderResponse);
    expect(out.deliveryFee).toBe(3);
    expect(out).not.toHaveProperty("merchantDeliveryShare");
    expect(out.deliveryCeiling).toMatchObject({ acceptedPrice: 3, saved: null });
  });

  it("asks the customer to raise once the ask is due — never on a free-delivery venue", () => {
    const past = new Date(Date.now() - 1000);
    expect(customerCeilingView(row({ status: "requested", deliveryAskCustomerAt: past }))!.askRaise).toBe(true);
    expect(customerCeilingView(row({ status: "requested", deliveryAskCustomerAt: past, deliveryVenueFunded: true }))!.askRaise).toBe(false);
    expect(customerCeilingView(row({ status: "requested", deliveryAskCustomerAt: past, deliveryCeiling: D(6) }))!.askRaise).toBe(false);
  });

  it("an order without a ceiling has no view at all", () => {
    expect(customerCeilingView(row({ deliveryCeiling: null }))).toBeUndefined();
    expect(merchantTopUpView(row({ deliveryCeiling: null }))).toBeUndefined();
  });

  it("the merchant sees the offer, its top-up and the choices left", () => {
    expect(merchantTopUpView(row({ deliveryFee: D(4), merchantTopUp: D(1), deliveryAskCustomerAt: new Date("2026-11-05T12:49:00Z") }))).toEqual({
      offer: 4,
      topUp: 1,
      choices: [0.5, 1, 2],
      askCustomerAt: "2026-11-05T12:49:00.000Z",
    });
  });
});

describe("recomputeMerchantDeliveryShare on a ceiling order", () => {
  it("keeps the shop's top-up as the share (not the whole fee)", () => {
    expect(recomputeMerchantDeliveryShare(1, 50, 4, { deliveryCeiling: 3, merchantTopUp: 1, deliveryVenueFunded: false })).toBe(1);
    expect(recomputeMerchantDeliveryShare(null, 50, 3, { deliveryCeiling: 3, merchantTopUp: null, deliveryVenueFunded: false })).toBeNull();
    expect(recomputeMerchantDeliveryShare(3, 50, 3, { deliveryCeiling: 3, deliveryVenueFunded: true })).toBe(3);
  });
});
