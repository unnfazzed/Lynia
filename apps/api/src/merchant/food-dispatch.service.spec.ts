import { describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import type { Env } from "../config/env";
import { TokenService } from "../auth/token.service";
import type { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";
import type { TrackingGateway } from "../tracking/tracking.gateway";
import type { DispatchStrategy } from "./dispatch-strategy";
import { FoodDispatchService } from "./food-dispatch.service";

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
  } as unknown as TrackingGateway & {
    emitOrderStatus: ReturnType<typeof vi.fn>;
    evictRiderFromSupply: ReturnType<typeof vi.fn>;
    emitFoodOffer: ReturnType<typeof vi.fn>;
    emitFoodOfferClosed: ReturnType<typeof vi.fn>;
  };
}

/** Fake Prisma where `$transaction(cb)` runs the callback against the same fake (tx === prisma),
 *  mirroring food-order.service.spec.ts's `build()`. */
function build(methods: Record<string, unknown>, strategy: DispatchStrategy, gateway = fakeGateway()) {
  notified.length = 0;
  const prisma = { ...methods } as Record<string, unknown>;
  prisma.$transaction = async (cb: (tx: unknown) => unknown) => cb(prisma);
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

describe("FoodDispatchService.sweepSearch — N-08 auto-offer", () => {
  it("offers the nearest candidate on the first attempt and logs a FoodDispatchAttempt row", async () => {
    const attemptCreate = vi.fn(async () => ({}));
    const orderUpdateMany = vi.fn(async () => ({ count: 1 }));
    const strategy: DispatchStrategy = { pickCandidate: vi.fn(async () => ({ riderId: "r1", distanceM: 800 })) };
    const { svc, gateway } = build(
      {
        order: {
          findMany: async () => [{ id: orderId }],
          findUnique: async () => baseOrder(),
          updateMany: orderUpdateMany,
        },
        merchant: { findUnique: async () => ({ location: { point: HARARE_CBD } }) },
        orderEvent: { create: async () => ({}) },
        foodDispatchAttempt: { create: attemptCreate },
      },
      strategy,
    );

    const result = await svc.sweepSearch();
    expect(result).toEqual({ offered: 1, held: 0 });
    expect(orderUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ id: orderId, status: "requested", dispatchAttempt: 0, noRiderHoldAt: null }),
        data: expect.objectContaining({ status: "open_for_offers", dispatchOfferedRiderId: "r1", dispatchAttempt: 1 }),
      }),
    );
    expect(attemptCreate).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ orderId, riderId: "r1", attemptNumber: 1, radiusM: 1500 }) }),
    );
    expect(notified).toEqual([expect.objectContaining({ profileIds: ["r1"] })]);
    expect(gateway.emitOrderStatus).not.toHaveBeenCalled(); // no realtime push on an offer, only on rider-secured
    // C5 rider offer alarm channel: the WS twin of the push above, redacted like the parcel board
    // (point + landmark only — contactPhone must never cross the wire to an un-accepted rider).
    expect(gateway.emitFoodOffer).toHaveBeenCalledWith(
      "r1",
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

  it("parks for the next poll (dispatch_search self-loop) when no candidate is found, without touching the cap", async () => {
    const orderUpdateMany = vi.fn(async () => ({ count: 1 }));
    const strategy: DispatchStrategy = { pickCandidate: async () => null };
    const { svc } = build(
      {
        order: { findMany: async () => [{ id: orderId }], findUnique: async () => baseOrder(), updateMany: orderUpdateMany },
        merchant: { findUnique: async () => ({ location: { point: HARARE_CBD } }) },
      },
      strategy,
    );

    const result = await svc.sweepSearch();
    expect(result).toEqual({ offered: 0, held: 0 });
    expect(orderUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ dispatchAttempt: 1, dispatchNextCheckAt: expect.any(Date) }) }),
    );
  });

  it("widens the radius per attempt (dispatchRadiusForAttempt)", async () => {
    const attemptCreate = vi.fn(async () => ({}));
    const strategy: DispatchStrategy = { pickCandidate: vi.fn(async () => ({ riderId: "r1", distanceM: 2000 })) };
    const { svc } = build(
      {
        order: {
          findMany: async () => [{ id: orderId }],
          findUnique: async () => baseOrder({ dispatchAttempt: 2 }), // about to make attempt 3
          updateMany: async () => ({ count: 1 }),
        },
        merchant: { findUnique: async () => ({ location: { point: HARARE_CBD } }) },
        orderEvent: { create: async () => ({}) },
        foodDispatchAttempt: { create: attemptCreate },
      },
      strategy,
    );
    await svc.sweepSearch();
    expect(strategy.pickCandidate).toHaveBeenCalledWith(expect.objectContaining({ radiusM: 3500 }));
    expect(attemptCreate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ attemptNumber: 3, radiusM: 3500 }) }));
  });

  it("N-07: enters the D-34 merchant hold once the NO_RIDER cap (6 attempts) is exhausted", async () => {
    const orderUpdateMany = vi.fn(async () => ({ count: 1 }));
    const strategy: DispatchStrategy = { pickCandidate: vi.fn(async () => null) };
    const { svc } = build(
      { order: { findMany: async () => [{ id: orderId }], findUnique: async () => baseOrder({ dispatchAttempt: 6 }), updateMany: orderUpdateMany } },
      strategy,
    );
    const result = await svc.sweepSearch();
    expect(result).toEqual({ offered: 0, held: 1 });
    expect(strategy.pickCandidate).not.toHaveBeenCalled();
    expect(orderUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ noRiderHoldAt: expect.any(Date), dispatchNextCheckAt: null }) }),
    );
  });

  it("skips an order that raced to hold/assigned since the sweep's own read (defensive re-check)", async () => {
    const strategy: DispatchStrategy = { pickCandidate: vi.fn() };
    const { svc } = build(
      { order: { findMany: async () => [{ id: orderId }], findUnique: async () => baseOrder({ noRiderHoldAt: new Date() }) } },
      strategy,
    );
    const result = await svc.sweepSearch();
    expect(result).toEqual({ offered: 0, held: 0 });
    expect(strategy.pickCandidate).not.toHaveBeenCalled();
  });
});

