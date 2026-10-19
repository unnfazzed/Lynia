/**
 * Own bikers T3b (D-117): "My bikers" bookings on a real PostGIS (needs DATABASE_URL). A booking rings only the
 * owner's online bikers, in rounds; the first to accept takes it; an accept and "Send to any biker" race on one
 * row and exactly one wins; a biker who gives a booking back costs them nothing and it rings the others again.
 */
import { FLEET_DISPATCH, type CreateFleetBookingRequest } from "@lynia/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { TokenService } from "../auth/token.service";
import { FLEET_DROP_ACTION } from "../common/fleet-scope";
import { recordFleetRide } from "../common/fleet-ledger";
import { PiiCryptoService } from "../common/pii-crypto.service";
import type { Env } from "../config/env";
import type { MatchingService } from "../matching/matching.service";
import type { OfferExpiryService } from "../matching/offer-expiry.service";
import type { NotificationsService } from "../notifications/notifications.service";
import { MetricsService } from "../observability/metrics.service";
import type { OffersService } from "../offers/offers.service";
import { OrderLifecycleService } from "../orders/order-lifecycle.service";
import { OrdersService } from "../orders/orders.service";
import { PrismaService } from "../prisma/prisma.service";
import type { TrackingGateway } from "../tracking/tracking.gateway";
import { TrackingService } from "../tracking/tracking.service";
import { WalletService } from "../wallet/wallet.service";
import { NearestRiderDispatchStrategy } from "./dispatch-strategy";
import { marketplaceFleetFee } from "./fleet-candidates";
import { FleetDispatchService } from "./fleet-dispatch.service";
import { FoodDispatchService } from "./food-dispatch.service";
import { PREFERRED_RETIRED_NOTE, PreferredRetirementService } from "./preferred-retirement.service";
import { FleetAdminService } from "./fleet-admin.service";
import { FleetLedgerService } from "./fleet-ledger.service";
import { FleetService } from "./fleet.service";
import type { MerchantAccess } from "./merchant-access";
import { MerchantBookingService } from "./merchant-booking.service";

const FLAGS_OFF = { RESTAURANTS_ENABLED: "false", MERCHANT_DISPATCH_AUTO_ENABLED: "false", MERCHANT_WALLET_ENABLED: "false" } as const;
const prisma = new PrismaService();
const tokens = new TokenService({ JWT_SIGNING_SECRET: "int-test-secret-0123456789", ACCESS_TTL_SECONDS: 900, ...FLAGS_OFF } as Env);
const codeCrypto = new PiiCryptoService({ PII_ENCRYPTION_KEY: "fleet-dispatch-int-pii-key-0123456789ab" } as Env);
const tracking = new TrackingService({ REDIS_URL: undefined } as Env, prisma, new MetricsService());
const gateway = {
  emitFleetOffer: vi.fn(async () => {}),
  emitFleetOfferClosed: vi.fn(async () => {}),
  emitFoodOffer: vi.fn(async () => {}),
  emitDispatchOfferClosed: vi.fn(async () => {}),
  emitFoodQueueChanged: vi.fn(),
  emitOrderStatus: vi.fn(),
  emitBidExpired: vi.fn(),
  emitJobCancelled: vi.fn(),
  evictFromOrderRoom: vi.fn(async () => {}),
  evictRiderFromSupply: vi.fn(async () => {}),
  safeEmitBoardNewOrder: vi.fn(),
  emitBoardNewOrder: vi.fn(),
};
const notifications = { notifyProfiles: vi.fn(async () => new Set<string>()), notifyNewBroadcast: vi.fn(async () => {}), notifyOrderStatus: vi.fn(async () => {}) };
const expiry = { schedule: vi.fn(async () => {}) };
const orders = new OrdersService(prisma, expiry as unknown as OfferExpiryService, tracking, notifications as unknown as NotificationsService, gateway as unknown as TrackingGateway);
const lifecycle = new OrderLifecycleService(
  { ...FLAGS_OFF } as Env,
  prisma,
  tokens,
  gateway as unknown as TrackingGateway,
  notifications as unknown as NotificationsService,
  orders,
  new WalletService({ ...FLAGS_OFF } as Env, prisma),
  undefined,
  undefined,
  undefined,
  codeCrypto,
);
// T9: the food rounds, with the real nearest-biker strategy over the real tracking (PG path, public bikers only).
const food = new FoodDispatchService(
  prisma,
  tokens,
  notifications as unknown as NotificationsService,
  gateway as unknown as TrackingGateway,
  new NearestRiderDispatchStrategy(tracking, prisma),
  codeCrypto,
);
const dispatch = new FleetDispatchService(prisma, notifications as unknown as NotificationsService, gateway as unknown as TrackingGateway, orders, food);
const alerts = { notify: vi.fn() };
const ledger = new FleetLedgerService(prisma, alerts as never);
const admin = new FleetAdminService(prisma, notifications as unknown as NotificationsService, gateway as unknown as TrackingGateway, dispatch, ledger);
const fleetSvc = new FleetService(prisma, gateway as unknown as TrackingGateway, notifications as unknown as NotificationsService);
const bookings = new MerchantBookingService(
  prisma,
  orders,
  { listForOrder: async () => [] } as unknown as OffersService,
  {} as MatchingService,
  lifecycle,
  dispatch,
  tokens,
  codeCrypto,
);

const AVONDALE = { lat: -17.8, lng: 31.04 };
const FAR = { lat: -17.86, lng: 31.1 };
const BOOK: CreateFleetBookingRequest = {
  dropoff: { point: { lat: -17.81, lng: 31.05 }, landmark: "22 King George Rd", contactPhone: "+263771234567" },
  items: [{ description: "2 piece meal", quantity: 1 }],
  declaredValue: 12,
  disclaimerVersion: "merchant-booking",
  idempotencyKey: "00000000-0000-4000-8000-000000000001",
  collectCash: true,
};
let key = 1;
const book = (over: Partial<CreateFleetBookingRequest> = {}): CreateFleetBookingRequest => ({
  ...BOOK,
  idempotencyKey: `00000000-0000-4000-8000-${String(++key).padStart(12, "0")}`,
  ...over,
});

async function clean(): Promise<void> {
  await prisma.auditLog.deleteMany({ where: { action: { startsWith: "merchant.fleet." } } });
  await prisma.auditLog.deleteMany({ where: { action: { startsWith: "merchant.preferred." } } });
  await prisma.merchantPreferredRider.deleteMany({});
  await prisma.foodDispatchAttempt.deleteMany({});
  await prisma.merchantFleetLedger.deleteMany({});
  await prisma.merchantFleetStatement.deleteMany({});
  await prisma.fleetInvite.deleteMany({});
  await prisma.commissionLedger.deleteMany({});
  await prisma.commissionAccount.deleteMany({});
  await prisma.merchantBooking.deleteMany({});
  await prisma.orderEvent.deleteMany({});
  await prisma.offer.deleteMany({});
  await prisma.order.deleteMany({});
  await prisma.merchantMember.deleteMany({});
  await prisma.rider.deleteMany({});
  await prisma.ownerFleet.deleteMany({});
  await prisma.merchant.deleteMany({});
  await prisma.profile.deleteMany({});
}

