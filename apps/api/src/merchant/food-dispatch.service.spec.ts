import { describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import type { Env } from "../config/env";
import { TokenService } from "../auth/token.service";
import type { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";
import type { TrackingGateway } from "../tracking/tracking.gateway";
import type { DispatchStrategy } from "./dispatch-strategy";
import { earlyDispatchDue, FoodDispatchService } from "./food-dispatch.service";
import { withMembershipShim } from "./testing/membership-shim";

const tokens = new TokenService({ JWT_SIGNING_SECRET: "food-dispatch-test-secret-0123456789", ACCESS_TTL_SECONDS: 900 } as Env);

const notified: Array<{ profileIds: string[]; title: string; body: string }> = [];
const notifications = {
  notifyProfiles: async (profileIds: string[], msg: { title: string; body: string }) => {
    notified.push({ profileIds, ...msg });
  },
} as unknown as NotificationsService;

function fakeGateway() {
  return {
    emitOrderStatus: vi.fn(),
    evictRiderFromSupply: vi.fn(async () => {}),
    emitFoodOffer: vi.fn(async () => {}),
    emitFoodOfferClosed: vi.fn(async () => {}),
    emitFoodQueueChanged: vi.fn(),
  } as unknown as TrackingGateway & {
    emitOrderStatus: ReturnType<typeof vi.fn>;
    evictRiderFromSupply: ReturnType<typeof vi.fn>;
    emitFoodOffer: ReturnType<typeof vi.fn>;
    emitFoodOfferClosed: ReturnType<typeof vi.fn>;
    emitFoodQueueChanged: ReturnType<typeof vi.fn>;
  };
}

/** Fake Prisma where `$transaction(cb)` runs the callback against the same fake (tx === prisma),
 *  mirroring food-order.service.spec.ts's `build()`. */
function build(methods: Record<string, unknown>, strategy: DispatchStrategy, gateway = fakeGateway()) {
  notified.length = 0;
  const prisma = withMembershipShim({ ...methods } as Record<string, unknown>);
  prisma.$transaction = async (cb: (tx: unknown) => unknown) => cb(prisma);
  // The tick's post-write "is the round still live?" re-check: live unless a test says otherwise.
  const order = prisma.order as Record<string, unknown> | undefined;
  if (order && !order.count) order.count = async () => 1;
  const svc = new FoodDispatchService(prisma as unknown as PrismaService, tokens, notifications, gateway, strategy);
  return { svc, prisma, gateway };
}

const HARARE_CBD = { lat: -17.8292, lng: 31.0522 };
// C5: FoodOfferEvent.parse() requires real (version/variant-nibble-valid) UUIDs — matches the strict
// pattern every other WS event schema (BoardNewOrderEvent etc.) already enforces.
const orderId = "11111111-1111-4111-8111-111111111111";
const MERCHANT_ID = "33333333-3333-4333-8333-333333333333";

// D-17/board-redaction fixtures: contactPhone is PII a browsing/offered rider must never see — kept
// on the stored Waypoint (mirrors a real order row) so tests can assert it's stripped on the wire.
const PICKUP = { point: HARARE_CBD, landmark: "Mama's Kitchen", contactPhone: "+263771111111" };
const DROPOFF = { point: { lat: -17.8016, lng: 31.0431 }, landmark: "Avondale Shops", contactPhone: "+263772222222" };

const baseOrder = (over: Record<string, unknown> = {}) => ({
  status: "requested",
  merchantPhase: "ready_for_pickup",
  merchantId: MERCHANT_ID,
  noRiderHoldAt: null,
  dispatchAttempt: 0,
  dispatchExcludedRiderIds: [] as string[],
  dispatchStartedAt: null,
  pickup: PICKUP,
  dropoff: DROPOFF,
  itemDesc: "2x Sadza & stew",
  merchantGoodsTotal: 12.5,
  deliveryFee: 2.5,
  distanceKm: 3.1,
  ...over,
});

/** A strategy that finds nobody — for the paths that never reach it. */
const NONE: DispatchStrategy = { pickCandidates: async () => [] };

describe("FoodDispatchService.sweepSearch — the restaurant's own riders (merchant web upgrade L3)", () => {
  function world(preferred: { findMany: () => Promise<Array<{ phone: string }>> }) {
    const strategy: DispatchStrategy = { pickCandidates: vi.fn(async () => [{ riderId: "mine", distanceM: 900, preferred: true }]) };
    const { svc } = build(
      {
        order: { findMany: async () => [{ id: orderId }], findUnique: async () => baseOrder(), updateMany: vi.fn(async () => ({ count: 1 })) },
        merchant: { findUnique: async () => ({ location: { point: HARARE_CBD } }) },
        merchantPreferredRider: preferred,
        profile: {
          findMany: async () => [
            { id: "mine", merchantMemberships: [] },
            // On the restaurant's own team: never its rider (OV-5).
            { id: "cook", merchantMemberships: [{ merchantId: MERCHANT_ID }] },
          ],
        },
        orderEvent: { create: async () => ({}) },
        foodDispatchAttempt: { upsert: vi.fn(async () => ({})) },
      },
      strategy,
    );
    return { svc, strategy };
  }

  it("hands the strategy the restaurant's riders, matched by phone, never its own team", async () => {
    const { svc, strategy } = world({ findMany: async () => [{ phone: "+263771230000" }, { phone: "+263771239999" }] });
    expect(await svc.sweepSearch()).toEqual({ offered: 1, held: 0 });
    expect(strategy.pickCandidates).toHaveBeenCalledWith(expect.objectContaining({ preferredRiderIds: ["mine"] }));
  });

  it("carries on nearest-first when the lookup fails", async () => {
    const { svc, strategy } = world({
      findMany: async () => {
        throw new Error("connection reset");
      },
    });
    expect(await svc.sweepSearch()).toEqual({ offered: 1, held: 0 });
    expect(strategy.pickCandidates).toHaveBeenCalledWith(expect.objectContaining({ preferredRiderIds: [] }));
  });
});

const one = (riderId: string, distanceM = 800) => [{ riderId, distanceM }];
const pick = (list: Array<{ riderId: string; distanceM: number; preferred?: boolean }>): DispatchStrategy => ({ pickCandidates: vi.fn(async () => list) });

describe("FoodDispatchService.sweepSearch — rounds (owner 2026-10-01: the best 10, then everyone)", () => {
  function world(over: Record<string, unknown> = {}, strategy = pick(one("r1"))) {
    const attemptUpsert = vi.fn(async () => ({}));
    const orderUpdateMany = vi.fn(async () => ({ count: 1 }));
    const built = build(
      {
        order: { findMany: async () => [{ id: orderId }], findUnique: async () => baseOrder(), updateMany: orderUpdateMany },
        merchant: { findUnique: async () => ({ location: { point: HARARE_CBD } }) },
        orderEvent: { create: async () => ({}) },
        foodDispatchAttempt: { upsert: attemptUpsert, findMany: async () => [], updateMany: async () => ({ count: 0 }) },
        ...over,
      },
      strategy,
    );
    return { ...built, attemptUpsert, orderUpdateMany, strategy };
  }

  it("offers the first round to the best 10 at once: one row, one push and one alarm each", async () => {
    const riders = Array.from({ length: 10 }, (_, i) => ({ riderId: `r${i}`, distanceM: 100 * (i + 1) }));
    const { svc, gateway, attemptUpsert, orderUpdateMany, strategy } = world({}, pick(riders));

    expect(await svc.sweepSearch()).toEqual({ offered: 1, held: 0 });
    expect(strategy.pickCandidates).toHaveBeenCalledWith(expect.objectContaining({ limit: 10, radiusM: 8000, excludeRiderIds: [] }));
    expect(orderUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: orderId, status: "requested", dispatchAttempt: 0, noRiderHoldAt: null }),
        data: expect.objectContaining({ status: "open_for_offers", dispatchOfferedRiderId: null, dispatchOfferExpiresAt: expect.any(Date), dispatchAttempt: 1 }),
      }),
    );
    expect(attemptUpsert).toHaveBeenCalledTimes(10);
    expect(attemptUpsert).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { orderId_riderId: { orderId, riderId: "r0" } },
        create: expect.objectContaining({ orderId, riderId: "r0", attemptNumber: 1, radiusM: 8000 }),
        update: expect.objectContaining({ attemptNumber: 1, outcome: "pending", respondedAt: null }),
      }),
    );
    expect(notified).toEqual([expect.objectContaining({ profileIds: riders.map((r) => r.riderId) })]);
    expect(gateway.emitFoodOffer).toHaveBeenCalledTimes(10);
    expect(gateway.emitOrderStatus).not.toHaveBeenCalled(); // no realtime push on an offer, only on rider-secured
    // C5 rider offer alarm channel, redacted like the parcel board (point + landmark only —
    // contactPhone must never cross the wire to an un-accepted rider).
    expect(gateway.emitFoodOffer).toHaveBeenCalledWith(
      "r3",
      expect.objectContaining({
        orderId,
        merchantId: MERCHANT_ID,
        pickup: { point: HARARE_CBD, landmark: "Mama's Kitchen" },
        dropoff: { point: DROPOFF.point, landmark: "Avondale Shops" },
        itemDesc: "2x Sadza & stew",
        merchantGoodsTotal: 12.5,
        deliveryFee: 2.5,
        distanceKm: 3.1,
      }),
    );
    const offerPayload = gateway.emitFoodOffer.mock.calls[0][1];
    expect(offerPayload.pickup.contactPhone).toBeUndefined();
    expect(offerPayload.dropoff.contactPhone).toBeUndefined();
  });

  it("offers every later round to everyone eligible (no cap), passing riders who passed as excluded", async () => {
    const { svc, strategy, attemptUpsert } = world({
      order: { findMany: async () => [{ id: orderId }], findUnique: async () => baseOrder({ dispatchAttempt: 1, dispatchExcludedRiderIds: ["passed"] }), updateMany: async () => ({ count: 1 }) },
    });
    await svc.sweepSearch();
    expect(strategy.pickCandidates).toHaveBeenCalledWith(expect.objectContaining({ limit: null, excludeRiderIds: ["passed"] }));
    expect(attemptUpsert).toHaveBeenCalledWith(expect.objectContaining({ update: expect.objectContaining({ attemptNumber: 2, outcome: "pending" }) }));
  });

  it("parks for the next poll (dispatch_search self-loop) when nobody is found, without touching the cap", async () => {
    const { svc, orderUpdateMany } = world({}, pick([]));
    expect(await svc.sweepSearch()).toEqual({ offered: 0, held: 0 });
    expect(orderUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ dispatchAttempt: 1, dispatchNextCheckAt: expect.any(Date) }) }),
    );
  });

  it("N-07: enters the D-34 merchant hold once the NO_RIDER cap (6 rounds) is exhausted, and pushes a C5 queue-changed signal", async () => {
    const orderUpdateMany = vi.fn(async () => ({ count: 1 }));
    const strategy = pick([]);
    const { svc, gateway } = build(
      { order: { findMany: async () => [{ id: orderId }], findUnique: async () => baseOrder({ dispatchAttempt: 6 }), updateMany: orderUpdateMany } },
      strategy,
    );
    expect(await svc.sweepSearch()).toEqual({ offered: 0, held: 1 });
    expect(strategy.pickCandidates).not.toHaveBeenCalled();
    expect(orderUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ noRiderHoldAt: expect.any(Date), dispatchNextCheckAt: null }) }),
    );
    expect(gateway.emitFoodQueueChanged).toHaveBeenCalledWith(MERCHANT_ID, orderId);
  });

  // LM-02: a second tick can land between tick's read and the offer CAS. A lost CAS degrades to
  // "skipped" without writing a phantom offer row or pushing an alarm for a round that never opened.
  it("skips (no rows, no push) when the round-opening CAS itself loses a race", async () => {
    const { svc, gateway, attemptUpsert } = world({
      order: { findMany: async () => [{ id: orderId }], findUnique: async () => baseOrder(), updateMany: async () => ({ count: 0 }) },
    });
    expect(await svc.sweepSearch()).toEqual({ offered: 0, held: 0 });
    expect(attemptUpsert).not.toHaveBeenCalled();
    expect(notified).toEqual([]);
    expect(gateway.emitFoodOffer).not.toHaveBeenCalled();
  });

  it("skips (not 'searching') when the nobody-found park CAS loses a race", async () => {
    const { svc } = world(
      { order: { findMany: async () => [{ id: orderId }], findUnique: async () => baseOrder(), updateMany: async () => ({ count: 0 }) } },
      pick([]),
    );
    expect(await svc.sweepSearch()).toEqual({ offered: 0, held: 0 });
  });

  it("closes the round again (no push) when the offer rows can't be written — nobody could accept it", async () => {
    const orderUpdateMany = vi.fn(async () => ({ count: 1 }));
    const { svc, gateway } = world({
      order: { findMany: async () => [{ id: orderId }], findUnique: async () => baseOrder(), updateMany: orderUpdateMany },
      foodDispatchAttempt: {
        upsert: async () => {
          throw new Error("connection reset");
        },
        findMany: async () => [],
        updateMany: async () => ({ count: 0 }),
      },
    });
    expect(await svc.sweepSearch()).toEqual({ offered: 0, held: 0 });
    expect(orderUpdateMany).toHaveBeenLastCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ status: "open_for_offers" }), data: expect.objectContaining({ status: "requested" }) }),
    );
    expect(notified).toEqual([]);
    expect(gateway.emitFoodOffer).not.toHaveBeenCalled();
  });

  it("skips an order that raced to hold/assigned since the sweep's own read (defensive re-check)", async () => {
    const strategy = pick([]);
    const { svc } = build(
      { order: { findMany: async () => [{ id: orderId }], findUnique: async () => baseOrder({ noRiderHoldAt: new Date() }) } },
      strategy,
    );
    expect(await svc.sweepSearch()).toEqual({ offered: 0, held: 0 });
    expect(strategy.pickCandidates).not.toHaveBeenCalled();
  });
});

