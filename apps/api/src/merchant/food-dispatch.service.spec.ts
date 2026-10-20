import { describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import { RESTAURANTS_DISPATCH } from "@lynia/shared";
import type { Env } from "../config/env";
import { TokenService } from "../auth/token.service";
import { PiiCryptoService } from "../common/pii-crypto.service";
import type { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";
import type { TrackingGateway } from "../tracking/tracking.gateway";
import type { DispatchStrategy } from "./dispatch-strategy";
import type { RiderNudgeService } from "../tracking/rider-nudge.service";
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
    evictFromOrderRoom: vi.fn(async () => {}),
    emitFoodOffer: vi.fn(async () => {}),
    emitDispatchOfferClosed: vi.fn(async () => {}),
    emitFoodQueueChanged: vi.fn(),
  } as unknown as TrackingGateway & {
    emitOrderStatus: ReturnType<typeof vi.fn>;
    evictRiderFromSupply: ReturnType<typeof vi.fn>;
    evictFromOrderRoom: ReturnType<typeof vi.fn>;
    emitFoodOffer: ReturnType<typeof vi.fn>;
    emitDispatchOfferClosed: ReturnType<typeof vi.fn>;
    emitFoodQueueChanged: ReturnType<typeof vi.fn>;
  };
}

/** Fake Prisma where `$transaction(cb)` runs the callback against the same fake (tx === prisma),
 *  mirroring food-order.service.spec.ts's `build()`. */
