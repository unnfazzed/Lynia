import { ForbiddenException } from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import type { TokenService } from "../auth/token.service";
import type { NotificationsService } from "../notifications/notifications.service";
import type { MetricsService, MatchSelectOutcome } from "../observability/metrics.service";
import { PrismaService } from "../prisma/prisma.service";
import type { TrackingGateway } from "../tracking/tracking.gateway";
import type { TrackingService } from "../tracking/tracking.service";
import { MatchingService } from "./matching.service";

/** bid:expired / order:taken are best-effort; a no-op gateway keeps selectOffer's unit tests off the
 *  socket path. `order:taken` (rider-journey 2·b1 / 3·b1) fires on a successful assign. */
const noopGateway = { emitBidExpired: () => {}, emitOrderTaken: () => {}, emitOrderStatus: () => {} } as unknown as TrackingGateway;

/**
 * selectOffer wraps its transaction in a metrics timer. The wrapper MUST classify the failure for the
 * metric and then RE-THROW the original domain exception — a swallowed error would break the
 * "rider just taken" rollback UX. These tests assert both: the metric is recorded with the mapped
 * outcome, and the exception still propagates.
 */

const noopNotifications = { notifyOrderStatus: async () => {}, notifyOrderExpired: async () => {} } as unknown as NotificationsService;
const noopTokens = { randomOtp: () => "000000", hash: (s: string) => s } as unknown as TokenService;
// No-supply check on a no-bid expiry; unit tests never reach it, so an empty nearby list is fine.
const noopTracking = { nearbyRiders: async () => [] } as unknown as TrackingService;

function fakeMetrics() {
  return { startTimer: () => () => 7, recordMatchSelect: vi.fn() } as unknown as MetricsService & {
    recordMatchSelect: ReturnType<typeof vi.fn>;
  };
}

/** A Prisma fake whose $transaction runs the passed callback against a per-test `tx` object. */
function svc(tx: Record<string, unknown>, gateway: TrackingGateway = noopGateway) {
  const metrics = fakeMetrics();
  const prisma = {
    $transaction: async (fn: (t: unknown) => Promise<unknown>) => fn(tx),
  } as unknown as PrismaService;
  return { service: new MatchingService(prisma, noopTokens, noopNotifications, metrics, gateway, noopTracking), metrics };
}

const orderId = "11111111-1111-1111-1111-111111111111";
const offerId = "22222222-2222-2222-2222-222222222222";

