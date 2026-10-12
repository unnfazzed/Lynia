import { afterEach, describe, expect, it, vi } from "vitest";
import { BadRequestException, Logger } from "@nestjs/common";
import { cancelledByOf, customerOrderOutcome, MerchantCancelOrderRequest, RESTAURANTS_TIMING } from "@lynia/shared";
import type { Env } from "../config/env";
import type { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";
import { TokenService } from "../auth/token.service";
import { PiiCryptoService } from "../common/pii-crypto.service";
import type { TrackingGateway } from "../tracking/tracking.gateway";
import type { PaymentRail } from "../adapters/payments/payment-rail.interface";
import type { FoodDebtService } from "./food-debt.service";
import { FoodOrderService } from "./food-order.service";
import { withMembershipShim } from "./testing/membership-shim";

// #670: the PaymentRail seam. Default mirrors StubPaymentRail (always `pending` — never fabricates a
// confirm), so existing tests are unaffected; the prompt tests pass a rail that confirms or fails.
function fakeRail(overrides: Record<string, unknown> = {}): PaymentRail {
  return {
    initiate: async () => ({ status: "pending", providerRef: "rail_ref_1" }),
    confirm: async () => ({ status: "pending" }),
    reconcile: async () => ({ status: "pending" }),
    ...overrides,
  } as unknown as PaymentRail;
}

const tokens = new TokenService({ JWT_SIGNING_SECRET: "food-order-test-secret-0123456789", ACCESS_TTL_SECONDS: 900 } as Env);
const notified: Array<{ profileIds: string[]; title: string; body: string }> = [];
const notifications = {
  notifyProfiles: async (profileIds: string[], msg: { title: string; body: string }) => {
    notified.push({ profileIds, ...msg });
  },
} as unknown as NotificationsService;
// C4: confirmPickup calls FoodDebtService.openDebtIfNeeded inside its own transaction — a no-op
// stub here since this file's fixtures never set merchant_payment_method="cash"/merchant_cash_rule=
// "collect_and_return" (the real method's own guard would no-op too); openDebtIfNeeded's actual
// behaviour is covered by food-debt.service.spec.ts.
const debt = { openDebtIfNeeded: async () => {} } as unknown as FoodDebtService;

// C5 kitchen socket queue: every mutating method best-effort pushes emitFoodQueueChanged.
// `queueChanges` records every push so tests can assert it fired (or didn't). `isMerchantOnline`
// stays stubbed "online"; since D1 (C1) the accept-window sweep no longer reads it.
const queueChanges: Array<{ merchantId: string; orderId: string }> = [];
function fakeGateway(overrides: Record<string, unknown> = {}) {
  return {
    emitFoodQueueChanged: (merchantId: string, orderId: string) => queueChanges.push({ merchantId, orderId }),
    isMerchantOnline: async () => true,
    ...overrides,
  } as unknown as TrackingGateway;
}

/** Fake Prisma where `$transaction(cb)` runs the callback against the same fake (tx === prisma),
 *  mirroring order-lifecycle.service.spec.ts's `build()`. */
function build(methods: Record<string, unknown>, gateway: TrackingGateway = fakeGateway(), rail: PaymentRail = fakeRail()) {
  notified.length = 0;
  queueChanges.length = 0;
  // placeOrder's account-standing read (FOOD-STANDING-01): a customer in good standing unless a test
  // overrides `profile`.
  const prisma = withMembershipShim({ profile: { findUnique: async () => ({ onHold: false, cashBanned: false, rider: null }) }, customerBalanceEntry: { findMany: async () => [] }, ...methods } as Record<string, unknown>);
  prisma.$transaction = async (cb: (tx: unknown) => unknown) => cb(prisma);
  const svc = new FoodOrderService(prisma as unknown as PrismaService, tokens, notifications, debt, gateway, rail);
  return { svc, prisma };
}

const HARARE_CBD = { lat: -17.8292, lng: 31.0522 };
const AVONDALE = { lat: -17.8003, lng: 31.0335 };

const dish = (over: Record<string, unknown> = {}) => ({
  id: "d1",
  merchantId: "m1",
  name: "Sadza & Chicken",
  priceUsd: 5,
  isDraft: false,
  outOfStockUntil: null,
  category: { hidden: false, availableFrom: null, availableTo: null },
  ...over,
});

describe("FoodOrderService.placeOrder", () => {
  it("computes goods total + N-01 delivery fee + N-15 small-order fee, all server-side (D-35)", async () => {
    let created: Record<string, unknown> | undefined;
    const { svc } = build({
      order: {
        findFirst: async () => null, // no idempotency replay
        create: async ({ data }: { data: Record<string, unknown> }) => {
          created = data;
          return { ...data, id: "o1", merchantItems: [], pickupCodeAttempts: 0, noShowCallTimestamps: [] };
        },
      },
      merchant: { findFirst: async () => ({ id: "m1", location: { point: HARARE_CBD, landmark: "CBD", contactPhone: "+263771234567" } }) },
      merchantDish: { findMany: async () => [dish({ priceUsd: 3 })] }, // below the $4 minimum
    });

    const res = await svc.placeOrder("c1", "m1", {
      items: [{ dishId: "d1", quantity: 1 }],
      dropoff: { point: AVONDALE, landmark: "Avondale", contactPhone: "+263779999999" },
      paymentMethod: "cash",
    });

    // 3.0 subtotal < $4 minimum -> +$1.00 small-order fee (N-15) -> $4.00 goods total.
    expect(created!.merchantGoodsTotal).toBe(4.0);
    expect(res.merchantGoodsTotal).toBe(4.0);
    // ~3.77km CBD->Avondale (pinned in pricing.test.ts) -> deliveryFeeForDistance.
    expect(res.deliveryFee).toBeGreaterThan(0);
    expect(res.total).toBe(res.merchantGoodsTotal! + res.deliveryFee!);
    expect(created!.status).toBe("requested");
    expect(created!.merchantPhase).toBe("awaiting_accept");
    expect(created!.acceptDeadlineAt).toBeInstanceOf(Date);
  });

  // D-71: free delivery paid by the restaurant or shop — the totals the customer sees, the rider's fee.
  describe("free delivery paid by the venue (D-71)", () => {
    function placeWith(merchantOver: Record<string, unknown>, priceUsd: number, paymentMethod: "cash" | "wallet" = "cash") {
      let created: Record<string, unknown> | undefined;
      const { svc } = build({
        order: {
          findFirst: async () => null,
          create: async ({ data }: { data: Record<string, unknown> }) => {
            created = data;
            return { ...data, id: "o1", merchantItems: [], pickupCodeAttempts: 0, noShowCallTimestamps: [] };
          },
        },
        merchant: {
          findFirst: async () => ({ id: "m1", location: { point: HARARE_CBD, landmark: "CBD", contactPhone: "+263771234567" }, ...merchantOver }),
        },
        merchantDish: { findMany: async () => [dish({ priceUsd })] },
      });
      const run = svc.placeOrder("c1", "m1", {
        items: [{ dishId: "d1", quantity: 1 }],
        dropoff: { point: AVONDALE, landmark: "Avondale", contactPhone: "+263779999999" },
        paymentMethod,
      });
      return run.then((res) => ({ res, created: created! }));
    }

    it("customer pays $0 delivery: total = goods, biker's deliveryFee unchanged, venue's share = the fee", async () => {
      const { res, created } = await placeWith({ freeDelivery: true }, 12);
      const fee = res.deliveryFee!;
      expect(fee).toBeGreaterThan(0);
      expect(created.deliveryFee).toBe(fee); // the rider's earning is the full fee
      expect(created.merchantDeliveryShare).toBe(fee);
      expect(created.agreedFare).toBe(12); // what the customer pays at the door
      expect(res.total).toBe(12);
      expect(res.customerDeliveryFee).toBe(0);
      expect(res.merchantDeliveryShare).toBe(fee);
    });

    it("a venue without the switch: customer pays goods + fee, no share stored", async () => {
      const { res, created } = await placeWith({ freeDelivery: false }, 12);
      expect(created.merchantDeliveryShare).toBeNull();
      expect(created.agreedFare).toBe(12 + res.deliveryFee!);
      expect(res).not.toHaveProperty("merchantDeliveryShare");
      expect(res).not.toHaveProperty("customerDeliveryFee");
    });

    it("goods that don't cover the fee are not funded (the venue never pays to give food away)", async () => {
      // $0.50 dish + $1.00 small-order fee = $1.50 goods, below any CBD→Avondale fee.
      const { res, created } = await placeWith({ freeDelivery: true }, 0.5);
      expect(res.deliveryFee!).toBeGreaterThan(1.5);
      expect(created.merchantDeliveryShare).toBeNull();
      expect(created.agreedFare).toBe(1.5 + res.deliveryFee!);
    });

    it("a wallet order is never funded: it isn't placed at all (cash only, D-74)", async () => {
      await expect(placeWith({ freeDelivery: true }, 12, "wallet")).rejects.toMatchObject({ response: { reason: "wallet_not_accepted" }, status: 400 });
    });
  });

  it("a shop or pharmacy that isn't orderable (its section off) is 'Shop/Pharmacy not found', not 'Restaurant' (E2E 2026-10-05 P-5)", async () => {
    const place = (kind: { businessType: string; shopKind: string | null } | null) =>
      build({
        order: { findFirst: async () => null },
        merchant: { findFirst: async () => null, findUnique: async () => kind },
      }).svc.placeOrder("c1", "m1", { items: [{ dishId: "d1", quantity: 1 }], dropoff: { point: HARARE_CBD }, paymentMethod: "cash" } as never);
    await expect(place({ businessType: "shop", shopKind: "grocery" })).rejects.toMatchObject({ status: 404, message: "Shop not found" });
    await expect(place({ businessType: "shop", shopKind: "pharmacy" })).rejects.toMatchObject({ status: 404, message: "Pharmacy not found" });
    await expect(place({ businessType: "restaurant", shopKind: null })).rejects.toMatchObject({ status: 404, message: "Restaurant not found" });
    await expect(place(null)).rejects.toMatchObject({ status: 404, message: "Restaurant not found" });
  });

  it("rejects a drop-off outside Zimbabwe server-side, naming where we serve (owner 2026-10-12, D-99)", async () => {
    let created = false;
    const { svc } = build({
      order: { findFirst: async () => null, create: async () => { created = true; return {}; } },
      merchant: { findFirst: async () => ({ id: "m1", location: { point: HARARE_CBD } }) },
      merchantDish: { findMany: async () => [dish()] },
    });
    // Lusaka, Zambia — outside the country.
    const threw = await svc
      .placeOrder("c1", "m1", { items: [{ dishId: "d1", quantity: 1 }], dropoff: { point: { lat: -15.4167, lng: 28.2833 } }, paymentMethod: "cash" } as never)
      .then(() => null)
      .catch((e: unknown) => e);
    const body = (threw as { getResponse: () => { reason: string; message: string } }).getResponse();
    expect(body.reason).toBe("outside_service_area");
    expect(body.message).toMatch(/We deliver across Zimbabwe/);
    expect(created).toBe(false);
  });

  it("has no distance cap inside the area: a CBD kitchen delivers to Norton, ~38 km away, at the per-km fee", async () => {
    const NORTON = { lat: -17.8833, lng: 30.7 };
    const { svc } = build({
      order: { findFirst: async () => null, create: async ({ data }: { data: Record<string, unknown> }) => ({ ...data, id: "o1", merchantItems: [], pickupCodeAttempts: 0, noShowCallTimestamps: [] }) },
      merchant: { findFirst: async () => ({ id: "m1", location: { point: HARARE_CBD, landmark: "CBD", contactPhone: "+263771234567" } }) },
      merchantDish: { findMany: async () => [dish()] },
    });
    const res = await svc.placeOrder("c1", "m1", {
      items: [{ dishId: "d1", quantity: 1 }],
      dropoff: { point: NORTON, landmark: "Norton", contactPhone: "+263779999999" },
      paymentMethod: "cash",
    });
    expect(res.deliveryFee).toBeGreaterThan(0);
  });

  it("rejects a draft (photoless) dish — never orderable, mirrors the customer read API's exclusion", async () => {
    const { svc } = build({
      merchant: { findFirst: async () => ({ id: "m1", location: { point: HARARE_CBD } }) },
      merchantDish: { findMany: async () => [dish({ isDraft: true })] },
    });
    await expect(
      svc.placeOrder("c1", "m1", { items: [{ dishId: "d1", quantity: 1 }], dropoff: { point: AVONDALE }, paymentMethod: "cash" } as never),
    ).rejects.toThrow(/isn't available/i);
  });

  it("rejects an out-of-stock dish (N-14)", async () => {
    const { svc } = build({
      merchant: { findFirst: async () => ({ id: "m1", location: { point: HARARE_CBD } }) },
      merchantDish: { findMany: async () => [dish({ outOfStockUntil: new Date(Date.now() + 3_600_000) })] },
    });
    await expect(
      svc.placeOrder("c1", "m1", { items: [{ dishId: "d1", quantity: 1 }], dropoff: { point: AVONDALE }, paymentMethod: "cash" } as never),
    ).rejects.toThrow(/out of stock/i);
  });

  // MJ-RM12 / U25: the server, not the storefront, decides whether a category is on sale.
  describe("a dish's category must be sellable (MJ-RM12 / U25)", () => {
    const BREAKFAST = { hidden: false, availableFrom: "07:00", availableTo: "11:00" };
    function placeWith(category: Record<string, unknown>, opts: { scheduledFor?: Date } = {}) {
      let created = false;
      const prisma = build({
        order: {
          findFirst: async () => null,
          create: async ({ data }: { data: Record<string, unknown> }) => {
            created = true;
            return { ...data, id: "o1", merchantItems: [], pickupCodeAttempts: 0, noShowCallTimestamps: [], schedule: null };
          },
        },
        merchant: { findFirst: async () => ({ id: "m1", location: { point: HARARE_CBD, landmark: "CBD", contactPhone: "+263771234567" } }) },
        merchantDish: { findMany: async () => [dish({ category })] },
      }).prisma;
      const schedule = opts.scheduledFor
        ? { resolveSlot: async () => ({ scheduledFor: opts.scheduledFor!, ringsAt: new Date(opts.scheduledFor!.getTime() - 30 * 60_000) }) }
        : undefined;
      const svc = new FoodOrderService(prisma as unknown as PrismaService, tokens, notifications, debt, fakeGateway(), fakeRail(), undefined, undefined, undefined, schedule as never);
      const run = svc.placeOrder("c1", "m1", {
        items: [{ dishId: "d1", quantity: 2 }],
        dropoff: { point: AVONDALE, landmark: "Avondale", contactPhone: "+263779999999" },
        paymentMethod: "cash",
        ...(opts.scheduledFor ? { scheduledFor: opts.scheduledFor.toISOString() } : {}),
      } as never);
      return run.then(() => created);
    }
    afterEach(() => vi.useRealTimers());

    it("refuses a dish in a hidden category with the 409 'isn't available' (a basket built before the hide)", async () => {
      await expect(placeWith({ hidden: true, availableFrom: null, availableTo: null })).rejects.toMatchObject({ status: 409, message: expect.stringMatching(/isn't available/) });
    });

    it("refuses a dish outside its category's window by the HARARE clock, and takes it inside it", async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      // 09:30 UTC is 11:30 in Harare: Breakfast is over (a UTC reading would still say 09:30, served).
      vi.setSystemTime(new Date("2026-07-29T09:30:00Z"));
      await expect(placeWith(BREAKFAST)).rejects.toMatchObject({ status: 409, response: { reason: "category_window", message: "Sadza & Chicken isn't served at that time" } });
      // 05:30 UTC is 07:30 in Harare: served (a UTC reading would say 05:30, not yet).
      vi.setSystemTime(new Date("2026-07-29T05:30:00Z"));
      await expect(placeWith(BREAKFAST)).resolves.toBe(true);
    });

    it("judges a scheduled order at its slot, not at the moment it is placed", async () => {
      vi.useFakeTimers({ toFake: ["Date"] });
      vi.setSystemTime(new Date("2026-07-29T18:00:00Z")); // 20:00 Harare, Breakfast long over
      await expect(placeWith(BREAKFAST, { scheduledFor: new Date("2026-07-30T06:30:00Z") })).resolves.toBe(true); // 08:30 tomorrow
      await expect(placeWith(BREAKFAST, { scheduledFor: new Date("2026-07-30T10:00:00Z") })).rejects.toMatchObject({ status: 409, response: { reason: "category_window", message: expect.stringMatching(/isn't served at that time$/) } }); // 12:00
    });
  });

  it("409s a merchant with no pickup point set — nothing to price the delivery fee against", async () => {
    const { svc } = build({ merchant: { findFirst: async () => ({ id: "m1", location: null }) } });
    await expect(
      svc.placeOrder("c1", "m1", { items: [{ dishId: "d1", quantity: 1 }], dropoff: { point: AVONDALE }, paymentMethod: "cash" } as never),
    ).rejects.toThrow(/isn't ready to take orders/i);
  });

  it("replays the prior order on an idempotencyKey re-submit instead of creating a second one", async () => {
    let createCalls = 0;
    const { svc } = build({
      order: {
        findFirst: async () => ({ id: "o1", merchantId: "m1", status: "requested", merchantItems: [], pickupCodeAttempts: 0, noShowCallTimestamps: [] }),
        create: async () => {
          createCalls++;
          throw new Error("must not create a second order");
        },
      },
    });
    const res = await svc.placeOrder("c1", "m1", {
      items: [{ dishId: "d1", quantity: 1 }],
      dropoff: { point: AVONDALE },
      paymentMethod: "cash",
      idempotencyKey: "11111111-1111-1111-1111-111111111111",
    } as never);
    expect(res.id).toBe("o1");
    expect(createCalls).toBe(0);
  });
});

describe("FoodOrderService.placeOrder — account standing (FOOD-STANDING-01)", () => {
  const cashOrder = { items: [{ dishId: "d1", quantity: 1 }], dropoff: { point: AVONDALE, landmark: "Avondale", contactPhone: "+263779999999" }, paymentMethod: "cash" as const };
  const walletOrder = { ...cashOrder, paymentMethod: "wallet" as const };

  /** A placeable restaurant + dish, with the account row under test and a spy on the order write. */
  function standingHarness(account: Record<string, unknown> | null) {
    const create = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ ...data, id: "o1", merchantItems: [], pickupCodeAttempts: 0, noShowCallTimestamps: [] }));
    const merchantFind = vi.fn(async () => ({ id: "m1", location: { point: HARARE_CBD, landmark: "CBD", contactPhone: "+263771234567" }, cashRule: "collect_and_return" }));
    const { svc } = build({
      profile: { findUnique: async () => account },
      order: { findFirst: async () => null, create },
      merchant: { findFirst: merchantFind },
      merchantDish: { findMany: async () => [dish()] },
    });
    return { svc, create, merchantFind };
  }

  it("a held customer is refused with Send's { reason: on_hold } shape, before anything else is read or written", async () => {
    const { svc, create, merchantFind } = standingHarness({ onHold: true, cashBanned: false, rider: null });
    await expect(svc.placeOrder("c1", "m1", cashOrder)).rejects.toMatchObject({ response: { reason: "on_hold" }, status: 403 });
    expect(merchantFind).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it("a held customer is refused for a wallet order too — a hold blocks ordering outright", async () => {
    const { svc, create } = standingHarness({ onHold: true, cashBanned: false, rider: null });
    await expect(svc.placeOrder("c1", "m1", walletOrder)).rejects.toMatchObject({ response: { reason: "on_hold" } });
    expect(create).not.toHaveBeenCalled();
  });

  it("a banned or suspended biker can't order food either (F-01, same as Send)", async () => {
    for (const [status, reason] of [["banned", "account_banned"], ["suspended", "account_suspended"]] as const) {
      const { svc, create } = standingHarness({ onHold: false, cashBanned: false, rider: { accountStatus: status } });
      await expect(svc.placeOrder("c1", "m1", walletOrder)).rejects.toMatchObject({ response: { reason }, status: 403 });
      expect(create).not.toHaveBeenCalled();
    }
  });

  it("a cash-banned customer choosing cash is refused, told food is cash only now and who to ask (D-48)", async () => {
    const { svc, create } = standingHarness({ onHold: false, cashBanned: true, rider: null });
    await expect(svc.placeOrder("c1", "m1", cashOrder)).rejects.toMatchObject({
      response: {
        reason: "cash_banned",
        message: "Food orders are cash on delivery, and cash is off for your account. Message LyniaGo on WhatsApp.",
      },
      status: 403,
    });
    expect(create).not.toHaveBeenCalled();
  });

  it("a cash-banned customer paying by wallet is refused too — wallet is retired for every new order (D-74)", async () => {
    const { svc, create, merchantFind } = standingHarness({ onHold: false, cashBanned: true, rider: null });
    await expect(svc.placeOrder("c1", "m1", walletOrder)).rejects.toMatchObject({ response: { reason: "wallet_not_accepted" }, status: 400 });
    expect(merchantFind).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it("a customer in good standing (and an active biker ordering food) is unchanged", async () => {
    for (const account of [{ onHold: false, cashBanned: false, rider: null }, { onHold: false, cashBanned: false, rider: { accountStatus: "active" } }]) {
      const { svc, create } = standingHarness(account);
      const res = await svc.placeOrder("c1", "m1", cashOrder);
      expect(res.id).toBe("o1");
      expect(create).toHaveBeenCalledTimes(1);
    }
  });
});

describe("FoodOrderService.placeOrder — cash only, a new wallet order is refused (D-74)", () => {
  const body = { items: [{ dishId: "d1", quantity: 1 }], dropoff: { point: AVONDALE, landmark: "Avondale", contactPhone: "+263779999999" } };

  function harness(existing: Record<string, unknown> | null = null) {
    const create = vi.fn(async ({ data }: { data: Record<string, unknown> }) => ({ ...data, id: "o-new", merchantItems: [], pickupCodeAttempts: 0, noShowCallTimestamps: [] }));
    const merchantFind = vi.fn(async () => ({ id: "m1", location: { point: HARARE_CBD, landmark: "CBD", contactPhone: "+263771234567" } }));
    const { svc } = build({
      profile: { findUnique: async () => ({ onHold: false, cashBanned: false, rider: null }) },
      order: { findFirst: async () => existing, create },
      merchant: { findFirst: merchantFind },
      merchantDish: { findMany: async () => [dish()] },
    });
    return { svc, create, merchantFind };
  }

  it("refuses a wallet order with a 400 and a reason code, before the venue or menu is read or anything written", async () => {
    const { svc, create, merchantFind } = harness();
    await expect(svc.placeOrder("c1", "m1", { ...body, paymentMethod: "wallet" })).rejects.toMatchObject({
      response: { reason: "wallet_not_accepted", message: "Orders are cash on delivery now. Choose cash to place your order." },
      status: 400,
    });
    expect(merchantFind).not.toHaveBeenCalled();
    expect(create).not.toHaveBeenCalled();
  });

  it("still takes the same order paid in cash, as collect-and-return", async () => {
    const { svc, create } = harness();
    const res = await svc.placeOrder("c1", "m1", { ...body, paymentMethod: "cash" });
    expect(res.id).toBe("o-new");
    expect(create).toHaveBeenCalledTimes(1);
    expect(create.mock.calls[0]![0].data).toMatchObject({ merchantPaymentMethod: "cash", merchantCashRule: "collect_and_return" });
  });

  it("a retry of a wallet order an older install placed before the change gets that order back, not a refusal", async () => {
    const placedBefore = { id: "o-old", merchantId: "m1", status: "requested", merchantPaymentMethod: "wallet", merchantItems: [], pickupCodeAttempts: 0, noShowCallTimestamps: [] };
    const { svc, create } = harness(placedBefore);
    const res = await svc.placeOrder("c1", "m1", { ...body, paymentMethod: "wallet", idempotencyKey: "11111111-1111-1111-1111-111111111111" });
    expect(res.id).toBe("o-old");
    expect(res.paymentMethod).toBe("wallet");
    expect(create).not.toHaveBeenCalled();
  });
});

describe("FoodOrderService.acceptOrder — D-23 full vs item-level", () => {
  const baseOrder = (over: Record<string, unknown> = {}) => ({
    id: "o1",
    merchantId: "m1",
    status: "requested",
    merchantPhase: "awaiting_accept",
    merchantPaymentMethod: "cash",
    deliveryFee: 2.5,
    merchantItems: [
      { id: "i1", dishId: "d1", priceUsd: 5, quantity: 2, available: null },
      { id: "i2", dishId: "d2", priceUsd: 3, quantity: 1, available: null },
    ],
    pickupCodeAttempts: 0,
    noShowCallTimestamps: [],
    ...over,
  });

  it("full accept on a CASH order goes straight to preparing (R-01: nothing to confirm upfront)", async () => {
    let updateArgs: Record<string, unknown> | undefined;
    const { svc } = build({
      merchant: { findUnique: async () => ({ id: "m1", busyMode: false }) },
      order: {
        findFirst: async () => baseOrder(),
        findUnique: async () => baseOrder({ merchantPhase: "preparing" }),
        updateMany: async (a: Record<string, unknown>) => {
          updateArgs = a;
          return { count: 1 };
        },
      },
      merchantOrderItem: { updateMany: async () => ({ count: 2 }) },
    });
    await svc.acceptOrder("p1", "o1", { prepMinutes: 15 });
    const data = (updateArgs!.data as Record<string, unknown>);
    expect(data.merchantPhase).toBe("preparing");
    expect(data.prepStartedAt).toBeInstanceOf(Date);
    expect(data.prepMinutes).toBe(15);
  });

  it("full accept on a WALLET order goes to awaiting_payment — prep does NOT start (R-17)", async () => {
    let updateArgs: Record<string, unknown> | undefined;
    const { svc } = build({
      merchant: { findUnique: async () => ({ id: "m1", busyMode: false }) },
      order: {
        findFirst: async () => baseOrder({ merchantPaymentMethod: "wallet" }),
        findUnique: async () => baseOrder({ merchantPhase: "awaiting_payment" }),
        updateMany: async (a: Record<string, unknown>) => {
          updateArgs = a;
          return { count: 1 };
        },
      },
      merchantOrderItem: { updateMany: async () => ({ count: 2 }) },
    });
    await svc.acceptOrder("p1", "o1", { prepMinutes: 10 });
    const data = updateArgs!.data as Record<string, unknown>;
    expect(data.merchantPhase).toBe("awaiting_payment");
    expect(data.prepStartedAt).toBeUndefined();
  });

  it("N-17: busy mode adds 10 minutes to the chosen prep chip", async () => {
    let updateArgs: Record<string, unknown> | undefined;
    const { svc } = build({
      merchant: { findUnique: async () => ({ id: "m1", busyMode: true }) },
      order: {
        findFirst: async () => baseOrder(),
        findUnique: async () => baseOrder({ merchantPhase: "preparing" }),
        updateMany: async (a: Record<string, unknown>) => {
          updateArgs = a;
          return { count: 1 };
        },
      },
      merchantOrderItem: { updateMany: async () => ({ count: 2 }) },
    });
    await svc.acceptOrder("p1", "o1", { prepMinutes: 15 });
    expect((updateArgs!.data as Record<string, unknown>).prepMinutes).toBe(25);
  });

  it("item-level accept (D-23) recomputes the goods total off the remaining items only", async () => {
    let updateArgs: Record<string, unknown> | undefined;
    const { svc } = build({
      merchant: { findUnique: async () => ({ id: "m1", busyMode: false }) },
      order: {
        findFirst: async () => baseOrder(),
        findUnique: async () => baseOrder({ merchantPhase: "awaiting_item_approval" }),
        updateMany: async (a: Record<string, unknown>) => {
          updateArgs = a;
          return { count: 1 };
        },
      },
      merchantOrderItem: { updateMany: async () => ({ count: 1 }) },
    });
    // Drop d1 (2x $5 = $10) — only d2 (1x $3) remains, below $4 -> +$1 small-order fee -> $4.00.
    await svc.acceptOrder("p1", "o1", { prepMinutes: 20, unavailableDishIds: ["d1"] });
    const data = updateArgs!.data as Record<string, unknown>;
    expect(data.merchantPhase).toBe("awaiting_item_approval");
    expect(data.merchantGoodsTotal).toBe(4.0);
    expect(data.agreedFare).toBe(4.0 + 2.5); // + the untouched deliveryFee
    expect(data.itemApprovalDeadlineAt).toBeInstanceOf(Date);
  });

  it("refuses to mark every item unavailable — reject the whole order instead", async () => {
    const { svc } = build({
      merchant: { findUnique: async () => ({ id: "m1", busyMode: false }) },
      order: { findFirst: async () => baseOrder() },
    });
    await expect(svc.acceptOrder("p1", "o1", { prepMinutes: 10, unavailableDishIds: ["d1", "d2"] })).rejects.toThrow(/at least one item/i);
  });

  it("409s outside the awaiting_accept phase", async () => {
    const { svc } = build({
      merchant: { findUnique: async () => ({ id: "m1", busyMode: false }) },
      order: { findFirst: async () => baseOrder({ merchantPhase: "preparing" }) },
    });
    await expect(svc.acceptOrder("p1", "o1", { prepMinutes: 10 })).rejects.toThrow(/can no longer be accepted/i);
  });
});

describe("FoodOrderService.confirmPayment — R-11 own-statement match", () => {
  const order = (over: Record<string, unknown> = {}) => ({
    id: "o1",
    merchantId: "m1",
    status: "requested",
    merchantPhase: "awaiting_payment",
    merchantGoodsTotal: 12.5,
    merchantItems: [],
    pickupCodeAttempts: 0,
    noShowCallTimestamps: [],
    ...over,
  });

  it("D-06: a mismatched amount blocks release and names the gap in dollars", async () => {
    const { svc } = build({
      merchant: { findUnique: async () => ({ id: "m1" }) },
      order: { findFirst: async () => order() },
    });
    await expect(svc.confirmPayment("p1", "o1", { reference: "REF123", amount: 10.0 })).rejects.toThrow(/expected \$12\.50, got \$10\.00/);
  });

  it("a matching amount starts the prep clock (THIS is what starts it, not acceptance)", async () => {
    let updateArgs: Record<string, unknown> | undefined;
    const { svc } = build({
      merchant: { findUnique: async () => ({ id: "m1" }) },
      order: {
        findFirst: async () => order(),
        findUnique: async () => order({ merchantPhase: "preparing" }),
        updateMany: async (a: Record<string, unknown>) => {
          updateArgs = a;
          return { count: 1 };
        },
      },
    });
    await svc.confirmPayment("p1", "o1", { reference: "REF123", amount: 12.5 });
    const data = updateArgs!.data as Record<string, unknown>;
    expect(data.merchantPhase).toBe("preparing");
    expect(data.prepStartedAt).toBeInstanceOf(Date);
    expect(data.merchantPaymentReference).toBe("REF123");
  });
});

describe("FoodOrderService.requestPayment — C5 customer push contract", () => {
  it("pushes the persistent pay-now push (kind: food_pay_now) to the customer", async () => {
    const { svc } = build({
      merchant: { findUnique: async () => ({ id: "m1" }) },
      order: {
        findFirst: async () => ({
          id: "o1",
          merchantId: "m1",
          customerId: "c1",
          merchantPhase: "awaiting_payment",
          paymentCallLoggedAt: new Date(),
          merchantItems: [],
        }),
        update: async () => ({}),
        findUnique: async () => ({ id: "o1", merchantId: "m1", status: "requested", merchantItems: [], pickupCodeAttempts: 0, noShowCallTimestamps: [] }),
      },
    });
    await svc.requestPayment("p1", "o1", false);
    expect(notified).toHaveLength(1);
    expect(notified[0]!.profileIds).toEqual(["c1"]);
    expect(notified[0]!.title).toMatch(/confirm your payment/i);
  });

  it("409s without a logged call and no override (R-16)", async () => {
    const { svc } = build({
      merchant: { findUnique: async () => ({ id: "m1" }) },
      order: {
        findFirst: async () => ({ id: "o1", merchantId: "m1", merchantPhase: "awaiting_payment", paymentCallLoggedAt: null, merchantItems: [] }),
      },
    });
    await expect(svc.requestPayment("p1", "o1", false)).rejects.toThrow(/log the call/i);
    expect(notified).toHaveLength(0);
  });
});

describe("FoodOrderService.sweepPaymentReminders — N-22", () => {
  it("reminds once, ~15 min after an unanswered payment request, and marks it sent (idempotency guard)", async () => {
    let updateArgs: Record<string, unknown> | undefined;
    const { svc } = build({
      order: {
        findMany: async () => [{ id: "o1", customerId: "c1" }],
        updateMany: async (a: Record<string, unknown>) => {
          updateArgs = a;
          return { count: 1 };
        },
      },
    });
    const res = await svc.sweepPaymentReminders();
    expect(res).toEqual({ reminded: 1 });
    expect((updateArgs!.where as Record<string, unknown>).paymentReminderSentAt).toBeNull();
    expect((updateArgs!.data as Record<string, unknown>).paymentReminderSentAt).toBeInstanceOf(Date);
    expect(notified).toHaveLength(1);
    expect(notified[0]!.profileIds).toEqual(["c1"]);
    expect(notified[0]!.title).toMatch(/still waiting/i);
  });

  it("does nothing when the CAS loses the race (already reminded by a concurrent sweep)", async () => {
    const { svc } = build({
      order: {
        findMany: async () => [{ id: "o1", customerId: "c1" }],
        updateMany: async () => ({ count: 0 }),
      },
    });
    const res = await svc.sweepPaymentReminders();
    expect(res).toEqual({ reminded: 0 });
    expect(notified).toHaveLength(0);
  });
});

describe("FoodOrderService.rejectOrder — D-11", () => {
  it("the reason IS the customer copy, pushed via notifyProfiles", async () => {
    let findUniqueCalls = 0;
    const { svc } = build({
      merchant: { findUnique: async () => ({ id: "m1" }) },
      order: {
        updateMany: async () => ({ count: 1 }),
        findUnique: async () => {
          findUniqueCalls++;
          // notifyCancelledCustomer's lookup (customerId only) runs before the final
          // mustFindWithItems re-read (full row + merchantItems) — same distinguishing-by-call-order
          // shape as merchant.service.spec.ts's becomeMerchantMock.
          return findUniqueCalls === 1
            ? { customerId: "c1" }
            : { id: "o1", merchantId: "m1", status: "cancelled", merchantItems: [], pickupCodeAttempts: 0, noShowCallTimestamps: [] };
        },
      },
      orderEvent: { create: async () => ({}) },
    });
    await svc.rejectOrder("p1", "o1", "out_of_ingredient");
    expect(notified).toHaveLength(1);
    expect(notified[0]!.profileIds).toEqual(["c1"]);
    expect(notified[0]!.body).toMatch(/out of an ingredient/i);
  });

  it("409s once the order has moved past awaiting_accept (guarded CAS)", async () => {
    const { svc } = build({
      merchant: { findUnique: async () => ({ id: "m1" }) },
      order: { updateMany: async () => ({ count: 0 }) },
    });
    await expect(svc.rejectOrder("p1", "o1", "too_busy")).rejects.toThrow(/no longer be rejected/i);
  });
});

describe("FoodOrderService.confirmPickup — N-16, mirrors confirmDelivery one hop earlier", () => {
  const row = (over: Record<string, unknown> = {}) => [
    { status: "en_route_pickup", rider_id: "r1", pickup_code_hash: tokens.hash("424242"), pickup_code_attempts: 0, ...over },
  ];

  it("404s a missing order", async () => {
    const { svc } = build({ $queryRaw: async () => [] });
    await expect(svc.confirmPickup("o1", "r1", "424242")).rejects.toThrow(/not found/i);
  });

  it("403s a caller who isn't the assigned biker", async () => {
    const { svc } = build({ $queryRaw: async () => row() });
    await expect(svc.confirmPickup("o1", "other", "424242")).rejects.toThrow(/assigned biker/i);
  });

  it("409s outside en_route_pickup", async () => {
    const { svc } = build({ $queryRaw: async () => row({ status: "picked_up" }) });
    await expect(svc.confirmPickup("o1", "r1", "424242")).rejects.toThrow(/not ready for pickup/i);
  });

  it("a wrong code increments attempts and is COMMITTED (persists across calls)", async () => {
    let attempts = 0;
    const { svc } = build({
      $queryRaw: async () => row({ pickup_code_attempts: attempts }),
      order: {
        update: async ({ data }: { data: { pickupCodeAttempts?: { increment: number } } }) => {
          if (data.pickupCodeAttempts) attempts += data.pickupCodeAttempts.increment;
        },
      },
    });
    await expect(svc.confirmPickup("o1", "r1", "000000")).rejects.toThrow(/4 attempt/);
    expect(attempts).toBe(1);
  });

  // D-59 (BRIEF §16): the pickup code is six digits now. An installed rider app still types four; that
  // attempt must come back as an ordinary wrong code (400, attempts counted), never a 500.
  it("a legacy 4-digit attempt against a 6-digit code is a clean wrong-code 400", async () => {
    let attempts = 0;
    const { svc } = build({
      $queryRaw: async () => row({ pickup_code_attempts: attempts }),
      order: {
        update: async ({ data }: { data: { pickupCodeAttempts?: { increment: number } } }) => {
          if (data.pickupCodeAttempts) attempts += data.pickupCodeAttempts.increment;
        },
      },
    });
    const err = await svc.confirmPickup("o1", "r1", "4242").catch((e: unknown) => e);
    expect(err).toBeInstanceOf(BadRequestException);
    expect((err as Error).message).toMatch(/doesn't match/);
    expect(attempts).toBe(1);
  });

  it("a code minted as 4 digits before the switch still verifies (in-flight orders at deploy)", async () => {
    const { svc } = build({
      $queryRaw: async () => row({ pickup_code_hash: tokens.hash("4242") }),
      order: { update: async () => ({}) },
      orderEvent: { create: async () => ({}) },
    });
    expect(await svc.confirmPickup("o1", "r1", "4242")).toEqual({ orderId: "o1", status: "picked_up" });
  });

  it("locks out after DELIVERY_OTP_MAX_ATTEMPTS (5) wrong tries", async () => {
    const { svc } = build({ $queryRaw: async () => row({ pickup_code_attempts: 5 }) });
    await expect(svc.confirmPickup("o1", "r1", "424242")).rejects.toThrow(/too many attempts/i);
  });

  it("the right code flips to picked_up and stamps collectedAt", async () => {
    let updateData: Record<string, unknown> | undefined;
    const { svc } = build({
      $queryRaw: async () => row(),
      order: { update: async ({ data }: { data: Record<string, unknown> }) => (updateData = data) },
      orderEvent: { create: async () => ({}) },
    });
    const res = await svc.confirmPickup("o1", "r1", "424242");
    expect(res).toEqual({ orderId: "o1", status: "picked_up" });
    expect(updateData).toEqual({ status: "picked_up", collectedAt: expect.any(Date), merchantPhase: null, pickupCodeCipher: null });
  });

  // C4: R-01 wiring — confirmPickup must hand the row's merchant/payment/cashRule/goodsTotal snapshot
  // to FoodDebtService.openDebtIfNeeded, in the SAME transaction, for the debt to ever open. This
  // fails without the change (openDebtIfNeeded wasn't called at all before C4).
  it("hands the merchant/payment/cashRule/goodsTotal snapshot to FoodDebtService.openDebtIfNeeded", async () => {
    let opened: Record<string, unknown> | undefined;
    const prisma = {} as Record<string, unknown>;
    prisma.$transaction = async (cb: (tx: unknown) => unknown) => cb(prisma);
    prisma.$queryRaw = async () =>
      row({
        merchant_id: "m1",
        merchant_payment_method: "cash",
        merchant_cash_rule: "collect_and_return",
        merchant_goods_total: 13,
        // D-71: a free-delivery order — the fee and the venue's share ride along to the debt.
        delivery_fee: 2.5,
        merchant_delivery_share: 2.5,
      });
    prisma.order = { update: async () => ({}) };
    prisma.orderEvent = { create: async () => ({}) };
    const spyDebt = { openDebtIfNeeded: async (_tx: unknown, order: Record<string, unknown>) => (opened = order) } as unknown as FoodDebtService;
    const svc = new FoodOrderService(prisma as unknown as PrismaService, tokens, notifications, spyDebt, fakeGateway(), fakeRail());

    await svc.confirmPickup("o1", "r1", "424242");
    expect(opened).toEqual({
      id: "o1",
      merchantId: "m1",
      riderId: "r1",
      merchantPaymentMethod: "cash",
      merchantCashRule: "collect_and_return",
      merchantGoodsTotal: 13,
      deliveryFee: 2.5,
      merchantDeliveryShare: 2.5,
    });
    expect(queueChanges).toEqual([{ merchantId: "m1", orderId: "o1" }]);
  });
});

describe("FoodOrderService.listQueue — E2/E3 board visibility", () => {
  it("stays visible through the whole pre-handoff dispatch lifecycle, not just status=requested, OR while a collect-and-return debt is still open", async () => {
    let whereArg: Record<string, unknown> | undefined;
    const { svc } = build({
      merchant: { findUnique: async () => ({ id: "m1" }) },
      order: {
        findMany: async (args: { where: Record<string, unknown> }) => {
          whereArg = args.where;
          return [];
        },
      },
    });
    await svc.listQueue("p1");
    expect(whereArg).toEqual({
      merchantId: "m1",
      orderType: "merchant",
      OR: [{ status: { in: ["requested", "open_for_offers", "assigned", "confirmed", "en_route_pickup"] } }, { debtStatus: "open", merchantClosedAt: null }],
      // Order flow v2: a scheduled order joins the board when it rings.
      NOT: { schedule: { is: { rungAt: null } } },
    });
  });

  it("E3: an order the debt ledger still has open stays visible even once status is delivered/undelivered", async () => {
    const { svc } = build({
      merchant: { findUnique: async () => ({ id: "m1" }) },
      order: {
        findMany: async () => [
          { id: "o1", status: "delivered", merchantPhase: null, debtStatus: "open", debtAmount: 13, merchantItems: [], pickupCodeAttempts: 0, noShowCallTimestamps: [] },
          { id: "o2", status: "undelivered", merchantPhase: null, debtStatus: "open", debtAmount: 8, merchantItems: [], pickupCodeAttempts: 0, noShowCallTimestamps: [] },
        ],
      },
    });
    const res = await svc.listQueue("p1");
    expect(res.map((o) => o.id)).toEqual(["o1", "o2"]);
    expect(res.map((o) => o.debtStatus)).toEqual(["open", "open"]);
  });
});

describe("FoodOrderService.revealPickupCode — N-16 reveal-by-rotation", () => {
  it("409s outside ready_for_pickup", async () => {
    const { svc } = build({
      merchant: { findUnique: async () => ({ id: "m1" }) },
      order: { findFirst: async () => ({ id: "o1", merchantId: "m1", merchantPhase: "preparing", merchantItems: [] }) },
    });
    await expect(svc.revealPickupCode("p1", "o1")).rejects.toThrow(/isn't ready for pickup/);
  });

  it("a legacy row (no ciphertext, no crypto wired) mints once: stores its hash, keeps the tries (D2 review), returns the raw code", async () => {
    let updateArgs: Record<string, unknown> | undefined;
    const { svc } = build({
      merchant: { findUnique: async () => ({ id: "m1" }) },
      order: {
        findFirst: async () => ({ id: "o1", merchantId: "m1", merchantPhase: "ready_for_pickup", pickupCodeHash: "old", pickupCodeAttempts: 0, merchantItems: [] }),
        updateMany: async (a: Record<string, unknown>) => {
          updateArgs = a;
          return { count: 1 };
        },
      },
    });
    const res = await svc.revealPickupCode("p1", "o1");
    expect(res.pickupCode).toMatch(/^\d{6}$/);
    expect(updateArgs).toEqual({
      // D2: pinned on the hash it replaces, so two phones racing the one-time mint can't both win.
      where: { id: "o1", merchantPhase: "ready_for_pickup", pickupCodeHash: "old" },
      data: { pickupCodeHash: tokens.hash(res.pickupCode), pickupCodeCipher: null },
    });
  });

  // E2E 2026-10-05 LB-1: a rider's acceptance clears merchantPhase, and the merchant web reveals only
  // once a rider is assigned — so this window is the one every shop and pharmacy order needs.
  it.each(["assigned", "confirmed", "en_route_pickup"])("a legacy row mints once after a biker accepts (status %s)", async (status) => {
    let updateArgs: Record<string, unknown> | undefined;
    const { svc } = build({
      merchant: { findUnique: async () => ({ id: "m1" }) },
      order: {
        findFirst: async () => ({ id: "o1", merchantId: "m1", status, merchantPhase: null, riderId: "r1", pickupCodeHash: "old", pickupCodeAttempts: 0, merchantItems: [] }),
        updateMany: async (a: Record<string, unknown>) => {
          updateArgs = a;
          return { count: 1 };
        },
      },
    });
    const res = await svc.revealPickupCode("p1", "o1");
    expect(res.pickupCode).toMatch(/^\d{6}$/);
    expect(updateArgs).toEqual({
      where: { id: "o1", status, riderId: "r1", merchantPhase: null, pickupCodeHash: "old" },
      data: { pickupCodeHash: tokens.hash(res.pickupCode), pickupCodeCipher: null },
    });
  });

  it("409s after a biker accepts when the order never had a code (codeless stays codeless)", async () => {
    const { svc } = build({
      merchant: { findUnique: async () => ({ id: "m1" }) },
      order: { findFirst: async () => ({ id: "o1", merchantId: "m1", status: "assigned", merchantPhase: null, riderId: "r1", pickupCodeHash: null, merchantItems: [] }) },
    });
    await expect(svc.revealPickupCode("p1", "o1")).rejects.toThrow(/isn't ready for pickup/);
  });

  it("409s once the biker has picked up", async () => {
    const { svc } = build({
      merchant: { findUnique: async () => ({ id: "m1" }) },
      order: { findFirst: async () => ({ id: "o1", merchantId: "m1", status: "picked_up", merchantPhase: null, riderId: "r1", pickupCodeHash: "h", merchantItems: [] }) },
    });
    await expect(svc.revealPickupCode("p1", "o1")).rejects.toThrow(/isn't ready for pickup/);
  });

  it("409s on a lost CAS race when the row has no showable code either", async () => {
    const { svc } = build({
      merchant: { findUnique: async () => ({ id: "m1" }) },
      order: {
        findFirst: async () => ({ id: "o1", merchantId: "m1", merchantPhase: "ready_for_pickup", pickupCodeHash: "old", pickupCodeAttempts: 0, merchantItems: [] }),
        updateMany: async () => ({ count: 0 }),
        findUnique: async () => ({ pickupCodeHash: "other", pickupCodeCipher: null, pickupCodeAttempts: 0 }),
      },
    });
    await expect(svc.revealPickupCode("p1", "o1")).rejects.toThrow(/Order changed, retry/);
  });
});

/**
 * Owner decision D2 (2026-10-07) / MJ-H1: the pickup code is stored sealed next to its hash, so the
 * reveal is idempotent. Before, every reveal minted a new code and reset the attempts: a second staff
 * phone (or Back and reopen) killed the code on the first phone and the rider got "That code doesn't
 * match" and a lockout. These run against a stateful fake order row and a real PiiCryptoService.
 */
describe("FoodOrderService.revealPickupCode — D2 idempotent reveal (MJ-H1)", () => {
  const pii = new PiiCryptoService({ PII_ENCRYPTION_KEY: "food-order-test-pii-key-0123456789abcdef" } as Env);

  type Row = {
    id: string;
    merchantId: string;
    status: string;
    merchantPhase: string | null;
    riderId: string | null;
    pickupCodeHash: string | null;
    pickupCodeCipher: string | null;
    pickupCodeAttempts: number;
    pickupCodeReissues: number;
    merchantItems: unknown[];
  };

  /** Prisma `where` equality for the flat fields the reveal CAS uses (`{ not: null }`, `{ gte }` included). */
  function matches(row: Row, where: Record<string, unknown>): boolean {
    return Object.entries(where).every(([k, v]) => {
      const cur = (row as unknown as Record<string, unknown>)[k];
      if (v && typeof v === "object" && "not" in (v as object)) return cur !== (v as { not: unknown }).not;
      if (v && typeof v === "object" && "gte" in (v as object)) return (cur as number) >= (v as { gte: number }).gte;
      return cur === v;
    });
  }

  /** Applies a Prisma `data` object, `{ increment }` included. */
  function apply(row: Row, data: Record<string, unknown>): void {
    const r = row as unknown as Record<string, unknown>;
    for (const [k, v] of Object.entries(data)) {
      r[k] = v && typeof v === "object" && "increment" in (v as object) ? (r[k] as number) + (v as { increment: number }).increment : v;
    }
  }

  function harness(seed: Partial<Row>, opts: { crypto?: boolean } = {}) {
    const row: Row = {
      id: "o1",
      merchantId: "m1",
      status: "assigned",
      merchantPhase: null,
      riderId: "r1",
      pickupCodeHash: null,
      pickupCodeCipher: null,
      pickupCodeAttempts: 0,
      pickupCodeReissues: 0,
      merchantItems: [],
      ...seed,
    };
    const writes: Array<Record<string, unknown>> = [];
    const prisma = withMembershipShim({
      merchant: { findUnique: async () => ({ id: "m1" }) },
      order: {
        findFirst: async () => ({ ...row }),
        findUnique: async () => ({ ...row }),
        updateMany: async ({ where, data }: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
          if (!matches(row, where)) return { count: 0 };
          writes.push(data);
          apply(row, data);
          return { count: 1 };
        },
      },
    } as Record<string, unknown>);
    prisma.$transaction = async (cb: (tx: unknown) => unknown) => cb(prisma);
    const svc = new FoodOrderService(
      prisma as unknown as PrismaService,
      tokens,
      notifications,
      debt,
      fakeGateway(),
      fakeRail(),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      opts.crypto === false ? undefined : pii,
    );
    return { svc, row, writes, prisma: prisma as Record<string, unknown> & { order: Record<string, unknown> } };
  }

  const sealed = (code: string) => ({ pickupCodeHash: tokens.hash(code), pickupCodeCipher: pii.encryptCode(code, "pickup:o1") });

  it("reveal twice (and from a second staff phone) → the same code, attempts unchanged, nothing written", async () => {
    const { svc, row, writes } = harness({ ...sealed("482913"), pickupCodeAttempts: 2 });
    const phoneA = await svc.revealPickupCode("p1", "o1");
    const phoneB = await svc.revealPickupCode("p2", "o1");
    const phoneAReopened = await svc.revealPickupCode("p1", "o1");
    expect(phoneA.pickupCode).toBe("482913");
    expect(phoneB.pickupCode).toBe("482913");
    expect(phoneAReopened.pickupCode).toBe("482913");
    expect(writes).toEqual([]);
    expect(row.pickupCodeAttempts).toBe(2);
  });

  it("is idempotent in the ready_for_pickup window too", async () => {
    const { svc, writes } = harness({ status: "requested", merchantPhase: "ready_for_pickup", riderId: null, ...sealed("100200") });
    expect((await svc.revealPickupCode("p1", "o1")).pickupCode).toBe("100200");
    expect((await svc.revealPickupCode("p1", "o1")).pickupCode).toBe("100200");
    expect(writes).toEqual([]);
  });

  it("legacy row without ciphertext → the first reveal mints once and stores both; every later reveal is stable", async () => {
    const { svc, row, writes } = harness({ pickupCodeHash: tokens.hash("111111"), pickupCodeAttempts: 1 });
    const first = await svc.revealPickupCode("p1", "o1");
    expect(first.pickupCode).toMatch(/^\d{6}$/);
    expect(row.pickupCodeHash).toBe(tokens.hash(first.pickupCode));
    expect(pii.decryptCode(row.pickupCodeCipher, "pickup:o1")).toBe(first.pickupCode);
    // D2 review: this one-time mint is not a lockout re-issue — it keeps the rider's spent tries.
    expect(row.pickupCodeAttempts).toBe(1);
    expect(row.pickupCodeReissues).toBe(0);
    expect(writes).toHaveLength(1);
    const second = await svc.revealPickupCode("p2", "o1");
    const third = await svc.revealPickupCode("p1", "o1");
    expect(second.pickupCode).toBe(first.pickupCode);
    expect(third.pickupCode).toBe(first.pickupCode);
    expect(writes).toHaveLength(1);
  });

  it("a ciphertext that doesn't match the hash (a hash-only writer moved on) is never shown — it mints instead", async () => {
    const { svc, row } = harness({ pickupCodeHash: tokens.hash("222222"), pickupCodeCipher: pii.encryptCode("999999", "pickup:o1") });
    const res = await svc.revealPickupCode("p1", "o1");
    expect(res.pickupCode).not.toBe("999999");
    expect(row.pickupCodeHash).toBe(tokens.hash(res.pickupCode));
  });

  it("a tampered ciphertext reads as no code (no throw) and mints once", async () => {
    const { svc, row } = harness({ pickupCodeHash: tokens.hash("333333"), pickupCodeCipher: "c1:AAAAtampered" });
    const res = await svc.revealPickupCode("p1", "o1");
    expect(row.pickupCodeHash).toBe(tokens.hash(res.pickupCode));
  });

  it("lockout re-issue: at the attempt cap the reveal mints a NEW code and resets the attempts; then it's stable again", async () => {
    const { svc, row } = harness({ ...sealed("482913"), pickupCodeAttempts: 5 });
    const reissued = await svc.revealPickupCode("p1", "o1");
    expect(reissued.pickupCode).not.toBe("482913");
    expect(row.pickupCodeAttempts).toBe(0);
    expect(row.pickupCodeReissues).toBe(1);
    expect(row.pickupCodeHash).toBe(tokens.hash(reissued.pickupCode));
    // A second phone that still saw the lock gets the re-issued code, not a third one.
    expect((await svc.revealPickupCode("p2", "o1")).pickupCode).toBe(reissued.pickupCode);
  });

  // D2 review (item 1): each lockout re-issue resets the tries, so without a cap a rider could cycle
  // 5 guesses → re-issue → 5 guesses for ever.
  it("refuses a lockout re-issue past HANDOVER_CODE_MAX_REISSUES (2) — nothing written, tries stay locked", async () => {
    const { svc, row, writes } = harness({ ...sealed("482913"), pickupCodeAttempts: 5, pickupCodeReissues: 2 });
    await expect(svc.revealPickupCode("p1", "o1")).rejects.toMatchObject({ status: 409, response: { reason: "pickup_code_reissue_limit" } });
    expect(writes).toEqual([]);
    expect(row.pickupCodeAttempts).toBe(5);
    expect(row.pickupCodeHash).toBe(tokens.hash("482913"));
  });

  it("re-issue 1 and 2 are allowed, the third lock is refused (at most 15 guesses per order)", async () => {
    const { svc, row } = harness({ ...sealed("482913"), pickupCodeAttempts: 5 });
    await svc.revealPickupCode("p1", "o1");
    row.pickupCodeAttempts = 5;
    await svc.revealPickupCode("p1", "o1");
    expect(row.pickupCodeReissues).toBe(2);
    row.pickupCodeAttempts = 5;
    await expect(svc.revealPickupCode("p1", "o1")).rejects.toMatchObject({ response: { reason: "pickup_code_reissue_limit" } });
  });

  it("two phones racing a re-issue on the same lock produce ONE new code (the CAS pins the lock and the count)", async () => {
    const { svc, row, prisma, writes } = harness({ ...sealed("482913"), pickupCodeAttempts: 5 });
    const realFind = prisma.order.findFirst as () => Promise<Row>;
    let raced = false;
    prisma.order.findFirst = async () => {
      const snapshot = await realFind();
      if (!raced) {
        raced = true;
        // The other phone's re-issue lands between this reveal's read (locked) and its write.
        Object.assign(row, sealed("600700"), { pickupCodeAttempts: 0, pickupCodeReissues: 1 });
      }
      return snapshot;
    };
    expect((await svc.revealPickupCode("p1", "o1")).pickupCode).toBe("600700");
    expect(writes).toEqual([]);
    expect(row.pickupCodeReissues).toBe(1);
  });

  it("a ciphertext sealed for ANOTHER order doesn't open here (AAD) — it mints instead, and says so in the log without the value", async () => {
    const warn = vi.spyOn(Logger.prototype, "warn").mockImplementation(() => undefined);
    try {
      const { svc, row } = harness({ pickupCodeHash: tokens.hash("482913"), pickupCodeCipher: pii.encryptCode("482913", "pickup:o2") });
      const res = await svc.revealPickupCode("p1", "o1");
      expect(res.pickupCode).not.toBe("482913");
      expect(row.pickupCodeHash).toBe(tokens.hash(res.pickupCode));
      const logged = warn.mock.calls.map((c) => String(c[0])).join("\n");
      expect(logged).toMatch(/did not authenticate \(kind=pickup, order=o1\)/);
      expect(logged).not.toContain("482913");
      expect(logged).not.toContain("c1:");
    } finally {
      warn.mockRestore();
    }
  });

  it("two phones racing the legacy mint both show the winner's code", async () => {
    const { svc, row, prisma } = harness({ pickupCodeHash: tokens.hash("444444") });
    // The other phone's mint lands between this reveal's read and its write.
    const realFind = prisma.order.findFirst as () => Promise<Row>;
    prisma.order.findFirst = async () => {
      const snapshot = await realFind();
      Object.assign(row, sealed("555666"));
      return snapshot;
    };
    expect((await svc.revealPickupCode("p1", "o1")).pickupCode).toBe("555666");
  });

  it("markReady seals the code it mints, so the first reveal returns that code without minting", async () => {
    const { svc, row, writes } = harness({ status: "requested", merchantPhase: "preparing", riderId: null });
    await svc.markReady("p1", "o1").catch(() => undefined); // only the write matters here, not the response mapping
    expect(row.merchantPhase).toBe("ready_for_pickup");
    const minted = writes[0]!;
    const code = pii.decryptCode(minted.pickupCodeCipher as string, "pickup:o1");
    expect(code).toMatch(/^\d{6}$/);
    expect(minted.pickupCodeHash).toBe(tokens.hash(code!));
    expect((await svc.revealPickupCode("p1", "o1")).pickupCode).toBe(code);
    expect(writes).toHaveLength(1);
  });

  it("the revealed code verifies at the counter; a wrong code counts an attempt (verification is still the hash)", async () => {
    const { svc, row, prisma } = harness({ status: "en_route_pickup", ...sealed("482913") });
    const { pickupCode } = await svc.revealPickupCode("p1", "o1");
    const queryRow = () => [
      {
        status: row.status,
        rider_id: row.riderId,
        pickup_code_hash: row.pickupCodeHash,
        pickup_code_attempts: row.pickupCodeAttempts,
        merchant_id: "m1",
        merchant_payment_method: null,
        merchant_cash_rule: null,
        merchant_goods_total: null,
        delivery_fee: null,
        merchant_delivery_share: null,
      },
    ];
    prisma.$queryRaw = async () => queryRow();
    prisma.orderEvent = { create: async () => ({}) };
    prisma.order.update = async ({ data }: { data: Record<string, unknown> }) => {
      const inc = data.pickupCodeAttempts as { increment: number } | undefined;
      if (inc) row.pickupCodeAttempts += inc.increment;
      else Object.assign(row, data);
    };
    await expect(svc.confirmPickup("o1", "r1", "000001")).rejects.toThrow(/doesn't match/);
    expect(row.pickupCodeAttempts).toBe(1);
    expect(await svc.confirmPickup("o1", "r1", pickupCode)).toEqual({ orderId: "o1", status: "picked_up" });
    // A used code is never shown again.
    expect(row.pickupCodeCipher).toBeNull();
  });
});

describe("FoodOrderService reconciler sweeps", () => {
  it("N-03 + D1: cancels `shop_closed` only once the order waited 24 h on the merchant, and notifies the customer", async () => {
    const NOW = new Date("2026-10-07T10:00:00Z");
    let listWhere: Record<string, unknown> | undefined;
    let cancelled: Record<string, unknown> | undefined;
    const { svc } = build({
      order: {
        findMany: async ({ where }: { where: Record<string, unknown> }) => {
          listWhere = where;
          return [{ id: "o1", merchantId: "m1", acceptDeadlineAt: new Date(0) }];
        },
        updateMany: async (a: Record<string, unknown>) => {
          cancelled = a;
          return { count: 1 };
        },
        findUnique: async () => ({ customerId: "c1" }),
      },
      orderEvent: { create: async () => ({}) },
    });
    const res = await svc.sweepExpiredAcceptWindows(NOW);
    expect(res).toEqual({ cancelled: 1 });
    // The window opened acceptWindowMs before acceptDeadlineAt; the cap is 24 h after that.
    const cutoff = (listWhere!.acceptDeadlineAt as { lt: Date }).lt.getTime();
    expect(cutoff).toBe(NOW.getTime() - (RESTAURANTS_TIMING.merchantWaitCapMs - RESTAURANTS_TIMING.acceptWindowMs));
    expect(NOW.getTime() - (cutoff - RESTAURANTS_TIMING.acceptWindowMs)).toBe(24 * 60 * 60 * 1000);
    const data = cancelled!.data as Record<string, unknown>;
    expect(data.status).toBe("cancelled");
    expect(data.rejectionReason).toBe("shop_closed");
    expect(notified).toHaveLength(1);
    expect(queueChanges).toEqual([{ merchantId: "m1", orderId: "o1" }]);
  });

  it("C1 (MJ-H2 + U31): an offline merchant's order is never paused — the deadline is not moved and presence is not read", async () => {
    const writes: Array<Record<string, unknown>> = [];
    const isMerchantOnline = vi.fn(async () => false);
    const { svc } = build(
      {
        order: {
          // Nothing has waited 24 h yet: the sweep finds nothing to cancel, offline or not.
          findMany: async () => [],
          updateMany: async (a: Record<string, unknown>) => {
            writes.push(a);
            return { count: 1 };
          },
        },
      },
      fakeGateway({ isMerchantOnline }),
    );
    const res = await svc.sweepExpiredAcceptWindows();
    expect(res).toEqual({ cancelled: 0 });
    expect(isMerchantOnline).not.toHaveBeenCalled();
    // The old pause rewrote acceptDeadlineAt 20 s ahead every tick (the customer's 0:20 → 0:00 loop).
    expect(writes).toEqual([]);
    expect(notified).toHaveLength(0);
  });

  it("N-18: an unanswered item-approval window is treated as a decline (named mocked default)", async () => {
    let data: Record<string, unknown> | undefined;
    const { svc } = build({
      order: {
        findMany: async () => [{ id: "o1", merchantId: "m1" }],
        updateMany: async (a: { data: Record<string, unknown> }) => {
          data = a.data;
          return { count: 1 };
        },
        findUnique: async () => ({ customerId: "c1", merchant: { name: "Mama's Kitchen" } }),
      },
      orderEvent: { create: async () => ({}) },
    });
    const res = await svc.sweepExpiredItemApprovals();
    expect(res).toEqual({ cancelled: 1 });
    expect(queueChanges).toEqual([{ merchantId: "m1", orderId: "o1" }]);
    // U33 (C8): its own reason, not the venue's `other` — so the push doesn't say the venue couldn't take it.
    expect(data).toMatchObject({ status: "cancelled", rejectionReason: "item_approval_expired" });
    expect(cancelledByOf({ cancelledBy: null, customerId: "c1", rejectionReason: data!.rejectionReason as string })).toBe("lynia");
    expect(notified).toEqual([expect.objectContaining({ profileIds: ["c1"], title: "Your order was cancelled", body: "No answer in time. Nothing was charged." })]);
    expect(notified[0]!.title).not.toMatch(/couldn.t take/);
  });

  it("U33 (C8): a venue's 'Something else' push names the venue, and the feed and history agree", async () => {
    const { svc } = build({
      order: {
        updateMany: async () => ({ count: 1 }),
        findUnique: async () => ({ id: "o1", customerId: "c1", merchantId: "m1", status: "cancelled", merchant: { name: "Mama's Kitchen" }, merchantItems: [], pickupCodeAttempts: 0, noShowCallTimestamps: [] }),
      },
      merchant: { findUnique: async () => ({ id: "m1" }), findFirst: async () => ({ id: "m1" }) },
      orderEvent: { create: async () => ({}) },
    });
    await svc.rejectOrder("p1", "o1", "other", "Gas ran out");
    expect(notified[0]!.title).toMatch(/Mama's Kitchen couldn.t take your order/);
    expect(cancelledByOf({ cancelledBy: null, customerId: "c1", rejectionReason: "other" })).toBe("merchant");
    expect(customerOrderOutcome({ status: "cancelled", cancelledBy: null, customerId: "c1", rejectionReason: "other" })).toBe("venue_declined");
  });

  it("N-23: end-of-day close only fires once the shop's own closing time has passed", async () => {
    // Pin the clock to midday: isPastClosingTime uses the server wall clock, and a "00:00" close is
    // only in the past once now >= 00:00:59.999 local — so at ~00:00 UTC (a midnight CI run) this
    // flaked to cancelled:0. Midday is unambiguously past 00:00 in every timezone. Restore in finally.
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-06-15T12:00:00Z"));
    try {
      const closeAtMidnightSoFarInThePast = { mon: { open: "00:00", close: "00:00" }, tue: { open: "00:00", close: "00:00" }, wed: { open: "00:00", close: "00:00" }, thu: { open: "00:00", close: "00:00" }, fri: { open: "00:00", close: "00:00" }, sat: { open: "00:00", close: "00:00" }, sun: { open: "00:00", close: "00:00" } };
      let cancelledCount = 0;
      const { svc } = build({
        order: {
          findMany: async () => [{ id: "o1", merchantId: "m1" }],
          updateMany: async () => {
            cancelledCount++;
            return { count: 1 };
          },
          findUnique: async () => ({ customerId: "c1" }),
        },
        merchant: { findMany: async () => [{ id: "m1", hours: closeAtMidnightSoFarInThePast }] },
        orderEvent: { create: async () => ({}) },
      });
      const res = await svc.sweepEndOfDayClose();
      expect(res).toEqual({ cancelled: 1 });
      expect(cancelledCount).toBe(1);
    } finally {
      vi.useRealTimers();
    }
  });

  it("N-23: does nothing while the shop is still within its hours", async () => {
    const openAllDay = Object.fromEntries(
      ["mon", "tue", "wed", "thu", "fri", "sat", "sun"].map((d) => [d, { open: "00:00", close: "23:59" }]),
    );
    const { svc } = build({
      order: { findMany: async () => [{ id: "o1", merchantId: "m1" }] },
      merchant: { findMany: async () => [{ id: "m1", hours: openAllDay }] },
    });
    const res = await svc.sweepEndOfDayClose();
    expect(res).toEqual({ cancelled: 0 });
  });
});

describe("FoodOrderService.toResponse — A-O14 (LC-A06) null-padding omission", () => {
  const walletOrder = {
    id: "o1",
    merchantId: "m1",
    status: "delivered",
    merchantPhase: null,
    merchantPaymentMethod: "wallet",
    merchantPaymentConfirmedAt: new Date("2026-08-04T10:00:00Z"),
    merchantItems: [],
    pickupCodeAttempts: 0,
    noShowCallTimestamps: [],
    // Never touched by a wallet order — mirrors what the real DB rows actually hold.
    cashHandshakeAmount: null,
    customerCashConfirmedAt: null,
    riderCashConfirmedAt: null,
    cashHandshakeDeadlineAt: null,
    cashHandshakeFrozenAt: null,
    merchantCashRule: null,
    debtStatus: null,
    debtAmount: null,
    debtOpenedAt: null,
    debtSettledAt: null,
    refundReference: null,
    refundAmount: null,
    refundedAt: null,
  };

  const PADDING_FIELDS = [
    "cashHandshakeAmount",
    "customerCashConfirmedAt",
    "riderCashConfirmedAt",
    "cashHandshakeDeadlineAt",
    "cashHandshakeFrozenAt",
    "merchantCashRule",
    "debtStatus",
    "debtAmount",
    "debtOpenedAt",
    "debtSettledAt",
    "refundReference",
    "refundAmount",
    "refundedAt",
  ] as const;

  it("omits every cash-handshake/debt-ledger/refund key on a wallet order with none of that state", async () => {
    const { svc } = build({ order: { findFirst: async () => walletOrder } });
    const res = await svc.getMyOrder("o1", "c1");
    for (const field of PADDING_FIELDS) expect(res).not.toHaveProperty(field);
    // Untouched fields keep serializing as normal (this isn't a blanket strip).
    expect(res.status).toBe("delivered");
    expect(res.paymentMethod).toBe("wallet");
  });

  it("keeps only the fields actually populated on a CASH collect-and-return order with an open debt", async () => {
    const { svc } = build({
      order: {
        findFirst: async () => ({
          ...walletOrder,
          merchantPaymentMethod: "cash",
          merchantCashRule: "collect_and_return",
          debtStatus: "open",
          debtAmount: 13,
          debtOpenedAt: new Date("2026-08-04T10:05:00Z"),
        }),
      },
    });
    const res = await svc.getMyOrder("o1", "c1");
    expect(res.merchantCashRule).toBe("collect_and_return");
    expect(res.debtStatus).toBe("open");
    expect(res.debtAmount).toBe(13);
    expect(res.debtOpenedAt).toBe("2026-08-04T10:05:00.000Z");
    // Still-null fields (never a cash handshake or refund on this order) stay omitted.
    for (const field of ["cashHandshakeAmount", "customerCashConfirmedAt", "riderCashConfirmedAt", "debtSettledAt", "refundReference", "refundAmount", "refundedAt"] as const) {
      expect(res).not.toHaveProperty(field);
    }
  });
});

describe("FoodOrderService.toResponse — brief 07 (U66, D-97 D3g) the venue's note", () => {
  const rejected = { id: "o1", merchantId: "m1", status: "cancelled", merchantPhase: null, merchantItems: [], pickupCodeAttempts: 0, noShowCallTimestamps: [] };

  it("carries the venue's 'Something else' note to the customer's order read", async () => {
    const { svc } = build({ order: { findFirst: async () => ({ ...rejected, rejectionReason: "other", cancelReason: "  Gas ran out, sorry  " }) } });
    const res = await svc.getMyOrder("o1", "c1");
    expect(res.venueNote).toBe("Gas ran out, sorry");
  });

  it("omits it without a note, or when the cancel wasn't the venue's 'Something else'", async () => {
    const none = build({ order: { findFirst: async () => ({ ...rejected, rejectionReason: "other", cancelReason: null }) } });
    expect(await none.svc.getMyOrder("o1", "c1")).not.toHaveProperty("venueNote");
    const customers = build({ order: { findFirst: async () => ({ ...rejected, rejectionReason: null, cancelReason: "changed my mind" }) } });
    expect(await customers.svc.getMyOrder("o1", "c1")).not.toHaveProperty("venueNote");
  });
});

describe("FoodOrderService.toResponse — #671 assigned-rider identity block", () => {
  const riderJoin = {
    profileId: "r1",
    bikeReg: "AEE 4471",
    vehicleInfo: "Red Honda Ace",
    ratingAvg: 4.8,
    ratingCount: 132,
    tripsCount: 132,
    kycStatus: "verified",
    photoUrl: "https://cdn.lynia/r1.jpg",
    profile: { firstName: "Tendai", lastName: "M" },
  };
  const assignedOrder = (rider: unknown) => ({
    id: "o1",
    merchantId: "m1",
    status: "assigned",
    merchantPhase: null,
    merchantPaymentMethod: "wallet",
    merchantItems: [],
    riderId: rider ? "r1" : null,
    dispatchAttempt: 1,
    pickupCodeAttempts: 0,
    noShowCallTimestamps: [],
    merchant: { location: { contactPhone: "+263771234567" }, ownerProfile: { phone: "+263771234567" } },
    rider,
  });

  it("maps the joined biker to the public identity block (plate=bike_reg, kycVerified from kyc_status)", async () => {
    const { svc } = build({ order: { findFirst: async () => assignedOrder(riderJoin) } });
    const res = await svc.getAsRider("o1", "r1");
    expect(res.rider).toEqual({
      profileId: "r1",
      firstName: "Tendai",
      lastName: "M",
      photoUrl: "https://cdn.lynia/r1.jpg",
      ratingAvg: 4.8,
      ratingCount: 132,
      tripsCount: 132,
      vehicleInfo: "Red Honda Ace",
      plate: "AEE 4471",
      kycVerified: true,
    });
  });

  it("reports kycVerified=false for a non-verified biker (pending/failed/expired)", async () => {
    const { svc } = build({ order: { findFirst: async () => assignedOrder({ ...riderJoin, kycStatus: "pending" }) } });
    const res = await svc.getAsRider("o1", "r1");
    expect(res.rider?.kycVerified).toBe(false);
  });

  it("omits the biker block entirely before a biker is assigned (null join)", async () => {
    const { svc } = build({ order: { findFirst: async () => assignedOrder(null) } });
    const res = await svc.getAsRider("o1", "r1");
    expect(res).not.toHaveProperty("rider");
  });
});

describe("FoodOrderService payment prompt (#670)", () => {
  const awaitingOrder = (over: Record<string, unknown> = {}) => ({
    id: "o1",
    merchantId: "m1",
    customerId: "c1",
    status: "confirmed",
    merchantPhase: "awaiting_payment",
    merchantPaymentMethod: "wallet",
    merchantGoodsTotal: 13,
    deliveryFee: 2.5,
    merchantItems: [],
    pickupCodeAttempts: 0,
    noShowCallTimestamps: [],
    paymentPromptStatus: null,
    paymentPromptRef: null,
    merchantPaymentReference: null,
    ...over,
  });

  it("sendPaymentPrompt pushes the prompt via the rail and records pending + the rail ref", async () => {
    let updated: Record<string, unknown> | undefined;
    const base = awaitingOrder();
    const { svc } = build({
      order: {
        findFirst: async () => base,
        findUnique: async () => ({ ...base, paymentPromptStatus: "pending", paymentPromptRef: "rail_ref_1" }),
        update: async ({ data }: { data: Record<string, unknown> }) => { updated = data; return {}; },
      },
      profile: { findUnique: async () => ({ phone: "+263771234567" }) },
    });
    const res = await svc.sendPaymentPrompt("o1", "c1", "ecocash");
    expect(updated).toMatchObject({ paymentPromptStatus: "pending", paymentPromptRail: "ecocash", paymentPromptRef: "rail_ref_1" });
    expect(res.paymentPromptStatus).toBe("pending");
  });

  it("sendPaymentPrompt is idempotent — a prompt already pending is never re-pushed", async () => {
    let initiated = false;
    const { svc } = build(
      { order: { findFirst: async () => awaitingOrder({ paymentPromptStatus: "pending", paymentPromptRef: "rail_ref_1" }) } },
      undefined,
      fakeRail({ initiate: async () => { initiated = true; return { status: "pending", providerRef: "x" }; } }),
    );
    const res = await svc.sendPaymentPrompt("o1", "c1", "ecocash");
    expect(initiated).toBe(false);
    expect(res.paymentPromptStatus).toBe("pending");
  });

  it("sendPaymentPrompt rejects a cash order (paid at the door, not by prompt)", async () => {
    const { svc } = build({ order: { findFirst: async () => awaitingOrder({ merchantPaymentMethod: "cash" }) } });
    await expect(svc.sendPaymentPrompt("o1", "c1", "ecocash")).rejects.toThrow(/paid at the door/i);
  });

  it("checkPaymentPrompt on a confirmed rail result marks confirmed and bridges the ref into merchantPaymentReference", async () => {
    let updated: Record<string, unknown> | undefined;
    const base = awaitingOrder({ paymentPromptStatus: "pending", paymentPromptRef: "rail_ref_1" });
    const { svc } = build(
      {
        order: {
          findFirst: async () => base,
          findUnique: async () => ({ ...base, paymentPromptStatus: "confirmed" }),
          update: async ({ data }: { data: Record<string, unknown> }) => { updated = data; return {}; },
        },
      },
      undefined,
      fakeRail({ confirm: async () => ({ status: "confirmed", providerRef: "rail_ref_1" }) }),
    );
    await svc.checkPaymentPrompt("o1", "c1");
    expect(updated).toMatchObject({ paymentPromptStatus: "confirmed", merchantPaymentReference: "rail_ref_1" });
  });

  it("checkPaymentPrompt leaves a still-pending prompt untouched (stub rail never confirms)", async () => {
    let touched = false;
    const { svc } = build({
      order: {
        findFirst: async () => awaitingOrder({ paymentPromptStatus: "pending", paymentPromptRef: "rail_ref_1" }),
        findUnique: async () => awaitingOrder({ paymentPromptStatus: "pending", paymentPromptRef: "rail_ref_1" }),
        update: async () => { touched = true; return {}; },
      },
    }); // default fakeRail confirm → pending
    const res = await svc.checkPaymentPrompt("o1", "c1");
    expect(touched).toBe(false);
    expect(res.paymentPromptStatus).toBe("pending");
  });
});

describe("D-48 · merchant mobile redesign: open switch, cash only, closing an order after pickup", () => {
  const cash = { items: [{ dishId: "d1", quantity: 1 }], dropoff: { point: AVONDALE, landmark: "Avondale", contactPhone: "+263779999999" }, paymentMethod: "cash" as const };

  function placing(merchant: Record<string, unknown>) {
    let created: Record<string, unknown> | undefined;
    const { svc } = build({
      order: {
        findFirst: async () => null,
        create: async ({ data }: { data: Record<string, unknown> }) => {
          created = data;
          return { ...data, id: "o1", merchantItems: [], pickupCodeAttempts: 0, noShowCallTimestamps: [] };
        },
      },
      merchant: { findFirst: async () => ({ id: "m1", location: { point: HARARE_CBD, landmark: "CBD", contactPhone: "+263771234567" }, ...merchant }) },
      merchantDish: { findMany: async () => [dish()] },
    });
    return { svc, created: () => created };
  }

  it("refuses an order while the restaurant is closed by hand, and takes one once that has passed", async () => {
    const closed = placing({ closedUntil: new Date(Date.now() + 3_600_000) });
    await expect(closed.svc.placeOrder("c1", "m1", cash)).rejects.toMatchObject({ response: { reason: "restaurant_closed" }, status: 409 });
    expect(closed.created()).toBeUndefined();

    const reopened = placing({ closedUntil: new Date(Date.now() - 1000) });
    await reopened.svc.placeOrder("c1", "m1", cash);
    expect(reopened.created()).toBeDefined();
  });

  it("makes every cash order collect-and-return — the biker brings the cash back — whatever the shop's old rule", async () => {
    const h = placing({ cashRule: "pay_upfront" });
    await h.svc.placeOrder("c1", "m1", cash);
    expect(h.created()!.merchantCashRule).toBe("collect_and_return");
  });

  function closing(order: Record<string, unknown>) {
    const updates: Record<string, unknown>[] = [];
    const base = { id: "o1", merchantId: "m1", merchantItems: [], pickupCodeAttempts: 0, noShowCallTimestamps: [], merchantClosedAt: null, ...order };
    const { svc } = build({
      merchant: { findUnique: async () => ({ id: "m1" }) },
      order: {
        findFirst: async () => base,
        update: async ({ data }: { data: Record<string, unknown> }) => {
          updates.push(data);
          return { ...base, ...data };
        },
      },
    });
    return { svc, updates };
  }

  it("closes the merchant's side after pickup — no cash, or mark completed — without touching the delivery", async () => {
    const h = closing({ status: "delivered", debtStatus: "open", debtAmount: 12, deliveredAt: new Date() });
    const res = await h.svc.closeOrder("p1", "o1", "no_cash");
    expect(h.updates).toHaveLength(1);
    expect(Object.keys(h.updates[0]!).sort()).toEqual(["merchantCloseReason", "merchantClosedAt"]);
    expect(h.updates[0]!.merchantCloseReason).toBe("no_cash");
    expect(res.merchantCloseReason).toBe("no_cash");
    expect(res.status).toBe("delivered");

    const riding = closing({ status: "en_route_dropoff", debtStatus: "open" });
    expect((await riding.svc.closeOrder("p1", "o1", "force")).merchantCloseReason).toBe("force");
  });

  it("never closes before the biker has the food (owner decision: that would be a cancel)", async () => {
    for (const status of ["requested", "open_for_offers", "assigned", "en_route_pickup"]) {
      const h = closing({ status });
      await expect(h.svc.closeOrder("p1", "o1", "force")).rejects.toMatchObject({ response: { reason: "not_picked_up" }, status: 409 });
      expect(h.updates).toHaveLength(0);
    }
  });

  it("is idempotent, and leaves a debt that was already settled alone", async () => {
    const closedAt = new Date("2026-09-30T12:00:00Z");
    const again = closing({ status: "delivered", debtStatus: "open", merchantClosedAt: closedAt, merchantCloseReason: "no_cash" });
    expect((await again.svc.closeOrder("p1", "o1", "force")).merchantCloseReason).toBe("no_cash");
    expect(again.updates).toHaveLength(0);

    const settled = closing({ status: "delivered", debtStatus: "settled_cash" });
    await settled.svc.closeOrder("p1", "o1", "no_cash");
    expect(settled.updates).toHaveLength(0);
  });

  it("gives an open debt its due time — delivery plus the 30-minute return window — and the times the screens draw", async () => {
    const deliveredAt = new Date("2026-09-30T12:31:00Z");
    const { svc } = build({});
    const res = await (svc as unknown as { toResponse: (o: unknown) => MerchantOrderResponseLike }).toResponse({
      id: "o1",
      merchantId: "m1",
      status: "delivered",
      merchantItems: [],
      pickupCodeAttempts: 0,
      noShowCallTimestamps: [],
      debtStatus: "open",
      deliveredAt,
      createdAt: new Date("2026-09-30T12:04:00Z"),
      merchantClosedAt: null,
      merchantCloseReason: null,
    });
    expect(res.cashDueAt).toBe("2026-09-30T13:01:00.000Z");
    expect(res.deliveredAt).toBe("2026-09-30T12:31:00.000Z");
    expect(res.createdAt).toBe("2026-09-30T12:04:00.000Z");
    expect("merchantClosedAt" in res).toBe(false);
  });

  it("a single-order read carries the step times for the tracking stepper", async () => {
    const at = new Date("2026-09-30T12:04:00Z");
    const { svc } = build({
      merchant: { findUnique: async () => ({ id: "m1" }) },
      order: { findFirst: async () => ({ id: "o1", merchantId: "m1", status: "picked_up", merchantItems: [], pickupCodeAttempts: 0, noShowCallTimestamps: [] }) },
      orderEvent: { findMany: async () => [{ status: "requested", createdAt: at }] },
    });
    expect((await svc.getQueueOrder("p1", "o1")).timeline).toEqual([{ status: "requested", at: "2026-09-30T12:04:00.000Z" }]);
  });
});

type MerchantOrderResponseLike = Record<string, unknown> & { cashDueAt?: string; deliveredAt?: string; createdAt?: string; merchantCloseReason?: string };

describe("FoodOrderService.cancelPreparing — B3 'Can't finish this order' (D-48)", () => {
  it("cancels a cash order still cooking and tells the customer — nothing was paid, so nothing to refund", async () => {
    let where: Record<string, unknown> | undefined;
    let data: Record<string, unknown> | undefined;
    const events: unknown[] = [];
    const { svc } = build({
      merchant: { findUnique: async () => ({ id: "m1" }) },
      order: {
        updateMany: async (args: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
          where = args.where;
          data = args.data;
          return { count: 1 };
        },
        findUnique: async () => ({ id: "o1", merchantId: "m1", customerId: "c1", status: "cancelled", merchantItems: [], pickupCodeAttempts: 0, noShowCallTimestamps: [] }),
      },
      orderEvent: { create: async (args: unknown) => events.push(args) },
    });
    const res = await svc.cancelPreparing("p1", "o1");
    expect(where).toMatchObject({ id: "o1", merchantId: "m1", status: { in: ["requested", "open_for_offers"] }, riderId: null, merchantPhase: "preparing", merchantPaymentMethod: "cash" });
    expect(data).toMatchObject({ status: "cancelled", merchantPhase: null, rejectionReason: "other" });
    expect(events).toHaveLength(1);
    expect(res.status).toBe("cancelled");
  });

  it("D-77 K3b: stores the reason and the note, and the customer's push carries the note", async () => {
    let data: Record<string, unknown> | undefined;
    const pushes: Array<{ body: string }> = [];
    const { svc } = build({
      merchant: { findUnique: async () => ({ id: "m1" }) },
      order: {
        updateMany: async (args: { data: Record<string, unknown> }) => {
          data = args.data;
          return { count: 1 };
        },
        findUnique: async () => ({ id: "o1", merchantId: "m1", customerId: "c1", status: "cancelled", merchantItems: [], pickupCodeAttempts: 0, noShowCallTimestamps: [] }),
      },
      orderEvent: { create: async () => ({}) },
    });
    (svc as unknown as { notifications: { notifyProfiles: (ids: string[], m: { body: string }) => Promise<void> } }).notifications.notifyProfiles = async (_ids, m) => {
      pushes.push(m);
    };
    await svc.cancelPreparing("p1", "o1", "kitchen_problem", "  Gas ran out  ");
    expect(data).toMatchObject({ rejectionReason: "kitchen_problem", cancelReason: "Gas ran out" });
    expect(pushes[0]!.body).toMatch(/“Gas ran out”$/);
  });

  it("MJ-M2 (C8): the auto-accept ring's 'Can't take it' body {reason, note} passes the endpoint's schema and is stored", async () => {
    // The controller parses the raw body with MerchantCancelOrderRequest; the ring sends K2a / S2a reasons.
    const parsed = MerchantCancelOrderRequest.safeParse({ reason: "out_of_ingredient", note: "  No gas  " });
    expect(parsed.success).toBe(true);
    let data: Record<string, unknown> | undefined;
    const { svc } = build({
      merchant: { findUnique: async () => ({ id: "m1" }) },
      order: {
        updateMany: async (args: { data: Record<string, unknown> }) => {
          data = args.data;
          return { count: 1 };
        },
        findUnique: async () => ({ id: "o1", merchantId: "m1", customerId: "c1", status: "cancelled", merchantItems: [], pickupCodeAttempts: 0, noShowCallTimestamps: [] }),
      },
      orderEvent: { create: async () => ({}) },
    });
    const body = parsed.success ? parsed.data : {};
    await svc.cancelPreparing("p1", "o1", body.reason ?? "other", body.note);
    expect(data).toMatchObject({ rejectionReason: "out_of_ingredient", cancelReason: "No gas" });
  });

  // MJ-RM1: an auto-accepted order's rider search starts in the last minutes of cooking, so "Problem with
  // this order?" must also work while a round is live — and quiet the riders still being asked.
  it("MJ-RM1: cancels a cooking order in a live biker round (no biker yet) and closes the bikers' offers", async () => {
    const closed: Array<[string, string]> = [];
    const attemptUpdates: Array<Record<string, unknown>> = [];
    let data: Record<string, unknown> | undefined;
    const { svc } = build(
      {
        merchant: { findUnique: async () => ({ id: "m1" }) },
        order: {
          updateMany: async (args: { data: Record<string, unknown> }) => {
            data = args.data;
            return { count: 1 };
          },
          findUnique: async () => ({ id: "o1", merchantId: "m1", customerId: "c1", status: "cancelled", merchantItems: [], pickupCodeAttempts: 0, noShowCallTimestamps: [] }),
        },
        foodDispatchAttempt: {
          findMany: async () => [{ riderId: "r1" }, { riderId: "r2" }],
          updateMany: async (args: Record<string, unknown>) => {
            attemptUpdates.push(args);
            return { count: 2 };
          },
        },
        orderEvent: { create: async () => ({}) },
      },
      fakeGateway({ emitFoodOfferClosed: async (riderId: string, orderId: string) => void closed.push([riderId, orderId]) }),
    );
    await svc.cancelPreparing("p1", "o1", "kitchen_problem");
    expect(data).toMatchObject({ status: "cancelled", dispatchOfferExpiresAt: null, dispatchNextCheckAt: null });
    expect(attemptUpdates).toEqual([{ where: { orderId: "o1", outcome: "pending" }, data: expect.objectContaining({ outcome: "expired" }) }]);
    expect(closed).toEqual([
      ["r1", "o1"],
      ["r2", "o1"],
    ]);
  });

  it("refuses anything else — a wallet order (refund path), one already at dispatch, or one not cooking", async () => {
    const { svc } = build({
      merchant: { findUnique: async () => ({ id: "m1" }) },
      order: { updateMany: async () => ({ count: 0 }) },
    });
    await expect(svc.cancelPreparing("p1", "o1")).rejects.toMatchObject({ response: { reason: "not_cancellable" }, status: 409 });
  });
});
