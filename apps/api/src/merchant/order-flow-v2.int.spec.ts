/**
 * Order flow v2 backend (ledger D-59) against a real Postgres: substitution rounds (BRIEF §8), proof at
 * hand-over (§9), the venue rating (§11) and the four-step track (§4).
 *
 * Same convention as launch-flip.int.spec.ts: every service hand-wired (esbuild drops DI metadata),
 * `onModuleInit()` never called (no real reconciler intervals) — sweeps are invoked directly. Push and
 * realtime are recorded stubs; everything that decides money or state is the real code on the real DB.
 */
import { afterAll, beforeEach, describe, expect, it } from "vitest";
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
import { assertPickupProofIfRequired, MerchantOrderProofService } from "./merchant-order-proof.service";
import { OrderSubstitutionService } from "./order-substitution.service";
import { VenueRatingService } from "./venue-rating.service";

const FLAGS = { RESTAURANTS_ENABLED: "true", MERCHANT_DISPATCH_AUTO_ENABLED: "true", MERCHANT_WALLET_ENABLED: "false" } as const;
const prisma = new PrismaService();
const tokens = new TokenService({ JWT_SIGNING_SECRET: "order-flow-v2-int-secret-0123456789", ACCESS_TTL_SECONDS: 900, ...FLAGS } as Env);

const pushes: Array<{ to: string[]; title: string; body: string }> = [];
const notifications = {
  notifyProfiles: async (to: string[], m: { title: string; body: string }) => void pushes.push({ to, title: m.title, body: m.body }),
  notifyOrderStatus: async () => {},
} as unknown as NotificationsService;

const statusEmits: Array<{ orderId: string; status: string; extra?: Record<string, unknown> }> = [];
const gateway = {
  emitOrderStatus: (orderId: string, status: string, extra?: Record<string, unknown>) => void statusEmits.push({ orderId, status, extra }),
  emitFoodQueueChanged: () => undefined,
  emitJobCancelled: () => undefined,
  isMerchantOnline: async () => true,
  evictRiderFromSupply: async () => undefined,
} as unknown as TrackingGateway;

const storage = { createReadUrl: async (key: string) => `https://signed.example/${key}` } as unknown as StorageAdapter;

const wallet = new WalletService({ ...FLAGS } as Env, prisma);
const lifecycle = new OrderLifecycleService({ ...FLAGS } as Env, prisma, tokens, gateway, notifications, { announceOpenOrder: async () => {} } as unknown as OrdersService, wallet);
const debt = new FoodDebtService(prisma, notifications, lifecycle);
const substitutions = new OrderSubstitutionService(prisma, notifications, gateway);
const foodOrders = new FoodOrderService(prisma, tokens, notifications, debt, gateway, new StubPaymentRail(), substitutions, storage);
const proof = new MerchantOrderProofService(prisma, lifecycle, gateway);
const venueRatings = new VenueRatingService(prisma);

const KITCHEN = { point: { lat: -17.8292, lng: 31.0522 }, landmark: "Avondale Fresh", contactPhone: "+263771111111" };
const DROPOFF = { point: { lat: -17.8016, lng: 31.0431 }, landmark: "Belgravia", contactPhone: "+263772222222" };

async function clean(): Promise<void> {
  await prisma.venueRating.deleteMany({});
  await prisma.merchantOrderSubstitution.deleteMany({});
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
  statusEmits.length = 0;
}

async function profile(role: "customer" | "merchant" | "rider"): Promise<string> {
  const p = await prisma.profile.create({ data: { role, firstName: "Rudo", lastName: "M", phone: `${role}_${crypto.randomUUID()}` }, select: { id: true } });
  return p.id;
}

interface Venue {
  merchantId: string;
  ownerId: string;
  dish: Record<"bread" | "milk" | "eggs" | "bakers" | "oil", string>;
}