function build(methods: Record<string, unknown>, strategy: DispatchStrategy, gateway = fakeGateway(), codeCrypto?: PiiCryptoService, nudge?: RiderNudgeService) {
  notified.length = 0;
  const prisma = withMembershipShim({ ...methods } as Record<string, unknown>);
  prisma.$transaction = async (cb: (tx: unknown) => unknown) => cb(prisma);
  // The tick's post-write "is the round still live?" re-check: live unless a test says otherwise.
  const order = prisma.order as Record<string, unknown> | undefined;
  if (order && !order.count) order.count = async () => 1;
  // The tick's read of riders still cooling down after a pass: nobody, unless a test says otherwise.
  const attempts = (prisma.foodDispatchAttempt ??= {}) as Record<string, unknown>;
  if (!attempts.findMany) attempts.findMany = async () => [];
  // acceptDispatch re-runs the online gate on the accepting biker: in good standing unless a test says otherwise.
  const riders = (prisma.rider ??= {}) as Record<string, unknown>;
  if (!riders.findUnique) {
    riders.findUnique = async () => ({ kycStatus: "verified", accountStatus: "active", onHold: false, cooldownUntil: null });
  }
  // acceptDispatch's merchant-debt soft-lock (hasOpenMerchantObligation: `where: { riderId, OR }`) finds no open
  // obligation unless a test says otherwise. Every other findFirst keeps the test's own mock.
  if (order && typeof order.findFirst === "function") {
    type Args = { where?: { riderId?: unknown; OR?: unknown } };
    const findFirst = order.findFirst as (args: Args) => unknown;
    order.findFirst = async (args: Args) => (args?.where?.riderId !== undefined && args.where.OR !== undefined ? null : findFirst(args));
  }
  const svc = new FoodDispatchService(prisma as unknown as PrismaService, tokens, notifications, gateway, strategy, codeCrypto, nudge);
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
  customerId: "cust-1",
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

describe("FoodDispatchService.sweepSearch — Preferred riders is retired (Own bikers T9)", () => {
  it("never reads a business's preferred bikers or ranks one first", async () => {
    const preferred = { findMany: vi.fn(async () => [{ phone: "+263771230000" }]) };
    const strategy: DispatchStrategy = { pickCandidates: vi.fn(async () => [{ riderId: "rider-1", distanceM: 900 }]) };
    const { svc } = build(
      {
        order: { findMany: async () => [{ id: orderId }], findUnique: async () => baseOrder(), updateMany: vi.fn(async () => ({ count: 1 })) },
        merchant: { findUnique: async () => ({ location: { point: HARARE_CBD }, ownerProfileId: null }) },
        ownerFleet: { findUnique: async () => null },
        $queryRaw: async () => [],
        merchantPreferredRider: preferred,
        profile: { findMany: async () => [] },
        orderEvent: { create: async () => ({}) },
        foodDispatchAttempt: { upsert: vi.fn(async () => ({})) },
      },
      strategy,
    );
    expect(await svc.sweepSearch()).toEqual({ offered: 1, held: 0 });
    expect(strategy.pickCandidates).toHaveBeenCalledWith(expect.not.objectContaining({ preferredRiderIds: expect.anything() }));
    expect(preferred.findMany).not.toHaveBeenCalled();
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
    expect(strategy.pickCandidates).toHaveBeenCalledWith(expect.objectContaining({ limit: 10, radiusM: RESTAURANTS_DISPATCH.pickupReachM, excludeRiderIds: ["cust-1"] }));
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
        create: expect.objectContaining({ orderId, riderId: "r0", attemptNumber: 1, radiusM: RESTAURANTS_DISPATCH.pickupReachM }),
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

  it("offers every later round to everyone eligible (no cap), passing bikers who dropped it as excluded", async () => {
    const { svc, strategy, attemptUpsert } = world({
      order: { findMany: async () => [{ id: orderId }], findUnique: async () => baseOrder({ dispatchAttempt: 1, dispatchExcludedRiderIds: ["dropped"] }), updateMany: async () => ({ count: 1 }) },
    });
    await svc.sweepSearch();
    expect(strategy.pickCandidates).toHaveBeenCalledWith(expect.objectContaining({ limit: null, excludeRiderIds: ["dropped", "cust-1"] }));
    expect(attemptUpsert).toHaveBeenCalledWith(expect.objectContaining({ update: expect.objectContaining({ attemptNumber: 2, outcome: "pending" }) }));
  });

  // Owner 2026-10-12: a pass keeps a rider off the order for declineCooldownMs (10 min), not for ever.
  it("leaves out a biker who passed within the decline cooldown, and asks one whose pass has lapsed", async () => {
    const declined = [
      { riderId: "just-passed", respondedAt: new Date(Date.now() - 2 * 60_000) },
      { riderId: "passed-long-ago", respondedAt: new Date(Date.now() - 11 * 60_000) },
    ];
    const attemptFindMany = vi.fn(async ({ where }: { where: { outcome?: string; respondedAt?: { gt: Date } } }) =>
      where.outcome === "declined" ? declined.filter((d) => d.respondedAt > where.respondedAt!.gt).map(({ riderId }) => ({ riderId })) : [],
    );
    const { svc, strategy } = world({
      order: { findMany: async () => [{ id: orderId }], findUnique: async () => baseOrder({ dispatchAttempt: 1, dispatchExcludedRiderIds: ["dropped"] }), updateMany: async () => ({ count: 1 }) },
      foodDispatchAttempt: { upsert: vi.fn(async () => ({})), findMany: attemptFindMany, updateMany: async () => ({ count: 0 }) },
    });
    const before = Date.now();
    await svc.sweepSearch();
    expect(strategy.pickCandidates).toHaveBeenCalledWith(expect.objectContaining({ excludeRiderIds: ["dropped", "cust-1", "just-passed"] }));
    const cutoff = (attemptFindMany.mock.calls[0]![0].where.respondedAt!.gt as Date).getTime();
    expect(cutoff).toBeGreaterThanOrEqual(before - RESTAURANTS_DISPATCH.declineCooldownMs);
    expect(cutoff).toBeLessThanOrEqual(Date.now() - RESTAURANTS_DISPATCH.declineCooldownMs);
  });

  it("never offers a biker their OWN food order: the order's customer is excluded from every round", async () => {
    const { svc, strategy } = world({
      order: { findMany: async () => [{ id: orderId }], findUnique: async () => baseOrder({ customerId: "biker-who-ordered" }), updateMany: async () => ({ count: 1 }) },
    });
    await svc.sweepSearch();
    expect(strategy.pickCandidates).toHaveBeenCalledWith(expect.objectContaining({ excludeRiderIds: expect.arrayContaining(["biker-who-ordered"]) }));
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

  // Owner 2026-10-12: the customer hears about the hold too — the order screen's T11a copy, verbatim.
  it("pushes the customer once the hold commits: still looking, the tap opens the order (and its free cancel)", async () => {
    const { svc } = build(
      { order: { findMany: async () => [{ id: orderId }], findUnique: async () => baseOrder({ dispatchAttempt: 6 }), updateMany: async () => ({ count: 1 }) } },
      NONE,
    );
    await svc.sweepSearch();
    expect(notified).toEqual([
      {
        profileIds: ["cust-1"],
        title: "Finding a biker is taking longer",
        body: "We’re asking more bikers now. Your food is kept warm — same food, same price, nothing extra to pay.",
        data: { orderId, status: "requested", to: "customer", orderType: "merchant", kind: "food_no_rider_hold" },
        collapseKey: `order:${orderId}:no_rider_hold`,
      },
    ]);
  });

  // Owner 2026-10-12: nobody online took it, so the offline riders near the pickup are asked to come online.
  it("nudges the offline bikers near the pickup when the hold commits (and not when it loses the race)", async () => {
    const nudgeOfflineRiders = vi.fn(async () => {});
    const nudge = { nudgeOfflineRiders } as unknown as RiderNudgeService;
    const held = build(
      { order: { findMany: async () => [{ id: orderId }], findUnique: async () => baseOrder({ dispatchAttempt: 6 }), updateMany: async () => ({ count: 1 }) } },
      NONE,
      undefined,
      undefined,
      nudge,
    );
    await held.svc.sweepSearch();
    expect(nudgeOfflineRiders).toHaveBeenCalledWith(expect.objectContaining(PICKUP.point), "job");

    nudgeOfflineRiders.mockClear();
    const lost = build(
      { order: { findMany: async () => [{ id: orderId }], findUnique: async () => baseOrder({ dispatchAttempt: 6 }), updateMany: async () => ({ count: 0 }) } },
      NONE,
      undefined,
      undefined,
      nudge,
    );
    await lost.svc.sweepSearch();
    expect(nudgeOfflineRiders).not.toHaveBeenCalled();
  });

  it("nudges the offline bikers near the venue when a round finds nobody in reach", async () => {
    const nudgeOfflineRiders = vi.fn(async () => {});
    const { svc } = build(
      {
        order: { findMany: async () => [{ id: orderId }], findUnique: async () => baseOrder(), updateMany: async () => ({ count: 1 }) },
        merchant: { findUnique: async () => ({ location: { point: HARARE_CBD } }) },
      },
      NONE,
      undefined,
      undefined,
      { nudgeOfflineRiders } as unknown as RiderNudgeService,
    );
    await svc.sweepSearch();
    expect(nudgeOfflineRiders).toHaveBeenCalledWith(HARARE_CBD, "job");
  });

  it("no hold push when the hold CAS loses a race (someone else moved the order first)", async () => {
    const { svc } = build(
      { order: { findMany: async () => [{ id: orderId }], findUnique: async () => baseOrder({ dispatchAttempt: 6 }), updateMany: async () => ({ count: 0 }) } },
      NONE,
    );
    expect(await svc.sweepSearch()).toEqual({ offered: 0, held: 0 });
    expect(notified).toEqual([]);
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
    expect(gateway.emitDispatchOfferClosed).toHaveBeenCalledWith("r1", orderId);
    expect(gateway.emitDispatchOfferClosed).toHaveBeenCalledWith("r2", orderId);
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
    expect(gateway.emitDispatchOfferClosed).not.toHaveBeenCalled();
  });
});

const roundEnd = new Date(Date.now() + 30_000);
const liveOrder = { status: "open_for_offers", merchantId: MERCHANT_ID, dispatchOfferExpiresAt: roundEnd, dispatchExcludedRiderIds: [] as string[] };
const pendingRow = { outcome: "pending", expiresAt: roundEnd };
/** The accepting rider, in good standing — acceptDispatch re-runs the online gate on it. */
const goodRider = { findUnique: async () => ({ kycStatus: "verified", accountStatus: "active", onHold: false, cooldownUntil: null }) };

describe("FoodDispatchService.acceptDispatch — D-04 biker secured, first to accept wins", () => {
  it("assigns the biker, mints a delivery code, clears merchantPhase + dispatch fields, tells the round's other bikers, pushes rider-secured", async () => {
    const orderUpdateMany = vi.fn(async () => ({ count: 1 }));
    const attemptUpdateMany = vi.fn(async () => ({ count: 1 }));
    const { svc, gateway } = build(
      {
        order: { findFirst: async () => liveOrder, updateMany: orderUpdateMany, findUnique: async () => ({ customerId: "cust-1" }) },
        foodDispatchAttempt: { findUnique: async () => pendingRow, findMany: async () => [{ riderId: "r2" }, { riderId: "r3" }], updateMany: attemptUpdateMany },
        orderEvent: { create: async () => ({}) },
        rider: goodRider,
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
    expect(gateway.emitDispatchOfferClosed).toHaveBeenCalledWith("r2", orderId);
    expect(gateway.emitDispatchOfferClosed).toHaveBeenCalledWith("r3", orderId);
    expect(gateway.emitDispatchOfferClosed).not.toHaveBeenCalledWith("r1", orderId);
    expect(gateway.emitOrderStatus).toHaveBeenCalledWith(orderId, "assigned");
    expect(gateway.emitFoodQueueChanged).toHaveBeenCalledWith(MERCHANT_ID, orderId);
    expect(notified.map((n) => n.profileIds)).toEqual([["r1"], ["cust-1"]]);
  });

  it("owner 2026-10-12: refuses a biker whose balance doesn't cover 10% of the delivery fee — nothing is written", async () => {
    vi.stubEnv("COMMISSION_RATE_PCT", "10");
    const orderUpdateMany = vi.fn(async () => ({ count: 1 }));
    const { svc } = build(
      {
        order: { findFirst: async () => ({ ...liveOrder, deliveryFee: 3 }), updateMany: orderUpdateMany, findMany: async () => [] },
        foodDispatchAttempt: { findUnique: async () => pendingRow },
        rider: { findMany: async () => [{ profileId: "r1", tripsCount: 30 }], findUnique: goodRider.findUnique },
        commissionAccount: { findMany: async () => [{ riderId: "r1", balance: 0.29 }] },
      },
      NONE,
    );
    await expect(svc.acceptDispatch(orderId, "r1")).rejects.toMatchObject({ response: { reason: "commission_low_balance" } });
    expect(orderUpdateMany).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });

  it("409s the second biker to accept: the first already took it (lost CAS)", async () => {
    const { svc } = build(
      { order: { findFirst: async () => liveOrder, updateMany: async () => ({ count: 0 }) }, foodDispatchAttempt: { findUnique: async () => pendingRow }, rider: goodRider },
      NONE,
    );
    await expect(svc.acceptDispatch(orderId, "r2")).rejects.toThrow(/no longer live/i);
  });

  it("403s a biker this order was never offered to", async () => {
    const { svc } = build({ order: { findFirst: async () => liveOrder }, foodDispatchAttempt: { findUnique: async () => null } }, NONE);
    await expect(svc.acceptDispatch(orderId, "someone-else")).rejects.toThrow(/isn't yours/i);
  });

  it("409s a biker whose offer is no longer pending (their round closed, or they passed)", async () => {
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

  it("409s (not 500) on the one_active_ride race — the biker got assigned to another job first", async () => {
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
        rider: goodRider,
      },
      NONE,
    );
    const err = await svc.acceptDispatch(orderId, "r1").catch((e: unknown) => e);
    expect((err as Error).message).toMatch(/another active job/i);
    // Structured like every other refusal, so the app can branch on the tag.
    expect((err as { getResponse: () => unknown }).getResponse()).toMatchObject({ reason: "one_active_ride" });
  });

  it("403s { reason: own_order } when the accepting biker is the order's own customer — nothing claimed", async () => {
    const orderUpdateMany = vi.fn(async () => ({ count: 1 }));
    const { svc } = build(
      {
        order: { findFirst: async () => ({ ...liveOrder, customerId: "r1" }), updateMany: orderUpdateMany },
        foodDispatchAttempt: { findUnique: async () => pendingRow },
        rider: goodRider,
      },
      NONE,
    );
    const err = await svc.acceptDispatch(orderId, "r1").catch((e: unknown) => e);
    expect((err as { getStatus: () => number }).getStatus()).toBe(403);
    expect((err as { getResponse: () => unknown }).getResponse()).toMatchObject({ reason: "own_order" });
    expect(orderUpdateMany).not.toHaveBeenCalled();
  });

  it.each([
    [{ kycStatus: "expired", accountStatus: "active", onHold: false, cooldownUntil: null }, "kyc_expired"],
    [{ kycStatus: "verified", accountStatus: "suspended", onHold: false, cooldownUntil: null }, "suspended"],
    [{ kycStatus: "verified", accountStatus: "active", onHold: true, cooldownUntil: null }, "on_hold"],
    [{ kycStatus: "verified", accountStatus: "active", onHold: false, cooldownUntil: new Date(Date.now() + 60_000) }, "cooldown"],
  ])("re-runs the online gate at accept: a rider demoted mid-round is refused (%o → %s)", async (standing, reason) => {
    const orderUpdateMany = vi.fn(async () => ({ count: 1 }));
    const { svc } = build(
      {
        order: { findFirst: async () => liveOrder, updateMany: orderUpdateMany },
        foodDispatchAttempt: { findUnique: async () => pendingRow },
        rider: { findUnique: async () => standing },
      },
      NONE,
    );
    const err = await svc.acceptDispatch(orderId, "r1").catch((e: unknown) => e);
    expect((err as { getStatus: () => number }).getStatus()).toBe(403);
    expect((err as { getResponse: () => unknown }).getResponse()).toMatchObject({ reason, message: expect.any(String) });
    expect(orderUpdateMany).not.toHaveBeenCalled();
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

  it("marks the biker's row declined (off this order for the cooldown); the round stays live for the others", async () => {
    const { svc, gateway, orderUpdate, orderUpdateMany, attemptUpdateMany } = world(3);
    expect(await svc.declineDispatch(orderId, "r1")).toEqual({ orderId, declined: true });
    expect(attemptUpdateMany).toHaveBeenCalledWith({ where: { orderId, riderId: "r1", outcome: "pending" }, data: expect.objectContaining({ outcome: "declined" }) });
    // Not pushed into dispatchExcludedRiderIds (that list is for drops): the declined row is the cooldown.
    expect(orderUpdate).not.toHaveBeenCalled();
    expect(orderUpdateMany).not.toHaveBeenCalled();
    expect(gateway.emitDispatchOfferClosed).toHaveBeenCalledWith("r1", orderId);
  });

  it("closes the round at once when the last biker still deciding passes", async () => {
    const { svc, orderUpdateMany } = world(0);
    await svc.declineDispatch(orderId, "r1");
    expect(orderUpdateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: orderId, status: "open_for_offers", dispatchOfferExpiresAt: roundEnd }, data: expect.objectContaining({ status: "requested" }) }),
    );
  });

  it("403s a biker this order was never offered to", async () => {
    const { svc } = build({ order: { findFirst: async () => liveOrder }, foodDispatchAttempt: { findUnique: async () => null } }, NONE);
    await expect(svc.declineDispatch(orderId, "r2")).rejects.toThrow(/isn't yours/i);
  });
});

describe("FoodDispatchService.dropDispatch — D-33 pre-pickup only", () => {
  // Dropping is not passing: a rider who dropped an accepted job stays off this order (no cooldown).
  it("re-dispatches in place: requested/ready_for_pickup, biker cleared, excluded, fresh budget, strike applied", async () => {
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
    // The dropped rider's sockets leave the order room after the commit (the next rider's position and
    // the order's status no longer reach them).
    expect(gateway.evictFromOrderRoom).toHaveBeenCalledWith("r1", orderId);
    expect(gateway.emitFoodQueueChanged).toHaveBeenCalledWith(MERCHANT_ID, orderId); // C5: merchant sees the drop without waiting for the poll
  });

  it("forces the biker offline + cooldown on the CANCEL_STRIKE_LIMIT-th drop (mirrors order-lifecycle cancel)", async () => {
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
    const { svc, gateway } = build(
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
    expect(gateway.evictFromOrderRoom).not.toHaveBeenCalled(); // nothing committed — the rider keeps the room
  });
});

describe("FoodDispatchService.getOfferForRider — C5 biker offer alarm channel (poll/reconnect fallback)", () => {
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

  it("returns the biker's own live offer, redacted, soonest to run out first", async () => {
    const findMany = vi.fn(async () => [liveRow]);
    const { svc } = build({ foodDispatchAttempt: { findMany } }, NONE);
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
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ riderId: "r1", outcome: "pending", order: { orderType: "merchant", status: "open_for_offers" } }),
        orderBy: { expiresAt: "asc" },
        take: 1,
      }),
    );
  });

  it("returns null when this biker holds no live offer", async () => {
    const { svc } = build({ foodDispatchAttempt: { findMany: async () => [] } }, NONE);
    await expect(svc.getOfferForRider("r1")).resolves.toBeNull();
  });

  // Owner 2026-10-12: several orders can ring one rider at once — the screen opened from one must show THAT one.
  it("pins the read to one order when asked", async () => {
    const findMany = vi.fn(async () => [liveRow]);
    const { svc } = build({ foodDispatchAttempt: { findMany } }, NONE);
    await svc.getOfferForRider("r1", orderId);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ riderId: "r1", orderId }), take: 1 }));
  });
});