describe("FoodDispatchService.sweepExpiredOffers — N-08 60s window", () => {
  it("releases a stale offer back to requested, excludes the rider, marks the attempt expired", async () => {
    const orderUpdateMany = vi.fn(async () => ({ count: 1 }));
    const attemptUpdateMany = vi.fn(async () => ({ count: 1 }));
    const { svc, gateway } = build(
      {
        order: {
          findMany: async () => [{ id: orderId, dispatchOfferedRiderId: "r1" }],
          findUnique: async () => ({ dispatchExcludedRiderIds: [] }),
          updateMany: orderUpdateMany,
        },
        foodDispatchAttempt: { updateMany: attemptUpdateMany },
      },
      { pickCandidate: async () => null },
    );
    const result = await svc.sweepExpiredOffers();
    expect(result).toEqual({ expired: 1 });
    // C5: the ONLY signal an expired offer's rider gets besides their next poll — the sweep-driven
    // path (unlike a self-triggered decline), so this is the case this channel exists for.
    expect(gateway.emitFoodOfferClosed).toHaveBeenCalledWith("r1", orderId);
    expect(orderUpdateMany).toHaveBeenCalledWith({
      where: { id: orderId, status: "open_for_offers", dispatchOfferedRiderId: "r1" },
      data: expect.objectContaining({
        status: "requested",
        dispatchOfferedRiderId: null,
        dispatchExcludedRiderIds: ["r1"],
        dispatchNextCheckAt: expect.any(Date),
      }),
    });
    expect(attemptUpdateMany).toHaveBeenCalledWith({
      where: { orderId, riderId: "r1", outcome: "pending" },
      data: expect.objectContaining({ outcome: "expired" }),
    });
  });

  it("never re-adds a rider already in the excluded list (idempotent)", async () => {
    const orderUpdateMany = vi.fn(async () => ({ count: 1 }));
    const { svc } = build(
      {
        order: {
          findMany: async () => [{ id: orderId, dispatchOfferedRiderId: "r1" }],
          findUnique: async () => ({ dispatchExcludedRiderIds: ["r1"] }),
          updateMany: orderUpdateMany,
        },
        foodDispatchAttempt: { updateMany: async () => ({ count: 1 }) },
      },
      { pickCandidate: async () => null },
    );
    await svc.sweepExpiredOffers();
    expect(orderUpdateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ dispatchExcludedRiderIds: ["r1"] }) }));
  });
});