async function profile(role: "customer" | "rider" | "merchant", firstName = "T"): Promise<string> {
  const p = await prisma.profile.create({ data: { role, firstName, lastName: "T", phone: `x_${crypto.randomUUID()}` }, select: { id: true } });
  return p.id;
}

type Fleet = { ownerId: string; branchId: string; access: MerchantAccess };

async function fleetOwner(opts: { paused?: boolean; enabled?: boolean } = {}): Promise<Fleet> {
  const ownerId = await profile("merchant", "Owner");
  await prisma.ownerFleet.create({
    data: { ownerProfileId: ownerId, enabled: opts.enabled ?? true, rideFee: 1.5, pausedAt: opts.paused ? new Date() : null },
  });
  const m = await prisma.merchant.create({
    data: { name: "Chicken Inn Avondale", ownerProfileId: ownerId, location: { point: AVONDALE, landmark: "Avondale shops", contactPhone: "+263770000001" } },
    select: { id: true },
  });
  await prisma.merchantMember.create({ data: { merchantId: m.id, profileId: ownerId, role: "owner", displayName: "Owner" } });
  return { ownerId, branchId: m.id, access: { merchantId: m.id, role: "owner", businessType: "restaurant" } as MerchantAccess };
}

/** A verified biker with a fresh fix at `at`; one of `fleet`'s when given, else public. */
async function biker(opts: { fleet?: Fleet; online?: boolean; at?: { lat: number; lng: number } } = {}): Promise<string> {
  const id = await profile("rider", "Biker");
  await prisma.rider.create({
    data: {
      profileId: id,
      bikeReg: "ABZ 0000",
      kycStatus: "verified",
      isOnline: true,
      fleetOwnerProfileId: opts.fleet?.ownerId ?? null,
      fleetHomeMerchantId: opts.fleet?.branchId ?? null,
      fleetJoinedAt: opts.fleet ? new Date() : null,
    },
  });
  const at = opts.at ?? AVONDALE;
  await tracking.updateRiderLocation(id, at.lat, at.lng);
  if (opts.online === false) await prisma.rider.update({ where: { profileId: id }, data: { isOnline: false } });
  return id;
}

const pendingFor = async (orderId: string) =>
  (await prisma.foodDispatchAttempt.findMany({ where: { orderId, outcome: "pending" }, select: { riderId: true } })).map((r) => r.riderId).sort();
/** End the live round now, as the clock would. */
const endRound = (orderId: string) =>
  prisma.order.update({ where: { id: orderId }, data: { dispatchOfferExpiresAt: new Date(Date.now() - 1000), dispatchNextCheckAt: new Date(Date.now() - 1000) } });

beforeAll(async () => {
  await prisma.$connect();
});
beforeEach(async () => {
  await clean();
  vi.clearAllMocks();
});
afterAll(async () => {
  await clean();
  await prisma.$disconnect();
});

describe("Ring my bikers (create + first round)", () => {
  it("makes one order + booking at fleet_searching with no fare and the fee snapshot, and rings only the owner's online bikers", async () => {
    const f = await fleetOwner();
    const near = await biker({ fleet: f });
    const far = await biker({ fleet: f, at: FAR });
    await biker({ fleet: f, online: false });
    const publicBiker = await biker();
    const other = await fleetOwner();
    await biker({ fleet: other });

    const res = await bookings.createFleet(f.access, f.ownerId, book());
    const order = await prisma.order.findUniqueOrThrow({ where: { id: res.booking.id } });
    expect(order).toMatchObject({ status: "fleet_searching", fleetMerchantId: f.branchId, riderId: null, orderType: "parcel" });
    expect(Number(order.proposedFare)).toBe(0);
    expect(Number(order.fleetFee)).toBe(1.5);
    expect(order.otpHash).toBe(tokens.hash(res.deliveryCode));
    expect(await prisma.merchantBooking.count({ where: { orderId: order.id, merchantId: f.branchId, collectCash: true } })).toBe(1);

    expect(await pendingFor(order.id)).toEqual([near, far].sort());
    expect(await pendingFor(order.id)).not.toContain(publicBiker);
    expect(res.booking).toMatchObject({ state: "finding", fleet: { state: "ringing", rung: 2 } });
    expect(new Date(res.booking.fleet!.endsAt!).getTime() - Date.now()).toBeGreaterThan(FLEET_DISPATCH.rounds * FLEET_DISPATCH.roundMs - 10_000);
    expect(gateway.emitFleetOffer).toHaveBeenCalledTimes(2);

    // The biker's list: shop name, the cash to collect at the door, no fare anywhere.
    const offers = await dispatch.offersFor(near);
    expect(offers).toEqual([expect.objectContaining({ orderId: order.id, shop: "Chicken Inn Avondale", collect: "12.00" })]);
    expect(await dispatch.offersFor(publicBiker)).toEqual([]);
  });

  it("holds at once when none of the bikers is online (OB-M11), and a replay returns the same booking", async () => {
    const f = await fleetOwner();
    await biker({ fleet: f, online: false });
    const body = book();
    const res = await bookings.createFleet(f.access, f.ownerId, body);
    expect(res.booking.fleet).toEqual({ state: "none_online", rung: 0, endsAt: null });
    const again = await bookings.createFleet(f.access, f.ownerId, body);
    expect(again.booking.id).toBe(res.booking.id);
    expect(again.deliveryCode).toBe(res.deliveryCode);
    expect(await prisma.order.count()).toBe(1);
  });

  it("refuses a paused fleet (OB-M12) and a business without Own bikers", async () => {
    const paused = await fleetOwner({ paused: true });
    await expect(bookings.createFleet(paused.access, paused.ownerId, book())).rejects.toMatchObject({ response: { reason: "fleet_paused" } });
    const off = await fleetOwner({ enabled: false });
    await expect(bookings.createFleet(off.access, off.ownerId, book())).rejects.toMatchObject({ response: { reason: "fleet_off" } });
    expect(await prisma.order.count()).toBe(0);
  });
});

