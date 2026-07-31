/**
 * X2 — the launch-flip rehearsal, made executable.
 *
 * The joint launch plan (docs/plans/2026-07-28-restaurants-send-joint-launch-plan.md §5, cross-cutting
 * X2) asks for a STAGING run before the flag flip: "flags ON end-to-end golden pass (cash and wallet
 * food order complete with correct ledger entries; NO_RIDER inside cap; race test parcel-bid vs
 * food-offer), then flags OFF regression (Express golden matrix still green, merchant routes dead)".
 * A staging run is a one-shot human ritual: it proves the corridor on the day it is performed and
 * proves nothing the next morning. This file exists so that ritual is a REGRESSION instead of an
 * event — every leg of the rehearsal, driven against a real Postgres/PostGIS, on every CI run and
 * every time an engineer touches C2/C3/C4 or the Express seams they share a table with. The checklist
 * in `docs/LAUNCH-EXECUTION-RUNBOOK.md` names this file as the automated half of the gate; what stays
 * manual is only what genuinely can't be automated (real tablets, real riders, real mobile money).
 *
 * Why an INT spec and not a unit spec: every claim X2 makes is a claim about the DATABASE, not about
 * a service's control flow. "The debt ledger nets to exactly zero" (plan §7 launch gate) is a claim
 * about two rows in `merchant_debt_ledger` summing to 0.00 in NUMERIC(10,2). "A merchant order never
 * leaks into an Express query" is a claim about the `order_type` predicates C1/C2 added to real SQL,
 * including the raw PostGIS board query no mocked `$queryRaw` can reach. "The parcel-bid vs food-offer
 * soft-lock holds" is a claim about `common/food-dispatch-lock.ts` running inside the real
 * bid-acceptance transaction. Mocks would restate the implementation; only a live DB can falsify it.
 *
 * Convention (mirrors orders/order-lifecycle.int.spec.ts): esbuild drops DI metadata, so every service
 * is hand-wired — never through Nest — and `onModuleInit()` is NEVER called on any of them, because
 * that starts the real setInterval reconcilers. The sweeps are invoked directly and deterministically,
 * exactly as the unit specs do. Push/WS/Redis side effects are stubbed; everything that decides money
 * or state is the real service against the real DB.
 */
import { RESTAURANTS_DISPATCH } from "@lynia/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { TokenService } from "../auth/token.service";
import { hasLiveFoodDispatchOffer } from "../common/food-dispatch-lock";
import { hasOpenMerchantObligation } from "../common/merchant-debt-lock";
import type { Env } from "../config/env";
import { MatchingService } from "../matching/matching.service";
import { OfferExpiryService } from "../matching/offer-expiry.service";
import type { NotificationsService } from "../notifications/notifications.service";
import { MetricsService } from "../observability/metrics.service";
import { OffersService } from "../offers/offers.service";
import { OrderLifecycleService } from "../orders/order-lifecycle.service";
import { OrdersService } from "../orders/orders.service";
import { PrismaService } from "../prisma/prisma.service";
import type { TrackingGateway } from "../tracking/tracking.gateway";
import type { NearbyRider, TrackingService } from "../tracking/tracking.service";
import { WalletService } from "../wallet/wallet.service";
import { NearestRiderDispatchStrategy } from "./dispatch-strategy";
import { FoodDebtService } from "./food-debt.service";
import { FoodDispatchService } from "./food-dispatch.service";
import { FoodOrderService } from "./food-order.service";

// The two flag positions X2 rehearses. Both are constructed EXPLICITLY (never left to the env schema's
// defaults) so each leg below names which side of the flip it is proving — the same "flags-present-and-
// off" discipline the Express golden matrix uses in orders/order-lifecycle.int.spec.ts.
const MERCHANT_FLAGS_ON = {
  RESTAURANTS_ENABLED: "true",
  MERCHANT_DISPATCH_AUTO_ENABLED: "true",
  MERCHANT_WALLET_ENABLED: "true",
} as const;
const MERCHANT_FLAGS_OFF = {
  RESTAURANTS_ENABLED: "false",
  MERCHANT_DISPATCH_AUTO_ENABLED: "false",
  MERCHANT_WALLET_ENABLED: "false",
} as const;

const prisma = new PrismaService();
const tokens = new TokenService({ JWT_SIGNING_SECRET: "launch-flip-int-secret-0123456789", ACCESS_TTL_SECONDS: 900, ...MERCHANT_FLAGS_ON } as Env);

// Push is fire-and-forget everywhere in these paths; a no-op stub keeps the rehearsal off FCM.
const noopNotifications = {
  notifyProfiles: async () => {},
  notifyOrderStatus: async () => {},
  notifyNewOffer: async () => {},
  notifyOrderExpired: async () => {},
  notifyNewBroadcast: async () => {},
  notifyRidersAvailable: async () => {},
} as unknown as NotificationsService;