describe("FoodDispatchService.getOffersForRider — every food job ringing the rider (owner 2026-10-12)", () => {
  const row = (id: string, inMs: number) => ({
    expiresAt: new Date(Date.now() + inMs),
    order: { id, merchantId: MERCHANT_ID, pickup: PICKUP, dropoff: DROPOFF, itemDesc: "Sadza", merchantGoodsTotal: 10, deliveryFee: 2, distanceKm: 2 },
  });
  const second = "00000000-0000-4000-8000-0000000000b2";

  it("lists every live offer, soonest to run out first", async () => {
    const findMany = vi.fn(async (_a: { where: Record<string, unknown> }) => [row(orderId, 20_000), row(second, 50_000)]);
    const { svc } = build({ foodDispatchAttempt: { findMany } }, NONE);
    const offers = await svc.getOffersForRider("r1");
    expect(offers.map((o) => o.orderId)).toEqual([orderId, second]);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: expect.objectContaining({ riderId: "r1", outcome: "pending", order: { orderType: "merchant", status: "open_for_offers" } }),
        orderBy: { expiresAt: "asc" },
      }),
    );
    expect(findMany.mock.calls[0][0].where).not.toHaveProperty("orderId");
  });

  it("is empty when nothing is ringing", async () => {
    const { svc } = build({ foodDispatchAttempt: { findMany: async () => [] } }, NONE);
    await expect(svc.getOffersForRider("r1")).resolves.toEqual([]);
  });
});

