import { Prisma } from "@prisma/client";
import { type MakeOfferRequest, makeOffer } from "@lynia/shared";
import { describe, expect, it, vi } from "vitest";
import type { NotificationsService } from "../notifications/notifications.service";
import type { MetricsService } from "../observability/metrics.service";
import { PrismaService } from "../prisma/prisma.service";
import type { TrackingGateway } from "../tracking/tracking.gateway";
import { OffersService } from "./offers.service";

/** Push is fire-and-forget; a no-op stub keeps these unit tests off the notification path. */
const noopNotifications = { notifyNewOffer: async () => {} } as unknown as NotificationsService;

/** Metrics are best-effort observability; a spy fake keeps unit tests off the OTel path. */
const fakeMetrics = () =>
  ({ startTimer: () => () => 0, recordOfferLatency: vi.fn(), incOffersMade: vi.fn() }) as unknown as MetricsService;

/** Fake WS gateway — the offers-changed signal is best-effort; spy on it, never hit a real socket. */
function fakeGateway() {
  return { emitOffersChanged: vi.fn(), emitBoardNewOrder: vi.fn() };
}

/** Per-test Prisma fake — only the methods makeOffer/listForOrder touch. No DB. The FOR UPDATE
 *  re-lock inside makeOffer runs through `$transaction`, so provide it (delegating to the same fake)
 *  plus a `$queryRaw` default that reports the order still open; a test can override `$queryRaw` to
 *  simulate the order closing under the lock. */
function svc(prisma: Partial<Record<string, unknown>>, gateway = fakeGateway(), metrics = fakeMetrics()) {
  const tx: Record<string, unknown> = {
    $queryRaw: async () => [{ status: "open_for_offers", order_type: "parcel" }],
    // Default: the customer and rider are not a blocked pair. A test overrides this to exercise the
    // block gate. Placed before `...prisma` so a test can still override it.
    block: { findFirst: async () => null },
    ...prisma,
  };
  const full: Record<string, unknown> = {
    ...tx,
    $transaction: async (fn: (t: unknown) => unknown) => fn(tx),
  };
  return {
    service: new OffersService(
      full as unknown as PrismaService,
      noopNotifications,
      gateway as unknown as TrackingGateway,
      metrics,
    ),
    gateway,
    metrics,
  };
}

// Shared fixture (roadmap 4.1): a rider accepting the customer's price at $2.50, ETA 10min. The exact
// orderId is only ever read back via `offerInput.orderId`, so the fixture's value flows through unchanged.
const offerInput: MakeOfferRequest = makeOffer();

