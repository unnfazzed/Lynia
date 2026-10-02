/**
 * Order flow v2, backend B (ledger D-59) against a real Postgres: shop & pharmacy ordering, scheduled
 * orders (BRIEF §12), prescriptions behind RX_ENABLED (BRIEF §13) and the owed balance after a cancel
 * after collection (BRIEF D3f). An INT spec because every claim here is about real rows and real
 * relation filters (the merchant queue's "not yet rung" filter, the slot "Full" count, the balance CAS).
 *
 * Same conventions as launch-flip.int.spec.ts: services hand-wired, onModuleInit never called (no
 * interval sweeps), sweeps invoked directly, push/socket stubbed.
 */
import { ORDER_SCHEDULE } from "@lynia/shared";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { StubPaymentRail } from "../adapters/payments/stub-payment-rail";
import type { StorageAdapter } from "../adapters/storage/storage.interface";
import { TokenService } from "../auth/token.service";
import type { Env } from "../config/env";
import type { NotificationsService } from "../notifications/notifications.service";
import { OrderLifecycleService } from "../orders/order-lifecycle.service";
import type { OrdersService } from "../orders/orders.service";
import { PrismaService } from "../prisma/prisma.service";
import type { TrackingGateway } from "../tracking/tracking.gateway";
import { WalletService } from "../wallet/wallet.service";
import { FoodDebtService } from "./food-debt.service";
import { FoodOrderService } from "./food-order.service";
import { OrderScheduleService } from "./order-schedule.service";
import { PrescriptionService } from "./prescription.service";

const ENV = {
  RESTAURANTS_ENABLED: "true",
  SHOPS_ENABLED: "true",
  PHARMACY_ENABLED: "true",
  RX_ENABLED: "true",
  MERCHANT_DISPATCH_AUTO_ENABLED: "true",
  MERCHANT_WALLET_ENABLED: "false",
} as unknown as Env;

const prisma = new PrismaService();
const tokens = new TokenService({ JWT_SIGNING_SECRET: "order-flow-v2-int-secret-0123456789", ACCESS_TTL_SECONDS: 900 } as Env);
const pushes: Array<{ profileIds: string[]; title: string }> = [];
const notifications = {
  notifyProfiles: async (profileIds: string[], msg: { title: string }) => void pushes.push({ profileIds, title: msg.title }),
  notifyOrderStatus: async () => {},
} as unknown as NotificationsService;
const gateway = {
  emitOrderStatus: () => undefined,
  emitJobCancelled: () => undefined,
  emitFoodQueueChanged: () => undefined,
  isMerchantOnline: async () => true,
  emitBidExpired: () => undefined,
} as unknown as TrackingGateway;
const storage = { createReadUrl: async (key: string) => `https://signed.example/${key}` } as unknown as StorageAdapter;
const wallet = new WalletService(ENV, prisma);
const lifecycle = new OrderLifecycleService(ENV, prisma, tokens, gateway, notifications, { announceOpenOrder: async () => {} } as unknown as OrdersService, wallet);
const debt = new FoodDebtService(prisma, notifications, lifecycle);
const schedule = new OrderScheduleService(prisma, notifications, gateway, ENV);
const prescriptions = new PrescriptionService(prisma, notifications, gateway, storage, ENV);
const foodOrders = new FoodOrderService(prisma, tokens, notifications, debt, gateway, new StubPaymentRail(), undefined, storage, ENV, schedule, prescriptions);

