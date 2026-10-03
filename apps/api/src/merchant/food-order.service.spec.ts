import { describe, expect, it, vi } from "vitest";
import { BadRequestException } from "@nestjs/common";
import type { Env } from "../config/env";
import type { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";
import { TokenService } from "../auth/token.service";
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

// C5 kitchen socket queue: every mutating method now best-effort pushes emitFoodQueueChanged, and
// the N-03 accept-window sweep gates on isMerchantOnline. `queueChanges` records every push so tests
// can assert it fired (or didn't); defaults to "always online" so every pre-existing sweep test keeps
// its original always-auto-cancel behaviour unless a test overrides `isMerchantOnline` itself.
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

    it("customer pays $0 delivery: total = goods, rider's deliveryFee unchanged, venue's share = the fee", async () => {
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

  it("rejects a drop-off outside the service area server-side, naming the towns we serve (owner 2026-10-02)", async () => {
    let created = false;
    const { svc } = build({
      order: { findFirst: async () => null, create: async () => { created = true; return {}; } },
      merchant: { findFirst: async () => ({ id: "m1", location: { point: HARARE_CBD } }) },
      merchantDish: { findMany: async () => [dish()] },
    });
    // Marondera, ~66 km out — beyond every town disc.
    const threw = await svc
      .placeOrder("c1", "m1", { items: [{ dishId: "d1", quantity: 1 }], dropoff: { point: { lat: -18.185, lng: 31.55 } }, paymentMethod: "cash" } as never)
      .then(() => null)
      .catch((e: unknown) => e);
    const body = (threw as { getResponse: () => { reason: string; message: string } }).getResponse();
    expect(body.reason).toBe("outside_service_area");
    expect(body.message).toMatch(/Chitungwiza, Norton, Ruwa/);
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

  it("a banned or suspended rider can't order food either (F-01, same as Send)", async () => {
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

  it("a customer in good standing (and an active rider ordering food) is unchanged", async () => {
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

  it("403s a caller who isn't the assigned rider", async () => {
    const { svc } = build({ $queryRaw: async () => row() });
    await expect(svc.confirmPickup("o1", "other", "424242")).rejects.toThrow(/assigned rider/i);
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
    expect(updateData).toEqual({ status: "picked_up", collectedAt: expect.any(Date) });
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

  it("mints a fresh code, stores its hash, resets attempts, and returns the raw code", async () => {
    let updateArgs: Record<string, unknown> | undefined;
    const { svc } = build({
      merchant: { findUnique: async () => ({ id: "m1" }) },
      order: {
        findFirst: async () => ({ id: "o1", merchantId: "m1", merchantPhase: "ready_for_pickup", merchantItems: [] }),
        updateMany: async (a: Record<string, unknown>) => {
          updateArgs = a;
          return { count: 1 };
        },
      },
    });
    const res = await svc.revealPickupCode("p1", "o1");
    expect(res.pickupCode).toMatch(/^\d{6}$/);
    expect(updateArgs).toEqual({
      where: { id: "o1", merchantPhase: "ready_for_pickup" },
      data: { pickupCodeHash: tokens.hash(res.pickupCode), pickupCodeAttempts: 0 },
    });
  });

  it("409s on a lost CAS race (order changed between the read and the update)", async () => {
    const { svc } = build({
      merchant: { findUnique: async () => ({ id: "m1" }) },
      order: {
        findFirst: async () => ({ id: "o1", merchantId: "m1", merchantPhase: "ready_for_pickup", merchantItems: [] }),
        updateMany: async () => ({ count: 0 }),
      },
    });
    await expect(svc.revealPickupCode("p1", "o1")).rejects.toThrow(/Order changed, retry/);
  });
});

describe("FoodOrderService reconciler sweeps", () => {
  it("N-03: auto-cancels an order past its accept deadline and notifies the customer (merchant online)", async () => {
    let cancelled: Record<string, unknown> | undefined;
    const { svc } = build({
      order: {
        findMany: async () => [{ id: "o1", merchantId: "m1", acceptDeadlineAt: new Date(0) }],
        updateMany: async (a: Record<string, unknown>) => {
          cancelled = a;
          return { count: 1 };
        },
        findUnique: async () => ({ customerId: "c1" }),
      },
      orderEvent: { create: async () => ({}) },
    });
    const res = await svc.sweepExpiredAcceptWindows();
    expect(res).toEqual({ cancelled: 1, paused: 0 });
    const data = cancelled!.data as Record<string, unknown>;
    expect(data.status).toBe("cancelled");
    expect(data.rejectionReason).toBe("shop_closed");
    expect(notified).toHaveLength(1);
    expect(queueChanges).toEqual([{ merchantId: "m1", orderId: "o1" }]);
  });

  it("C5/D-16: pauses (extends the deadline) instead of cancelling when the kitchen tablet is dark, and pushes no cancellation notice", async () => {
    let updateArgs: Record<string, unknown> | undefined;
    const isMerchantOnline = vi.fn(async () => false);
    const { svc } = build(
      {
        order: {
          findMany: async () => [{ id: "o1", merchantId: "m1", acceptDeadlineAt: new Date(0) }],
          updateMany: async (a: Record<string, unknown>) => {
            updateArgs = a;
            return { count: 1 };
          },
        },
      },
      fakeGateway({ isMerchantOnline }),
    );
    const res = await svc.sweepExpiredAcceptWindows();
    expect(res).toEqual({ cancelled: 0, paused: 1 });
    expect(isMerchantOnline).toHaveBeenCalledWith("m1");
    const data = updateArgs!.data as Record<string, unknown>;
    // Only the deadline moves — no status/merchantPhase change, so this is a metadata write, not a
    // lifecycle transition (nothing for order-lifecycle.transitions.ts to declare).
    expect(Object.keys(data)).toEqual(["acceptDeadlineAt"]);
    expect((data.acceptDeadlineAt as Date).getTime()).toBeGreaterThan(Date.now());
    expect(notified).toHaveLength(0);
    expect(queueChanges).toHaveLength(0);
  });

  it("C5: a reconnected merchant's next sweep cancels for real if they still haven't answered", async () => {
    const { svc } = build(
      {
        order: {
          findMany: async () => [{ id: "o1", merchantId: "m1", acceptDeadlineAt: new Date(0) }],
          updateMany: async () => ({ count: 1 }),
          findUnique: async () => ({ customerId: "c1" }),
        },
        orderEvent: { create: async () => ({}) },
      },
      fakeGateway({ isMerchantOnline: async () => true }),
    );
    const res = await svc.sweepExpiredAcceptWindows();
    expect(res).toEqual({ cancelled: 1, paused: 0 });
  });

  it("N-18: an unanswered item-approval window is treated as a decline (named mocked default)", async () => {
    const { svc } = build({
      order: {
        findMany: async () => [{ id: "o1", merchantId: "m1" }],
        updateMany: async () => ({ count: 1 }),
        findUnique: async () => ({ customerId: "c1" }),
      },
      orderEvent: { create: async () => ({}) },
    });
    const res = await svc.sweepExpiredItemApprovals();
    expect(res).toEqual({ cancelled: 1 });
    expect(queueChanges).toEqual([{ merchantId: "m1", orderId: "o1" }]);
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

  it("maps the joined rider to the public identity block (plate=bike_reg, kycVerified from kyc_status)", async () => {
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

  it("reports kycVerified=false for a non-verified rider (pending/failed/expired)", async () => {
    const { svc } = build({ order: { findFirst: async () => assignedOrder({ ...riderJoin, kycStatus: "pending" }) } });
    const res = await svc.getAsRider("o1", "r1");
    expect(res.rider?.kycVerified).toBe(false);
  });

  it("omits the rider block entirely before a rider is assigned (null join)", async () => {
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

  it("makes every cash order collect-and-return — the rider brings the cash back — whatever the shop's old rule", async () => {
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

  it("never closes before the rider has the food (owner decision: that would be a cancel)", async () => {
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
    expect(where).toMatchObject({ id: "o1", merchantId: "m1", status: "requested", merchantPhase: "preparing", merchantPaymentMethod: "cash" });
    expect(data).toMatchObject({ status: "cancelled", merchantPhase: null, rejectionReason: "other" });
    expect(events).toHaveLength(1);
    expect(res.status).toBe("cancelled");
  });

  it("refuses anything else — a wallet order (refund path), one already at dispatch, or one not cooking", async () => {
    const { svc } = build({
      merchant: { findUnique: async () => ({ id: "m1" }) },
      order: { updateMany: async () => ({ count: 0 }) },
    });
    await expect(svc.cancelPreparing("p1", "o1")).rejects.toMatchObject({ response: { reason: "not_cancellable" }, status: 409 });
  });
});