describe("accept, decline and the rounds", () => {
  it("the first to accept takes it; the other's offer closes and a late accept is told it's gone", async () => {
    const f = await fleetOwner();
    const a = await biker({ fleet: f });
    const b = await biker({ fleet: f });
    const { booking } = await bookings.createFleet(f.access, f.ownerId, book());
    await dispatch.accept(booking.id, a);
    const order = await prisma.order.findUniqueOrThrow({ where: { id: booking.id } });
    expect(order).toMatchObject({ status: "assigned", riderId: a, fleetMerchantId: f.branchId });
    expect(await pendingFor(booking.id)).toEqual([]);
    expect(gateway.emitFleetOfferClosed).toHaveBeenCalledWith(b, booking.id);
    await expect(dispatch.accept(booking.id, b)).rejects.toMatchObject({ response: { reason: "offer_gone" } });
  });

  it("a biker who left the fleet since the ring can't accept", async () => {
    const f = await fleetOwner();
    const a = await biker({ fleet: f });
    const { booking } = await bookings.createFleet(f.access, f.ownerId, book());
    await prisma.rider.update({ where: { profileId: a }, data: { fleetOwnerProfileId: null, fleetHomeMerchantId: null, fleetJoinedAt: null } });
    await expect(dispatch.accept(booking.id, a)).rejects.toMatchObject({ response: { reason: "fleet_scope" } });
    expect((await prisma.order.findUniqueOrThrow({ where: { id: booking.id } })).riderId).toBeNull();
  });

  it("a pass ends the round when nobody else is deciding, and that biker isn't rung again this search; Try again asks them again", async () => {
    const f = await fleetOwner();
    const a = await biker({ fleet: f });
    const { booking } = await bookings.createFleet(f.access, f.ownerId, book());
    await dispatch.decline(booking.id, a);
    // The pass started the next round at once: nobody left to ring, so it counted as a quiet round.
    const after = await prisma.order.findUniqueOrThrow({ where: { id: booking.id } });
    expect(after.dispatchAttempt).toBe(2);
    expect(await pendingFor(booking.id)).toEqual([]);

    // The remaining rounds run out (quiet: the one biker passed): "None of your bikers took it".
    for (let round = 3; round <= FLEET_DISPATCH.rounds + 1; round++) {
      await endRound(booking.id);
      await dispatch.sweepRounds();
    }
    const held = await bookings.detail(f.access, booking.id);
    expect(held.fleet).toEqual({ state: "none_took", rung: 0, endsAt: null });
    expect(notifications.notifyProfiles).toHaveBeenCalledWith([f.ownerId], expect.objectContaining({ title: "None of your bikers took it" }));

    const retried = await bookings.fleetRetry(f.access, booking.id);
    expect(retried.fleet).toMatchObject({ state: "ringing", rung: 1 });
    expect(await pendingFor(booking.id)).toEqual([a]);
  });

  it(`rings ${FLEET_DISPATCH.rounds} rounds, re-ringing a biker who let one run out, then holds`, async () => {
    const f = await fleetOwner();
    const a = await biker({ fleet: f });
    const { booking } = await bookings.createFleet(f.access, f.ownerId, book());
    for (let round = 2; round <= FLEET_DISPATCH.rounds; round++) {
      await endRound(booking.id);
      expect((await dispatch.sweepRounds()).rung).toBe(1);
      expect(await pendingFor(booking.id)).toEqual([a]);
    }
    await endRound(booking.id);
    expect((await dispatch.sweepRounds()).held).toBe(1);
    expect((await bookings.detail(f.access, booking.id)).fleet?.state).toBe("none_took");
    expect(await pendingFor(booking.id)).toEqual([]);
  });
});

describe("a hold nobody acts on (E8)", () => {
  it(`ends as expired after ${FLEET_DISPATCH.holdExpireMs / 60_000} minutes and tells the booker; a fresh hold stays`, async () => {
    const f = await fleetOwner();
    const { booking } = await bookings.createFleet(f.access, f.ownerId, book()); // nobody online: held at once
    const fresh = await bookings.createFleet(f.access, f.ownerId, book());
    await prisma.order.update({ where: { id: booking.id }, data: { noRiderHoldAt: new Date(Date.now() - FLEET_DISPATCH.holdExpireMs - 1000) } });
    expect(await dispatch.sweepStaleHolds()).toEqual({ expired: 1 });
    expect((await bookings.detail(f.access, booking.id)).state).toBe("expired");
    expect((await bookings.detail(f.access, fresh.booking.id)).fleet?.state).toBe("none_online");
    expect(notifications.notifyProfiles).toHaveBeenCalledWith([f.ownerId], expect.objectContaining({ data: expect.objectContaining({ kind: "fleet_expired" }) }));
  });
});

describe("Send to any biker", () => {
  it("turns the same booking (same id, same code) into a public auction and closes the bikers' offers", async () => {
    const f = await fleetOwner();
    const a = await biker({ fleet: f });
    const { booking, deliveryCode } = await bookings.createFleet(f.access, f.ownerId, book());
    const res = await bookings.fleetConvert(f.access, f.ownerId, booking.id, 2.5);
    const order = await prisma.order.findUniqueOrThrow({ where: { id: booking.id } });
    expect(order).toMatchObject({ status: "open_for_offers", fleetMerchantId: null, fleetFee: null, otpHash: tokens.hash(deliveryCode) });
    expect(Number(order.proposedFare)).toBe(2.5);
    expect(order.offerWindowEndsAt!.getTime()).toBeGreaterThan(Date.now());
    expect(res.fleet).toBeUndefined();
    expect(await pendingFor(booking.id)).toEqual([]);
    await expect(dispatch.accept(booking.id, a)).rejects.toMatchObject({ response: { reason: "offer_gone" } });
    expect(await prisma.auditLog.count({ where: { action: "merchant.fleet.any_biker", target: booking.id } })).toBe(1);
  });

  it("loses to an accept that committed first: 409, and the biker keeps the job", async () => {
    const f = await fleetOwner();
    const a = await biker({ fleet: f });
    const { booking } = await bookings.createFleet(f.access, f.ownerId, book());
    await dispatch.accept(booking.id, a);
    await expect(bookings.fleetConvert(f.access, f.ownerId, booking.id, 2.5)).rejects.toMatchObject({ response: { reason: "already_taken" } });
    expect(await prisma.order.findUniqueOrThrow({ where: { id: booking.id } })).toMatchObject({ status: "assigned", riderId: a, fleetMerchantId: f.branchId });
  });

  it("an accept that read its offer before the conversion committed loses at the claim", async () => {
    const f = await fleetOwner();
    const a = await biker({ fleet: f });
    const { booking } = await bookings.createFleet(f.access, f.ownerId, book());
    // The accept's read happens, then the conversion commits, then the accept claims on what it read.
    const harness = dispatch as unknown as { liveOffer: (o: string, r: string) => Promise<unknown> };
    const live = await harness.liveOffer(booking.id, a);
    await bookings.fleetConvert(f.access, f.ownerId, booking.id, 2.5);
    const spy = vi.spyOn(harness, "liveOffer").mockResolvedValueOnce(live);
    await expect(dispatch.accept(booking.id, a)).rejects.toMatchObject({ response: { reason: "offer_gone" } });
    spy.mockRestore();
    expect(await prisma.order.findUniqueOrThrow({ where: { id: booking.id } })).toMatchObject({ status: "open_for_offers", riderId: null, fleetMerchantId: null });
  });

  it("races an accept on the same row: exactly one wins", async () => {
    for (let i = 0; i < 5; i++) {
      await clean();
      const f = await fleetOwner();
      const a = await biker({ fleet: f });
      const { booking } = await bookings.createFleet(f.access, f.ownerId, book());
      const [acc, conv] = await Promise.allSettled([dispatch.accept(booking.id, a), bookings.fleetConvert(f.access, f.ownerId, booking.id, 2.5)]);
      if (acc.status === "rejected" && conv.status === "rejected") throw new Error(`both lost: ${String(acc.reason)} / ${String(conv.reason)}`);
      expect([acc.status, conv.status].filter((s) => s === "fulfilled")).toHaveLength(1);
      const order = await prisma.order.findUniqueOrThrow({ where: { id: booking.id } });
      if (acc.status === "fulfilled") expect(order).toMatchObject({ status: "assigned", riderId: a, fleetMerchantId: f.branchId });
      else expect(order).toMatchObject({ status: "open_for_offers", riderId: null, fleetMerchantId: null });
    }
  });
});