/** A manual-accept venue with five items (prices from the handoff's Avondale Fresh sample). */
async function makeVenue(over: { businessType?: "restaurant" | "shop"; autoAccept?: boolean } = {}): Promise<Venue> {
  const ownerId = await profile("merchant");
  const m = await prisma.merchant.create({
    data: {
      name: "Avondale Fresh",
      ownerProfileId: ownerId,
      pilotEnabled: true,
      location: KITCHEN,
      autoAccept: over.autoAccept ?? false,
      businessType: over.businessType ?? "restaurant",
      ...(over.businessType === "shop" ? { shopKind: "grocery" as const } : {}),
    },
    select: { id: true },
  });
  const cat = await prisma.merchantCategory.create({ data: { merchantId: m.id, name: "All" }, select: { id: true } });
  const mk = async (name: string, priceUsd: number) =>
    (
      await prisma.merchantDish.create({
        data: { categoryId: cat.id, merchantId: m.id, name, priceUsd, isDraft: false, photoUrl: `dish/${name}.jpg` },
        select: { id: true },
      })
    ).id;
  return {
    merchantId: m.id,
    ownerId,
    dish: {
      bread: await mk("Lobels bread", 1.1),
      milk: await mk("Dairibord milk 2L", 3.5),
      eggs: await mk("Eggs x6", 2.0),
      bakers: await mk("Bakers Inn 700g", 1.2),
      oil: await mk("Olivine oil 2L", 6.0),
    },
  };
}

async function place(v: Venue, customerId: string, outOfStockPref?: "ask" | "remove") {
  return foodOrders.placeOrder(customerId, v.merchantId, {
    items: [
      { dishId: v.dish.bread, quantity: 1 },
      { dishId: v.dish.milk, quantity: 2 },
      { dishId: v.dish.eggs, quantity: 1 },
    ],
    dropoff: DROPOFF,
    paymentMethod: "cash",
    ...(outOfStockPref ? { outOfStockPref } : {}),
  });
}

function line(order: { items: Array<{ itemId?: string; dishId: string | null }> }, dishId: string): string {
  return order.items.find((i) => i.dishId === dishId)!.itemId!;
}

beforeEach(clean);
afterAll(async () => {
  await clean();
  await prisma.$disconnect();
});