describe("FoodDispatchService.sweepExpiredOffers — N-08 60s round", () => {
  it("closes a stale round back to requested, expires every pending row and closes each alarm — without excluding anyone", async () => {
    const roundEnd = new Date(Date.now() - 1000);
    const orderUpdateMany = vi.fn(async () => ({ count: 1 }));
    const attemptUpdateMany = vi.fn(async () => ({ count: 2 }));
    const { svc, gateway } = build(
      {
        order: { findMany: async () => [{ id: orderId, dispatchOfferExpiresAt: roundEnd }], updateMany: orderUpdateMany },
        foodDispatchAttempt: { findMany: async () => [{ riderId: "r1" }, { riderId: "r2" }], updateMany: attemptUpdateMany },
      },
      NONE,
    );
    expect(await svc.sweepExpiredOffers()).toEqual({ expired: 1 });
    expect(orderUpdateMany).toHaveBeenCalledWith({
      where: { id: orderId, status: "open_for_offers", dispatchOfferExpiresAt: roundEnd },
      data: { status: "requested", dispatchOfferedRiderId: null, dispatchOfferExpiresAt: null, dispatchNextCheckAt: expect.any(Date) },
    });
    expect(attemptUpdateMany).toHaveBeenCalledWith({
      where: { orderId, outcome: "pending" },
      data: expect.objectContaining({ outcome: "expired" }),
    });
    // C5: the ONLY signal a still-ringing rider gets besides their next poll.
    expect(gateway.emitFoodOfferClosed).toHaveBeenCalledWith("r1", orderId);
    expect(gateway.emitFoodOfferClosed).toHaveBeenCalledWith("r2", orderId);
  });

  it("does nothing when the round was already accepted or closed (lost CAS)", async () => {
    const attemptUpdateMany = vi.fn(async () => ({ count: 0 }));
    const { svc, gateway } = build(
      {
        order: { findMany: async () => [{ id: orderId, dispatchOfferExpiresAt: new Date(Date.now() - 1000) }], updateMany: async () => ({ count: 0 }) },
        foodDispatchAttempt: { findMany: async () => [{ riderId: "r1" }], updateMany: attemptUpdateMany },
      },
      NONE,
    );
    expect(await svc.sweepExpiredOffers()).toEqual({ expired: 0 });
    expect(attemptUpdateMany).not.toHaveBeenCalled();
    expect(gateway.emitFoodOfferClosed).not.toHaveBeenCalled();
  });
});