describe("giving it back and cancelling", () => {
  it("an Own biker's drop puts it back to the owner's bikers with the code kept, no strike, and never rings them again", async () => {
    const f = await fleetOwner();
    const a = await biker({ fleet: f });
    const b = await biker({ fleet: f });
    const { booking, deliveryCode } = await bookings.createFleet(f.access, f.ownerId, book());
    await dispatch.accept(booking.id, a);
    await prisma.order.update({ where: { id: booking.id }, data: { status: "en_route_pickup" } });

    const res = await lifecycle.cancel(booking.id, a, "Puncture");
    expect(res).toMatchObject({ status: "fleet_searching", cancelledBy: "rider", cooldownUntil: null });
    const order = await prisma.order.findUniqueOrThrow({ where: { id: booking.id } });
    expect(order).toMatchObject({ status: "fleet_searching", riderId: null, fleetMerchantId: f.branchId, otpHash: tokens.hash(deliveryCode) });
    expect(Number(order.fleetFee)).toBe(1.5);
    expect(order.dispatchExcludedRiderIds).toEqual([a]);
    const rider = await prisma.rider.findUniqueOrThrow({ where: { profileId: a } });
    expect(rider.cancelStrikes).toBe(0);
    expect(await prisma.auditLog.count({ where: { action: "merchant.fleet.drop", actor: a, target: booking.id } })).toBe(1);
    expect(await prisma.order.count()).toBe(1); // no public re-broadcast clone

    await dispatch.sweepRounds();
    expect(await pendingFor(booking.id)).toEqual([b]);
    expect((await bookings.detail(f.access, booking.id)).fleet?.state).toBe("ringing");
  });

  it("the business cancels while it rings: cancelled, and the ringing bikers' offers close", async () => {
    const f = await fleetOwner();
    const a = await biker({ fleet: f });
    const { booking } = await bookings.createFleet(f.access, f.ownerId, book());
    const res = await bookings.cancel(f.access, f.ownerId, booking.id, "Buyer changed their mind");
    expect(res).toMatchObject({ state: "cancelled", cancelledBy: "business" });
    expect(await pendingFor(booking.id)).toEqual([]);
    expect(gateway.emitFleetOfferClosed).toHaveBeenCalledWith(a, booking.id);
    // Nothing left to resurrect.
    await expect(bookings.fleetConvert(f.access, f.ownerId, booking.id, 2.5)).rejects.toMatchObject({ response: { reason: "already_taken" } });
  });
});

describe("T4 gates", () => {
  const SHOP = { point: AVONDALE, landmark: "Shop", contactPhone: "+263770000001" };
  const BUYER = { point: AVONDALE, landmark: "Buyer", contactPhone: "+263770000002" };

  /**
   * A fleet booking order for `branchId`, created with its merchant_bookings row in one transaction like a real
   * booking (the 0108 trigger checks at commit that the tag matches the booking).
   */
  async function fleetOrder(branchId: string, data: { riderId: string; status: "completed" | "delivered"; debtAmount?: number }): Promise<string> {
    const customerId = await profile("customer");
    return prisma.$transaction(async (tx) => {
      const o = await tx.order.create({
        data: {
          customerId,
          riderId: data.riderId,
          fleetMerchantId: branchId,
          fleetFee: 1.5,
          pickup: SHOP,
          dropoff: BUYER,
          itemDesc: "meal",
          suggestedFare: 2,
          proposedFare: 0,
          status: data.status,
          ...(data.status === "delivered" ? { deliveredAt: new Date() } : {}),
          ...(data.debtAmount ? { debtStatus: "open" as const, debtAmount: data.debtAmount } : {}),
        },
        select: { id: true },
      });
      await tx.merchantBooking.create({ data: { orderId: o.id, merchantId: branchId, bookedByProfileId: customerId } });
      return o.id;
    });
  }

  it("OV-F3: cash owed to their own business doesn't keep a biker off its jobs; cash owed to another business does", async () => {
    const f = await fleetOwner();
    const ownCash = await biker({ fleet: f });
    await fleetOrder(f.branchId, { riderId: ownCash, status: "completed", debtAmount: 14 });

    // Owes a different business (a venue order's cash): made while public, then joined the fleet.
    const otherCash = await biker();
    const elsewhere = await fleetOwner();
    await prisma.order.create({
      data: {
        customerId: await profile("customer"),
        riderId: otherCash,
        orderType: "merchant",
        merchantId: elsewhere.branchId,
        pickup: SHOP,
        dropoff: BUYER,
        itemDesc: "meal",
        suggestedFare: 2,
        proposedFare: 2,
        status: "completed",
        debtStatus: "open",
        debtAmount: 9,
      },
    });
    await prisma.rider.update({ where: { profileId: otherCash }, data: { fleetOwnerProfileId: f.ownerId, fleetHomeMerchantId: f.branchId, fleetJoinedAt: new Date() } });

    const { booking } = await bookings.createFleet(f.access, f.ownerId, book());
    expect(await pendingFor(booking.id)).toEqual([ownCash]);
    await dispatch.accept(booking.id, ownCash);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: booking.id } })).riderId).toBe(ownCash);

    // The roster shows what each holds for THIS owner only.
    const roster = await fleetSvc.roster(f.access);
    const row = (id: string) => roster.bikers.find((b) => b.riderId === id)!;
    expect(row(ownCash).cashHeld).toBe("14.00");
    expect(row(otherCash).cashHeld).toBeNull();
  });

  it("OV-F2: the roster counts this week's give-backs per biker", async () => {
    const f = await fleetOwner();
    const a = await biker({ fleet: f });
    const { booking } = await bookings.createFleet(f.access, f.ownerId, book());
    await dispatch.accept(booking.id, a);
    await lifecycle.cancel(booking.id, a);
    const roster = await fleetSvc.roster(f.access);
    expect(roster.bikers.find((b) => b.riderId === a)).toMatchObject({ cancelsThisWeek: 1, cashHeld: null });
  });

  it("a completed fleet job leaves the free-jobs count alone; a public one counts", async () => {
    const f = await fleetOwner();
    const fleetBiker = await biker({ fleet: f });
    const publicBiker = await biker();
    const fleetJob = await fleetOrder(f.branchId, { riderId: fleetBiker, status: "delivered" });
    const publicJob = await prisma.order.create({
      data: {
        customerId: await profile("customer"),
        riderId: publicBiker,
        pickup: SHOP,
        dropoff: BUYER,
        itemDesc: "parcel",
        suggestedFare: 2,
        proposedFare: 2,
        agreedFare: 2,
        status: "delivered",
        deliveredAt: new Date(),
      },
      select: { id: true },
    });
    await lifecycle.completeOrder(fleetJob);
    await lifecycle.completeOrder(publicJob.id);

    expect((await prisma.rider.findUniqueOrThrow({ where: { profileId: fleetBiker } })).tripsCount).toBe(0);
    expect(await prisma.commissionLedger.count({ where: { riderId: fleetBiker } })).toBe(0);
    expect((await prisma.rider.findUniqueOrThrow({ where: { profileId: publicBiker } })).tripsCount).toBe(1);
    expect(await prisma.commissionLedger.count({ where: { riderId: publicBiker, type: "free_job" } })).toBe(1);
  });
});