describe("Substitution (BRIEF §8)", () => {
  it("at accept: a swap + a removal park the order for the customer's answer, priced as 'every swap declined'", async () => {
    const v = await makeVenue();
    const customerId = await profile("customer");
    const placed = await place(v, customerId);
    // bread 1.10 + milk 2×3.50 + eggs 2.00 = 10.10
    expect(placed.itemsSubtotal).toBe(10.1);
    expect(placed.track).toEqual({ step: "confirmed", index: 0, rxChecked: false });
    expect(placed.outOfStockPref).toBe("ask");

    await substitutions.propose(v.ownerId, placed.id, {
      prepMinutes: 15,
      lines: [
        { action: "swap", itemId: line(placed, v.dish.bread), dishId: v.dish.bakers },
        { action: "remove", itemId: line(placed, v.dish.eggs) },
      ],
    });
    const open = await foodOrders.getMyOrder(placed.id, customerId);
    // Legacy-coherent: an installed app sees the D-23 shortened order waiting for approval.
    expect(open.merchantPhase).toBe("awaiting_item_approval");
    expect(open.itemApprovalDeadlineAt).not.toBeNull();
    expect(open.items.find((i) => i.dishId === v.dish.bread)!.available).toBe(false);
    expect(open.items.find((i) => i.dishId === v.dish.eggs)!.available).toBe(false);
    expect(open.items.find((i) => i.dishId === v.dish.milk)!.available).toBe(true);
    // Stored total = the no-answer default: milk only (7.00), no small-order fee.
    expect(open.merchantGoodsTotal).toBe(7);
    const round = open.substitution!;
    expect(round).toMatchObject({ status: "open", kind: "at_accept", keptSubtotal: 7, wasTotal: placed.total });
    expect(round.deadlineAt).not.toBeNull();
    const swap = round.lines.find((l) => l.action === "swap")!;
    expect(swap).toMatchObject({ name: "Lobels bread", priceUsd: 1.1, swapName: "Bakers Inn 700g", swapPriceUsd: 1.2, swapQuantity: 1, answer: null });
    expect(swap.swapPhotoUrl).toBe("https://signed.example/dish/Bakers Inn 700g.jpg");
    expect(pushes.at(-1)!.title).toBe("Avondale Fresh needs your answer");
    expect(pushes.at(-1)!.body).toBe("Lobels bread is out. Swap for Bakers Inn 700g (+$0.10)? Answer in 3 min.");

    // A second round can't open while this one is.
    await expect(substitutions.propose(v.ownerId, placed.id, { lines: [{ action: "remove", itemId: line(placed, v.dish.milk) }] })).rejects.toMatchObject({
      response: { reason: "not_changeable" },
    });
    // Nor can the merchant hand it to a rider.
    await expect(foodOrders.markReady(v.ownerId, placed.id)).rejects.toThrow();

    await substitutions.confirm(customerId, placed.id, { roundId: round.id, answers: [{ lineId: swap.id, accept: true }] });
    const done = await foodOrders.getMyOrder(placed.id, customerId);
    expect(done.merchantPhase).toBe("preparing");
    expect(done.prepStartedAt).not.toBeNull();
    expect(done.merchantGoodsTotal).toBe(8.2); // milk 7.00 + Bakers 1.20
    expect(done.total).toBe(8.2 + done.deliveryFee!);
    const added = done.items.find((i) => i.dishId === v.dish.bakers)!;
    expect(added).toMatchObject({ available: true, quantity: 1, replacesItemId: line(placed, v.dish.bread) });
    expect(done.substitution).toMatchObject({ status: "confirmed" });
    expect(done.substitution!.lines.find((l) => l.action === "swap")!.answer).toBe("accept");
    expect(done.track).toMatchObject({ step: "making" });
    // The customer's room heard the phase move, with the track.
    expect(statusEmits.at(-1)).toMatchObject({ orderId: placed.id, status: "requested", extra: { merchantPhase: "preparing", track: { step: "making" } } });
  });

  it("no answer in time: the sweep declines every swap, removes those lines, and the order carries on (U3)", async () => {
    const v = await makeVenue();
    const customerId = await profile("customer");
    const placed = await place(v, customerId);
    await substitutions.propose(v.ownerId, placed.id, {
      prepMinutes: 10,
      lines: [{ action: "swap", itemId: line(placed, v.dish.bread), dishId: v.dish.bakers }],
    });
    // Not yet due: nothing happens.
    expect(await substitutions.sweepExpiredRounds(new Date())).toEqual({ timedOut: 0 });
    // The legacy 60 s item-approval sweep must not cancel a v2 round.
    await prisma.order.update({ where: { id: placed.id }, data: { itemApprovalDeadlineAt: new Date(Date.now() - 1000) } });
    expect(await foodOrders.sweepExpiredItemApprovals()).toEqual({ cancelled: 0 });

    expect(await substitutions.sweepExpiredRounds(new Date(Date.now() + 4 * 60_000))).toEqual({ timedOut: 1 });
    const after = await foodOrders.getMyOrder(placed.id, customerId);
    expect(after.status).toBe("requested");
    expect(after.merchantPhase).toBe("preparing");
    expect(after.merchantGoodsTotal).toBe(9); // milk 7.00 + eggs 2.00
    expect(after.substitution).toMatchObject({ status: "timed_out" });
    expect(after.substitution!.lines[0]!.answer).toBe("remove");
    expect(pushes.at(-1)!.body).toBe("No answer in time. Lobels bread taken off — your order carries on. New total $" + after.total!.toFixed(2) + ".");
  });

  it("removals and quantity drops apply at once and are announced — nothing to answer (U4b)", async () => {
    const v = await makeVenue();
    const customerId = await profile("customer");
    const placed = await place(v, customerId);
    await foodOrders.acceptOrder(v.ownerId, placed.id, { prepMinutes: 15 });
    await substitutions.propose(v.ownerId, placed.id, {
      lines: [
        { action: "reduce", itemId: line(placed, v.dish.milk), quantity: 1 },
        { action: "remove", itemId: line(placed, v.dish.bread) },
      ],
    });
    const after = await foodOrders.getMyOrder(placed.id, customerId);
    expect(after.merchantPhase).toBe("preparing");
    expect(after.substitution).toMatchObject({ status: "applied", kind: "mid_prep", deadlineAt: null });
    // milk 3.50 + eggs 2.00 = 5.50
    expect(after.merchantGoodsTotal).toBe(5.5);
    expect(after.items.find((i) => i.dishId === v.dish.milk)!.quantity).toBe(1);
    expect(pushes.at(-1)!.body).toMatch(/took off Dairibord milk 2L, Lobels bread — they ran out\. New total \$.+\. Nothing to answer\./);
    // Nothing open, so the kitchen can carry on to ready.
    await foodOrders.markReady(v.ownerId, placed.id);
  });

  it("small-order fee comes back when the basket drops under $4.00 (N-15)", async () => {
    const v = await makeVenue();
    const customerId = await profile("customer");
    const placed = await place(v, customerId);
    await foodOrders.acceptOrder(v.ownerId, placed.id, { prepMinutes: 15 });
    await substitutions.propose(v.ownerId, placed.id, {
      lines: [
        { action: "remove", itemId: line(placed, v.dish.milk) },
        { action: "remove", itemId: line(placed, v.dish.eggs) },
      ],
    });
    const after = await foodOrders.getMyOrder(placed.id, customerId);
    expect(after.itemsSubtotal).toBe(1.1);
    expect(after.smallOrderFee).toBe(1);
    expect(after.merchantGoodsTotal).toBe(2.1);
  });

  it("every line gone ⇒ cancelled, nothing charged (U5) — both by removal and by declined swaps", async () => {
    const v = await makeVenue();
    const customerId = await profile("customer");
    const a = await place(v, customerId);
    await substitutions.propose(v.ownerId, a.id, {
      prepMinutes: 15,
      lines: a.items.map((i) => ({ action: "remove" as const, itemId: i.itemId! })),
    });
    const ra = await foodOrders.getMyOrder(a.id, customerId);
    expect(ra).toMatchObject({ status: "cancelled", rejectionReason: "all_out_of_stock", track: null });

    const b = await place(v, customerId);
    await substitutions.propose(v.ownerId, b.id, {
      prepMinutes: 15,
      lines: [
        { action: "swap", itemId: line(b, v.dish.bread), dishId: v.dish.bakers },
        { action: "remove", itemId: line(b, v.dish.milk) },
        { action: "remove", itemId: line(b, v.dish.eggs) },
      ],
    });
    const open = await foodOrders.getMyOrder(b.id, customerId);
    expect(open.merchantGoodsTotal).toBe(0);
    const swapId = open.substitution!.lines.find((l) => l.action === "swap")!.id;
    await substitutions.confirm(customerId, b.id, { roundId: open.substitution!.id, answers: [{ lineId: swapId, accept: false }] });
    const rb = await foodOrders.getMyOrder(b.id, customerId);
    expect(rb).toMatchObject({ status: "cancelled", rejectionReason: "all_out_of_stock" });
    expect(pushes.at(-1)!.title).toBe("Avondale Fresh couldn’t supply anything in your order");
  });

  it("'Remove it' customers are never asked about swaps; confirm needs every swap answered", async () => {
    const v = await makeVenue();
    const customerId = await profile("customer");
    const r = await place(v, customerId, "remove");
    expect(r.outOfStockPref).toBe("remove");
    await expect(
      substitutions.propose(v.ownerId, r.id, { prepMinutes: 15, lines: [{ action: "swap", itemId: line(r, v.dish.bread), dishId: v.dish.bakers }] }),
    ).rejects.toMatchObject({ response: { reason: "swaps_off" } });

    const a = await place(v, customerId);
    await substitutions.propose(v.ownerId, a.id, {
      prepMinutes: 15,
      lines: [
        { action: "swap", itemId: line(a, v.dish.bread), dishId: v.dish.bakers },
        { action: "swap", itemId: line(a, v.dish.eggs), dishId: v.dish.oil },
      ],
    });
    const open = await foodOrders.getMyOrder(a.id, customerId);
    const [s1] = open.substitution!.lines;
    await expect(
      substitutions.confirm(customerId, a.id, { roundId: open.substitution!.id, answers: [{ lineId: s1!.id, accept: true }] }),
    ).rejects.toThrow(/every swap/);
  });

  it("an installed app approving through items-response keeps the order with every swap declined", async () => {
    const v = await makeVenue();
    const customerId = await profile("customer");
    const placed = await place(v, customerId);
    await substitutions.propose(v.ownerId, placed.id, {
      prepMinutes: 15,
      lines: [{ action: "swap", itemId: line(placed, v.dish.bread), dishId: v.dish.bakers }],
    });
    const res = await foodOrders.approveItems(placed.id, customerId, true);
    expect(res.merchantPhase).toBe("preparing");
    expect(res.merchantGoodsTotal).toBe(9);
    expect(res.items.some((i) => i.dishId === v.dish.bakers)).toBe(false);
  });

  it("mid-prep: the customer can cancel the whole order free while a round is open", async () => {
    const v = await makeVenue();
    const customerId = await profile("customer");
    const placed = await place(v, customerId);
    await foodOrders.acceptOrder(v.ownerId, placed.id, { prepMinutes: 15 });
    // Cooking — normally past the free-cancel point.
    await expect(foodOrders.cancelUnpaid(placed.id, customerId)).rejects.toThrow(/kitchen has started/);
    await substitutions.propose(v.ownerId, placed.id, { lines: [{ action: "swap", itemId: line(placed, v.dish.bread), dishId: v.dish.bakers }] });
    const mid = await foodOrders.getMyOrder(placed.id, customerId);
    expect(mid.substitution).toMatchObject({ status: "open", kind: "mid_prep" });
    expect(mid.merchantPhase).toBe("preparing");
    const cancelled = await foodOrders.cancelUnpaid(placed.id, customerId);
    expect(cancelled.status).toBe("cancelled");
    const round = await prisma.merchantOrderSubstitution.findFirstOrThrow({ where: { orderId: placed.id } });
    expect(round.status).toBe("cancelled");
  });

  it("the database allows one open round per order", async () => {
    const v = await makeVenue();
    const customerId = await profile("customer");
    const placed = await place(v, customerId);
    const base = { orderId: placed.id, kind: "mid_prep", status: "open", wasTotal: 1 };
    await prisma.merchantOrderSubstitution.create({ data: base });
    await expect(prisma.merchantOrderSubstitution.create({ data: base })).rejects.toThrow();
    await prisma.merchantOrderSubstitution.create({ data: { ...base, status: "confirmed" } });
  });
});