// Every gateway call in these paths is best-effort realtime. `isMerchantOnline` is the one that has to
// answer truthfully rather than no-op: FoodOrderService.sweepExpiredAcceptWindows treats an OFFLINE
// merchant as "clock paused" (D-16), so a stub returning false would silently disable the N-03 window.
// Nothing here drives that sweep, but the honest value keeps the stub safe for anyone extending this file.
const gateway = {
  emitOrderStatus: () => undefined,
  emitBidExpired: () => undefined,
  emitOrderTaken: () => undefined,
  emitJobCancelled: () => undefined,
  emitOrderRebroadcast: () => undefined,
  emitOffersChanged: () => undefined,
  emitBoardNewOrder: () => undefined,
  emitBoardNewOrderToCells: () => undefined,
  emitFoodQueueChanged: () => undefined,
  emitFoodOffer: async () => undefined,
  emitFoodOfferClosed: async () => undefined,
  isMerchantOnline: async () => true,
  evictRiderFromGeo: async () => undefined,
  evictRiderFromSupply: async () => undefined,
} as unknown as TrackingGateway;

const metrics = new MetricsService(); // NoopMeter-safe with no OTLP endpoint — every record is a no-op.
const noopOrders = { announceOpenOrder: async () => {} } as unknown as OrdersService;

// ── Flags-ON wiring (the merchant vertical under test) ────────────────────────────────────────────
const walletOn = new WalletService({ ...MERCHANT_FLAGS_ON } as Env, prisma);
// No onModuleInit() → no Redis queue; scheduleAutoClose() no-ops, which is what we want under test.
const lifecycleOn = new OrderLifecycleService({ ...MERCHANT_FLAGS_ON } as Env, prisma, tokens, gateway, noopNotifications, noopOrders, walletOn);
const debt = new FoodDebtService(prisma, noopNotifications, lifecycleOn);
const foodOrders = new FoodOrderService(prisma, tokens, noopNotifications, debt, gateway);

// The dispatch STRATEGY is the real NearestRiderDispatchStrategy over the real Prisma — so its
// eligibility filters (already-mid-ride, already holding another food offer, owing a merchant debt) are
// exercised against real rows. Only the Redis-backed geo lookup is stubbed: `nearbyRiders` is a live
// GEOSEARCH in production, so this array IS "who is physically in range right now" for each test.
let nearbyRiders: NearbyRider[] = [];
const geoStub = { nearbyRiders: async () => nearbyRiders } as unknown as TrackingService;
const dispatch = new FoodDispatchService(prisma, tokens, noopNotifications, gateway, new NearestRiderDispatchStrategy(geoStub, prisma));

// ── Flags-OFF wiring (the Express vertical, which must be untouched by all of the above) ──────────
const walletOff = new WalletService({ ...MERCHANT_FLAGS_OFF } as Env, prisma);
const lifecycleOff = new OrderLifecycleService({ ...MERCHANT_FLAGS_OFF } as Env, prisma, tokens, gateway, noopNotifications, noopOrders, walletOff);
const matchingOff = new MatchingService(prisma, tokens, noopNotifications, metrics, gateway, geoStub);
const offersOff = new OffersService(prisma, noopNotifications, gateway, metrics);
// listOpen/listOpenNearby never touch the expiry seam; a stub keeps the OrdersService ↔ OfferExpiry
// construction cycle out of this file.
const ordersRead = new OrdersService(prisma, {} as unknown as OfferExpiryService, geoStub, noopNotifications, gateway);
const offerExpiryOff = new OfferExpiryService({ ...MERCHANT_FLAGS_OFF } as Env, matchingOff, prisma);

const KITCHEN = { point: { lat: -17.8292, lng: 31.0522 }, landmark: "Mama's Kitchen", contactPhone: "+263771111111" };
const DROPOFF = { point: { lat: -17.8016, lng: 31.0431 }, landmark: "Avondale Shops", contactPhone: "+263772222222" };
/** 2 × $6.25 = $12.50 subtotal — deliberately above N-15's $4.00 minimum, so no small-order fee lands
 *  and `merchantGoodsTotal` is exactly the basket. Every money assertion below is anchored on this. */
const DISH_PRICE = 6.25;
const GOODS_TOTAL = "12.50";

async function clean(): Promise<void> {
  // Child-first, so no FK ever blocks a delete (merchants own dishes/categories AND hang off a profile).
  await prisma.merchantDebtLedger.deleteMany({});
  await prisma.foodDispatchAttempt.deleteMany({});
  await prisma.merchantOrderItem.deleteMany({});
  await prisma.orderEvent.deleteMany({});
  await prisma.rating.deleteMany({});
  await prisma.offer.deleteMany({});
  await prisma.order.deleteMany({});
  await prisma.merchantDish.deleteMany({});
  await prisma.merchantCategory.deleteMany({});
  await prisma.merchant.deleteMany({});
  await prisma.rider.deleteMany({});
  await prisma.profile.deleteMany({});
  nearbyRiders = [];
}