describe("FoodDispatchService — merchant D-34 hold-screen decisions", () => {
  it("resumeSearch clears the hold, resets the attempt budget and ends every pass's cooldown — drops stay excluded", async () => {
    const updateMany = vi.fn(async (_a: { where: Record<string, unknown>; data: Record<string, unknown> }) => ({ count: 1 }));
    const attemptUpdateMany = vi.fn(async () => ({ count: 2 }));
    const { svc } = build(
      { merchant: { findUnique: async () => ({ id: "m1" }) }, order: { updateMany }, foodDispatchAttempt: { updateMany: attemptUpdateMany } },
      NONE,
    );
    const res = await svc.resumeSearch("owner-1", orderId);
    expect(res).toEqual({ orderId, resumed: true });
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { noRiderHoldAt: null, dispatchAttempt: 0, dispatchStartedAt: null, dispatchNextCheckAt: null } }),
    );
    expect(updateMany.mock.calls[0]![0].data).not.toHaveProperty("dispatchExcludedRiderIds");
    expect(attemptUpdateMany).toHaveBeenCalledWith({ where: { orderId, outcome: "declined" }, data: { outcome: "expired" } });
  });

  it("resumeSearch 409s when the order isn't actually on hold, and leaves the passes alone", async () => {
    const attemptUpdateMany = vi.fn(async () => ({ count: 0 }));
    const { svc } = build(
      { merchant: { findUnique: async () => ({ id: "m1" }) }, order: { updateMany: async () => ({ count: 0 }) }, foodDispatchAttempt: { updateMany: attemptUpdateMany } },
      NONE,
    );
    await expect(svc.resumeSearch("owner-1", orderId)).rejects.toThrow(/waiting on a biker decision/i);
    expect(attemptUpdateMany).not.toHaveBeenCalled();
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

  it("past the NO_RIDER cap while still cooking: parks until the ready time, counted past the cap — no D-34 hold on food that isn't ready", async () => {
    const { svc, orderUpdateMany } = world(cookingOrder(3, { dispatchAttempt: 6 }), pick([]));
    expect(await svc.sweepSearch()).toEqual({ offered: 0, held: 0 });
    const park = orderUpdateMany.mock.calls[0]![0];
    expect(park.where).toMatchObject({ merchantPhase: "preparing", dispatchAttempt: 6, noRiderHoldAt: null });
    expect(park.data).not.toHaveProperty("noRiderHoldAt");
    // The marker the ready-time tick reads: only this park writes the count past the cap.
    expect(park.data).toMatchObject({ dispatchAttempt: RESTAURANTS_DISPATCH.maxAttempts + 1 });
    expect((park.data.dispatchNextCheckAt as Date).getTime()).toBeGreaterThan(Date.now() + 2 * MIN);
    expect(notified).toEqual([]);
  });

  // Owner 2026-10-12: before, the order kept its spent count and went straight into the hold the moment
  // it was ready, with no search after the food was actually ready.
  it("once ready, an order whose budget ran out while cooking gets a fresh budget instead of the hold", async () => {
    const readyAfterCooking = baseOrder({ dispatchAttempt: RESTAURANTS_DISPATCH.maxAttempts + 1, dispatchStartedAt: new Date(Date.now() - 15 * MIN) });
    const orderUpdateMany = vi.fn(async (_args: { where: Record<string, unknown>; data: Record<string, unknown> }) => ({ count: 1 }));
    const strategy = pick(one("r1"));
    const { svc } = build(
      {
        order: { findMany: async () => [{ id: orderId }], findUnique: async () => readyAfterCooking, updateMany: orderUpdateMany },
        merchant: { findUnique: async () => ({ location: { point: HARARE_CBD } }) },
        orderEvent: { create: async () => ({}) },
        foodDispatchAttempt: { upsert: vi.fn(async () => ({})), findMany: async () => [], updateMany: async () => ({ count: 0 }) },
      },
      strategy,
    );
    const before = Date.now();
    expect(await svc.sweepSearch()).toEqual({ offered: 1, held: 0 });
    expect(strategy.pickCandidates).toHaveBeenCalledWith(expect.objectContaining({ limit: RESTAURANTS_DISPATCH.firstRoundSize }));
    const claim = orderUpdateMany.mock.calls[0]![0];
    expect(claim.where).toMatchObject({ merchantPhase: "ready_for_pickup", dispatchAttempt: RESTAURANTS_DISPATCH.maxAttempts + 1, noRiderHoldAt: null });
    expect(claim.data).toMatchObject({ status: "open_for_offers", dispatchAttempt: 1 });
    expect(claim.data).not.toHaveProperty("noRiderHoldAt");
    expect((claim.data.dispatchStartedAt as Date).getTime()).toBeGreaterThanOrEqual(before);
  });

  it("…and with nobody around it searches its fresh rounds, holding only after they run out too", async () => {
    const orderUpdateMany = vi.fn(async (_args: { where: Record<string, unknown>; data: Record<string, unknown> }) => ({ count: 1 }));
    const { svc } = build(
      {
        order: { findMany: async () => [{ id: orderId }], findUnique: async () => baseOrder({ dispatchAttempt: RESTAURANTS_DISPATCH.maxAttempts + 1 }), updateMany: orderUpdateMany },
        merchant: { findUnique: async () => ({ location: { point: HARARE_CBD } }) },
      },
      pick([]),
    );
    expect(await svc.sweepSearch()).toEqual({ offered: 0, held: 0 });
    expect(orderUpdateMany.mock.calls[0]![0].data).toMatchObject({ dispatchAttempt: 1, dispatchNextCheckAt: expect.any(Date) });
    expect(notified).toEqual([]);
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
    expect(gateway.emitDispatchOfferClosed).toHaveBeenCalledWith("r1", orderId);
    expect(gateway.emitDispatchOfferClosed).toHaveBeenCalledWith("r2", orderId);
    expect(gateway.emitFoodOffer).not.toHaveBeenCalled();
    expect(notified).toEqual([]);
  });

  it("sweepOrphanedOffers: expires stale pending offers on orders no longer offering — never the biker the order went to", async () => {
    const attemptFindMany = vi.fn(async () => [
      { id: "a1", orderId, riderId: "r1", order: { riderId: null } }, // cancelled order
      { id: "a2", orderId: "o2", riderId: "winner", order: { riderId: "winner" } }, // accept still marking its own row
    ]);
    const attemptUpdateMany = vi.fn(async () => ({ count: 1 }));
    const { svc, gateway } = build({ foodDispatchAttempt: { findMany: attemptFindMany, updateMany: attemptUpdateMany } }, NONE);
    const now = new Date();
    expect(await svc.sweepOrphanedOffers(now)).toEqual({ expired: 1 });
    expect(attemptFindMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { outcome: "pending", expiresAt: { lt: now }, order: { orderType: "merchant", status: { not: "open_for_offers" } } } }),
    );
    expect(attemptUpdateMany).toHaveBeenCalledWith({ where: { id: { in: ["a1"] }, outcome: "pending" }, data: { outcome: "expired", respondedAt: now } });
    expect(gateway.emitDispatchOfferClosed).toHaveBeenCalledTimes(1);
    expect(gateway.emitDispatchOfferClosed).toHaveBeenCalledWith("r1", orderId);
  });
});