describe("Proof at hand-over (BRIEF §9)", () => {
  async function jobAt(v: Venue, status: "en_route_pickup" | "en_route_dropoff") {
    const customerId = await profile("customer");
    const riderId = await profile("rider");
    await prisma.rider.create({ data: { profileId: riderId, bikeReg: "ABH 4721", photoUrl: "x", kycStatus: "verified" } });
    const o = await prisma.order.create({
      data: {
        orderType: "merchant",
        customerId,
        riderId,
        merchantId: v.merchantId,
        pickup: KITCHEN,
        dropoff: DROPOFF,
        itemDesc: "1x Lobels bread",
        suggestedFare: 3,
        proposedFare: 3,
        agreedFare: 3,
        status,
        merchantPaymentMethod: "cash",
        merchantGoodsTotal: 1.5,
        deliveryFee: 1.5,
      },
      select: { id: true },
    });
    return { orderId: o.id, customerId, riderId };
  }

  it("a shop's order can't be collected without the sealed-bag photo; a restaurant's can", async () => {
    const shop = await makeVenue({ businessType: "shop" });
    const job = await jobAt(shop, "en_route_pickup");
    await expect(prisma.$transaction((tx) => assertPickupProofIfRequired(tx, job.orderId))).rejects.toMatchObject({
      response: { reason: "pickup_photo_required" },
    });
    const res = await proof.attachPickupProof(job.orderId, job.riderId, { key: `pickup/${job.riderId}/bag.jpg`, bagSealed: true });
    expect(res).toEqual({ orderId: job.orderId, photoAttached: true, bagSealed: true });
    await prisma.$transaction((tx) => assertPickupProofIfRequired(tx, job.orderId));

    const view = await foodOrders.getMyOrder(job.orderId, job.customerId);
    expect(view.pickupProofRequired).toBe(true);
    expect(view.pickupProof).toMatchObject({ photoUrl: `https://signed.example/pickup/${job.riderId}/bag.jpg`, bagSealed: true });
    expect(view.pickupProof!.takenAt).not.toBeNull();
    expect(view.venue).toEqual({ name: "Avondale Fresh", businessType: "shop", shopKind: "grocery" });

    const restaurant = await makeVenue();
    const rjob = await jobAt(restaurant, "en_route_pickup");
    await prisma.$transaction((tx) => assertPickupProofIfRequired(tx, rjob.orderId));
  });

  it("another rider can't attach, and a foreign photo key is refused", async () => {
    const v = await makeVenue();
    const job = await jobAt(v, "en_route_pickup");
    const other = await profile("rider");
    await expect(proof.attachPickupProof(job.orderId, other, { bagSealed: true })).rejects.toThrow(/assigned rider/);
    await expect(proof.attachPickupProof(job.orderId, job.riderId, { key: `pickup/${other}/x.jpg` })).rejects.toThrow(/Invalid photo key/);
  });

  it("the door photo carries why the code couldn't be used and who it was handed to, for customer and merchant", async () => {
    const v = await makeVenue();
    const job = await jobAt(v, "en_route_dropoff");
    await expect(
      proof.attachDoorProof(job.orderId, job.riderId, { key: `delivery-proof/${job.riderId}/gate.jpg`, reason: "handed_to_someone_else" }),
    ).rejects.toMatchObject({ response: { reason: "handed_to_required" } });
    await proof.attachDoorProof(job.orderId, job.riderId, {
      key: `delivery-proof/${job.riderId}/gate.jpg`,
      reason: "handed_to_someone_else",
      handedTo: "Chipo",
      lat: -17.8,
      lng: 31.04,
    });
    const customer = await foodOrders.getMyOrder(job.orderId, job.customerId);
    expect(customer.doorProof).toMatchObject({
      photoUrl: `https://signed.example/delivery-proof/${job.riderId}/gate.jpg`,
      reason: "handed_to_someone_else",
      handedTo: "Chipo",
    });
    const merchant = await foodOrders.getQueueOrder(v.ownerId, job.orderId);
    expect(merchant.doorProof).toMatchObject({ handedTo: "Chipo" });
    // Evidence only: the status didn't move.
    expect(customer.status).toBe("en_route_dropoff");
    expect(customer.track).toMatchObject({ step: "on_the_way" });
  });
});