describe("T5 the fleet bill", () => {
  const rows = (orderId: string) => prisma.merchantFleetLedger.findMany({ where: { orderId } });

  /** A "My bikers" booking taken by one of the owner's bikers. */
  async function takenBooking(): Promise<{ f: Fleet; rider: string; orderId: string; accountId: string }> {
    const f = await fleetOwner();
    const rider = await biker({ fleet: f });
    const { booking } = await bookings.createFleet(f.access, f.ownerId, book());
    await dispatch.accept(booking.id, rider);
    const { customerId } = await prisma.order.findUniqueOrThrow({ where: { id: booking.id }, select: { customerId: true } });
    return { f, rider, orderId: booking.id, accountId: customerId };
  }

  it("a completed ride is billed once, at the fee snapshotted on the order, to its branch and owner", async () => {
    const { f, rider, orderId } = await takenBooking();
    // The owner raises the fee afterwards: the ride keeps the fee it was booked at.
    await prisma.ownerFleet.update({ where: { ownerProfileId: f.ownerId }, data: { rideFee: 3 } });
    await prisma.order.update({ where: { id: orderId }, data: { status: "delivered", deliveredAt: new Date(), collectedAt: new Date() } });
    await lifecycle.completeOrder(orderId);
    await lifecycle.completeOrder(orderId);
    const billed = await rows(orderId);
    expect(billed).toHaveLength(1);
    expect(billed[0]).toMatchObject({ kind: "booking", merchantId: f.branchId, ownerProfileId: f.ownerId, riderId: rider, statementId: null });
    expect(Number(billed[0].fee)).toBe(1.5);
  });

  it("an undelivered ride is billed (the ride happened)", async () => {
    const { rider, orderId } = await takenBooking();
    await prisma.order.update({ where: { id: orderId }, data: { status: "en_route_dropoff", collectedAt: new Date() } });
    await lifecycle.markUndelivered(orderId, rider, "recipient_unreachable");
    expect(await rows(orderId)).toHaveLength(1);
  });

  it("cancelled after pickup is billed; cancelled before pickup is not", async () => {
    const after = await takenBooking();
    await prisma.order.update({ where: { id: after.orderId }, data: { status: "picked_up", collectedAt: new Date() } });
    await lifecycle.cancel(after.orderId, after.accountId, "Buyer cancelled");
    expect(await rows(after.orderId)).toHaveLength(1);

    const before = await takenBooking();
    await bookings.cancel(before.f.access, before.f.ownerId, before.orderId);
    expect(await rows(before.orderId)).toHaveLength(0);
  });

  it("the bill rule itself (paths like the admin cancel call it unguarded): a cancel bills only once the biker collected", async () => {
    const before = await takenBooking();
    await prisma.order.update({ where: { id: before.orderId }, data: { status: "cancelled", cancelledAt: new Date() } });
    expect(await recordFleetRide(prisma, before.orderId)).toBe(false);
    const after = await takenBooking();
    await prisma.order.update({ where: { id: after.orderId }, data: { status: "cancelled", cancelledAt: new Date(), collectedAt: new Date() } });
    expect(await recordFleetRide(prisma, after.orderId)).toBe(true);
    expect(await recordFleetRide(prisma, after.orderId)).toBe(false); // idempotent
  });

  it("a booking sent to any biker and delivered by a public biker is never on the fleet bill", async () => {
    const f = await fleetOwner();
    await biker({ fleet: f });
    const publicBiker = await biker();
    const { booking } = await bookings.createFleet(f.access, f.ownerId, book());
    await bookings.fleetConvert(f.access, f.ownerId, booking.id, 2.5);
    await prisma.order.update({ where: { id: booking.id }, data: { status: "delivered", riderId: publicBiker, agreedFare: 2.5, deliveredAt: new Date() } });
    await lifecycle.completeOrder(booking.id);
    expect(await rows(booking.id)).toHaveLength(0);
  });

  it("the reconciliation bills a ride a path forgot, says so on Telegram, and finds nothing the second time", async () => {
    const { orderId } = await takenBooking();
    // A path that ends orders without billing (here: a raw write).
    await prisma.order.update({ where: { id: orderId }, data: { status: "completed", completedAt: new Date(), collectedAt: new Date() } });
    expect(await ledger.reconcile()).toEqual({ repaired: [orderId] });
    expect(await rows(orderId)).toHaveLength(1);
    expect(alerts.notify).toHaveBeenCalledTimes(1);
    expect(await ledger.reconcile()).toEqual({ repaired: [] });
    expect(alerts.notify).toHaveBeenCalledTimes(1);
  });

  it("an adjustment is its own append-only row on the open week, with the admin and a reason", async () => {
    const { f, orderId } = await takenBooking();
    await prisma.order.update({ where: { id: orderId }, data: { status: "delivered", deliveredAt: new Date(), collectedAt: new Date() } });
    await lifecycle.completeOrder(orderId);
    const admin = await profile("customer");
    await ledger.adjust(admin, { merchantId: f.branchId, orderId, fee: -1.5, reason: "wrong fee" });
    const all = await rows(orderId);
    expect(all.map((r) => r.kind).sort()).toEqual(["adjustment", "booking"]);
    expect(all.find((r) => r.kind === "adjustment")).toMatchObject({ actorProfileId: admin, reason: "wrong fee", statementId: null });
    await expect(ledger.adjust(admin, { merchantId: f.branchId, fee: -1, reason: "" })).rejects.toMatchObject({ response: { reason: "reason_required" } });
    const elsewhere = await fleetOwner();
    await expect(ledger.adjust(admin, { merchantId: elsewhere.branchId, orderId, fee: -1, reason: "wrong branch" })).rejects.toMatchObject({
      response: { reason: "ride_not_found" },
    });
  });
});

describe("E4: another business's booking", () => {
  it("reads as not found for retry, Send to any biker and cancel, and is left untouched", async () => {
    const a = await fleetOwner();
    await biker({ fleet: a });
    const b = await fleetOwner();
    const { booking } = await bookings.createFleet(a.access, a.ownerId, book());
    await expect(bookings.fleetRetry(b.access, booking.id)).rejects.toMatchObject({ status: 404 });
    await expect(bookings.fleetConvert(b.access, b.ownerId, booking.id, 2.5)).rejects.toMatchObject({ status: 404 });
    await expect(bookings.cancel(b.access, b.ownerId, booking.id)).rejects.toMatchObject({ status: 404 });
    expect((await prisma.order.findUniqueOrThrow({ where: { id: booking.id } })).status).toBe("fleet_searching");
  });
});