async function makeCustomer(): Promise<string> {
  const p = await prisma.profile.create({
    data: { role: "customer", firstName: "Tariro", lastName: "C", phone: `c_${crypto.randomUUID()}` },
    select: { id: true },
  });
  return p.id;
}

/** An online, KYC-verified rider with a fresh heartbeat — the liveness selectOffer/makeOffer demand. */
async function makeRider(): Promise<string> {
  const p = await prisma.profile.create({
    data: { role: "rider", firstName: "Rider", lastName: "R", phone: `r_${crypto.randomUUID()}` },
    select: { id: true },
  });
  await prisma.rider.create({
    data: { profileId: p.id, bikeReg: "ABZ 0000", photoUrl: "x", kycStatus: "verified", isOnline: true, lastHeartbeatAt: new Date() },
  });
  return p.id;
}

interface Kitchen {
  merchantId: string;
  ownerId: string;
  dishId: string;
}

/** A pilot-enabled shop with a location, one published dish, and the given R-03 cash rule snapshot. */
async function makeKitchen(cashRule: "collect_and_return" | "pay_upfront" = "collect_and_return"): Promise<Kitchen> {
  const owner = await prisma.profile.create({
    data: { role: "merchant", firstName: "Mai", lastName: "M", phone: `m_${crypto.randomUUID()}` },
    select: { id: true },
  });
  const merchant = await prisma.merchant.create({
    data: { name: "Mama's Kitchen", ownerProfileId: owner.id, cashRule, pilotEnabled: true, location: KITCHEN },
    select: { id: true },
  });
  const category = await prisma.merchantCategory.create({
    data: { merchantId: merchant.id, name: "Mains" },
    select: { id: true },
  });
  const dish = await prisma.merchantDish.create({
    // isDraft:false — a draft dish (D-31, no photo) is rejected at placement.
    data: { categoryId: category.id, merchantId: merchant.id, name: "Sadza & stew", priceUsd: DISH_PRICE, isDraft: false, photoUrl: "x" },
    select: { id: true },
  });
  return { merchantId: merchant.id, ownerId: owner.id, dishId: dish.id };
}

async function orderRow(orderId: string) {
  return prisma.order.findUniqueOrThrow({
    where: { id: orderId },
    select: {
      status: true,
      merchantPhase: true,
      riderId: true,
      debtStatus: true,
      debtAmount: true,
      debtOpenedAt: true,
      debtSettledAt: true,
      dispatchAttempt: true,
      dispatchNextCheckAt: true,
      dispatchOfferedRiderId: true,
      noRiderHoldAt: true,
      customerCashConfirmedAt: true,
      riderCashConfirmedAt: true,
    },
  });
}

/** Sum of a debt ledger in integer cents — the only safe way to assert "nets to zero" on NUMERIC(10,2). */
async function ledgerNetCents(orderId: string): Promise<number> {
  const rows = await prisma.merchantDebtLedger.findMany({ where: { orderId } });
  return rows.reduce((sum, r) => sum + Math.round(Number(r.amount) * 100), 0);
}

/** Place a CASH order and drive C2's kitchen phase to `ready_for_pickup`, returning the revealed
 *  N-16 pickup code (markReady hashes the code it mints and discards the plaintext — revealPickupCode
 *  is the only way a caller can learn it, exactly as the tablet does at the counter). */
async function cashOrderReadyForDispatch(k: Kitchen, customerId: string): Promise<{ orderId: string; pickupCode: string }> {
  const placed = await foodOrders.placeOrder(customerId, k.merchantId, {
    items: [{ dishId: k.dishId, quantity: 2 }],
    dropoff: DROPOFF,
    paymentMethod: "cash",
  });
  // A CASH order skips `awaiting_payment` entirely — R-11's pay-before-cook gate is the WALLET rail
  // (money changes hands at the door instead), so accept goes straight to `preparing`.
  await foodOrders.acceptOrder(k.ownerId, placed.id, { prepMinutes: 15 });
  await foodOrders.markReady(k.ownerId, placed.id);
  const { pickupCode } = await foodOrders.revealPickupCode(k.ownerId, placed.id);
  return { orderId: placed.id, pickupCode };
}

/** One deterministic dispatch tick with `riderId` as the only rider in geo range, then that rider
 *  accepting the resulting N-08 offer. */
async function offerAndAccept(orderId: string, riderId: string): Promise<void> {
  nearbyRiders = [{ profileId: riderId, distanceM: 400 }];
  expect(await dispatch.sweepSearch()).toEqual({ offered: 1, held: 0 });
  await dispatch.acceptDispatch(orderId, riderId);
}