describe("Venue rating (BRIEF §11)", () => {
  async function delivered(v: Venue) {
    const customerId = await profile("customer");
    const o = await prisma.order.create({
      data: {
        orderType: "merchant",
        customerId,
        merchantId: v.merchantId,
        pickup: KITCHEN,
        dropoff: DROPOFF,
        itemDesc: "1x Lobels bread",
        suggestedFare: 3,
        proposedFare: 3,
        agreedFare: 3,
        status: "delivered",
        deliveredAt: new Date(),
        merchantPaymentMethod: "cash",
        merchantGoodsTotal: 1.5,
        deliveryFee: 1.5,
      },
      select: { id: true },
    });
    return { orderId: o.id, customerId };
  }

  it("rates once, after delivery, and moves the venue's star rating exactly once across both paths", async () => {
    const v = await makeVenue();
    const a = await delivered(v);
    const first = await venueRatings.rate(a.orderId, a.customerId, { score: 4, tags: ["tasty", "well_packed"] });
    expect(first).toMatchObject({ score: 4, tags: ["tasty", "well_packed"] });
    // Idempotent: a retry with a different score returns the rating that stands.
    expect(await venueRatings.rate(a.orderId, a.customerId, { score: 1 })).toMatchObject({ score: 4 });
    // The rider rating path with a food score must not count the venue a second time.
    await lifecycle.rate(a.orderId, a.customerId, 5, undefined, 2);
    let m = await prisma.merchant.findUniqueOrThrow({ where: { id: v.merchantId } });
    expect(m.foodRatingCount).toBe(1);
    expect(m.foodRatingAvg).toBeCloseTo(4, 5);

    // A second order rated through the old foodScore path alone still counts (and is recorded once).
    const b = await delivered(v);
    await lifecycle.rate(b.orderId, b.customerId, 5, undefined, 2);
    expect(await venueRatings.rate(b.orderId, b.customerId, { score: 5 })).toMatchObject({ score: 2 });
    m = await prisma.merchant.findUniqueOrThrow({ where: { id: v.merchantId } });
    expect(m.foodRatingCount).toBe(2);
    expect(m.foodRatingAvg).toBeCloseTo(3, 5);

    const view = await foodOrders.getMyOrder(a.orderId, a.customerId);
    expect(view.venueRating).toMatchObject({ score: 4 });
    expect(view.track).toMatchObject({ step: "delivered", index: 3 });
    // The merchant's read never carries the customer's own venue rating.
    const merchantView = await foodOrders.getQueueOrder(v.ownerId, a.orderId);
    expect(merchantView.venueRating).toBeUndefined();
  });

  it("refuses before delivery and for someone else's order", async () => {
    const v = await makeVenue();
    const customerId = await profile("customer");
    const placed = await place(v, customerId);
    await expect(venueRatings.rate(placed.id, customerId, { score: 5 })).rejects.toMatchObject({ response: { reason: "not_delivered" } });
    const d = await delivered(v);
    await expect(venueRatings.rate(d.orderId, customerId, { score: 5 })).rejects.toThrow(/Not your order/);
  });
});