describe("MatchingService.selectOffer — metric wrapper re-throws domain errors", () => {
  it("re-throws NotFound when the offer is missing (outcome=error) — not swallowed", async () => {
    const { service, metrics } = svc({ offer: { findFirst: async () => null } });
    await expect(service.selectOffer(orderId, offerId, "cust")).rejects.toThrow(/offer not found/i);
    expect(metrics.recordMatchSelect).toHaveBeenCalledWith(7, "error" satisfies MatchSelectOutcome);
  });

  it("re-throws Forbidden when the caller is not the order's customer (outcome=forbidden)", async () => {
    const { service, metrics } = svc({
      offer: {
        findFirst: async () => ({
          status: "pending",
          riderId: "r1",
          offeredFare: { toString: () => "2.50" },
          order: { status: "open_for_offers", customerId: "someone-else" },
          rider: { isOnline: true, lastHeartbeatAt: new Date(), kycStatus: "verified", accountStatus: "active", onHold: false, cooldownUntil: null },
        }),
      },
    });
    await expect(service.selectOffer(orderId, offerId, "cust")).rejects.toBeInstanceOf(ForbiddenException);
    expect(metrics.recordMatchSelect).toHaveBeenCalledWith(7, "forbidden" satisfies MatchSelectOutcome);
  });

  it("re-throws Conflict when the order is no longer open (outcome=not_open)", async () => {
    const { service, metrics } = svc({
      offer: {
        findFirst: async () => ({
          status: "pending",
          riderId: "r1",
          offeredFare: { toString: () => "2.50" },
          order: { status: "assigned", customerId: "cust" },
          rider: { isOnline: true, lastHeartbeatAt: new Date(), kycStatus: "verified", accountStatus: "active", onHold: false, cooldownUntil: null },
        }),
      },
      block: { findFirst: async () => null },
    });
    await expect(service.selectOffer(orderId, offerId, "cust")).rejects.toThrow(/no longer open/i);
    expect(metrics.recordMatchSelect).toHaveBeenCalledWith(7, "not_open" satisfies MatchSelectOutcome);
  });

  it("re-throws Conflict when the offer is no longer available (outcome=unavailable)", async () => {
    const { service, metrics } = svc({
      offer: {
        findFirst: async () => ({
          status: "declined",
          riderId: "r1",
          offeredFare: { toString: () => "2.50" },
          order: { status: "open_for_offers", customerId: "cust" },
          rider: { isOnline: true, lastHeartbeatAt: new Date(), kycStatus: "verified", accountStatus: "active", onHold: false, cooldownUntil: null },
        }),
      },
      block: { findFirst: async () => null },
    });
    await expect(service.selectOffer(orderId, offerId, "cust")).rejects.toThrow(/no longer available/i);
    expect(metrics.recordMatchSelect).toHaveBeenCalledWith(7, "unavailable" satisfies MatchSelectOutcome);
  });

  it("records outcome=assigned on the happy path and returns the delivery code", async () => {
    const { service, metrics } = svc({
      offer: {
        findFirst: async () => ({
          status: "pending",
          riderId: "r1",
          offeredFare: { toString: () => "2.50" },
          order: { status: "open_for_offers", customerId: "cust" },
          rider: { isOnline: true, lastHeartbeatAt: new Date(), kycStatus: "verified", accountStatus: "active", onHold: false, cooldownUntil: null },
        }),
        update: async () => ({}),
        updateMany: async () => ({ count: 0 }),
      },
      order: { updateMany: async () => ({ count: 1 }) },
      orderEvent: { create: async () => ({}) },
      block: { findFirst: async () => null },
    });
    const res = await service.selectOffer(orderId, offerId, "cust");
    expect(res).toMatchObject({ orderId, riderId: "r1", status: "assigned", deliveryCode: "000000" });
    expect(metrics.recordMatchSelect).toHaveBeenCalledWith(7, "assigned" satisfies MatchSelectOutcome);
  });

  it("fires order:taken to the board on a successful assign, scoped to the pickup cell (2·b1 / 3·b1)", async () => {
    const emitOrderTaken = vi.fn();
    const gateway = { emitBidExpired: () => {}, emitOrderTaken } as unknown as TrackingGateway;
    const { service } = svc(
      {
        offer: {
          findFirst: async () => ({
            status: "pending",
            riderId: "r1",
            offeredFare: { toString: () => "2.50" },
            order: { status: "open_for_offers", customerId: "cust", pickup: { point: { lat: -17.8, lng: 31.05 } } },
            rider: { isOnline: true, lastHeartbeatAt: new Date(), kycStatus: "verified", accountStatus: "active", onHold: false, cooldownUntil: null },
          }),
          update: async () => ({}),
          updateMany: async () => ({ count: 0 }),
        },
        order: { updateMany: async () => ({ count: 1 }) },
        orderEvent: { create: async () => ({}) },
        block: { findFirst: async () => null },
      },
      gateway,
    );
    await service.selectOffer(orderId, offerId, "cust");
    // Same pickup-cell distribution as bid:expired so every rider who saw the card sees it close.
    expect(emitOrderTaken).toHaveBeenCalledWith(orderId, -17.8, 31.05);
  });
});