describe("FoodDispatchService.acceptDispatch — MJ-RM1: a biker found early leaves the cooking ticket alone", () => {
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

  it("MJ-RM2: clears the dropped biker's counter state — arrival, ETA, pickup photo and seal — in the same guarded write", async () => {
    const { svc, orderUpdateMany } = world({ status: "en_route_pickup", merchantPhase: null, dispatchExcludedRiderIds: [], merchantId: MERCHANT_ID });
    await svc.dropDispatch(orderId, "r1");
    expect(orderUpdateMany.mock.calls[0]![0]).toMatchObject({
      where: { id: orderId, status: "en_route_pickup", riderId: "r1", merchantPhase: null },
      data: { merchantPhase: "ready_for_pickup", riderArrivedAt: null, riderEtaAt: null, pickupPhotoKey: null, pickupPhotoAt: null, pickupBagSealed: null },
    });
  });

  it("MJ-RM1: a biker found early drops while the kitchen is still cooking — it stays 'preparing', not 'ready'", async () => {
    const { svc, orderUpdateMany } = world({ status: "assigned", merchantPhase: "preparing", dispatchExcludedRiderIds: [], merchantId: MERCHANT_ID });
    await svc.dropDispatch(orderId, "r1");
    expect(orderUpdateMany.mock.calls[0]![0]).toMatchObject({ where: { merchantPhase: "preparing" }, data: { status: "requested", merchantPhase: "preparing" } });
  });
});