describe("FoodDispatchService.acceptDispatch — D-04 rider secured", () => {
  const liveOffer = { status: "open_for_offers", dispatchOfferedRiderId: "r1", dispatchOfferExpiresAt: new Date(Date.now() + 30_000) };

  it("assigns the candidate, mints a delivery code, clears merchantPhase + dispatch fields, pushes rider-secured", async () => {
    const orderUpdateMany = vi.fn(async () => ({ count: 1 }));
    const { svc, gateway } = build(
      {
        order: {
          findFirst: async () => liveOffer,
          updateMany: orderUpdateMany,
          findUnique: async () => ({ customerId: "cust-1" }),
        },
        foodDispatchAttempt: { updateMany: async () => ({ count: 1 }) },
        orderEvent: { create: async () => ({}) },
      },
      { pickCandidate: async () => null },
    );
    const res = await svc.acceptDispatch(orderId, "r1");
    expect(res).toEqual({ orderId, status: "assigned" });
    expect(orderUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: orderId, status: "open_for_offers", dispatchOfferedRiderId: "r1" },
        data: expect.objectContaining({ status: "assigned", riderId: "r1", merchantPhase: null, dispatchOfferedRiderId: null }),
      }),
    );
    expect(gateway.emitOrderStatus).toHaveBeenCalledWith(orderId, "assigned");
    expect(notified.map((n) => n.profileIds)).toEqual([["r1"], ["cust-1"]]);
  });

  it("403s a caller who isn't the candidate rider", async () => {
    const { svc } = build({ order: { findFirst: async () => liveOffer } }, { pickCandidate: async () => null });
    await expect(svc.acceptDispatch(orderId, "someone-else")).rejects.toThrow(/isn't yours/i);
  });

  it("409s when the offer already expired", async () => {
    const { svc } = build(
      { order: { findFirst: async () => ({ ...liveOffer, dispatchOfferExpiresAt: new Date(Date.now() - 1000) }) } },
      { pickCandidate: async () => null },
    );
    await expect(svc.acceptDispatch(orderId, "r1")).rejects.toThrow(/just expired/i);
  });

  it("409s (not 500) on the one_active_ride race — the rider got assigned to another job first", async () => {
    const p2002 = new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "5.22.0" });
    const { svc } = build(
      { order: { findFirst: async () => liveOffer, updateMany: async () => { throw p2002; } } },
      { pickCandidate: async () => null },
    );
    await expect(svc.acceptDispatch(orderId, "r1")).rejects.toThrow(/another active job/i);
  });
});