const roundEnd = new Date(Date.now() + 30_000);
const liveOrder = { status: "open_for_offers", merchantId: MERCHANT_ID, dispatchOfferExpiresAt: roundEnd, dispatchExcludedRiderIds: [] as string[] };
const pendingRow = { outcome: "pending", expiresAt: roundEnd };

describe("FoodDispatchService.acceptDispatch — D-04 rider secured, first to accept wins", () => {
  it("assigns the rider, mints a delivery code, clears merchantPhase + dispatch fields, tells the round's other riders, pushes rider-secured", async () => {
    const orderUpdateMany = vi.fn(async () => ({ count: 1 }));
    const attemptUpdateMany = vi.fn(async () => ({ count: 1 }));
    const { svc, gateway } = build(
      {
        order: { findFirst: async () => liveOrder, updateMany: orderUpdateMany, findUnique: async () => ({ customerId: "cust-1" }) },
        foodDispatchAttempt: { findUnique: async () => pendingRow, findMany: async () => [{ riderId: "r2" }, { riderId: "r3" }], updateMany: attemptUpdateMany },
        orderEvent: { create: async () => ({}) },
      },
      NONE,
    );
    expect(await svc.acceptDispatch(orderId, "r1")).toEqual({ orderId, status: "assigned" });
    expect(orderUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: orderId, status: "open_for_offers", dispatchOfferExpiresAt: roundEnd },
        data: expect.objectContaining({ status: "assigned", riderId: "r1", merchantPhase: null, dispatchOfferExpiresAt: null }),
      }),
    );
    expect(attemptUpdateMany).toHaveBeenCalledWith({ where: { orderId, riderId: "r1", outcome: "pending" }, data: expect.objectContaining({ outcome: "accepted" }) });
    expect(attemptUpdateMany).toHaveBeenCalledWith({
      where: { orderId, outcome: "pending", riderId: { not: "r1" } },
      data: expect.objectContaining({ outcome: "expired" }),
    });
    expect(gateway.emitFoodOfferClosed).toHaveBeenCalledWith("r2", orderId);
    expect(gateway.emitFoodOfferClosed).toHaveBeenCalledWith("r3", orderId);
    expect(gateway.emitFoodOfferClosed).not.toHaveBeenCalledWith("r1", orderId);
    expect(gateway.emitOrderStatus).toHaveBeenCalledWith(orderId, "assigned");
    expect(gateway.emitFoodQueueChanged).toHaveBeenCalledWith(MERCHANT_ID, orderId);
    expect(notified.map((n) => n.profileIds)).toEqual([["r1"], ["cust-1"]]);
  });

  it("409s the second rider to accept: the first already took it (lost CAS)", async () => {
    const { svc } = build(
      { order: { findFirst: async () => liveOrder, updateMany: async () => ({ count: 0 }) }, foodDispatchAttempt: { findUnique: async () => pendingRow } },
      NONE,
    );
    await expect(svc.acceptDispatch(orderId, "r2")).rejects.toThrow(/no longer live/i);
  });

  it("403s a rider this order was never offered to", async () => {
    const { svc } = build({ order: { findFirst: async () => liveOrder }, foodDispatchAttempt: { findUnique: async () => null } }, NONE);
    await expect(svc.acceptDispatch(orderId, "someone-else")).rejects.toThrow(/isn't yours/i);
  });

  it("409s a rider whose offer is no longer pending (their round closed, or they passed)", async () => {
    const { svc } = build(
      { order: { findFirst: async () => liveOrder }, foodDispatchAttempt: { findUnique: async () => ({ ...pendingRow, outcome: "expired" }) } },
      NONE,
    );
    await expect(svc.acceptDispatch(orderId, "r1")).rejects.toThrow(/no longer live/i);
  });

  it("409s when the offer already ran out", async () => {
    const { svc } = build(
      { order: { findFirst: async () => liveOrder }, foodDispatchAttempt: { findUnique: async () => ({ ...pendingRow, expiresAt: new Date(Date.now() - 1000) }) } },
      NONE,
    );
    await expect(svc.acceptDispatch(orderId, "r1")).rejects.toThrow(/just expired/i);
  });

  it("409s (not 500) on the one_active_ride race — the rider got assigned to another job first", async () => {
    const p2002 = new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "5.22.0" });
    const { svc } = build(
      {
        order: {
          findFirst: async () => liveOrder,
          updateMany: async () => {
            throw p2002;
          },
        },
        foodDispatchAttempt: { findUnique: async () => pendingRow },
      },
      NONE,
    );
    await expect(svc.acceptDispatch(orderId, "r1")).rejects.toThrow(/another active job/i);
  });
});

