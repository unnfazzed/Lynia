import { Prisma } from "@prisma/client";
import { ACTIVE_RIDE_STATUSES, estimatePickupEtaMinutes, type MakeOfferRequest, OFFER_WINDOW_MS } from "@lynia/shared";
import { makeOffer } from "@lynia/shared/fixtures";
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
    // Default: the rider has no prior offer on the order (makeOffer reads it under the lock before
    // creating). A test overrides findUnique to exercise the one-round rule / answering a raise.
    offer: { findUnique: async () => null, ...(prisma.offer as Record<string, unknown> | undefined) },
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

  it("403s when the caller is not a biker", async () => {
    const { service, gateway } = svc({
      order: { findUnique: async () => ({ status: "open_for_offers", orderType: "parcel" }), findFirst: async () => null },
      rider: { findUnique: async () => null },
    });
    await expect(service.makeOffer(offerInput, "rider-1")).rejects.toThrow(/not a biker/i);
    expect(gateway.emitOffersChanged).not.toHaveBeenCalled();
  });

  it("403s when the biker is not verified", async () => {
    const { service, gateway } = svc({
      order: { findUnique: async () => ({ status: "open_for_offers", orderType: "parcel" }), findFirst: async () => null },
      rider: { findUnique: async () => ({ kycStatus: "pending", isOnline: true }) },
    });
    await expect(service.makeOffer(offerInput, "rider-1")).rejects.toThrow(/not verified/i);
    expect(gateway.emitOffersChanged).not.toHaveBeenCalled();
  });

  it("403s when the biker is offline", async () => {
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

  it("409s a new bid once the offer window has ended — even inside the choose grace, while the order is still open", async () => {
    // After-send v2: the order stays `open_for_offers` for OFFER_CHOOSE_GRACE_MS past the window so the
    // customer can pick from the offers already on screen — but no NEW offer may land in that grace.
    const create = vi.fn();
    const riderLookup = vi.fn(async () => ({ kycStatus: "verified", isOnline: true, accountStatus: "active", onHold: false, cooldownUntil: null }));
    const { service, metrics } = svc({
      order: {
        findUnique: async () => ({ status: "open_for_offers", orderType: "parcel", createdAt: new Date(Date.now() - OFFER_WINDOW_MS - 5_000) }),
        findFirst: async () => null,
      },
      rider: { findUnique: riderLookup },
      offer: { create },
    });
    await expect(service.makeOffer(offerInput, "rider-1")).rejects.toThrow(/offer window has closed/i);
    expect(create).not.toHaveBeenCalled();
    expect(riderLookup).not.toHaveBeenCalled(); // refused before any gating work
    expect(metrics.incOffersMade).toHaveBeenCalledWith("conflict");
  });

  it("409s (no offer) when the window ends between the pre-check and the FOR UPDATE re-check", async () => {
    const create = vi.fn();
    const { service, metrics } = svc({
      order: {
        findUnique: async () => ({ status: "open_for_offers", orderType: "parcel", createdAt: new Date(Date.now() - OFFER_WINDOW_MS + 60_000) }),
        findFirst: async () => null,
      },
      rider: { findUnique: async () => ({ kycStatus: "verified", isOnline: true, accountStatus: "active", onHold: false, cooldownUntil: null }) },
      // Under the lock the row reads as still open but its window has run out.
      $queryRaw: async () => [{ status: "open_for_offers", order_type: "parcel", created_at: new Date(Date.now() - OFFER_WINDOW_MS) }],
      offer: { create },
    });
    await expect(service.makeOffer(offerInput, "rider-1")).rejects.toThrow(/offer window has closed/i);
    expect(create).not.toHaveBeenCalled();
    expect(metrics.incOffersMade).toHaveBeenCalledWith("conflict");
  });

  it("still takes a bid just inside the window", async () => {
    const { service } = svc({
      order: {
        findUnique: async () => ({ status: "open_for_offers", orderType: "parcel", createdAt: new Date(Date.now() - OFFER_WINDOW_MS + 2_000) }),
        findFirst: async () => null,
      },
      rider: { findUnique: async () => ({ kycStatus: "verified", isOnline: true, accountStatus: "active", onHold: false, cooldownUntil: null }) },
      $queryRaw: async () => [{ status: "open_for_offers", order_type: "parcel", created_at: new Date(Date.now() - OFFER_WINDOW_MS + 2_000) }],
      offer: { create: async () => ({ id: "o1", type: "accept", offeredFare: { toString: () => "2.50" }, etaMinutes: 10, status: "pending" }) },
    });
    await expect(service.makeOffer(offerInput, "rider-1")).resolves.toMatchObject({ id: "o1" });
  });

  // Cold start (owner 2026-10-12): the window end is stored on the order and can run past createdAt + 90 s.
  it("takes a bid past the old 90 s mark while the stored window end is still ahead", async () => {
    const createdAt = new Date(Date.now() - OFFER_WINDOW_MS - 60_000);
    const offerWindowEndsAt = new Date(Date.now() + 60_000);
    const { service } = svc({
      order: { findUnique: async () => ({ status: "open_for_offers", orderType: "parcel", createdAt, offerWindowEndsAt }), findFirst: async () => null },
      rider: { findUnique: async () => ({ kycStatus: "verified", isOnline: true, accountStatus: "active", onHold: false, cooldownUntil: null }) },
      $queryRaw: async () => [{ status: "open_for_offers", order_type: "parcel", created_at: createdAt, offer_window_ends_at: offerWindowEndsAt, fare_raised_at: null }],
      offer: { create: async () => ({ id: "o1", type: "accept", offeredFare: { toString: () => "2.50" }, etaMinutes: 10, status: "pending" }) },
    });
    await expect(service.makeOffer(offerInput, "rider-1")).resolves.toMatchObject({ id: "o1" });
  });

  describe("answering a raise (owner 2026-10-12)", () => {
    const raisedAt = new Date(Date.now() - 5_000);
    const lockRow = (fareRaisedAt: Date | null) => [{ status: "open_for_offers", order_type: "parcel", created_at: new Date(), offer_window_ends_at: null, fare_raised_at: fareRaisedAt }];
    const base = (fareRaisedAt: Date | null, prior: { status: string; createdAt: Date }, update = vi.fn(async () => ({ id: "off-1", type: "counter", offeredFare: { toString: () => "4.00" }, etaMinutes: 10, status: "pending" }))) => ({
      update,
      ...svc({
        order: { findUnique: async () => ({ status: "open_for_offers", orderType: "parcel", createdAt: new Date() }), findFirst: async () => null },
        rider: { findUnique: async () => ({ kycStatus: "verified", isOnline: true, accountStatus: "active", onHold: false, cooldownUntil: null }) },
        $queryRaw: async () => lockRow(fareRaisedAt),
        offer: { findUnique: async () => ({ id: "off-1", ...prior }), create: vi.fn(), update },
      }),
    });
    const counter: MakeOfferRequest = { ...offerInput, type: "counter", offeredFare: 4 };

    it("replaces a pending offer made before the raise, back to pending at the new bid", async () => {
      const h = base(raisedAt, { status: "pending", createdAt: new Date(raisedAt.getTime() - 30_000) });
      await expect(h.service.makeOffer(counter, "rider-1")).resolves.toMatchObject({ id: "off-1", offeredFare: "4.00" });
      expect(h.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "off-1" }, data: expect.objectContaining({ type: "counter", offeredFare: 4, status: "pending" }) }));
      expect(h.gateway.emitOffersChanged).toHaveBeenCalled();
    });

    it("lets a biker who withdrew before the raise bid again", async () => {
      const h = base(raisedAt, { status: "declined", createdAt: new Date(raisedAt.getTime() - 30_000) });
      await expect(h.service.makeOffer(counter, "rider-1")).resolves.toMatchObject({ id: "off-1" });
      expect(h.update).toHaveBeenCalled();
    });

    it("keeps the one-round rule when there was no raise, or the offer already answered it", async () => {
      const never = base(null, { status: "pending", createdAt: new Date(Date.now() - 30_000) });
      await expect(never.service.makeOffer(counter, "rider-1")).rejects.toThrow(/already responded/i);
      expect(never.update).not.toHaveBeenCalled();

      const after = base(raisedAt, { status: "pending", createdAt: new Date(raisedAt.getTime() + 1_000) });
      await expect(after.service.makeOffer(counter, "rider-1")).rejects.toThrow(/already responded/i);
      expect(after.metrics.incOffersMade).toHaveBeenCalledWith("conflict");
    });
  });

  it("never stores an ETA shorter than the biker's distance to the pickup allows", async () => {
    const create = vi.fn(async (args: { data: { etaMinutes: number } }) => ({ id: "o1", type: "accept", offeredFare: { toString: () => "2.50" }, etaMinutes: args.data.etaMinutes, status: "pending" }));
    const { service } = svc({
      order: { findUnique: async () => ({ status: "open_for_offers", orderType: "parcel" }), findFirst: async () => null },
      rider: { findUnique: async () => ({ kycStatus: "verified", isOnline: true, accountStatus: "active", onHold: false, cooldownUntil: null }) },
      // 50 km out: the 10-minute chip the rider tapped is impossible.
      $queryRaw: async (q: Prisma.Sql) => (q.sql.includes("ST_Distance") ? [{ distance_m: 50_000 }] : [{ status: "open_for_offers", order_type: "parcel" }]),
      offer: { create },
    });
    await service.makeOffer(offerInput, "rider-1");
    expect(create.mock.calls[0][0].data.etaMinutes).toBe(estimatePickupEtaMinutes(50_000));
    expect(estimatePickupEtaMinutes(50_000)).toBeGreaterThan(offerInput.etaMinutes);
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

  it("403s a biker bidding on their own order (no self-bid)", async () => {
    const { service, gateway } = svc({
      order: { findUnique: async () => ({ status: "open_for_offers", orderType: "parcel", customerId: "rider-1", proposedFare: 2.5 }) },
    });
    await expect(service.makeOffer(offerInput, "rider-1")).rejects.toThrow(/your own order/i);
    expect(gateway.emitOffersChanged).not.toHaveBeenCalled();
  });

  it("403s a biker bidding on an order whose customer is a blocked pair (no offer inserted)", async () => {
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

  // LM-01 pinning test: the accept-must-match-proposedFare guard (line ~107) is gated on
  // `input.type === "accept"` — a "counter" offer is the rider's OWN price and must bypass it
  // entirely, even at a fare that would have been rejected as an accept. Money-sensitive (this is
  // the value selectOffer later binds into agreedFare), previously exercised only indirectly via
  // admin fareProvenance display tests, never at the point the offer is actually created.
  it("accepts a counter offer at a fare that would have failed the accept-match guard (LM-01)", async () => {
    const create = vi.fn(async (args: { data: { type: string; offeredFare: number } }) => ({
      id: "o1",
      type: args.data.type,
      offeredFare: { toString: () => args.data.offeredFare.toFixed(2) },
      etaMinutes: 12,
      status: "pending",
    }));
    const { service } = svc({
      order: {
        findUnique: async () => ({ status: "open_for_offers", orderType: "parcel", customerId: "cust-1", proposedFare: 3 }),
        findFirst: async () => null,
      },
      rider: { findUnique: async () => ({ kycStatus: "verified", isOnline: true, accountStatus: "active", onHold: false, cooldownUntil: null }) },
      offer: { create },
    });
    const res = await service.makeOffer({ ...offerInput, type: "counter", offeredFare: 4.75 }, "rider-1");
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ type: "counter", offeredFare: 4.75 }) }));
    expect(res).toMatchObject({ type: "counter", offeredFare: "4.75" });
  });

  // C4: a rider owing a merchant a collect-and-return debt (or mid-handshake) can't bid on a parcel
  // either.
  it("403s a biker with an open merchant debt / pending handshake (C4 soft-lock)", async () => {
    const create = vi.fn();
    const { service, metrics } = svc({
      order: {
        findUnique: async () => ({ status: "open_for_offers", orderType: "parcel" }),
        findFirst: async () => ({ id: "food-order-1" }),
      },
      rider: { findUnique: async () => ({ kycStatus: "verified", isOnline: true, accountStatus: "active", onHold: false, cooldownUntil: null }) },
      offer: { create },
    });
    await expect(service.makeOffer(offerInput, "rider-1")).rejects.toThrow(/still settling with a restaurant/i);
    expect(create).not.toHaveBeenCalled();
    expect(metrics.incOffersMade).toHaveBeenCalledWith("forbidden");
  });

  // Owner 2026-10-12: a rider already on a job can't bid. The offer could never be picked (the list hides
  // it, selectOffer 409s rider_taken) but used up the rider's one round on the order.
  it("403s a rider who is already on a job, before any offer is written", async () => {
    const create = vi.fn();
    const findFirst = vi.fn(async (a: { where: { status?: { in: string[] } } }) => (a.where.status ? { id: "their-current-job" } : null));
    const { service, metrics, gateway } = svc({
      order: { findUnique: async () => ({ status: "open_for_offers", orderType: "parcel" }), findFirst },
      rider: { findUnique: async () => ({ kycStatus: "verified", isOnline: true, accountStatus: "active", onHold: false, cooldownUntil: null }) },
      offer: { create },
    });
    await expect(service.makeOffer(offerInput, "rider-1")).rejects.toThrow(/finish your current job/i);
    expect(findFirst).toHaveBeenCalledWith({ where: { riderId: "rider-1", status: { in: ACTIVE_RIDE_STATUSES } }, select: { id: true } });
    expect(create).not.toHaveBeenCalled();
    expect(gateway.emitOffersChanged).not.toHaveBeenCalled();
    expect(metrics.incOffersMade).toHaveBeenCalledWith("forbidden");
  });
});