const VENUE = { point: { lat: -17.8292, lng: 31.0522 }, landmark: "Venue", contactPhone: "+263771111111" };
const DROPOFF = { point: { lat: -17.8016, lng: 31.0431 }, landmark: "Avondale", contactPhone: "+263772222222" };
const ALL_DAY = Object.fromEntries(["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map((d) => [d, { open: "00:00", close: "23:59" }]));

async function clean(): Promise<void> {
  await prisma.customerBalanceEntry.deleteMany({});
  await prisma.merchantDebtLedger.deleteMany({});
  await prisma.foodDispatchAttempt.deleteMany({});
  await prisma.merchantOrderItem.deleteMany({});
  await prisma.orderEvent.deleteMany({});
  await prisma.rating.deleteMany({});
  await prisma.offer.deleteMany({});
  await prisma.order.deleteMany({});
  await prisma.merchantDish.deleteMany({});
  await prisma.merchantCategory.deleteMany({});
  await prisma.merchantMember.deleteMany({});
  await prisma.merchant.deleteMany({});
  await prisma.rider.deleteMany({});
  await prisma.profile.deleteMany({});
  pushes.length = 0;
}

async function makeProfile(prefix: string): Promise<string> {
  const p = await prisma.profile.create({ data: { firstName: prefix, lastName: "X", phone: `${prefix}_${crypto.randomUUID()}` }, select: { id: true } });
  return p.id;
}

interface Venue {
  merchantId: string;
  ownerId: string;
  dishId: string;
  rxDishId: string;
}

async function makeVenue(kind: { businessType: "restaurant" | "shop"; shopKind?: "pharmacy" | "grocery"; autoAccept?: boolean; hours?: object | null; price?: number }): Promise<Venue> {
  const ownerId = await makeProfile("owner");
  const merchant = await prisma.merchant.create({
    data: {
      name: kind.shopKind === "pharmacy" ? "Avondale Pharmacy" : kind.businessType === "shop" ? "Avondale Fresh" : "Gava's Kitchen",
      ownerProfileId: ownerId,
      pilotEnabled: true,
      location: VENUE,
      businessType: kind.businessType,
      shopKind: kind.shopKind ?? null,
      autoAccept: kind.autoAccept ?? true,
      prepBaselineMinutes: 15,
      hours: (kind.hours === undefined ? ALL_DAY : kind.hours) as object,
    },
    select: { id: true },
  });
  await prisma.merchantMember.create({ data: { merchantId: merchant.id, profileId: ownerId, role: "owner", displayName: "Owner" } });
  const category = await prisma.merchantCategory.create({ data: { merchantId: merchant.id, name: "All" }, select: { id: true } });
  const dish = await prisma.merchantDish.create({
    data: { categoryId: category.id, merchantId: merchant.id, name: "Bread 700g", priceUsd: kind.price ?? 7.3, isDraft: false, photoUrl: "x" },
    select: { id: true },
  });
  const rx = await prisma.merchantDish.create({
    data: { categoryId: category.id, merchantId: merchant.id, name: "Amoxicillin 500mg", priceUsd: 6.2, isDraft: false, photoUrl: "x", rxRequired: true },
    select: { id: true },
  });
  return { merchantId: merchant.id, ownerId, dishId: dish.id, rxDishId: rx.id };
}

const body = (dishId: string, extra: Record<string, unknown> = {}) => ({
  items: [{ dishId, quantity: 2 }],
  dropoff: DROPOFF,
  paymentMethod: "cash" as const,
  ...extra,
});

beforeAll(async () => {
  await prisma.$connect();
});
afterAll(async () => {
  await clean();
  await prisma.$disconnect();
});
beforeEach(clean);

describe("shop & pharmacy ordering (ledger D-59)", () => {
  it("a shop takes an order on the restaurants endpoint: never auto-accept, 3-minute window, same pricing, venue kind on the read", async () => {
    const shop = await makeVenue({ businessType: "shop", shopKind: "grocery" });
    const customer = await makeProfile("cust");
    const placed = await foodOrders.placeOrder(customer, shop.merchantId, body(shop.dishId));
    expect(placed.merchantPhase).toBe("awaiting_accept");
    expect(placed.autoAccepted).toBeFalsy();
    expect(placed.acceptDeadlineAt).toBeTruthy();
    expect(placed.venue?.businessType).toBe("shop");
    expect(placed.venue?.shopKind).toBe("grocery");
    expect(placed.merchantGoodsTotal).toBe(14.6);
    // Merchant side: same endpoints — it rings, accept with ready-in, "Order is packed" = markReady.
    expect((await foodOrders.listQueue(shop.ownerId)).map((o) => o.id)).toEqual([placed.id]);
    await foodOrders.acceptOrder(shop.ownerId, placed.id, { prepMinutes: 10 });
    const ready = await foodOrders.markReady(shop.ownerId, placed.id);
    expect(ready.merchantPhase).toBe("ready_for_pickup");
  });

  it("a shop in a section that's switched off can't be ordered from; a pharmacy under $4 pays the small-order fee", async () => {
    const pharmacy = await makeVenue({ businessType: "shop", shopKind: "pharmacy", price: 1.65 });
    const customer = await makeProfile("cust");
    const off = new FoodOrderService(prisma, tokens, notifications, debt, gateway, new StubPaymentRail(), undefined, storage, { ...ENV, PHARMACY_ENABLED: "false" } as Env, schedule, prescriptions);
    await expect(off.placeOrder(customer, pharmacy.merchantId, body(pharmacy.dishId))).rejects.toThrow(/not found/i);
    const placed = await foodOrders.placeOrder(customer, pharmacy.merchantId, body(pharmacy.dishId));
    expect(placed.merchantGoodsTotal).toBe(4.3); // $3.30 + $1.00 small-order fee
    expect(placed.venue?.shopKind).toBe("pharmacy");
  });
});

describe("scheduled orders (BRIEF §12)", () => {
  it("slots → place for a slot → off the live queue → Change time → rings at its time like a new order", async () => {
    const shop = await makeVenue({ businessType: "shop", shopKind: "grocery" });
    const customer = await makeProfile("cust");
    const slots = await schedule.slotsFor(shop.merchantId, DROPOFF.point);
    expect(slots.slotMinutes).toBe(30);
    const all = [...slots.today.slots, ...slots.tomorrow.slots];
    expect(all.length).toBeGreaterThan(2);
    const pick = all[1]!;
    const placed = await foodOrders.placeOrder(customer, shop.merchantId, body(shop.dishId, { scheduledFor: pick.start }));
    expect(placed.scheduledFor).toBe(pick.start);
    expect(placed.merchantPhase).toBe("awaiting_accept");
    expect(placed.acceptDeadlineAt ?? null).toBeNull();
    expect(placed.scheduleStartedAt ?? null).toBeNull();

    // Off the live board, on the Scheduled list; accept refused until it rings.
    expect(await foodOrders.listQueue(shop.ownerId)).toEqual([]);
    expect((await foodOrders.listScheduled(shop.ownerId)).map((o) => o.id)).toEqual([placed.id]);
    await expect(foodOrders.acceptOrder(shop.ownerId, placed.id, { prepMinutes: 10 })).rejects.toMatchObject({ response: { reason: "scheduled_not_started" } });

    // Change time to another offered slot; a made-up time is refused.
    await expect(foodOrders.changeSchedule(placed.id, customer, "2026-01-01T10:15:00.000Z")).rejects.toMatchObject({ response: { reason: "slot_unavailable" } });
    const moved = await foodOrders.changeSchedule(placed.id, customer, all[2]!.start);
    expect(moved.scheduledFor).toBe(all[2]!.start);

    // The ring sweep does nothing early, then rings it at ringsAt with the shop's 3-minute window.
    expect((await schedule.sweepDueRings(new Date())).rung).toBe(0);
    const ringsAt = new Date(moved.ringsAt!);
    expect((await schedule.sweepDueRings(new Date(ringsAt.getTime() + 1000))).rung).toBe(1);
    const rung = await foodOrders.getMyOrder(placed.id, customer);
    expect(rung.scheduleStartedAt).toBeTruthy();
    expect(rung.acceptDeadlineAt).toBeTruthy();
    expect((await foodOrders.listQueue(shop.ownerId)).map((o) => o.id)).toEqual([placed.id]);
    expect(pushes.some((p) => p.title === "Your scheduled order has started")).toBe(true);
    // Time can't change any more.
    await expect(foodOrders.changeSchedule(placed.id, customer, all[3]!.start)).rejects.toMatchObject({ response: { reason: "scheduled_started" } });
  });

  it("an auto-accept restaurant's scheduled cash order goes straight to cooking when it rings", async () => {
    const kitchen = await makeVenue({ businessType: "restaurant", autoAccept: true });
    const customer = await makeProfile("cust");
    const slots = await schedule.slotsFor(kitchen.merchantId, DROPOFF.point);
    const pick = slots.firstAvailable!;
    const placed = await foodOrders.placeOrder(customer, kitchen.merchantId, body(kitchen.dishId, { scheduledFor: pick.start }));
    expect(placed.autoAccepted).toBeFalsy();
    await schedule.sweepDueRings(new Date(new Date(placed.ringsAt!).getTime() + 1000));
    const rung = await foodOrders.getMyOrder(placed.id, customer);
    expect(rung.merchantPhase).toBe("preparing");
    expect(rung.autoAccepted).toBe(true);
    expect(rung.prepStartedAt).toBeTruthy();
  });

  it("a closed venue takes only a scheduled order; a full slot is listed Full and refused", async () => {
    const closed = await makeVenue({ businessType: "shop", shopKind: "grocery", hours: {} });
    const customer = await makeProfile("cust");
    // No window any day → nothing to offer, and an ASAP order is refused as closed.
    await expect(foodOrders.placeOrder(customer, closed.merchantId, body(closed.dishId))).rejects.toMatchObject({ response: { reason: "restaurant_closed" } });

    const shop = await makeVenue({ businessType: "shop", shopKind: "grocery" });
    const pick = (await schedule.slotsFor(shop.merchantId, DROPOFF.point)).firstAvailable!;
    for (let i = 0; i < ORDER_SCHEDULE.slotCapacity; i++) {
      await foodOrders.placeOrder(await makeProfile("c"), shop.merchantId, body(shop.dishId, { scheduledFor: pick.start }));
    }
    const after = await schedule.slotsFor(shop.merchantId, DROPOFF.point);
    expect([...after.today.slots, ...after.tomorrow.slots].find((s) => s.start === pick.start)?.full).toBe(true);
    expect(after.firstAvailable?.start).not.toBe(pick.start);
    await expect(foodOrders.placeOrder(customer, shop.merchantId, body(shop.dishId, { scheduledFor: pick.start }))).rejects.toMatchObject({ response: { reason: "slot_full" } });
  });
});

describe("prescriptions (BRIEF §13)", () => {
  const script = (customerId: string) => ({ photoKeys: [`rx/${customerId}/page1.jpg`], patientName: "Rudo M", consent: true as const });

  it("refuses Rx items while RX_ENABLED is off, and without a prescription while it's on", async () => {
    const pharmacy = await makeVenue({ businessType: "shop", shopKind: "pharmacy" });
    const customer = await makeProfile("cust");
    const offPrescriptions = new PrescriptionService(prisma, notifications, gateway, storage, { ...ENV, RX_ENABLED: "false" } as Env);
    const off = new FoodOrderService(prisma, tokens, notifications, debt, gateway, new StubPaymentRail(), undefined, storage, ENV, schedule, offPrescriptions);
    await expect(off.placeOrder(customer, pharmacy.merchantId, body(pharmacy.rxDishId, { prescription: script(customer) }))).rejects.toMatchObject({ response: { reason: "rx_unavailable" } });
    await expect(foodOrders.placeOrder(customer, pharmacy.merchantId, body(pharmacy.rxDishId))).rejects.toMatchObject({ response: { reason: "prescription_required" } });
    // Someone else's photo key is refused.
    await expect(
      foodOrders.placeOrder(customer, pharmacy.merchantId, body(pharmacy.rxDishId, { prescription: { ...script(customer), photoKeys: ["rx/someone-else/p.jpg"] } })),
    ).rejects.toThrow(/invalid photo key/i);
  });

  it("pharmacist check: only a pharmacist approves; packing waits for it; the rider's tick is recorded; photos only for the parties", async () => {
    const pharmacy = await makeVenue({ businessType: "shop", shopKind: "pharmacy" });
    const customer = await makeProfile("cust");
    const placed = await foodOrders.placeOrder(customer, pharmacy.merchantId, {
      ...body(pharmacy.dishId),
      items: [{ dishId: pharmacy.dishId, quantity: 1 }, { dishId: pharmacy.rxDishId, quantity: 1 }],
      prescription: script(customer),
    });
    expect(placed.prescription).toMatchObject({ status: "pending", patientName: "Rudo M", pageCount: 1 });
    expect(placed.items.find((i) => i.dishId === pharmacy.rxDishId)?.rxRequired).toBe(true);

    await expect(prescriptions.approve(pharmacy.ownerId, placed.id)).rejects.toMatchObject({ response: { reason: "not_pharmacist" } });
    await prisma.merchantMember.updateMany({ where: { profileId: pharmacy.ownerId }, data: { isPharmacist: true } });
    await foodOrders.acceptOrder(pharmacy.ownerId, placed.id, { prepMinutes: 10 });
    await expect(foodOrders.markReady(pharmacy.ownerId, placed.id)).rejects.toMatchObject({ response: { reason: "prescription_pending" } });
    await prescriptions.approve(pharmacy.ownerId, placed.id);
    await foodOrders.markReady(pharmacy.ownerId, placed.id);

    // Photos: the customer and the pharmacy, nobody else.
    expect((await prescriptions.photos(placed.id, { customerId: customer })).photos[0]!.url).toContain(`rx/${customer}/page1.jpg`);
    expect((await prescriptions.photos(placed.id, { merchantProfileId: pharmacy.ownerId })).photos).toHaveLength(1);
    await expect(prescriptions.photos(placed.id, { customerId: await makeProfile("stranger") })).rejects.toThrow(/not found/i);

    // The rider ticks at the door.
    const riderId = await makeProfile("rider");
    await prisma.rider.create({ data: { profileId: riderId, bikeReg: "ABZ 1", photoUrl: "x", kycStatus: "verified" } });
    await prisma.order.update({ where: { id: placed.id }, data: { riderId, status: "en_route_dropoff", merchantPhase: null } });
    const tick = await prescriptions.riderSawOriginal(placed.id, riderId);
    expect(tick.riderSawOriginalAt).toBeTruthy();
    expect((await foodOrders.getAsRider(placed.id, riderId)).prescription?.riderSawOriginalAt).toBeTruthy();
  });

  it("a decline takes the Rx lines off and re-prices; the customer can then cancel the rest free; all-Rx cancels the order", async () => {
    const pharmacy = await makeVenue({ businessType: "shop", shopKind: "pharmacy", price: 3.3 });
    await prisma.merchantMember.updateMany({ where: { profileId: pharmacy.ownerId }, data: { isPharmacist: true } });
    const customer = await makeProfile("cust");
    const mixed = await foodOrders.placeOrder(customer, pharmacy.merchantId, {
      ...body(pharmacy.dishId),
      items: [{ dishId: pharmacy.dishId, quantity: 1 }, { dishId: pharmacy.rxDishId, quantity: 1 }],
      prescription: script(customer),
    });
    expect(mixed.merchantGoodsTotal).toBe(9.5);
    await foodOrders.acceptOrder(pharmacy.ownerId, mixed.id, { prepMinutes: 10 });
    await prescriptions.decline(pharmacy.ownerId, mixed.id, { reason: "expired", note: "Dated 2025" });
    const after = await foodOrders.getMyOrder(mixed.id, customer);
    expect(after.status).toBe("requested");
    expect(after.merchantGoodsTotal).toBe(4.3); // $3.30 left + the $1.00 small-order fee
    expect(after.items.find((i) => i.dishId === pharmacy.rxDishId)?.available).toBe(false);
    expect(after.prescription).toMatchObject({ status: "declined", declineReason: "expired", declineNote: "Dated 2025" });
    const cancelled = await foodOrders.cancelUnpaid(mixed.id, customer);
    expect(cancelled.status).toBe("cancelled");

    const onlyRx = await foodOrders.placeOrder(customer, pharmacy.merchantId, { ...body(pharmacy.rxDishId), prescription: script(customer) });
    await prescriptions.decline(pharmacy.ownerId, onlyRx.id, { reason: "unreadable" });
    const gone = await foodOrders.getMyOrder(onlyRx.id, customer);
    expect(gone.status).toBe("cancelled");
    expect(gone.rejectionReason).toBe("rx_declined");
  });
});

describe("owed balance after a cancel after collection (BRIEF D3f)", () => {
  it("records the full total, carries it on the next order as its own line, collects it at the door, and clears on delivery", async () => {
    const kitchen = await makeVenue({ businessType: "restaurant", autoAccept: false, price: 7.5 });
    const customer = await makeProfile("cust");
    const riderId = await makeProfile("rider");
    await prisma.rider.create({ data: { profileId: riderId, bikeReg: "ABZ 2", photoUrl: "x", kycStatus: "verified" } });

    const first = await foodOrders.placeOrder(customer, kitchen.merchantId, body(kitchen.dishId));
    const firstTotal = first.total!;
    await prisma.order.update({ where: { id: first.id }, data: { riderId, status: "picked_up", collectedAt: new Date(), merchantPhase: null } });
    await lifecycle.cancel(first.id, customer, "changed my mind");
    const cancelled = await foodOrders.getMyOrder(first.id, customer);
    expect(cancelled.owedUsd).toBe(firstTotal);
    expect((await foodOrders.myBalance(customer)).owedUsd).toBe(firstTotal);

    const second = await foodOrders.placeOrder(customer, kitchen.merchantId, body(kitchen.dishId));
    expect(second.previousBalanceUsd).toBe(firstTotal);
    expect(second.total).toBe(Math.round((second.merchantGoodsTotal! + second.deliveryFee! + firstTotal) * 100) / 100);
    // Carried, so a third order placed meanwhile doesn't carry it again.
    const third = await foodOrders.placeOrder(customer, kitchen.merchantId, body(kitchen.dishId));
    expect(third.previousBalanceUsd ?? null).toBeNull();
    expect((await foodOrders.myBalance(customer)).lines[0]!.carriedOnOrderId).toBe(second.id);

    // The doorstep cash amount includes it.
    await prisma.order.update({ where: { id: second.id }, data: { riderId, status: "en_route_dropoff", merchantPhase: null } });
    await debt.confirmCustomerCash(second.id, customer);
    const row = await prisma.order.findUniqueOrThrow({ where: { id: second.id }, select: { cashHandshakeAmount: true } });
    expect(Number(row.cashHandshakeAmount)).toBe(second.total);

    // Delivered → paid.
    await prisma.order.update({ where: { id: second.id }, data: { status: "delivered", deliveredAt: new Date() } });
    expect((await foodOrders.myBalance(customer)).owedUsd).toBe(0);
  });

  it("a carrying order that ends undelivered frees the balance for the next order", async () => {
    const kitchen = await makeVenue({ businessType: "restaurant", autoAccept: false });
    const customer = await makeProfile("cust");
    const src = await foodOrders.placeOrder(customer, kitchen.merchantId, body(kitchen.dishId));
    await prisma.order.update({ where: { id: src.id }, data: { status: "cancelled" } });
    await prisma.customerBalanceEntry.create({ data: { profileId: customer, sourceOrderId: src.id, amount: 5 } });
    const carrier = await foodOrders.placeOrder(customer, kitchen.merchantId, body(kitchen.dishId));
    expect(carrier.previousBalanceUsd).toBe(5);
    await foodOrders.cancelUnpaid(carrier.id, customer);
    const next = await foodOrders.placeOrder(customer, kitchen.merchantId, body(kitchen.dishId));
    expect(next.previousBalanceUsd).toBe(5);
  });
});