describe("FoodDispatchService.declineDispatch — \"Not this one\"", () => {
  function world(stillDeciding: number) {
    const orderUpdate = vi.fn(async () => ({}));
    const orderUpdateMany = vi.fn(async () => ({ count: 1 }));
    const attemptUpdateMany = vi.fn(async () => ({ count: 1 }));
    const built = build(
      {
        order: { findFirst: async () => liveOrder, update: orderUpdate, updateMany: orderUpdateMany },
        foodDispatchAttempt: { findUnique: async () => pendingRow, updateMany: attemptUpdateMany, count: async () => stillDeciding, findMany: async () => [] },
      },
      NONE,
    );
    return { ...built, orderUpdate, orderUpdateMany, attemptUpdateMany };
  }

  it("marks the rider's row declined and never offers them this order again; the round stays live for the others", async () => {
    const { svc, gateway, orderUpdate, orderUpdateMany, attemptUpdateMany } = world(3);
    expect(await svc.declineDispatch(orderId, "r1")).toEqual({ orderId, declined: true });
    expect(attemptUpdateMany).toHaveBeenCalledWith({ where: { orderId, riderId: "r1", outcome: "pending" }, data: expect.objectContaining({ outcome: "declined" }) });
    expect(orderUpdate).toHaveBeenCalledWith({ where: { id: orderId }, data: { dispatchExcludedRiderIds: { push: "r1" } } });
    expect(orderUpdateMany).not.toHaveBeenCalled();
    expect(gateway.emitFoodOfferClosed).toHaveBeenCalledWith("r1", orderId);
  });

  it("closes the round at once when the last rider still deciding passes", async () => {
    const { svc, orderUpdateMany } = world(0);
    await svc.declineDispatch(orderId, "r1");
    expect(orderUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: orderId, status: "open_for_offers", dispatchOfferExpiresAt: roundEnd }, data: expect.objectContaining({ status: "requested" }) }),
    );
  });

  it("403s a rider this order was never offered to", async () => {
    const { svc } = build({ order: { findFirst: async () => liveOrder }, foodDispatchAttempt: { findUnique: async () => null } }, NONE);
    await expect(svc.declineDispatch(orderId, "r2")).rejects.toThrow(/isn't yours/i);
  });
});