/** A rider selectOffer would take: online, a fresh heartbeat, in good standing. */
const LIVE = (over: Record<string, unknown> = {}) => ({
  isOnline: true,
  lastHeartbeatAt: new Date(Date.now() - 5_000),
  kycStatus: "verified",
  accountStatus: "active",
  onHold: false,
  cooldownUntil: null,
  ...over,
});

describe("OffersService.listForOrder", () => {
  it("MJ-RL2 / U62: drops an offer selectOffer would refuse (offline, stale, held, owing cash); the wire shape is unchanged", async () => {
    const heldQuery = vi.fn(async () => [{ riderId: "r-owes" }, { riderId: "r-busy" }]);
    const offer = (id: string, rider: Record<string, unknown>) => ({ id, type: "accept", offeredFare: { toString: () => "3.00" }, etaMinutes: 8, rider: { ratingAvg: 4.5, ratingCount: 3, tripsCount: 9, profile: { firstName: "A", lastName: "B", photoUrl: null }, ...rider } });
    const { service } = svc({
      order: { findUnique: async () => ({ customerId: "cust-1" }), findMany: heldQuery },
      block: { findMany: async () => [] },
      offer: {
        findMany: async () => [
          offer("o-ok", { profileId: "r-ok", ...LIVE() }),
          offer("o-off", { profileId: "r-off", ...LIVE({ isOnline: false }) }),
          // Bid, then locked the phone: the bid counts as presence (owner 2026-10-12), so it stays.
          offer("o-locked", { profileId: "r-locked", ...LIVE({ lastHeartbeatAt: new Date(Date.now() - 5 * 60_000) }) }),
          offer("o-stale", { profileId: "r-stale", ...LIVE({ lastHeartbeatAt: new Date(Date.now() - 20 * 60_000) }) }),
          offer("o-held", { profileId: "r-held", ...LIVE({ onHold: true }) }),
          offer("o-owes", { profileId: "r-owes", ...LIVE() }),
          // On another customer's ride right now: selectOffer would 409 rider_taken on every Choose.
          offer("o-busy", { profileId: "r-busy", ...LIVE() }),
        ],
      },
    });
    const res = await service.listForOrder("order-1", "cust-1");
    expect(res.map((o) => o.id)).toEqual(["o-ok", "o-locked"]);
    // Review: ONE batched read over the live riders (no per-offer query), covering an active ride elsewhere
    // (the one_active_ride statuses) and the merchant-debt soft-lock.
    expect(heldQuery).toHaveBeenCalledTimes(1);
    const where = (heldQuery.mock.calls[0] as unknown as [{ where: { riderId: { in: string[] }; OR: Array<Record<string, unknown>> } }])[0].where;
    expect(where.riderId.in.sort()).toEqual(["r-busy", "r-locked", "r-ok", "r-owes"]);
    expect(where.OR[0]).toEqual({ status: { in: ["assigned", "confirmed", "en_route_pickup", "picked_up", "en_route_dropoff"] } });
    expect(where.OR).toHaveLength(4);
    // The gate's fields are read for the check only — never sent to the customer.
    expect(Object.keys(res[0]!.rider).sort()).toEqual(["profile", "profileId", "ratingAvg", "ratingCount", "tripsCount"]);
  });

  it("serializes each offer's Decimal fare to a string", async () => {
    const { service } = svc({
      order: { findUnique: async () => ({ customerId: "cust-1" }), findMany: async () => [] },
      block: { findMany: async () => [] },
      offer: {
        findMany: async () => [
          { id: "o1", type: "accept", offeredFare: { toString: () => "3.00" }, etaMinutes: 8, rider: { profileId: "r1", ...LIVE() } },
        ],
      },
    });
    const res = await service.listForOrder("order-1", "cust-1");
    expect(res[0]!.offeredFare).toBe("3.00");
  });

  it("excludes a pending offer from a biker the customer blocked AFTER the offer was placed", async () => {
    let capturedWhere: unknown;
    const { service } = svc({
      order: { findUnique: async () => ({ customerId: "cust-1" }), findMany: async () => [] },
      // cust-1 blocked r-blocked (customer-initiated direction).
      block: { findMany: async () => [{ blockerProfileId: "cust-1", blockedProfileId: "r-blocked" }] },
      offer: {
        findMany: async (args: { where: unknown }) => {
          capturedWhere = args.where;
          return [
            { id: "o1", type: "accept", offeredFare: { toString: () => "3.00" }, etaMinutes: 8, rider: { profileId: "r-ok", ...LIVE() } },
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

  it("also excludes a biker who blocked the customer (the other block direction)", async () => {
    let capturedWhere: unknown;
    const { service } = svc({
      order: { findUnique: async () => ({ customerId: "cust-1" }), findMany: async () => [] },
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

describe("OffersService — the per-job commission check (owner 2026-10-12, rate 10%)", () => {
  const RIDER = { kycStatus: "verified", isOnline: true, accountStatus: "active", onHold: false, cooldownUntil: null };
  const wallets = (riders: Record<string, { tripsCount: number; balance: number }>) => ({
    findMany: async ({ where }: { where: { profileId: { in: string[] } } }) =>
      where.profileId.in.map((id) => ({ profileId: id, tripsCount: riders[id]!.tripsCount })),
  });
  const accounts = (riders: Record<string, { tripsCount: number; balance: number }>) => ({
    findMany: async ({ where }: { where: { riderId: { in: string[] } } }) => where.riderId.in.map((id) => ({ riderId: id, balance: riders[id]!.balance })),
  });

  it("refuses a bid whose 10% commission is more than the biker's balance (past their free jobs) — no offer written", async () => {
    vi.stubEnv("COMMISSION_RATE_PCT", "10");
    const create = vi.fn();
    const riders = { "rider-1": { tripsCount: 25, balance: 0.2 } };
    const { service } = svc({
      order: { findUnique: async () => ({ status: "open_for_offers", orderType: "parcel", proposedFare: 2.5, suggestedFare: 2.5 }), findFirst: async () => null },
      rider: { findUnique: async () => RIDER, ...wallets(riders) },
      commissionAccount: accounts(riders),
      offer: { create },
    });
    // $2.50 fare → $0.25 commission > $0.20 balance.
    await expect(service.makeOffer(offerInput, "rider-1")).rejects.toMatchObject({ response: { reason: "commission_low_balance" } });
    expect(create).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });

  it("takes the bid when the balance covers it, or while the biker still has free jobs", async () => {
    vi.stubEnv("COMMISSION_RATE_PCT", "10");
    for (const state of [{ tripsCount: 25, balance: 0.25 }, { tripsCount: 3, balance: 0 }]) {
      const riders = { "rider-1": state };
      const { service } = svc({
        order: { findUnique: async () => ({ status: "open_for_offers", orderType: "parcel", proposedFare: 2.5, suggestedFare: 2.5 }), findFirst: async () => null },
        rider: { findUnique: async () => RIDER, ...wallets(riders) },
        commissionAccount: accounts(riders),
        offer: { create: async () => ({ id: "o1", type: "accept", offeredFare: { toString: () => "2.50" }, etaMinutes: 10, status: "pending" }) },
      });
      await expect(service.makeOffer(offerInput, "rider-1")).resolves.toMatchObject({ id: "o1" });
    }
    vi.unstubAllEnvs();
  });

  it("drops an offer from the customer's list once its biker can't cover the commission on their own fare", async () => {
    vi.stubEnv("COMMISSION_RATE_PCT", "10");
    const riders = { "r-ok": { tripsCount: 25, balance: 1 }, "r-short": { tripsCount: 25, balance: 0.1 } };
    const { service } = svc({
      order: { findUnique: async () => ({ customerId: "cust-1", suggestedFare: 3 }), findMany: async () => [] },
      block: { findMany: async () => [] },
      rider: wallets(riders),
      commissionAccount: accounts(riders),
      offer: {
        findMany: async () => [
          { id: "o1", type: "accept", offeredFare: { toString: () => "3.00" }, etaMinutes: 8, rider: { profileId: "r-ok", ...LIVE() } },
          { id: "o2", type: "accept", offeredFare: { toString: () => "3.00" }, etaMinutes: 8, rider: { profileId: "r-short", ...LIVE() } },
        ],
      },
    });
    const res = await service.listForOrder("order-1", "cust-1");
    expect(res.map((o) => o.rider.profileId)).toEqual(["r-ok"]);
    vi.unstubAllEnvs();
  });
});

describe("OffersService.withdrawOffer (Biker v2 J10)", () => {
  const ORDER = "0a1b2c3d-0000-4000-8000-000000000001";

  it("marks the biker's own pending offer declined and signals the customer's list", async () => {
    const update = vi.fn(async () => ({}));
    const { service, gateway } = svc({
      $queryRaw: async () => [{ status: "open_for_offers" }],
      offer: { findUnique: async () => ({ id: "off-1", status: "pending" }), update },
    });
    await expect(service.withdrawOffer(ORDER, "rider-1")).resolves.toEqual({ orderId: ORDER, withdrawn: true });
    expect(update).toHaveBeenCalledWith({ where: { id: "off-1" }, data: { status: "declined" } });
    expect(gateway.emitOffersChanged).toHaveBeenCalledWith(ORDER);
  });

  it("409s once the customer has chosen (the order is no longer open)", async () => {
    const update = vi.fn();
    const { service } = svc({ $queryRaw: async () => [{ status: "assigned" }], offer: { findUnique: async () => ({ id: "off-1", status: "pending" }), update } });
    await expect(service.withdrawOffer(ORDER, "rider-1")).rejects.toThrow(/already chosen/i);
    expect(update).not.toHaveBeenCalled();
  });

  it("404s with no offer from this biker, 409s on an offer already closed", async () => {
    const none = svc({ $queryRaw: async () => [{ status: "open_for_offers" }], offer: { findUnique: async () => null } });
    await expect(none.service.withdrawOffer(ORDER, "rider-1")).rejects.toThrow(/no offer/i);
    const closed = svc({ $queryRaw: async () => [{ status: "open_for_offers" }], offer: { findUnique: async () => ({ id: "off-1", status: "declined" }) } });
    await expect(closed.service.withdrawOffer(ORDER, "rider-1")).rejects.toThrow(/already closed/i);
  });
});