describe("FoodDispatchService.declineDispatch", () => {
  it("frees the offer immediately (the rider's own \"can't take it\")", async () => {
    const orderUpdateMany = vi.fn(async () => ({ count: 1 }));
    const { svc, gateway } = build(
      {
        order: {
          findFirst: async () => ({ status: "open_for_offers", dispatchOfferedRiderId: "r1" }),
          findUnique: async () => ({ dispatchExcludedRiderIds: [] }),
          updateMany: orderUpdateMany,
        },
        foodDispatchAttempt: { updateMany: async () => ({ count: 1 }) },
      },
      { pickCandidate: async () => null },
    );
    const res = await svc.declineDispatch(orderId, "r1");
    expect(res).toEqual({ orderId, declined: true });
    expect(orderUpdateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "requested" }) }));
    expect(gateway.emitFoodOfferClosed).toHaveBeenCalledWith("r1", orderId);
  });

  it("403s a caller who doesn't hold the offer", async () => {
    const { svc } = build(
      { order: { findFirst: async () => ({ status: "open_for_offers", dispatchOfferedRiderId: "r1" }) } },
      { pickCandidate: async () => null },
    );
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
          findFirst: async () => ({ status: "assigned", dispatchExcludedRiderIds: [] }),
          updateMany: orderUpdateMany,
          findUnique: async () => ({ customerId: "cust-1" }),
        },
        orderEvent: { create: async () => ({}) },
        rider: {
          findUnique: async () => ({ cancelStrikes: 0, reliabilityScore: 100, onHold: false, heldReason: null, cooldownUntil: null }),
          update: riderUpdate,
        },
      },
      { pickCandidate: async () => null },
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
      { pickCandidate: async () => null },
    );
    await svc.dropDispatch(orderId, "r1");
    expect(riderUpdate).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ cancelStrikes: 0, isOnline: false }) }));
    expect(gateway.evictRiderFromSupply).toHaveBeenCalledWith("r1");
  });

  it("rejects a drop after pickup (D-33 no drop after pickup)", async () => {
    const { svc } = build({ order: { findFirst: async () => ({ status: "picked_up" } as never) } }, { pickCandidate: async () => null });
    await expect(svc.dropDispatch(orderId, "r1")).rejects.toThrow(/already with you/i);
  });
});

describe("FoodDispatchService.getOfferForRider — C5 rider offer alarm channel (poll/reconnect fallback)", () => {
  const liveOfferRow = {
    id: orderId,
    merchantId: MERCHANT_ID,
    pickup: PICKUP,
    dropoff: DROPOFF,
    itemDesc: "2x Sadza & stew",
    merchantGoodsTotal: 12.5,
    deliveryFee: 2.5,
    distanceKm: 3.1,
    dispatchOfferExpiresAt: new Date(Date.now() + 30_000),
  };

  it("returns the redacted live offer for the rider holding it", async () => {
    const findFirst = vi.fn(async () => liveOfferRow);
    const { svc } = build({ order: { findFirst } }, { pickCandidate: async () => null });
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
      }),
    );
    // Never contactPhone on the wire — same guarantee as the WS push (D-17/board redaction).
    expect((offer as { pickup: Record<string, unknown> }).pickup.contactPhone).toBeUndefined();
    expect((offer as { dropoff: Record<string, unknown> }).dropoff.contactPhone).toBeUndefined();
    expect(findFirst).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ orderType: "merchant", status: "open_for_offers", dispatchOfferedRiderId: "r1" }),
      }),
    );
  });

  it("returns null when this rider holds no live offer", async () => {
    const { svc } = build({ order: { findFirst: async () => null } }, { pickCandidate: async () => null });
    await expect(svc.getOfferForRider("r1")).resolves.toBeNull();
  });
});

describe("FoodDispatchService — merchant D-34 hold-screen decisions", () => {
  it("resumeSearch clears the hold and resets the attempt budget", async () => {
    const updateMany = vi.fn(async () => ({ count: 1 }));
    const { svc } = build(
      { merchant: { findUnique: async () => ({ id: "m1" }) }, order: { updateMany } },
      { pickCandidate: async () => null },
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
      { pickCandidate: async () => null },
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
      { pickCandidate: async () => null },
    );
    const res = await svc.cancelFromHold("owner-1", orderId);
    expect(res).toEqual({ orderId, status: "cancelled" });
    expect(updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "cancelled", rejectionReason: "no_rider" }) }));
    expect(notified).toEqual([expect.objectContaining({ profileIds: ["cust-1"] })]);
  });
});