async function makeParcelOrder(customerId: string, proposedFare = 2.5): Promise<string> {
  const o = await prisma.order.create({
    data: {
      customerId,
      orderType: "parcel",
      pickup: KITCHEN,
      dropoff: DROPOFF,
      itemDesc: "documents",
      declaredValue: 10,
      suggestedFare: proposedFare,
      proposedFare,
      status: "open_for_offers",
    },
    select: { id: true },
  });
  return o.id;
}

beforeAll(async () => {
  await prisma.$connect();
});
afterAll(async () => {
  await clean();
  await prisma.$disconnect();
});
beforeEach(clean);

// ── Leg 1/2: flags ON, end-to-end golden pass with correct ledger entries ─────────────────────────
describe("X2 · flags ON — food golden pass", () => {
  it("a CASH order completes end to end and its debt ledger nets to exactly $0.00", async () => {
    const kitchen = await makeKitchen("collect_and_return");
    const customer = await makeCustomer();
    const rider = await makeRider();

    const placed = await foodOrders.placeOrder(customer, kitchen.merchantId, {
      items: [{ dishId: kitchen.dishId, quantity: 2 }],
      dropoff: DROPOFF,
      paymentMethod: "cash",
    });
    const orderId = placed.id;
    expect(placed.merchantPhase).toBe("awaiting_accept");
    expect(placed.paymentMethod).toBe("cash");
    // D-35: the price is server-computed from the dish snapshot, never sent by the client.
    expect(placed.merchantGoodsTotal?.toFixed(2)).toBe(GOODS_TOTAL);
    // R-03 snapshot at placement — a later shop-setting change can't retroactively alter this order.
    expect(placed.merchantCashRule).toBe("collect_and_return");
    expect(placed.debtStatus).toBeNull();

    const accepted = await foodOrders.acceptOrder(kitchen.ownerId, orderId, { prepMinutes: 15 });
    expect(accepted.merchantPhase).toBe("preparing");
    expect(accepted.prepStartedAt).not.toBeNull();

    await foodOrders.markReady(kitchen.ownerId, orderId);
    const { pickupCode } = await foodOrders.revealPickupCode(kitchen.ownerId, orderId);
    expect(pickupCode).toMatch(/^\d{4}$/);
    expect((await orderRow(orderId)).merchantPhase).toBe("ready_for_pickup");

    // C3 hand-off: one dispatch tick offers the single nearest candidate (N-08), who accepts.
    await offerAndAccept(orderId, rider);
    const assigned = await orderRow(orderId);
    expect(assigned).toMatchObject({ status: "assigned", riderId: rider });
    // merchantPhase is cleared on the genuine hand-off OUT of the kitchen's board.
    expect(assigned.merchantPhase).toBeNull();

    await lifecycleOn.advance(orderId, rider, "confirmed");
    await lifecycleOn.advance(orderId, rider, "en_route_pickup");

    // N-16: a wrong code at the counter is counted, never collected on.
    await expect(foodOrders.confirmPickup(orderId, rider, pickupCode === "0000" ? "1111" : "0000")).rejects.toThrow(/attempts left/i);
    expect(await foodOrders.confirmPickup(orderId, rider, pickupCode)).toEqual({ orderId, status: "picked_up" });

    // R-01: the debt opens IN the pickup transaction — the goods left the counter unpaid.
    const collected = await orderRow(orderId);
    expect(collected.status).toBe("picked_up");
    expect(collected.debtStatus).toBe("open");
    expect(collected.debtAmount?.toFixed(2)).toBe(GOODS_TOTAL);
    expect(collected.debtOpenedAt).not.toBeNull();
    const openedRows = await prisma.merchantDebtLedger.findMany({ where: { orderId } });
    expect(openedRows).toHaveLength(1);
    expect(openedRows[0]!.type).toBe("opened");
    expect(openedRows[0]!.amount.toFixed(2)).toBe(GOODS_TOTAL); // positive: the rider owes the kitchen
    expect(openedRows[0]!.merchantId).toBe(kitchen.merchantId);
    expect(openedRows[0]!.riderId).toBe(rider);

    await lifecycleOn.advance(orderId, rider, "en_route_dropoff");

    // R-09: on a CASH food order the delivery code stays masked until BOTH doorstep confirms land —
    // this is the gate that makes the handshake load-bearing rather than advisory.
    await expect(lifecycleOn.rotateDeliveryCode(orderId, customer)).rejects.toThrow(/confirm the cash exchange/i);
    // R-04 "food first": the customer confirms first; the rider's confirm before it is refused.
    await expect(debt.confirmRiderCash(orderId, rider)).rejects.toThrow(/customer's confirm first/i);

    await debt.confirmCustomerCash(orderId, customer);
    await debt.confirmRiderCash(orderId, rider);
    const shook = await orderRow(orderId);
    expect(shook.customerCashConfirmedAt).not.toBeNull();
    expect(shook.riderCashConfirmedAt).not.toBeNull();

    const { deliveryCode } = await lifecycleOn.rotateDeliveryCode(orderId, customer);
    await lifecycleOn.confirmDelivery(orderId, rider, deliveryCode);
    expect((await orderRow(orderId)).status).toBe("delivered");
    expect(await lifecycleOn.completeOrder(orderId)).toEqual({ completed: true });
    expect((await orderRow(orderId)).status).toBe("completed");

    // The delivery is done but the MONEY isn't: the cash is still in the rider's pocket, so the debt
    // is still open and the C4 soft-lock still holds them off new work (N-20).
    expect((await orderRow(orderId)).debtStatus).toBe("open");
    expect(await hasOpenMerchantObligation(prisma, rider)).toBe(true);

    // N-21/D-06: the returned-cash count must match the recorded debt exactly, and the mismatch names
    // the gap in dollars rather than just refusing.
    await expect(debt.confirmReturnedCash(kitchen.ownerId, orderId, 12.0)).rejects.toThrow(/expected \$12\.50, got \$12\.00/);
    expect(await debt.confirmReturnedCash(kitchen.ownerId, orderId, 12.5)).toEqual({ orderId, debtStatus: "settled_cash" });

    const settled = await orderRow(orderId);
    expect(settled.debtStatus).toBe("settled_cash");
    expect(settled.debtSettledAt).not.toBeNull();
    const ledger = await prisma.merchantDebtLedger.findMany({ where: { orderId }, orderBy: { createdAt: "asc" } });
    expect(ledger.map((r) => r.type)).toEqual(["opened", "settled_cash"]);
    expect(ledger.map((r) => r.amount.toFixed(2))).toEqual([GOODS_TOTAL, `-${GOODS_TOTAL}`]);
    // THE money invariant of the launch gate (plan §7): "debt ledger nets zero on a full cash order".
    expect(await ledgerNetCents(orderId)).toBe(0);
    // …and the rider is free again the instant it nets out.
    expect(await hasOpenMerchantObligation(prisma, rider)).toBe(false);
  });

  it("a WALLET order completes with NO debt ledger row at all (C4's documented scope cut)", async () => {
    const kitchen = await makeKitchen("collect_and_return");
    const customer = await makeCustomer();
    const rider = await makeRider();

    const placed = await foodOrders.placeOrder(customer, kitchen.merchantId, {
      items: [{ dishId: kitchen.dishId, quantity: 2 }],
      dropoff: DROPOFF,
      paymentMethod: "wallet",
    });
    const orderId = placed.id;
    // R-03: the cash rule is snapshotted only when it can apply — a WALLET order never carries one,
    // which is precisely why openDebtIfNeeded no-ops for it later.
    expect(placed.merchantCashRule).toBeNull();

    // R-11: WALLET is the pay-before-cook rail, so accept parks at `awaiting_payment`, not `preparing`.
    const accepted = await foodOrders.acceptOrder(kitchen.ownerId, orderId, { prepMinutes: 15 });
    expect(accepted.merchantPhase).toBe("awaiting_payment");
    expect(accepted.prepStartedAt).toBeNull();

    // R-16: the request-payment button is locked until a call is logged (or explicitly overridden).
    await expect(foodOrders.requestPayment(kitchen.ownerId, orderId, false)).rejects.toThrow(/Log the call/i);
    await foodOrders.logCall(kitchen.ownerId, orderId);
    const requested = await foodOrders.requestPayment(kitchen.ownerId, orderId, false);
    expect(requested.paymentRequestedAt).not.toBeNull();

    // D-06: a mismatched amount blocks release and names the gap. THIS is what starts the prep clock.
    await expect(foodOrders.confirmPayment(kitchen.ownerId, orderId, { reference: "MM-1", amount: 12.0 })).rejects.toThrow(
      /expected \$12\.50, got \$12\.00/,
    );
    const paid = await foodOrders.confirmPayment(kitchen.ownerId, orderId, { reference: "MM-99001", amount: 12.5 });
    expect(paid.merchantPhase).toBe("preparing");
    expect(paid.merchantPaymentConfirmedAt).not.toBeNull();
    expect(paid.merchantPaymentReference).toBe("MM-99001");

    await foodOrders.markReady(kitchen.ownerId, orderId);
    const { pickupCode } = await foodOrders.revealPickupCode(kitchen.ownerId, orderId);
    await offerAndAccept(orderId, rider);
    await lifecycleOn.advance(orderId, rider, "confirmed");
    await lifecycleOn.advance(orderId, rider, "en_route_pickup");
    await foodOrders.confirmPickup(orderId, rider, pickupCode);

    // The whole point of this leg: pickup on a WALLET order opens NOTHING.
    const collected = await orderRow(orderId);
    expect(collected.status).toBe("picked_up");
    expect(collected.debtStatus).toBeNull();
    expect(collected.debtAmount).toBeNull();
    expect(collected.debtOpenedAt).toBeNull();
    expect(await prisma.merchantDebtLedger.count({ where: { orderId } })).toBe(0);
    // …and with no debt and no handshake pending, the rider is never soft-locked.
    expect(await hasOpenMerchantObligation(prisma, rider)).toBe(false);

    await lifecycleOn.advance(orderId, rider, "en_route_dropoff");
    // R-09 short-circuits for WALLET: already paid, so the code reveals with no handshake at all.
    const { deliveryCode } = await lifecycleOn.rotateDeliveryCode(orderId, customer);
    await lifecycleOn.confirmDelivery(orderId, rider, deliveryCode);
    expect(await lifecycleOn.completeOrder(orderId)).toEqual({ completed: true });

    const done = await orderRow(orderId);
    expect(done.status).toBe("completed");
    expect(done.debtStatus).toBeNull();
    expect(done.customerCashConfirmedAt).toBeNull();
    expect(done.riderCashConfirmedAt).toBeNull();
    expect(await prisma.merchantDebtLedger.count({ where: { orderId } })).toBe(0);
  });
});

// ── Leg 3: NO_RIDER inside the cap (N-07 / D-34) ──────────────────────────────────────────────────
describe("X2 · flags ON — NO_RIDER holds only after the attempt cap", () => {
  it(`keeps searching for all ${RESTAURANTS_DISPATCH.maxAttempts} attempts and only then enters the merchant hold`, async () => {
    const kitchen = await makeKitchen();
    const customer = await makeCustomer();
    const { orderId } = await cashOrderReadyForDispatch(kitchen, customer);

    // Nobody in range for any radius step — the genuine NO_RIDER condition, not a rider declining.
    nearbyRiders = [];

    for (let attempt = 1; attempt <= RESTAURANTS_DISPATCH.maxAttempts; attempt++) {
      expect(await dispatch.sweepSearch()).toEqual({ offered: 0, held: 0 });
      const row = await orderRow(orderId);
      expect(row.dispatchAttempt).toBe(attempt);
      // The cap is NOT reached yet — a hold here would be the D-34 screen firing early, giving the
      // kitchen a "no rider" verdict while the search still had budget left.
      expect(row.noRiderHoldAt).toBeNull();
      expect(row.status).toBe("requested");
      expect(row.merchantPhase).toBe("ready_for_pickup");
      // A no-candidate tick parks the order for RESTAURANTS_DISPATCH.offerWindowMs (60s) before it is
      // due again. Hand-advance that clock instead of sleeping out six real minutes — this is the only
      // thing the reconciler waits on, so moving it is exactly equivalent to time passing.
      await prisma.order.update({ where: { id: orderId }, data: { dispatchNextCheckAt: new Date(Date.now() - 1_000) } });
    }

    // Attempt maxAttempts+1 is the one that exceeds the budget → D-34 hold.
    expect(await dispatch.sweepSearch()).toEqual({ offered: 0, held: 1 });
    const held = await orderRow(orderId);
    expect(held.noRiderHoldAt).not.toBeNull();
    expect(held.dispatchNextCheckAt).toBeNull(); // the reconciler stops polling a held order
    expect(held.dispatchAttempt).toBe(RESTAURANTS_DISPATCH.maxAttempts);
    // The order is NOT cancelled — the hold is a merchant decision point, never an auto-exit.
    expect(held.status).toBe("requested");
    expect(held.merchantPhase).toBe("ready_for_pickup");

    // A held order is excluded from the sweep entirely — no runaway re-ticking behind the hold screen.
    expect(await dispatch.sweepSearch()).toEqual({ offered: 0, held: 0 });

    // D-34 "keep searching" resets the budget, and the very next sweep secures the rider who just
    // came online — proving the hold is recoverable, not terminal.
    await dispatch.resumeSearch(kitchen.ownerId, orderId);
    const resumed = await orderRow(orderId);
    expect(resumed.noRiderHoldAt).toBeNull();
    expect(resumed.dispatchAttempt).toBe(0);

    const rider = await makeRider();
    nearbyRiders = [{ profileId: rider, distanceM: 900 }];
    expect(await dispatch.sweepSearch()).toEqual({ offered: 1, held: 0 });
    const offered = await orderRow(orderId);
    expect(offered.status).toBe("open_for_offers");
    expect(offered.dispatchOfferedRiderId).toBe(rider);
  });
});

// ── Leg 4: race test — parcel bid vs live food offer (C3 / Q7), and the C4 debt lock ──────────────
describe("X2 · flags ON — parcel-bid vs food-offer soft-lock", () => {
  it("C3: a live food offer blocks a NEW parcel bid and freezes an EXISTING one until it resolves", async () => {
    const kitchen = await makeKitchen();
    const foodCustomer = await makeCustomer();
    const parcelCustomer = await makeCustomer();
    const rider = await makeRider();
    const { orderId: foodOrderId } = await cashOrderReadyForDispatch(kitchen, foodCustomer);

    // The rider bids on a parcel BEFORE any food offer exists — allowed, nothing to block yet.
    const parcelId = await makeParcelOrder(parcelCustomer);
    const bid = await offersOff.makeOffer({ orderId: parcelId, type: "accept", offeredFare: 2.5, etaMinutes: 6 }, rider);
    expect(await hasLiveFoodDispatchOffer(prisma, rider)).toBe(false);

    // Now dispatch hands them a live 60s food offer.
    nearbyRiders = [{ profileId: rider, distanceM: 300 }];
    expect(await dispatch.sweepSearch()).toEqual({ offered: 1, held: 0 });
    expect(await hasLiveFoodDispatchOffer(prisma, rider)).toBe(true);

    // (a) A brand-new parcel bid is refused at creation, so the customer's board never even shows a
    //     bid it couldn't select.
    const otherParcel = await makeParcelOrder(parcelCustomer);
    await expect(offersOff.makeOffer({ orderId: otherParcel, type: "accept", offeredFare: 2.5, etaMinutes: 6 }, rider)).rejects.toThrow(
      /food pickup offer waiting/i,
    );
    // (b) The bid placed BEFORE the food offer is still sitting pending — selecting it must fail too,
    //     inside the real bid-acceptance transaction (this is the leg a unit spec can only simulate).
    await expect(matchingOff.selectOffer(parcelId, bid.id, parcelCustomer)).rejects.toThrow(/pick another/i);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: parcelId }, select: { status: true } })).status).toBe("open_for_offers");

    // The lock is scoped to the LIVE window, not to the rider forever: declining the food offer frees
    // them, and the same pending bid becomes selectable again.
    await dispatch.declineDispatch(foodOrderId, rider);
    expect(await hasLiveFoodDispatchOffer(prisma, rider)).toBe(false);
    const selected = await matchingOff.selectOffer(parcelId, bid.id, parcelCustomer);
    expect(selected.status).toBe("assigned");
    expect((await prisma.order.findUniqueOrThrow({ where: { id: foodOrderId }, select: { status: true } })).status).toBe("requested");
  });

  it("C4: an open collect-and-return debt blocks the rider from any new job until the cash is back", async () => {
    const kitchen = await makeKitchen();
    const foodCustomer = await makeCustomer();
    const parcelCustomer = await makeCustomer();
    const rider = await makeRider();

    const { orderId: foodOrderId, pickupCode } = await cashOrderReadyForDispatch(kitchen, foodCustomer);
    await offerAndAccept(foodOrderId, rider);
    await lifecycleOn.advance(foodOrderId, rider, "confirmed");
    await lifecycleOn.advance(foodOrderId, rider, "en_route_pickup");
    await foodOrders.confirmPickup(foodOrderId, rider, pickupCode);
    expect(await hasOpenMerchantObligation(prisma, rider)).toBe(true);

    // Carrying the kitchen's cash, the rider is off the parcel market entirely (N-20).
    const parcelId = await makeParcelOrder(parcelCustomer);
    await expect(offersOff.makeOffer({ orderId: parcelId, type: "accept", offeredFare: 2.5, etaMinutes: 6 }, rider)).rejects.toThrow(
      /still settling with a restaurant/i,
    );
    // Same rider is also invisible to the FOOD dispatcher — the strategy's own batched mirror of the
    // soft-lock — so a second kitchen can't hand them another job either.
    const secondKitchen = await makeKitchen();
    const { orderId: secondFoodId } = await cashOrderReadyForDispatch(secondKitchen, foodCustomer);
    nearbyRiders = [{ profileId: rider, distanceM: 200 }];
    expect(await dispatch.sweepSearch()).toEqual({ offered: 0, held: 0 });
    expect((await orderRow(secondFoodId)).dispatchOfferedRiderId).toBeNull();

    // Finish the trip and hand the cash back — only THEN does the market reopen.
    await lifecycleOn.advance(foodOrderId, rider, "en_route_dropoff");
    await debt.confirmCustomerCash(foodOrderId, foodCustomer);
    await debt.confirmRiderCash(foodOrderId, rider);
    const { deliveryCode } = await lifecycleOn.rotateDeliveryCode(foodOrderId, foodCustomer);
    await lifecycleOn.confirmDelivery(foodOrderId, rider, deliveryCode);
    await debt.confirmReturnedCash(kitchen.ownerId, foodOrderId, 12.5);

    expect(await ledgerNetCents(foodOrderId)).toBe(0);
    expect(await hasOpenMerchantObligation(prisma, rider)).toBe(false);
    const reopened = await offersOff.makeOffer({ orderId: parcelId, type: "accept", offeredFare: 2.5, etaMinutes: 6 }, rider);
    expect(reopened.status).toBe("pending");
  });
});