describe("OffersService.makeOffer", () => {
  it("404s when the order does not exist", async () => {
    const { service, gateway } = svc({ order: { findUnique: async () => null } });
    await expect(service.makeOffer(offerInput, "rider-1")).rejects.toThrow(/order not found/i);
    expect(gateway.emitOffersChanged).not.toHaveBeenCalled();
  });

  it("409s when the order is not open for offers", async () => {
    const { service, gateway } = svc({ order: { findUnique: async () => ({ status: "assigned" }) } });
    await expect(service.makeOffer(offerInput, "rider-1")).rejects.toThrow(/not open for offers/i);
    expect(gateway.emitOffersChanged).not.toHaveBeenCalled();
  });

  it("403s when the caller is not a rider", async () => {
    const { service, gateway } = svc({
      order: { findUnique: async () => ({ status: "open_for_offers", orderType: "parcel" }), findFirst: async () => null },
      rider: { findUnique: async () => null },
    });
    await expect(service.makeOffer(offerInput, "rider-1")).rejects.toThrow(/not a rider/i);
    expect(gateway.emitOffersChanged).not.toHaveBeenCalled();
  });

  it("403s when the rider is not verified", async () => {
    const { service, gateway } = svc({
      order: { findUnique: async () => ({ status: "open_for_offers", orderType: "parcel" }), findFirst: async () => null },
      rider: { findUnique: async () => ({ kycStatus: "pending", isOnline: true }) },
    });
    await expect(service.makeOffer(offerInput, "rider-1")).rejects.toThrow(/not verified/i);
    expect(gateway.emitOffersChanged).not.toHaveBeenCalled();
  });

  it("403s when the rider is offline", async () => {
    const { service, gateway } = svc({
      order: { findUnique: async () => ({ status: "open_for_offers", orderType: "parcel" }), findFirst: async () => null },
      rider: { findUnique: async () => ({ kycStatus: "verified", isOnline: false, accountStatus: "active", onHold: false, cooldownUntil: null }) },
    });
    await expect(service.makeOffer(offerInput, "rider-1")).rejects.toThrow(/go online/i);
    expect(gateway.emitOffersChanged).not.toHaveBeenCalled();
  });

  it("409s on the one-round-per-rider unique violation (P2002)", async () => {
    const dup = new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "5.22.0" });
    const { service, gateway } = svc({
      order: { findUnique: async () => ({ status: "open_for_offers", orderType: "parcel" }), findFirst: async () => null },
      rider: { findUnique: async () => ({ kycStatus: "verified", isOnline: true, accountStatus: "active", onHold: false, cooldownUntil: null }) },
      offer: { create: async () => { throw dup; } },
    });
    await expect(service.makeOffer(offerInput, "rider-1")).rejects.toThrow(/already responded/i);
    expect(gateway.emitOffersChanged).not.toHaveBeenCalled();
  });

  it("creates the offer and serializes the fare to a string", async () => {
    const { service } = svc({
      order: { findUnique: async () => ({ status: "open_for_offers", orderType: "parcel" }), findFirst: async () => null },
      rider: { findUnique: async () => ({ kycStatus: "verified", isOnline: true, accountStatus: "active", onHold: false, cooldownUntil: null }) },
      offer: {
        create: async () => ({
          id: "o1",
          type: "accept",
          offeredFare: { toString: () => "2.50" },
          etaMinutes: 10,
          status: "pending",
        }),
      },
    });
    const res = await service.makeOffer(offerInput, "rider-1");
    expect(res).toEqual({ id: "o1", type: "accept", offeredFare: "2.50", etaMinutes: 10, status: "pending" });
  });

  it("rejects (no orphan offer) when the order closes under the FOR UPDATE re-check", async () => {
    // Passes the initial pre-check (open) + gating, but the locked re-read reports it just got assigned
    // — so the offer is never inserted and the rider gets a conflict, not a stranded pending row.
    const create = vi.fn();
    const { service, metrics } = svc({
      order: { findUnique: async () => ({ status: "open_for_offers", orderType: "parcel" }), findFirst: async () => null },
      rider: { findUnique: async () => ({ kycStatus: "verified", isOnline: true, accountStatus: "active", onHold: false, cooldownUntil: null }) },
      $queryRaw: async () => [{ status: "assigned" }],
      offer: { create },
    });
    await expect(service.makeOffer(offerInput, "rider-1")).rejects.toThrow(/not open for offers/i);
    expect(create).not.toHaveBeenCalled();
    expect(metrics.incOffersMade).toHaveBeenCalledWith("conflict");
  });

  it("labels the offers_made_total counter by outcome (created / forbidden / conflict)", async () => {
    const ok = {
      order: { findUnique: async () => ({ status: "open_for_offers", orderType: "parcel" }), findFirst: async () => null },
      rider: { findUnique: async () => ({ kycStatus: "verified", isOnline: true, accountStatus: "active", onHold: false, cooldownUntil: null }) },
      offer: { create: async () => ({ id: "o1", type: "accept", offeredFare: { toString: () => "2.50" }, etaMinutes: 10, status: "pending" }) },
    };
    const created = svc(ok);
    await created.service.makeOffer(offerInput, "rider-1");
    expect(created.metrics.incOffersMade).toHaveBeenCalledWith("created");

    const offline = svc({
      order: { findUnique: async () => ({ status: "open_for_offers", orderType: "parcel" }), findFirst: async () => null },
      rider: { findUnique: async () => ({ kycStatus: "verified", isOnline: false, accountStatus: "active", onHold: false, cooldownUntil: null }) },
    });
    await expect(offline.service.makeOffer(offerInput, "rider-1")).rejects.toThrow(/go online/i);
    expect(offline.metrics.incOffersMade).toHaveBeenCalledWith("forbidden");

    const dup = new Prisma.PrismaClientKnownRequestError("dup", { code: "P2002", clientVersion: "5.22.0" });
    const conflict = svc({
      order: { findUnique: async () => ({ status: "open_for_offers", orderType: "parcel" }), findFirst: async () => null },
      rider: { findUnique: async () => ({ kycStatus: "verified", isOnline: true, accountStatus: "active", onHold: false, cooldownUntil: null }) },
      offer: { create: async () => { throw dup; } },
    });
    await expect(conflict.service.makeOffer(offerInput, "rider-1")).rejects.toThrow(/already responded/i);
    expect(conflict.metrics.incOffersMade).toHaveBeenCalledWith("conflict");
  });

  it("signals offers:changed for the order room on a successful offer", async () => {
    const { service, gateway } = svc({
      order: { findUnique: async () => ({ status: "open_for_offers", orderType: "parcel", customerId: "cust-1" }), findFirst: async () => null },
      rider: { findUnique: async () => ({ kycStatus: "verified", isOnline: true, accountStatus: "active", onHold: false, cooldownUntil: null }) },
      offer: {
        create: async () => ({
          id: "o1",
          type: "accept",
          offeredFare: { toString: () => "2.50" },
          etaMinutes: 10,
          status: "pending",
        }),
      },
    });
    await service.makeOffer(offerInput, "rider-1");
    expect(gateway.emitOffersChanged).toHaveBeenCalledWith(offerInput.orderId);
  });

  it("never fails the offer when the offers:changed push throws", async () => {
    const gateway = {
      emitOffersChanged: vi.fn(() => { throw new Error("socket down"); }),
      emitBoardNewOrder: vi.fn(),
    };
    const { service } = svc(
      {
        order: { findUnique: async () => ({ status: "open_for_offers", orderType: "parcel", customerId: "cust-1" }), findFirst: async () => null },
        rider: { findUnique: async () => ({ kycStatus: "verified", isOnline: true, accountStatus: "active", onHold: false, cooldownUntil: null }) },
        offer: {
          create: async () => ({
            id: "o1",
            type: "accept",
            offeredFare: { toString: () => "2.50" },
            etaMinutes: 10,
            status: "pending",
          }),
        },
      },
      gateway,
    );
    await expect(service.makeOffer(offerInput, "rider-1")).resolves.toMatchObject({ id: "o1" });
    expect(gateway.emitOffersChanged).toHaveBeenCalled();
  });

  it("403s a rider bidding on their own order (no self-bid)", async () => {
    const { service, gateway } = svc({
      order: { findUnique: async () => ({ status: "open_for_offers", orderType: "parcel", customerId: "rider-1", proposedFare: 2.5 }) },
    });
    await expect(service.makeOffer(offerInput, "rider-1")).rejects.toThrow(/your own order/i);
    expect(gateway.emitOffersChanged).not.toHaveBeenCalled();
  });

  it("403s a rider bidding on an order whose customer is a blocked pair (no offer inserted)", async () => {
    const create = vi.fn();
    const { service, gateway } = svc({
      order: { findUnique: async () => ({ status: "open_for_offers", orderType: "parcel", customerId: "cust-1", proposedFare: 2.5 }) },
      // A block exists between cust-1 and rider-1 → the offer must be refused at creation, before the
      // rider/standing gate and before any insert, so the blocker never gets a push or sees them listed.
      block: { findFirst: async () => ({ id: "b1" }) },
      rider: { findUnique: async () => ({ kycStatus: "verified", isOnline: true, accountStatus: "active", onHold: false, cooldownUntil: null }) },
      offer: { create },
    });
    await expect(service.makeOffer(offerInput, "rider-1")).rejects.toThrow(/can't bid on this order/i);
    expect(create).not.toHaveBeenCalled();
    expect(gateway.emitOffersChanged).not.toHaveBeenCalled();
  });

  it("403s an accept whose fare doesn't match the customer's proposed price", async () => {
    const create = vi.fn();
    const { service } = svc({
      order: {
        findUnique: async () => ({ status: "open_for_offers", orderType: "parcel", customerId: "cust-1", proposedFare: 3 }),
        findFirst: async () => null,
      },
      rider: { findUnique: async () => ({ kycStatus: "verified", isOnline: true, accountStatus: "active", onHold: false, cooldownUntil: null }) },
      offer: { create },
    });
    // offerInput is type "accept" with offeredFare 2.5 ≠ proposedFare 3 → rejected, no offer inserted.
    await expect(service.makeOffer(offerInput, "rider-1")).rejects.toThrow(/match the customer's proposed fare/i);
    expect(create).not.toHaveBeenCalled();
  });

  // C3: a rider currently holding a live food dispatch offer can't also bid on a parcel — checked at
  // creation (not just at selectOffer) so the customer's board never even shows a bid the rider can't
  // take. common/food-dispatch-lock.ts's own query is exercised here via the fake `order.findFirst`.
  it("403s a rider currently holding a live food dispatch offer (C3 soft-lock)", async () => {
    const create = vi.fn();
    const { service, metrics } = svc({
      order: {
        findUnique: async () => ({ status: "open_for_offers", orderType: "parcel" }),
        findFirst: async () => ({ id: "food-order-1" }), // a live, unexpired food offer exists for this rider
      },
      rider: { findUnique: async () => ({ kycStatus: "verified", isOnline: true, accountStatus: "active", onHold: false, cooldownUntil: null }) },
      offer: { create },
    });
    await expect(service.makeOffer(offerInput, "rider-1")).rejects.toThrow(/food pickup offer waiting/i);
    expect(create).not.toHaveBeenCalled();
    expect(metrics.incOffersMade).toHaveBeenCalledWith("forbidden");
  });

  // C4: a rider owing a merchant a collect-and-return debt (or mid-handshake) can't bid on a parcel
  // either, same shape as the C3 soft-lock above — distinguished from hasLiveFoodDispatchOffer's own
  // query by its distinct `where` shape (riderId+OR vs dispatchOfferedRiderId).
  it("403s a rider with an open merchant debt / pending handshake (C4 soft-lock)", async () => {
    const create = vi.fn();
    const { service, metrics } = svc({
      order: {
        findUnique: async () => ({ status: "open_for_offers", orderType: "parcel" }),
        findFirst: async (args: { where: Record<string, unknown> }) =>
          "dispatchOfferedRiderId" in args.where ? null : { id: "food-order-1" },
      },
      rider: { findUnique: async () => ({ kycStatus: "verified", isOnline: true, accountStatus: "active", onHold: false, cooldownUntil: null }) },
      offer: { create },
    });
    await expect(service.makeOffer(offerInput, "rider-1")).rejects.toThrow(/still settling with a restaurant/i);
    expect(create).not.toHaveBeenCalled();
    expect(metrics.incOffersMade).toHaveBeenCalledWith("forbidden");
  });
});