describe("T7a the console", () => {
  const OPS = "ops@lyniago.com";

  it("enable needs a fee, sets it for every branch of the owner, and shows on the fleets table", async () => {
    const ownerId = await profile("merchant", "Rudo");
    const m = await prisma.merchant.create({
      data: { name: "Pizza Inn Avondale", ownerProfileId: ownerId, location: { point: AVONDALE, landmark: "Avondale", contactPhone: "+263770000009" } },
      select: { id: true },
    });
    const detail = await admin.enable(OPS, m.id, { rideFee: 1.25 });
    expect(detail).toMatchObject({ enabled: true, paused: false, rideFee: "1.25", branches: [{ merchantId: m.id }] });
    expect((await admin.list()).find((r) => r.ownerProfileId === ownerId)).toMatchObject({ status: "paid", rideFee: "1.25", branches: 1, bikers: 0 });
    expect(await prisma.auditLog.count({ where: { actor: OPS, action: "merchant.fleet.enable", target: ownerId } })).toBe(1);
  });

  it("pause cancels the bookings still ringing (not the one a biker has), refuses new ones, and unpause restores them", async () => {
    const f = await fleetOwner();
    const a = await biker({ fleet: f });
    const ringing = (await bookings.createFleet(f.access, f.ownerId, book())).booking.id;
    const taken = (await bookings.createFleet(f.access, f.ownerId, book())).booking.id;
    await dispatch.accept(taken, a);

    await admin.pause(OPS, f.ownerId, { reasonCode: "NON_PAYMENT", note: "21–27 Sep bill overdue" });
    expect(await prisma.order.findUniqueOrThrow({ where: { id: ringing } })).toMatchObject({ status: "cancelled", cancelReason: "fleet_paused" });
    expect((await prisma.order.findUniqueOrThrow({ where: { id: taken } })).status).toBe("assigned");
    expect(notifications.notifyProfiles).toHaveBeenCalledWith([f.ownerId], expect.objectContaining({ title: "Own bikers paused" }));
    await expect(bookings.createFleet(f.access, f.ownerId, book())).rejects.toMatchObject({ response: { reason: "fleet_paused" } });
    expect((await prisma.rider.findUniqueOrThrow({ where: { profileId: a } })).fleetOwnerProfileId).toBe(f.ownerId); // still linked
    expect((await admin.list()).find((r) => r.ownerProfileId === f.ownerId)?.status).toBe("paused");

    await admin.unpause(OPS, f.ownerId, { reasonCode: "OTHER", note: "paid in cash" });
    await expect(bookings.createFleet(f.access, f.ownerId, book())).resolves.toBeTruthy();
  });

  it("disable releases idle bikers now and a busy one when their ride ends, ends open invites, and keeps bills", async () => {
    const f = await fleetOwner();
    const idle = await biker({ fleet: f });
    const busy = await biker({ fleet: f });
    const { booking } = await bookings.createFleet(f.access, f.ownerId, book());
    await dispatch.accept(booking.id, busy);
    await prisma.fleetInvite.create({
      data: { ownerProfileId: f.ownerId, homeMerchantId: f.branchId, phone: "+263771111111", displayName: "Kuda", token: "ABCDEFGHJK", invitedByProfileId: f.ownerId, expiresAt: new Date(Date.now() + 86_400_000) },
    });

    await admin.disable(OPS, f.ownerId, { reasonCode: "MERCHANT_REQUEST" });
    expect((await prisma.rider.findUniqueOrThrow({ where: { profileId: idle } })).fleetOwnerProfileId).toBeNull();
    expect(notifications.notifyProfiles).toHaveBeenCalledWith([idle], expect.objectContaining({ title: "You're a public biker now" }));
    expect((await prisma.rider.findUniqueOrThrow({ where: { profileId: busy } })).fleetOwnerProfileId).toBe(f.ownerId);
    expect(await prisma.fleetInvite.count({ where: { ownerProfileId: f.ownerId, revokedAt: null } })).toBe(0);

    // The ride ends; the next sweep releases them.
    await prisma.order.update({ where: { id: booking.id }, data: { status: "delivered", deliveredAt: new Date(), collectedAt: new Date() } });
    await lifecycle.completeOrder(booking.id);
    expect(await dispatch.dissolveDisabledFleets()).toEqual({ dissolved: 1 });
    expect((await prisma.rider.findUniqueOrThrow({ where: { profileId: busy } })).fleetOwnerProfileId).toBeNull();
    expect(await prisma.merchantFleetLedger.count({ where: { orderId: booking.id } })).toBe(1); // the ride is still billed
    expect((await admin.list()).find((r) => r.ownerProfileId === f.ownerId)?.status).toBe("disabled");
  });

  it("closes a finished week into one bill per owner, due the Friday after, once; this week's rows wait", async () => {
    const f = await fleetOwner();
    const second = await prisma.merchant.create({ data: { name: "Chicken Inn Borrowdale", ownerProfileId: f.ownerId }, select: { id: true } });
    // Monday 5 Oct 2026 (Harare); rows on Tue 6 Oct and Sun 11 Oct, and one in the next week.
    const at = (iso: string) => new Date(iso);
    const row = (merchantId: string, fee: number, createdAt: Date) =>
      prisma.merchantFleetLedger.create({ data: { ownerProfileId: f.ownerId, merchantId, kind: "adjustment", fee, reason: "fixture", actor: "fixture", createdAt } });
    await row(f.branchId, 1.5, at("2026-10-06T10:00:00Z"));
    await row(second.id, 1.5, at("2026-10-11T20:00:00Z"));
    await row(f.branchId, -0.5, at("2026-10-11T21:30:00Z")); // 23:30 Sunday in Harare: still that week
    await row(f.branchId, 1.5, at("2026-10-12T08:00:00Z")); // the next week

    const now = at("2026-10-13T09:00:00Z"); // Tuesday of the next week
    expect(await ledger.closeWeeks(now)).toEqual({ closed: 1 });
    expect(await ledger.closeWeeks(now)).toEqual({ closed: 0 });
    const bills = await prisma.merchantFleetStatement.findMany({ where: { ownerProfileId: f.ownerId } });
    expect(bills).toHaveLength(1);
    expect(bills[0].periodStart.toISOString().slice(0, 10)).toBe("2026-10-05");
    expect(bills[0].periodEnd.toISOString().slice(0, 10)).toBe("2026-10-11");
    expect(bills[0].dueOn?.toISOString().slice(0, 10)).toBe("2026-10-16");
    expect(Number(bills[0].total)).toBe(2.5);
    expect(await prisma.merchantFleetLedger.count({ where: { statementId: null } })).toBe(1);

    // The side panel and the table, before and after the due date; then paid.
    const before = await admin.detail(f.ownerId, at("2026-10-15T09:00:00Z"));
    expect(before.bills[0]).toMatchObject({ state: "unpaid", total: "2.50", daysOverdue: 0 });
    expect(before.bills[0].branches).toHaveLength(2);
    expect((await admin.list(at("2026-10-18T09:00:00Z"))).find((r) => r.ownerProfileId === f.ownerId)).toMatchObject({ status: "overdue", daysOverdue: 2, unpaid: "2.50" });
    const paid = await admin.markBillPaid(OPS, bills[0].id, "cash at the office");
    expect(paid.bills[0].state).toBe("paid");
    await expect(admin.markBillPaid(OPS, bills[0].id)).rejects.toMatchObject({ response: { reason: "already_paid" } });
  });

  it("an adjustment by an operator (an email, not a profile) is written and audited; another owner's branch is refused", async () => {
    const f = await fleetOwner();
    const other = await fleetOwner();
    await admin.adjust(OPS, f.ownerId, { merchantId: f.branchId, amount: -1.5, reason: "wrong fee" });
    const adj = await prisma.merchantFleetLedger.findFirstOrThrow({ where: { ownerProfileId: f.ownerId, kind: "adjustment" } });
    expect(adj).toMatchObject({ actorProfileId: null, actor: OPS, reason: "wrong fee" });
    expect(await prisma.auditLog.count({ where: { actor: OPS, action: "merchant.fleet.adjust" } })).toBe(1);
    await expect(admin.adjust(OPS, f.ownerId, { merchantId: other.branchId, amount: -1, reason: "wrong owner" })).rejects.toMatchObject({ status: 404 });
  });
});

