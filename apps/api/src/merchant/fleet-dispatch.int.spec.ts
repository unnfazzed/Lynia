/**
 * Own bikers T3b (D-117): "My bikers" bookings on a real PostGIS (needs DATABASE_URL). A booking rings only the
 * owner's online bikers, in rounds; the first to accept takes it; an accept and "Send to any biker" race on one
 * row and exactly one wins; a biker who gives a booking back costs them nothing and it rings the others again.
 */
import { FLEET_DISPATCH, type CreateFleetBookingRequest } from "@lynia/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { TokenService } from "../auth/token.service";
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
import { FleetDispatchService } from "./fleet-dispatch.service";
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
const dispatch = new FleetDispatchService(prisma, notifications as unknown as NotificationsService, gateway as unknown as TrackingGateway, orders);
const alerts = { notify: vi.fn() };
const ledger = new FleetLedgerService(prisma, alerts as never);
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
  await prisma.foodDispatchAttempt.deleteMany({});
  await prisma.merchantFleetLedger.deleteMany({});
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