describe("FoodDispatchService.dropDispatch — D-33 pre-pickup only", () => {
  it("re-dispatches in place: requested/ready_for_pickup, rider cleared, excluded, fresh budget, strike applied", async () => {
    const orderUpdateMany = vi.fn(async () => ({ count: 1 }));
    const riderUpdate = vi.fn(async () => ({}));
    const { svc, gateway } = build(
      {
        order: {
          findFirst: async () => ({ status: "assigned", dispatchExcludedRiderIds: [], merchantId: MERCHANT_ID }),
          updateMany: orderUpdateMany,
          findUnique: async () => ({ customerId: "cust-1" }),
        },
        orderEvent: { create: async () => ({}) },
        rider: {
          findUnique: async () => ({ cancelStrikes: 0, reliabilityScore: 100, onHold: false, heldReason: null, cooldownUntil: null }),
          update: riderUpdate,
        },
      },
      NONE,
    );
    const res = await svc.dropDispatch(orderId, "r1");
    expect(res).toEqual({ orderId, status: "requested" });
    expect(orderUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: "requested",
          merchantPhase: "ready_for_pickup",
          riderId: null,
          dispatchExcludedRiderIds: ["r1"],
          dispatchAttempt: 0,
        }),
      }),
    );
    expect(riderUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ cancelStrikes: 1 }) }));
    expect(gateway.evictRiderFromSupply).not.toHaveBeenCalled(); // strike 1 of 3 — no cooldown yet
    expect(gateway.emitFoodQueueChanged).toHaveBeenCalledWith(MERCHANT_ID, orderId); // C5: merchant sees the drop without waiting for the poll
  });

  it("forces the rider offline + cooldown on the CANCEL_STRIKE_LIMIT-th drop (mirrors order-lifecycle cancel)", async () => {
    const riderUpdate = vi.fn(async () => ({}));
    const { svc, gateway } = build(
      {
        order: {
          findFirst: async () => ({ status: "assigned", dispatchExcludedRiderIds: [] }),
          updateMany: async () => ({ count: 1 }),
          findUnique: async () => ({ customerId: "cust-1" }),
        },
        orderEvent: { create: async () => ({}) },
        rider: {
          findUnique: async () => ({ cancelStrikes: 2, reliabilityScore: 100, onHold: false, heldReason: null, cooldownUntil: null }),
          update: riderUpdate,
        },
      },
      NONE,
    );
    await svc.dropDispatch(orderId, "r1");
    expect(riderUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ cancelStrikes: 0, isOnline: false }) }));
    expect(gateway.evictRiderFromSupply).toHaveBeenCalledWith("r1");
  });

  it("rejects a drop after pickup (D-33 no drop after pickup)", async () => {
    const { svc } = build({ order: { findFirst: async () => ({ status: "picked_up" } as never) } }, NONE);
    await expect(svc.dropDispatch(orderId, "r1")).rejects.toThrow(/already with you/i);
  });

  // LM-02 (order-assignment audit, concurrency cell): the in-transaction CAS (status=order.status AND
  // riderId=caller) losing its race — e.g. the order was already dropped/reassigned between the
  // pre-transaction findFirst read and the transaction's own write — was never exercised by a test.
  // Pin that it surfaces as the documented "Order changed, retry" 409, not a silent no-op or a strike
  // applied against a drop that didn't actually happen.
  it("409s 'Order changed, retry' when the in-transaction CAS loses a race", async () => {
    const riderUpdate = vi.fn(async () => ({}));
    const { svc } = build(
      {
        order: {
          findFirst: async () => ({ status: "assigned", dispatchExcludedRiderIds: [], merchantId: MERCHANT_ID }),
          updateMany: async () => ({ count: 0 }),
        },
        rider: { findUnique: async () => ({ cancelStrikes: 0, reliabilityScore: 100, onHold: false, heldReason: null, cooldownUntil: null }), update: riderUpdate },
      },
      NONE,
    );
    await expect(svc.dropDispatch(orderId, "r1")).rejects.toThrow(/order changed, retry/i);
    expect(riderUpdate).not.toHaveBeenCalled();
  });
});

describe("FoodDispatchService.getOfferForRider — C5 rider offer alarm channel (poll/reconnect fallback)", () => {
  const liveRow = {
    expiresAt: new Date(Date.now() + 30_000),
    order: {
      id: orderId,
      merchantId: MERCHANT_ID,
      pickup: PICKUP,
      dropoff: DROPOFF,
      itemDesc: "2x Sadza & stew",
      merchantGoodsTotal: 12.5,
      deliveryFee: 2.5,
      distanceKm: 3.1,
    },
  };

  it("returns the rider's own live offer, redacted, soonest to run out first", async () => {
    const findFirst = vi.fn(async () => liveRow);
    const { svc } = build({ foodDispatchAttempt: { findFirst } }, NONE);
    const offer = await svc.getOfferForRider("r1");
    expect(offer).toEqual(
      expect.objectContaining({
        orderId,
        merchantId: MERCHANT_ID,
        pickup: { point: HARARE_CBD, landmark: "Mama's Kitchen" },
        dropoff: { point: DROPOFF.point, landmark: "Avondale Shops" },
        itemDesc: "2x Sadza & stew",
        merchantGoodsTotal: 12.5,
        deliveryFee: 2.5,
        distanceKm: 3.1,
        expiresAt: liveRow.expiresAt.toISOString(),
      }),
    );
    // Never contactPhone on the wire — same guarantee as the WS push (D-17/board redaction).
    expect((offer as { pickup: Record<string, unknown> }).pickup.contactPhone).toBeUndefined();
    expect((offer as { dropoff: Record<string, unknown> }).dropoff.contactPhone).toBeUndefined();
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ riderId: "r1", outcome: "pending", order: { orderType: "merchant", status: "open_for_offers" } }),
        orderBy: { expiresAt: "asc" },
      }),
    );
  });

  it("returns null when this rider holds no live offer", async () => {
    const { svc } = build({ foodDispatchAttempt: { findFirst: async () => null } }, NONE);
    await expect(svc.getOfferForRider("r1")).resolves.toBeNull();
  });
});