describe("T7b the merchant's fleet money", () => {
  it("staff and owner see the branch's rides this week (corrections included); only the week asked for", async () => {
    const f = await fleetOwner();
    const a = await biker({ fleet: f });
    const { booking } = await bookings.createFleet(f.access, f.ownerId, book());
    await dispatch.accept(booking.id, a);
    await prisma.order.update({ where: { id: booking.id }, data: { status: "delivered", deliveredAt: new Date(), collectedAt: new Date() } });
    await lifecycle.completeOrder(booking.id);
    await ledger.adjust("ops@lyniago.com", { merchantId: f.branchId, fee: -0.5, reason: "wrong fee" });

    const staff = { ...f.access, role: "staff" } as MerchantAccess;
    const rides = await fleetSvc.rides(staff);
    expect(rides).toMatchObject({ rides: 1, total: "1.00" });
    expect(rides.lines.map((l) => l.kind).sort()).toEqual(["adjustment", "booking"]);
    expect(rides.lines.find((l) => l.kind === "booking")?.ref).toMatch(/^#[0-9A-F]{4}$/);
    expect((await fleetSvc.rides(staff, "2020-01-06")).lines).toEqual([]);
    await expect(fleetSvc.rides(staff, "not-a-day")).rejects.toMatchObject({ status: 400 });
  });

  it("the owner's bill card: this week so far and the closed bills", async () => {
    const f = await fleetOwner();
    await prisma.merchantFleetLedger.create({
      data: { ownerProfileId: f.ownerId, merchantId: f.branchId, kind: "adjustment", fee: 4, reason: "fixture", actor: "fixture", createdAt: new Date("2026-10-06T10:00:00Z") },
    });
    await ledger.closeWeeks(new Date("2026-10-13T09:00:00Z"));
    const res = await fleetSvc.bills(f.access);
    expect(res.bills).toHaveLength(1);
    expect(res.bills[0]).toMatchObject({ periodStart: "2026-10-05", total: "4.00" });
    expect(res.thisWeek).toEqual({ rides: 0, total: "0.00" });
  });

  it("alerts: a bill over 7 days overdue tells the owner once a day; a business cancelling most accepted bookings is flagged once", async () => {
    const f = await fleetOwner();
    await prisma.merchantFleetStatement.create({
      data: { ownerProfileId: f.ownerId, periodStart: new Date("2026-09-21T00:00:00Z"), periodEnd: new Date("2026-09-27T00:00:00Z"), dueOn: new Date("2026-10-02T00:00:00Z"), total: 36, status: "sent" },
    });
    const now = new Date("2026-10-12T09:00:00Z");
    expect(await ledger.alertOverdueBills(now)).toEqual({ alerted: 1 });
    expect(await ledger.alertOverdueBills(now)).toEqual({ alerted: 0 });
    expect(alerts.notify).toHaveBeenCalledWith(expect.stringContaining("10 days overdue"));

    // 5 accepted bookings, 2 cancelled by the business before pickup: 40% > 20%.
    const a = await biker({ fleet: f });
    for (let i = 0; i < 5; i++) {
      const { booking } = await bookings.createFleet(f.access, f.ownerId, book());
      await dispatch.accept(booking.id, a);
      if (i < 2) await bookings.cancel(f.access, f.ownerId, booking.id);
      else await prisma.order.update({ where: { id: booking.id }, data: { status: "completed", completedAt: new Date() } });
    }
    expect(await ledger.alertCancelRates()).toEqual({ alerted: 1 });
    expect(await ledger.alertCancelRates()).toEqual({ alerted: 0 });
    expect(alerts.notify).toHaveBeenCalledWith(expect.stringContaining("cancelled 2 of 5"));
  });
});

describe("T9 the business's own app orders", () => {
  const OPS = "ops@lyniago.com";
  /** Well beyond `RESTAURANTS_DISPATCH.pickupReachM` (15 km) of Avondale. */
  const OUT_OF_REACH = { lat: -18.0, lng: 31.25 };

  /** A cash restaurant order of `f`'s branch, ready at the counter and not yet searched for. */
  async function appOrder(f: Fleet): Promise<string> {
    const o = await prisma.order.create({
      data: {
        customerId: await profile("customer"),
        orderType: "merchant",
        merchantId: f.branchId,
        status: "requested",
        merchantPhase: "ready_for_pickup",
        pickup: { point: AVONDALE, landmark: "Chicken Inn Avondale", contactPhone: "+263770000001" },
        dropoff: BOOK.dropoff,
        itemDesc: "2 piece meal",
        suggestedFare: 2,
        proposedFare: 2,
        merchantGoodsTotal: 12,
        deliveryFee: 2,
        merchantPaymentMethod: "cash",
        merchantCashRule: "collect_and_return",
      },
      select: { id: true },
    });
    return o.id;
  }
  /** The live round runs out, as the clock would, and the next one is opened. */
  async function nextRound(orderId: string): Promise<void> {
    await endRound(orderId);
    await food.sweepExpiredOffers();
    await food.sweepSearch();
  }
  const row = (id: string) =>
    prisma.order.findUniqueOrThrow({ where: { id }, select: { status: true, riderId: true, fleetMerchantId: true, fleetFee: true } });

  it("rings only the business's own bikers in reach first, on their own channel; the next round rings them first, then the public", async () => {
    const f = await fleetOwner();
    const own = await biker({ fleet: f });
    await biker({ fleet: f, at: OUT_OF_REACH });
    await biker({ fleet: await fleetOwner() }); // another business's Own biker, right here
    const pub = await biker();
    const orderId = await appOrder(f);

    expect(await food.sweepSearch()).toEqual({ offered: 1, held: 0 });
    expect(await pendingFor(orderId)).toEqual([own]);
    expect(gateway.emitFoodOffer).not.toHaveBeenCalled();
    // No fare on their card: what they collect is everything the customer pays, delivery included (OV-F5).
    expect(gateway.emitFleetOffer).toHaveBeenCalledWith(own, expect.objectContaining({ orderId, kind: "app", shop: "Chicken Inn Avondale", collect: "14.00" }));
    expect(await dispatch.offersFor(own)).toEqual([expect.objectContaining({ orderId, kind: "app" })]);

    await nextRound(orderId);
    expect(await pendingFor(orderId)).toEqual([own, pub].sort());
    expect(gateway.emitFoodOffer).toHaveBeenCalledTimes(1);
    expect(gateway.emitFoodOffer).toHaveBeenCalledWith(pub, expect.objectContaining({ orderId }));
  });

  it("an accept tags the order to the branch with OV5's fee and bills it as a marketplace ride; no commission check", async () => {
    const f = await fleetOwner();
    // No wallet and no free jobs left: a public biker like this is never rung (the commission cover), an Own biker is.
    const own = await biker({ fleet: f });
    const broke = await biker();
    await prisma.rider.updateMany({ where: { profileId: { in: [own, broke] } }, data: { tripsCount: 50 } });
    const orderId = await appOrder(f);

    await food.sweepSearch();
    await nextRound(orderId);
    expect(await pendingFor(orderId)).toEqual([own]);
    await dispatch.accept(orderId, own);

    const fee = marketplaceFleetFee(2);
    expect(fee).toBeGreaterThan(0);
    expect(await row(orderId)).toEqual({ status: "assigned", riderId: own, fleetMerchantId: f.branchId, fleetFee: expect.anything() });
    expect(Number((await row(orderId)).fleetFee)).toBe(fee);

    await prisma.order.update({ where: { id: orderId }, data: { status: "completed" } });
    await prisma.$transaction((tx) => recordFleetRide(tx, orderId));
    const bill = await prisma.merchantFleetLedger.findMany({ where: { orderId }, select: { kind: true, fee: true, merchantId: true, riderId: true } });
    expect(bill.map((b) => ({ ...b, fee: Number(b.fee) }))).toEqual([{ kind: "marketplace", fee, merchantId: f.branchId, riderId: own }]);
  });

  it("a give-back clears the tag and fee in the same write, costs nothing, and the next search rings the other own bikers first", async () => {
    const f = await fleetOwner();
    const a = await biker({ fleet: f });
    const b = await biker({ fleet: f });
    const pub = await biker();
    const orderId = await appOrder(f);
    await food.sweepSearch();
    await dispatch.accept(orderId, a);
    // The one who lost the race is told on both channels' close.
    expect(gateway.emitDispatchOfferClosed).toHaveBeenCalledWith(b, orderId);

    await food.dropDispatch(orderId, a);
    expect(await row(orderId)).toEqual({ status: "requested", riderId: null, fleetMerchantId: null, fleetFee: null });
    expect((await prisma.rider.findUniqueOrThrow({ where: { profileId: a } })).cancelStrikes).toBe(0);
    expect(await prisma.auditLog.count({ where: { action: FLEET_DROP_ACTION, target: orderId, actor: a } })).toBe(1);
    expect((await fleetSvc.roster(f.access)).bikers.find((x) => x.riderId === a)?.cancelsThisWeek).toBe(1);

    await food.sweepSearch();
    expect(await pendingFor(orderId)).toEqual([b]);
    expect(await pendingFor(orderId)).not.toContain(pub);
  });

  it("a public biker who takes it carries no tag; another business's Own biker can't take it", async () => {
    const f = await fleetOwner();
    const pub = await biker();
    const theirs = await biker({ fleet: await fleetOwner() });
    const orderId = await appOrder(f);
    await food.sweepSearch(); // nobody of f's online: the first round is the public's
    expect(await pendingFor(orderId)).toEqual([pub]);

    // Even holding a live offer (a crafted row), the other business's biker is refused, and nothing is written.
    const round = (await prisma.order.findUniqueOrThrow({ where: { id: orderId }, select: { dispatchOfferExpiresAt: true } })).dispatchOfferExpiresAt!;
    await prisma.foodDispatchAttempt.create({ data: { orderId, riderId: theirs, attemptNumber: 1, radiusM: 0, offeredAt: new Date(), expiresAt: round } });
    await expect(food.acceptDispatch(orderId, theirs)).rejects.toMatchObject({ status: 403, response: { reason: "fleet_scope" } });
    expect((await row(orderId)).riderId).toBeNull();

    await food.acceptDispatch(orderId, pub);
    expect(await row(orderId)).toEqual({ status: "assigned", riderId: pub, fleetMerchantId: null, fleetFee: null });
  });

  it("pause closes the offers the business's bikers hold and rings only the public after; unpause brings them back", async () => {
    const f = await fleetOwner();
    const own = await biker({ fleet: f });
    const pub = await biker();
    const orderId = await appOrder(f);
    await food.sweepSearch();
    expect(await pendingFor(orderId)).toEqual([own]);

    await admin.pause(OPS, f.ownerId, { reasonCode: "NON_PAYMENT" });
    expect(await pendingFor(orderId)).toEqual([]);
    expect(gateway.emitDispatchOfferClosed).toHaveBeenCalledWith(own, orderId);
    await expect(dispatch.accept(orderId, own)).rejects.toMatchObject({ status: 409 });

    await nextRound(orderId);
    expect(await pendingFor(orderId)).toEqual([pub]);

    await admin.unpause(OPS, f.ownerId, { reasonCode: "OTHER" });
    await nextRound(orderId);
    expect(await pendingFor(orderId)).toEqual([own, pub].sort());
  });

  it("an Own biker can't turn the business's app order into a ringing booking (the parcel cancel refuses it)", async () => {
    const f = await fleetOwner();
    const own = await biker({ fleet: f });
    const orderId = await appOrder(f);
    await food.sweepSearch();
    await dispatch.accept(orderId, own);
    // The parcel cancel route refuses a restaurant order outright: it is never turned into a ringing booking.
    await expect(lifecycle.cancel(orderId, own)).rejects.toThrow();
    expect(await row(orderId)).toEqual({ status: "assigned", riderId: own, fleetMerchantId: f.branchId, fleetFee: expect.anything() });
  });
});

describe("T9 retiring Preferred riders", () => {
  const notes = new PreferredRetirementService(prisma, notifications as unknown as NotificationsService);

  it("once PREFERRED_RETIRED is on, each business that kept preferred riders tells its owners, once", async () => {
    const f = await fleetOwner();
    await prisma.merchantPreferredRider.create({ data: { merchantId: f.branchId, phone: "+263771230000", label: "Blessing", addedByProfileId: f.ownerId } });
    await prisma.merchantPreferredRider.create({ data: { merchantId: f.branchId, phone: "+263771230001", label: "Tino", addedByProfileId: f.ownerId } });
    await fleetOwner(); // kept none: not told

    expect(await notes.sendNotes()).toEqual({ businesses: 0, owners: 0 }); // the flag is off
    vi.stubEnv("PREFERRED_RETIRED", "true");
    try {
      expect(await notes.sendNotes()).toEqual({ businesses: 1, owners: 1 });
      expect(notifications.notifyProfiles).toHaveBeenCalledWith([f.ownerId], expect.objectContaining({ title: PREFERRED_RETIRED_NOTE.title }));
      expect(await notes.sendNotes()).toEqual({ businesses: 0, owners: 0 });
      expect(notifications.notifyProfiles).toHaveBeenCalledTimes(1);
      // The list stays (rollback is unsetting the flag).
      expect(await prisma.merchantPreferredRider.count({ where: { merchantId: f.branchId } })).toBe(2);
    } finally {
      vi.unstubAllEnvs();
    }
  });
});