describe("OffersService.listForOrder", () => {
  it("serializes each offer's Decimal fare to a string", async () => {
    const { service } = svc({
      order: { findUnique: async () => ({ customerId: "cust-1" }) },
      block: { findMany: async () => [] },
      offer: {
        findMany: async () => [
          { id: "o1", type: "accept", offeredFare: { toString: () => "3.00" }, etaMinutes: 8, rider: { profileId: "r1" } },
        ],
      },
    });
    const res = await service.listForOrder("order-1", "cust-1");
    expect(res[0]!.offeredFare).toBe("3.00");
  });

  it("excludes a pending offer from a rider the customer blocked AFTER the offer was placed", async () => {
    let capturedWhere: unknown;
    const { service } = svc({
      order: { findUnique: async () => ({ customerId: "cust-1" }) },
      // cust-1 blocked r-blocked (customer-initiated direction).
      block: { findMany: async () => [{ blockerProfileId: "cust-1", blockedProfileId: "r-blocked" }] },
      offer: {
        findMany: async (args: { where: unknown }) => {
          capturedWhere = args.where;
          return [
            { id: "o1", type: "accept", offeredFare: { toString: () => "3.00" }, etaMinutes: 8, rider: { profileId: "r-ok" } },
          ];
        },
      },
    });
    const res = await service.listForOrder("order-1", "cust-1");
    // The blocked rider must never even reach the client — assert the query itself excludes them
    // (an IDOR-adjacent PII leak, not just a client-side filter that could be bypassed).
    expect(capturedWhere).toMatchObject({ riderId: { notIn: ["r-blocked"] } });
    expect(res.map((o) => o.rider.profileId)).toEqual(["r-ok"]);
  });

  it("also excludes a rider who blocked the customer (the other block direction)", async () => {
    let capturedWhere: unknown;
    const { service } = svc({
      order: { findUnique: async () => ({ customerId: "cust-1" }) },
      block: { findMany: async () => [{ blockerProfileId: "r-blocked", blockedProfileId: "cust-1" }] },
      offer: {
        findMany: async (args: { where: unknown }) => {
          capturedWhere = args.where;
          return [];
        },
      },
    });
    await service.listForOrder("order-1", "cust-1");
    expect(capturedWhere).toMatchObject({ riderId: { notIn: ["r-blocked"] } });
  });
});