describe("FoodDispatchService — merchant D-34 hold-screen decisions", () => {
  it("resumeSearch clears the hold and resets the attempt budget", async () => {
    const updateMany = vi.fn(async () => ({ count: 1 }));
    const { svc } = build(
      { merchant: { findUnique: async () => ({ id: "m1" }) }, order: { updateMany } },
      NONE,
    );
    const res = await svc.resumeSearch("owner-1", orderId);
    expect(res).toEqual({ orderId, resumed: true });
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { noRiderHoldAt: null, dispatchAttempt: 0, dispatchStartedAt: null, dispatchNextCheckAt: null } }),
    );
  });

  it("resumeSearch 409s when the order isn't actually on hold", async () => {
    const { svc } = build(
      { merchant: { findUnique: async () => ({ id: "m1" }) }, order: { updateMany: async () => ({ count: 0 }) } },
      NONE,
    );
    await expect(svc.resumeSearch("owner-1", orderId)).rejects.toThrow(/waiting on a rider decision/i);
  });

  it("cancelFromHold: no-fault D-13 cancel, apology copy, rejectionReason=no_rider", async () => {
    const updateMany = vi.fn(async () => ({ count: 1 }));
    const { svc } = build(
      {
        merchant: { findUnique: async () => ({ id: "m1" }) },
        order: { updateMany, findUnique: async () => ({ customerId: "cust-1" }) },
        orderEvent: { create: async () => ({}) },
      },
      NONE,
    );
    const res = await svc.cancelFromHold("owner-1", orderId);
    expect(res).toEqual({ orderId, status: "cancelled" });
    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "cancelled", rejectionReason: "no_rider" }) }));
    expect(notified).toEqual([expect.objectContaining({ profileIds: ["cust-1"] })]);
  });
});

// ── Wave 1 (reviewed list 2026-10-07): C2 = MJ-RM1 + U32, C14 = MJ-RM2, C16 = MJ-RM18 ─────────────────

const MIN = 60_000;
/** An auto-accepted, kitchen-confirmed order still cooking, ready in `readyInMin` minutes. */
const cookingOrder = (readyInMin: number, over: Record<string, unknown> = {}) =>
  baseOrder({
    merchantPhase: "preparing",
    autoAccepted: true,
    kitchenConfirmedAt: new Date(Date.now() - 10 * MIN),
    prepStartedAt: new Date(Date.now() - (20 - readyInMin) * MIN),
    prepMinutes: 20,
    substitutionRounds: [],
    ...over,
  });

describe("earlyDispatchDue — MJ-RM1 / U32", () => {
  const now = Date.now();
  it("is due inside the 8-minute lead, not before; never unconfirmed, never mid-substitution, never a non-cooking phase", () => {
    expect(earlyDispatchDue(cookingOrder(7) as never, now)).toBe(true);
    expect(earlyDispatchDue(cookingOrder(9) as never, now)).toBe(false);
    expect(earlyDispatchDue(cookingOrder(2, { kitchenConfirmedAt: null }) as never, now)).toBe(false);
    expect(earlyDispatchDue(cookingOrder(2, { autoAccepted: false }) as never, now)).toBe(false);
    expect(earlyDispatchDue(cookingOrder(2, { substitutionRounds: [{ id: "s1" }] }) as never, now)).toBe(false);
    expect(earlyDispatchDue(cookingOrder(2, { merchantPhase: "awaiting_item_approval" }) as never, now)).toBe(false);
  });
});

describe("FoodDispatchService.sweepSearch — MJ-RM1 / U32: the early search leaves the kitchen's phase alone", () => {
  function world(order: Record<string, unknown>, strategy = pick(one("r1"))) {
    const orderUpdateMany = vi.fn(async (_args: { where: Record<string, unknown>; data: Record<string, unknown> }) => ({ count: 1 }));
    const findMany = vi.fn(async ({ where }: { where: { merchantPhase?: string } }) =>
      where.merchantPhase === "preparing" ? [{ id: orderId, ...order }] : [],
    );
    const built = build(
      {
        order: { findMany, findUnique: async () => order, updateMany: orderUpdateMany },
        merchant: { findUnique: async () => ({ location: { point: HARARE_CBD } }) },
        orderEvent: { create: async () => ({}) },
        foodDispatchAttempt: { upsert: vi.fn(async () => ({})), findMany: async () => [], updateMany: async () => ({ count: 0 }) },
      },
      strategy,
    );
    return { ...built, orderUpdateMany, findMany, strategy };
  }

  it("offers a cooking order inside the lead WITHOUT writing merchantPhase or readyAt, guarded on it still cooking", async () => {
    const { svc, orderUpdateMany, findMany } = world(cookingOrder(7));
    expect(await svc.sweepSearch()).toEqual({ offered: 1, held: 0 });
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ merchantPhase: "preparing", autoAccepted: true, kitchenConfirmedAt: { not: null }, substitutionRounds: { none: { status: "open" } } }),
      }),
    );
    const claim = orderUpdateMany.mock.calls[0]![0];
    expect(claim.where).toMatchObject({ status: "requested", merchantPhase: "preparing" });
    expect(claim.data).toMatchObject({ status: "open_for_offers", dispatchAttempt: 1 });
    expect(claim.data).not.toHaveProperty("merchantPhase");
    expect(claim.data).not.toHaveProperty("readyAt");
  });

  // Review of wave 1: a mid-prep substitution the kitchen opened between the tick's read and its claim
  // must keep the order at `requested` (the customer's free cancel needs it).
  it("a cooking order's claims require no open substitution round; a ready order's claims are unchanged", async () => {
    const cookingWorld = world(cookingOrder(7));
    await cookingWorld.svc.sweepSearch();
    expect(cookingWorld.orderUpdateMany.mock.calls[0]![0].where).toMatchObject({ substitutionRounds: { none: { status: "open" } } });

    const nobody = world(cookingOrder(7), pick([]));
    await nobody.svc.sweepSearch();
    expect(nobody.orderUpdateMany.mock.calls[0]![0].where).toMatchObject({ merchantPhase: "preparing", substitutionRounds: { none: { status: "open" } } });

    const orderUpdateMany = vi.fn(async (_args: { where: Record<string, unknown> }) => ({ count: 1 }));
    const { svc } = build(
      {
        order: { findMany: async () => [{ id: orderId }], findUnique: async () => baseOrder(), updateMany: orderUpdateMany },
        merchant: { findUnique: async () => ({ location: { point: HARARE_CBD } }) },
        orderEvent: { create: async () => ({}) },
        foodDispatchAttempt: { upsert: vi.fn(async () => ({})) },
      },
      pick(one("r1")),
    );
    await svc.sweepSearch();
    expect(orderUpdateMany.mock.calls[0]![0].where).not.toHaveProperty("substitutionRounds");
  });

  it("does not search for a cooking order outside the lead (ready in 15 min)", async () => {
    const { svc, strategy } = world(cookingOrder(15));
    expect(await svc.sweepSearch()).toEqual({ offered: 0, held: 0 });
    expect(strategy.pickCandidates).not.toHaveBeenCalled();
  });

  it("past the NO_RIDER cap while still cooking: parks until the ready time — no D-34 hold on food that isn't ready", async () => {
    const { svc, orderUpdateMany } = world(cookingOrder(3, { dispatchAttempt: 6 }), pick([]));
    expect(await svc.sweepSearch()).toEqual({ offered: 0, held: 0 });
    const park = orderUpdateMany.mock.calls[0]![0];
    expect(park.where).toMatchObject({ merchantPhase: "preparing", dispatchAttempt: 6, noRiderHoldAt: null });
    expect(park.data).not.toHaveProperty("noRiderHoldAt");
    expect((park.data.dispatchNextCheckAt as Date).getTime()).toBeGreaterThan(Date.now() + 2 * MIN);
  });
});