// ── Leg 5: flags OFF regression — Express is untouched, at the DATA level ─────────────────────────
// HTTP-level dead-when-off is covered exhaustively by merchant-routes-dead.e2e.spec.ts and is
// deliberately NOT repeated here. What that spec cannot see is the shared `orders` table: with the
// flags off, merchant rows still EXIST from before the flip (or from a staging soak), so the
// question this leg answers is "can one of them ever surface in an Express query result?".
describe("X2 · flags OFF — Express regression + data-level non-interference", () => {
  it("an ordinary parcel order still runs its whole lifecycle with RESTAURANTS_ENABLED=false", async () => {
    const customer = await makeCustomer();
    const rider = await makeRider();
    const orderId = await makeParcelOrder(customer);

    const bid = await offersOff.makeOffer({ orderId, type: "accept", offeredFare: 2.5, etaMinutes: 6 }, rider);
    const { deliveryCode } = await matchingOff.selectOffer(orderId, bid.id, customer);
    for (const to of ["confirmed", "en_route_pickup", "picked_up", "en_route_dropoff"] as const) {
      await lifecycleOff.advance(orderId, rider, to);
    }
    await lifecycleOff.confirmDelivery(orderId, rider, deliveryCode);
    expect(await lifecycleOff.completeOrder(orderId)).toEqual({ completed: true });

    const done = await prisma.order.findUniqueOrThrow({ where: { id: orderId }, select: { status: true, orderType: true, debtStatus: true } });
    expect(done).toEqual({ status: "completed", orderType: "parcel", debtStatus: null });
    // A parcel order never touches the merchant money rail, whatever the flags say.
    expect(await prisma.merchantDebtLedger.count({})).toBe(0);
  });

  it("a merchant order parked in open_for_offers never leaks into an Express read", async () => {
    const kitchen = await makeKitchen();
    const foodCustomer = await makeCustomer();
    const parcelCustomer = await makeCustomer();
    const foodRider = await makeRider();
    const parcelRider = await makeRider();

    // Drive a food order to `open_for_offers` — the SAME status value Express keys its whole auction
    // on. This is the exact collision C1/C2's orderType filters exist to survive. Left LIVE on the
    // offer (not accepted), so it is genuinely sitting in that status while the Express reads run.
    const { orderId: foodOrderId } = await cashOrderReadyForDispatch(kitchen, foodCustomer);
    nearbyRiders = [{ profileId: foodRider, distanceM: 400 }];
    expect(await dispatch.sweepSearch()).toEqual({ offered: 1, held: 0 });
    expect((await orderRow(foodOrderId)).status).toBe("open_for_offers");
    const parcelId = await makeParcelOrder(parcelCustomer);

    const board = await ordersRead.listOpen();
    expect(board.map((o) => o.id)).toEqual([parcelId]);

    // The geo-scoped board is raw PostGIS SQL (`order_type = 'parcel'` inline) — the path a mocked
    // $queryRaw can never exercise. Both pickups are the same CBD point, so only the filter separates them.
    const nearby = await ordersRead.listOpen(KITCHEN.point.lat, KITCHEN.point.lng, 10_000);
    expect(nearby.map((o) => o.id)).toEqual([parcelId]);

    // A rider cannot bid on a merchant order through the Express offer rail at all.
    await expect(offersOff.makeOffer({ orderId: foodOrderId, type: "accept", offeredFare: 2.5, etaMinutes: 6 }, parcelRider)).rejects.toThrow(
      /not open for offers/i,
    );

    // A-1: Express's 90s auction reconciler must not force-expire a food order onto its clock. Backdate
    // BOTH orders well past the grace window so only the orderType predicate can tell them apart.
    const longAgo = new Date(Date.now() - 60 * 60 * 1000);
    await prisma.order.updateMany({ where: { id: { in: [parcelId, foodOrderId] } }, data: { createdAt: longAgo } });
    expect(await offerExpiryOff.reconcileStaleOffers()).toEqual({ expired: 1 });
    expect((await prisma.order.findUniqueOrThrow({ where: { id: parcelId }, select: { status: true } })).status).toBe("expired");
    const survivor = await orderRow(foodOrderId);
    expect(survivor.status).toBe("open_for_offers"); // untouched — dispatch still owns this order
  });
});