describe("MatchingService.expireOrder — persists the no-supply verdict for later reads", () => {
  const pickupPt = { point: { lat: -17.8, lng: 31.05 } };

  /** expireOrder runs a tx (order.updateMany CAS → offer.count → offer.updateMany → event) then a
   *  post-commit block on `this.prisma` (findUnique pickup → nearbyRiders → order.update). This fake
   *  wires both surfaces so the persistence branch is reachable. */
  function expireSvc(opts: { offerCount: number; nearby: unknown[] }) {
    const orderUpdate = vi.fn(async () => ({}));
    const tx = {
      order: { updateMany: async () => ({ count: 1 }) },
      offer: { count: async () => opts.offerCount, updateMany: async () => ({ count: 0 }) },
      orderEvent: { create: async () => ({}) },
    };
    const prisma = {
      $transaction: async (fn: (t: unknown) => Promise<unknown>) => fn(tx),
      order: { findUnique: async () => ({ pickup: pickupPt, createdAt: new Date() }), update: orderUpdate },
    } as unknown as PrismaService;
    const tracking = { nearbyRiders: async () => opts.nearby } as unknown as TrackingService;
    const notifyOrderExpired = vi.fn(async () => {});
    const notifications = { notifyOrderExpired } as unknown as NotificationsService;
    const service = new MatchingService(prisma, noopTokens, notifications, fakeMetrics(), noopGateway, tracking);
    return { service, orderUpdate, notifyOrderExpired };
  }

  it("stamps expiryNoSupply=true when the window closed with zero bids AND nobody online nearby", async () => {
    const { service, orderUpdate, notifyOrderExpired } = expireSvc({ offerCount: 0, nearby: [] });
    await service.expireOrder(orderId);
    expect(orderUpdate).toHaveBeenCalledWith({ where: { id: orderId }, data: { expiryNoSupply: true } });
    // The push still carries the same verdict transiently: noSupply=true, hadOffers=false (zero bids).
    expect(notifyOrderExpired).toHaveBeenCalledWith(orderId, true, false);
  });

  it("does NOT persist the flag when the auction had bids (price problem, not a supply problem)", async () => {
    const { service, orderUpdate, notifyOrderExpired } = expireSvc({ offerCount: 2, nearby: [] });
    await service.expireOrder(orderId);
    expect(orderUpdate).not.toHaveBeenCalled();
    // Bids existed → noSupply=false, hadOffers=true → the honest "riders offered" copy, not "raise price".
    expect(notifyOrderExpired).toHaveBeenCalledWith(orderId, false, true);
  });
});