// Review of wave 1: the kitchen's K3 cancel can land between the tick's claim and its offer rows, when
// cancelPreparing's own clean-up finds nothing yet. Those rows must not stay pending, nor ring anyone.
describe("FoodDispatchService — a round cancelled while its offers were being written", () => {
  it("re-checks the round after writing its rows: gone → this round's rows expire, alarms close, no push, no offer", async () => {
    const attemptFindMany = vi.fn(async () => [{ riderId: "r1" }, { riderId: "r2" }]);
    const attemptUpdateMany = vi.fn(async () => ({ count: 2 }));
    const { svc, gateway } = build(
      {
        order: {
          findMany: async () => [{ id: orderId }],
          findUnique: async () => baseOrder(),
          updateMany: async () => ({ count: 1 }),
          count: async () => 0, // cancelled meanwhile
        },
        merchant: { findUnique: async () => ({ location: { point: HARARE_CBD } }) },
        orderEvent: { create: async () => ({}) },
        foodDispatchAttempt: { upsert: vi.fn(async () => ({})), findMany: attemptFindMany, updateMany: attemptUpdateMany },
      },
      pick([
        { riderId: "r1", distanceM: 100 },
        { riderId: "r2", distanceM: 200 },
      ]),
    );
    expect(await svc.sweepSearch()).toEqual({ offered: 0, held: 0 });
    expect(attemptUpdateMany).toHaveBeenCalledWith({
      where: { orderId, outcome: "pending", expiresAt: expect.any(Date) },
      data: expect.objectContaining({ outcome: "expired" }),
    });
    expect(gateway.emitFoodOfferClosed).toHaveBeenCalledWith("r1", orderId);
    expect(gateway.emitFoodOfferClosed).toHaveBeenCalledWith("r2", orderId);
    expect(gateway.emitFoodOffer).not.toHaveBeenCalled();
    expect(notified).toEqual([]);
  });

  it("sweepOrphanedOffers: expires stale pending offers on orders no longer offering — never the rider the order went to", async () => {
    const attemptFindMany = vi.fn(async () => [
      { id: "a1", orderId, riderId: "r1", order: { riderId: null } }, // cancelled order
      { id: "a2", orderId: "o2", riderId: "winner", order: { riderId: "winner" } }, // accept still marking its own row
    ]);
    const attemptUpdateMany = vi.fn(async () => ({ count: 1 }));
    const { svc, gateway } = build({ foodDispatchAttempt: { findMany: attemptFindMany, updateMany: attemptUpdateMany } }, NONE);
    const now = new Date();
    expect(await svc.sweepOrphanedOffers(now)).toEqual({ expired: 1 });
    expect(attemptFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { outcome: "pending", expiresAt: { lt: now }, order: { status: { not: "open_for_offers" } } } }),
    );
    expect(attemptUpdateMany).toHaveBeenCalledWith({ where: { id: { in: ["a1"] }, outcome: "pending" }, data: { outcome: "expired", respondedAt: now } });
    expect(gateway.emitFoodOfferClosed).toHaveBeenCalledTimes(1);
    expect(gateway.emitFoodOfferClosed).toHaveBeenCalledWith("r1", orderId);
  });
});