/** D2 (owner 2026-10-07): the food order's delivery code is sealed next to its hash at accept, so the
 *  customer's reveal (OrderLifecycleService.revealDeliveryCode) is repeatable; a drop clears both. */
describe("FoodDispatchService — D2 sealed delivery code", () => {
  const pii = new PiiCryptoService({ PII_ENCRYPTION_KEY: "food-dispatch-d2-pii-key-0123456789abcdef" } as Env);

  it("acceptDispatch stores the minted code sealed next to its hash", async () => {
    const orderUpdateMany = vi.fn(async (_a: { where: Record<string, unknown>; data: Record<string, unknown> }) => ({ count: 1 }));
    const { svc } = build(
      {
        order: { findFirst: async () => liveOrder, updateMany: orderUpdateMany, findUnique: async () => ({ customerId: "cust-1" }) },
        foodDispatchAttempt: { findUnique: async () => pendingRow, findMany: async () => [], updateMany: vi.fn(async () => ({ count: 1 })) },
        orderEvent: { create: async () => ({}) },
      },
      NONE,
      fakeGateway(),
      pii,
    );
    await svc.acceptDispatch(orderId, "r1");
    const data = orderUpdateMany.mock.calls[0]![0].data;
    const code = pii.decryptCode(data.otpCipher as string, `delivery:${orderId}`);
    expect(code).toMatch(/^\d{6}$/);
    expect(data.otpHash).toBe(tokens.hash(code!));
  });

  const dropHarness = (pickupCodeAttempts: number) => {
    const orderUpdateMany = vi.fn(async (_a: { where: Record<string, unknown>; data: Record<string, unknown> }) => ({ count: 1 }));
    const { svc } = build(
      {
        order: {
          findFirst: async () => ({ status: "assigned", merchantPhase: null, dispatchExcludedRiderIds: [], merchantId: MERCHANT_ID, pickupCodeAttempts }),
          updateMany: orderUpdateMany,
          findUnique: async () => ({ customerId: "cust-1" }),
        },
        orderEvent: { create: async () => ({}) },
        rider: { findUnique: async () => ({ cancelStrikes: 0, reliabilityScore: 100, onHold: false, heldReason: null, cooldownUntil: null }), update: async () => ({}) },
      },
      NONE,
      fakeGateway(),
      pii,
    );
    return { svc, orderUpdateMany };
  };

  it("dropDispatch clears the delivery ciphertext with the hash; with no pickup try spent the pickup code and tries stay", async () => {
    const { svc, orderUpdateMany } = dropHarness(0);
    await svc.dropDispatch(orderId, "r1");
    const { where, data } = orderUpdateMany.mock.calls[0]![0];
    expect(data).toMatchObject({ otpHash: null, otpCipher: null });
    expect(data).not.toHaveProperty("pickupCodeHash");
    expect(data).not.toHaveProperty("pickupCodeCipher");
    expect(data).not.toHaveProperty("pickupCodeAttempts");
    expect(where).toMatchObject({ pickupCodeAttempts: 0 });
  });

  // D2 second review F2: resetting the tries on the SAME code handed each new (colluding) rider 5 more guesses.
  it("a drop after spent pickup tries mints a NEW pickup code (AAD-bound) with the tries at 0 — not counted as a re-issue", async () => {
    const { svc, orderUpdateMany } = dropHarness(3);
    await svc.dropDispatch(orderId, "r1");
    const { where, data } = orderUpdateMany.mock.calls[0]![0];
    expect(where).toMatchObject({ pickupCodeAttempts: 3 });
    expect(data).toMatchObject({ pickupCodeAttempts: 0 });
    const code = pii.decryptCode(data.pickupCodeCipher as string, `pickup:${orderId}`);
    expect(code).toMatch(/^\d{6}$/);
    expect(data.pickupCodeHash).toBe(tokens.hash(code!));
    expect(data).not.toHaveProperty("pickupCodeReissues");
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
    expect(strategy.pickCandidates).toHaveBeenCalledWith(expect.objectContaining({ excludeRiderIds: ["passed", "cust-1", "cashier", "owner"] }));
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

  // Own bikers (D-117): the round rings public bikers only, but a biker can join a fleet between ring and tap.
  // T9: an Own biker takes only their own business's app orders, and only while its fleet is on and not paused.
  it.each([
    ["another owner's business", { ownerProfileId: "owner-2" }, { enabled: true, pausedAt: null }],
    ["their business, fleet paused", { ownerProfileId: "owner-1" }, { enabled: true, pausedAt: new Date() }],
    ["their business, fleet switched off", { ownerProfileId: "owner-1" }, { enabled: false, pausedAt: null }],
  ])("acceptDispatch refuses 403 fleet_scope an Own biker on %s, and nothing is written", async (_label, merchant, fleet) => {
    const orderUpdateMany = vi.fn(async () => ({ count: 1 }));
    const { svc } = build(
      {
        order: { findFirst: async () => liveOrder, updateMany: orderUpdateMany },
        foodDispatchAttempt: { findUnique: async () => pendingRow },
        merchant: { findUnique: async () => merchant },
        ownerFleet: { findUnique: async () => fleet },
        rider: {
          findUnique: async () => ({ kycStatus: "verified", accountStatus: "active", onHold: false, cooldownUntil: null, fleetOwnerProfileId: "owner-1" }),
        },
      },
      NONE,
    );
    await expect(svc.acceptDispatch(orderId, "r1")).rejects.toMatchObject({ status: 403, response: { reason: "fleet_scope" } });
    expect(orderUpdateMany).not.toHaveBeenCalled();
  });

  // The plan's gap (own-bikers.md § Food dispatch): the round applies the merchant-debt soft-lock, the tap didn't.
  it("acceptDispatch refuses a biker whose venue cash debt opened between ring and tap, and nothing is written", async () => {
    const orderUpdateMany = vi.fn(async () => ({ count: 1 }));
    const { svc, prisma } = build(
      { order: { findFirst: async () => liveOrder, updateMany: orderUpdateMany }, foodDispatchAttempt: { findUnique: async () => pendingRow } },
      NONE,
    );
    // build() answers the debt read with "none"; this test models an open obligation instead.
    (prisma.order as Record<string, unknown>).findFirst = async (args: { where?: { riderId?: unknown } }) =>
      args?.where?.riderId !== undefined ? { id: "debt-order" } : liveOrder;
    await expect(svc.acceptDispatch(orderId, "r1")).rejects.toThrow(/still settling with a restaurant/i);
    expect(orderUpdateMany).not.toHaveBeenCalled();
  });

  it("acceptDispatch turns the database guard's commit-time refusal (a Join raced the tap) into 409 fleet_scope", async () => {
    const { svc } = build(
      {
        order: {
          findFirst: async () => liveOrder,
          updateMany: async () => {
            throw new Error("fleet_scope: rider r1 is outside the scope of order o1");
          },
        },
        foodDispatchAttempt: { findUnique: async () => pendingRow },
      },
      NONE,
    );
    await expect(svc.acceptDispatch(orderId, "r1")).rejects.toMatchObject({ status: 409, response: { reason: "fleet_scope" } });
  });
});