describe("MatchingService.expandBroadcast — widening ticks push only the new ring", () => {
  // A version/variant-valid UUID — the board event's `.strict()` contract parses the id as a uuid.
  const expandOrderId = "33333333-3333-4333-8333-333333333333";
  const openOrder = {
    status: "open_for_offers",
    pickup: { point: { lat: -17.8, lng: 31.05 }, landmark: "Eastgate" },
    dropoff: { point: { lat: -17.82, lng: 31.06 }, landmark: "Avenues" },
    itemDesc: "Documents",
    suggestedFare: { toString: () => "2.40" },
    proposedFare: { toString: () => "2.50" },
    distanceKm: 1.5,
    createdAt: new Date("2026-06-26T00:00:00Z"),
  };

  function expandSvc(opts: {
    order?: unknown;
    nearby?: unknown[];
    claim?: string[] | null;
  }) {
    const prisma = { order: { findUnique: async () => opts.order ?? openOrder } } as unknown as PrismaService;
    const nearbyRiders = vi.fn(async () => opts.nearby ?? []);
    const claimBroadcastRecipients = vi.fn(async () => opts.claim ?? null);
    const tracking = { nearbyRiders, claimBroadcastRecipients } as unknown as TrackingService;
    const notifyNewBroadcast = vi.fn(async () => {});
    const notifications = { notifyNewBroadcast } as unknown as NotificationsService;
    const emitBoardNewOrderToCells = vi.fn();
    const gateway = { emitBoardNewOrderToCells } as unknown as TrackingGateway;
    const service = new MatchingService(prisma, noopTokens, notifications, fakeMetrics(), gateway, tracking);
    return { service, nearbyRiders, claimBroadcastRecipients, notifyNewBroadcast, emitBoardNewOrderToCells };
  }

  it("queries the step's wider radius, re-emits the board card to the widened cells, pushes the claimed ids", async () => {
    const nearby = [
      { profileId: "r-near", distanceM: 3_000 },
      { profileId: "r-ring", distanceM: 7_000 },
    ];
    const { service, nearbyRiders, claimBroadcastRecipients, notifyNewBroadcast, emitBoardNewOrderToCells } = expandSvc({
      nearby,
      claim: ["r-ring"], // the sent set says r-near was pushed at create time
    });

    await service.expandBroadcast(expandOrderId, 0); // step 0 → 8 km

    // Fix 4: the widening FCM rebroadcast passes the permissive push heartbeat cutoff as the 4th arg.
    expect(nearbyRiders).toHaveBeenCalledWith(-17.8, 31.05, 8_000, expect.any(Number));
    expect(emitBoardNewOrderToCells).toHaveBeenCalledWith(expect.objectContaining({ id: expandOrderId }), -17.8, 31.05, 8_000);
    expect(claimBroadcastRecipients).toHaveBeenCalledWith(expandOrderId, ["r-near", "r-ring"]);
    expect(notifyNewBroadcast).toHaveBeenCalledWith(expandOrderId, ["r-ring"], { pickup: "Eastgate", fare: "2.50" });
  });

  it("falls back to ring geometry (distance > previous radius) when the claim set is unavailable", async () => {
    const nearby = [
      { profileId: "r-inner", distanceM: 4_000 }, // inside the 5 km create disc — already pushed
      { profileId: "r-outer", distanceM: 6_500 },
    ];
    const { service, notifyNewBroadcast } = expandSvc({ nearby, claim: null });

    await service.expandBroadcast(expandOrderId, 0);

    expect(notifyNewBroadcast).toHaveBeenCalledWith(expandOrderId, ["r-outer"], expect.anything());
  });

  it("no-ops once the order has left open_for_offers (accepted/cancelled mid-window)", async () => {
    const { service, nearbyRiders, notifyNewBroadcast } = expandSvc({
      order: { ...openOrder, status: "assigned" },
      nearby: [{ profileId: "r-1", distanceM: 7_000 }],
    });

    await service.expandBroadcast(expandOrderId, 0);

    expect(nearbyRiders).not.toHaveBeenCalled();
    expect(notifyNewBroadcast).not.toHaveBeenCalled();
  });

  it("skips the push when the new ring claimed nobody (everyone already covered)", async () => {
    const { service, notifyNewBroadcast } = expandSvc({
      nearby: [{ profileId: "r-1", distanceM: 3_000 }],
      claim: [],
    });

    await service.expandBroadcast(expandOrderId, 0);

    expect(notifyNewBroadcast).not.toHaveBeenCalled();
  });

  it("never throws — a DB failure inside a tick is logged and swallowed (best-effort)", async () => {
    const prisma = { order: { findUnique: async () => { throw new Error("db down"); } } } as unknown as PrismaService;
    const service = new MatchingService(prisma, noopTokens, noopNotifications, fakeMetrics(), noopGateway, noopTracking);
    await expect(service.expandBroadcast(expandOrderId, 0)).resolves.toBeUndefined();
  });

  it("ignores an out-of-range step index (defensive against a stale queued job)", async () => {
    const { service, nearbyRiders } = expandSvc({ nearby: [] });
    await service.expandBroadcast(expandOrderId, 99);
    expect(nearbyRiders).not.toHaveBeenCalled();
  });
});

describe("MatchingService.selectOffer — block enforcement (a blocked pair never re-matches)", () => {
  it("rejects selecting an offer from a blocked rider and never assigns the order", async () => {
    const orderUpdateMany = vi.fn(async () => ({ count: 1 }));
    // A block row exists between this customer and rider — the symmetric predicate matches either
    // direction, so the offer can't be selected.
    const { service, metrics } = svc({
      offer: {
        findFirst: async () => ({
          status: "pending",
          riderId: "r1",
          offeredFare: { toString: () => "2.50" },
          order: { status: "open_for_offers", customerId: "cust" },
          rider: { isOnline: true, lastHeartbeatAt: new Date(), kycStatus: "verified", accountStatus: "active", onHold: false, cooldownUntil: null },
        }),
      },
      order: { updateMany: orderUpdateMany },
      orderEvent: { create: async () => ({}) },
      block: { findFirst: async () => ({ id: "blk-1" }) },
    });

    await expect(service.selectOffer(orderId, offerId, "cust")).rejects.toBeInstanceOf(ForbiddenException);
    // Enforcement fires before the assignment CAS — the order is never claimed.
    expect(orderUpdateMany).not.toHaveBeenCalled();
    expect(metrics.recordMatchSelect).toHaveBeenCalledWith(7, "forbidden" satisfies MatchSelectOutcome);
  });
});