describe("FoodDispatchService.acceptDispatch — MJ-RM1: a rider found early leaves the cooking ticket alone", () => {
  it("keeps merchantPhase 'preparing' (guarded on it) when the order is still cooking", async () => {
    const orderUpdateMany = vi.fn(async (_args: { where: Record<string, unknown>; data: Record<string, unknown> }) => ({ count: 1 }));
    const { svc } = build(
      {
        order: { findFirst: async () => ({ ...liveOrder, merchantPhase: "preparing" }), updateMany: orderUpdateMany, findUnique: async () => ({ customerId: "cust-1" }) },
        foodDispatchAttempt: { findUnique: async () => pendingRow, findMany: async () => [], updateMany: async () => ({ count: 1 }) },
        orderEvent: { create: async () => ({}) },
      },
      NONE,
    );
    await svc.acceptDispatch(orderId, "r1");
    expect(orderUpdateMany).toHaveBeenCalledTimes(1);
    expect(orderUpdateMany.mock.calls[0]![0]).toMatchObject({
      where: { status: "open_for_offers", merchantPhase: "preparing" },
      data: { status: "assigned", riderId: "r1", merchantPhase: "preparing" },
    });
  });

  it("the kitchen tapped 'Food is ready' in between: secured as a ready order (phase cleared), not written back to cooking", async () => {
    const orderUpdateMany = vi.fn(async (args: { where: Record<string, unknown> }) => ({ count: args.where.merchantPhase === "ready_for_pickup" ? 1 : 0 }));
    const { svc } = build(
      {
        order: { findFirst: async () => ({ ...liveOrder, merchantPhase: "preparing" }), updateMany: orderUpdateMany, findUnique: async () => ({ customerId: "cust-1" }) },
        foodDispatchAttempt: { findUnique: async () => pendingRow, findMany: async () => [], updateMany: async () => ({ count: 1 }) },
        orderEvent: { create: async () => ({}) },
      },
      NONE,
    );
    expect(await svc.acceptDispatch(orderId, "r1")).toEqual({ orderId, status: "assigned" });
    expect(orderUpdateMany.mock.calls[1]![0]).toMatchObject({ where: { merchantPhase: "ready_for_pickup" }, data: { merchantPhase: null } });
  });
});

describe("FoodDispatchService.dropDispatch — MJ-RM2 (C14) + MJ-RM1", () => {
  function world(row: Record<string, unknown>) {
    const orderUpdateMany = vi.fn(async (_args: { where: Record<string, unknown>; data: Record<string, unknown> }) => ({ count: 1 }));
    const built = build(
      {
        order: { findFirst: async () => row, updateMany: orderUpdateMany, findUnique: async () => ({ customerId: "cust-1" }) },
        orderEvent: { create: async () => ({}) },
        rider: { findUnique: async () => ({ cancelStrikes: 0, reliabilityScore: 100, onHold: false, heldReason: null, cooldownUntil: null }), update: async () => ({}) },
      },
      NONE,
    );
    return { ...built, orderUpdateMany };
  }

  it("MJ-RM2: clears the dropped rider's counter state — arrival, ETA, pickup photo and seal — in the same guarded write", async () => {
    const { svc, orderUpdateMany } = world({ status: "en_route_pickup", merchantPhase: null, dispatchExcludedRiderIds: [], merchantId: MERCHANT_ID });
    await svc.dropDispatch(orderId, "r1");
    expect(orderUpdateMany.mock.calls[0]![0]).toMatchObject({
      where: { id: orderId, status: "en_route_pickup", riderId: "r1", merchantPhase: null },
      data: { merchantPhase: "ready_for_pickup", riderArrivedAt: null, riderEtaAt: null, pickupPhotoKey: null, pickupPhotoAt: null, pickupBagSealed: null },
    });
  });

  it("MJ-RM1: a rider found early drops while the kitchen is still cooking — it stays 'preparing', not 'ready'", async () => {
    const { svc, orderUpdateMany } = world({ status: "assigned", merchantPhase: "preparing", dispatchExcludedRiderIds: [], merchantId: MERCHANT_ID });
    await svc.dropDispatch(orderId, "r1");
    expect(orderUpdateMany.mock.calls[0]![0]).toMatchObject({ where: { merchantPhase: "preparing" }, data: { status: "requested", merchantPhase: "preparing" } });
  });
});

describe("FoodDispatchService — MJ-RM18 (C16): never the business's own team", () => {
  it("leaves every merchantMember of the order's business out of the round", async () => {
    const strategy = pick(one("outsider"));
    const memberFindMany = vi.fn(async () => [{ profileId: "cashier" }, { profileId: "owner" }]);
    const { svc } = build(
      {
        order: { findMany: async () => [{ id: orderId }], findUnique: async () => baseOrder({ dispatchExcludedRiderIds: ["passed"] }), updateMany: async () => ({ count: 1 }) },
        merchant: { findUnique: async () => ({ location: { point: HARARE_CBD } }) },
        merchantMember: { findMany: memberFindMany, findFirst: async () => null },
        merchantPreferredRider: { findMany: async () => [] },
        orderEvent: { create: async () => ({}) },
        foodDispatchAttempt: { upsert: vi.fn(async () => ({})) },
      },
      strategy,
    );
    await svc.sweepSearch();
    expect(memberFindMany).toHaveBeenCalledWith({ where: { merchantId: MERCHANT_ID }, select: { profileId: true } });
    expect(strategy.pickCandidates).toHaveBeenCalledWith(expect.objectContaining({ excludeRiderIds: ["passed", "cashier", "owner"] }));
  });

  it("acceptDispatch backstop: a team member holding an offer is refused 409 own_member and nothing is written", async () => {
    const orderUpdateMany = vi.fn(async () => ({ count: 1 }));
    const { svc } = build(
      {
        order: { findFirst: async () => liveOrder, updateMany: orderUpdateMany },
        foodDispatchAttempt: { findUnique: async () => pendingRow },
        merchantMember: {
          findFirst: async (args: { where: { merchantId: string; profileId: string } }) =>
            args.where.profileId === "cashier" && args.where.merchantId === MERCHANT_ID ? { id: "mm1" } : null,
        },
      },
      NONE,
    );
    await expect(svc.acceptDispatch(orderId, "cashier")).rejects.toMatchObject({ status: 409, response: { reason: "own_member" } });
    expect(orderUpdateMany).not.toHaveBeenCalled();
  });
});
