import { describe, expect, it, vi } from "vitest";
import type { NotificationsService } from "../notifications/notifications.service";
import type { OrderLifecycleService } from "../orders/order-lifecycle.service";
import { PrismaService } from "../prisma/prisma.service";
import { FoodDebtService } from "./food-debt.service";

const notified: Array<{ profileIds: string[]; title: string; body: string }> = [];
const notifications = {
  notifyProfiles: async (profileIds: string[], msg: { title: string; body: string }) => {
    notified.push({ profileIds, ...msg });
  },
} as unknown as NotificationsService;

/** Fake Prisma where `$transaction(cb)` runs the callback against the same fake (tx === prisma),
 *  mirroring food-order.service.spec.ts's `build()`. */
function build(methods: Record<string, unknown>, lifecycle: Partial<OrderLifecycleService> = {}) {
  notified.length = 0;
  const prisma = { ...methods } as Record<string, unknown>;
  prisma.$transaction = async (cb: (tx: unknown) => unknown) => cb(prisma);
  const svc = new FoodDebtService(prisma as unknown as PrismaService, notifications, lifecycle as OrderLifecycleService);
  return { svc, prisma };
}

const orderId = "o1";

describe("FoodDebtService.openDebtIfNeeded — R-01", () => {
  it("no-ops for a WALLET order (money already going through the wallet rail)", async () => {
    const { svc } = build({});
    const updateMany = vi.fn();
    await svc.openDebtIfNeeded({ order: { updateMany } } as unknown as Parameters<typeof svc.openDebtIfNeeded>[0], {
      id: orderId,
      merchantId: "m1",
      riderId: "r1",
      merchantPaymentMethod: "wallet",
      merchantCashRule: "collect_and_return",
      merchantGoodsTotal: 13,
    });
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("no-ops for a pay_upfront kitchen (out of scope this PR — see the class docstring)", async () => {
    const { svc } = build({});
    const updateMany = vi.fn();
    await svc.openDebtIfNeeded({ order: { updateMany } } as unknown as Parameters<typeof svc.openDebtIfNeeded>[0], {
      id: orderId,
      merchantId: "m1",
      riderId: "r1",
      merchantPaymentMethod: "cash",
      merchantCashRule: "pay_upfront",
      merchantGoodsTotal: 13,
    });
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("opens the debt and writes an `opened` ledger row for a collect-and-return CASH order", async () => {
    const orderUpdateMany = vi.fn(async () => ({ count: 1 }));
    const ledgerCreate = vi.fn(async () => ({}));
    const { svc } = build({});
    await svc.openDebtIfNeeded(
      { order: { updateMany: orderUpdateMany }, merchantDebtLedger: { create: ledgerCreate } } as unknown as Parameters<typeof svc.openDebtIfNeeded>[0],
      { id: orderId, merchantId: "m1", riderId: "r1", merchantPaymentMethod: "cash", merchantCashRule: "collect_and_return", merchantGoodsTotal: 13 },
    );
    expect(orderUpdateMany).toHaveBeenCalledWith({
      where: { id: orderId, debtStatus: null },
      data: { debtStatus: "open", debtAmount: 13, debtOpenedAt: expect.any(Date) },
    });
    expect(ledgerCreate).toHaveBeenCalledWith({
      data: { orderId, merchantId: "m1", riderId: "r1", type: "opened", amount: 13, actor: "system" },
    });
  });

  it("is idempotent — a CAS miss (already opened) skips the ledger write entirely", async () => {
    const orderUpdateMany = vi.fn(async () => ({ count: 0 }));
    const ledgerCreate = vi.fn();
    const { svc } = build({});
    await svc.openDebtIfNeeded(
      { order: { updateMany: orderUpdateMany }, merchantDebtLedger: { create: ledgerCreate } } as unknown as Parameters<typeof svc.openDebtIfNeeded>[0],
      { id: orderId, merchantId: "m1", riderId: "r1", merchantPaymentMethod: "cash", merchantCashRule: "collect_and_return", merchantGoodsTotal: 13 },
    );
    expect(ledgerCreate).not.toHaveBeenCalled();
  });
});

describe("FoodDebtService — doorstep handshake (R-04/R-05/N-19)", () => {
  it("customer confirms first — snapshots the amount and starts the N-19 clock", async () => {
    let updateData: Record<string, unknown> | undefined;
    const { svc } = build({
      order: {
        findFirst: async () => ({ status: "en_route_dropoff", merchantPaymentMethod: "cash", agreedFare: 15.5, customerCashConfirmedAt: null, riderId: "r1" }),
        updateMany: async (a: { data: Record<string, unknown> }) => {
          updateData = a.data;
          return { count: 1 };
        },
      },
    });
    const res = await svc.confirmCustomerCash(orderId, "c1");
    expect(res.customerCashConfirmedAt).toBeTruthy();
    expect(updateData!.cashHandshakeAmount).toBe(15.5);
    expect(updateData!.cashHandshakeDeadlineAt).toBeInstanceOf(Date);
    expect(notified).toEqual([expect.objectContaining({ profileIds: ["r1"] })]);
  });

  it("rejects a WALLET order — the handshake is CASH-only", async () => {
    const { svc } = build({
      order: { findFirst: async () => ({ status: "en_route_dropoff", merchantPaymentMethod: "wallet", customerCashConfirmedAt: null }) },
    });
    await expect(svc.confirmCustomerCash(orderId, "c1")).rejects.toThrow(/cash order/i);
  });

  it("rider cannot confirm before the customer does", async () => {
    const { svc } = build({
      order: { findFirst: async () => ({ customerCashConfirmedAt: null, riderCashConfirmedAt: null, cashHandshakeFrozenAt: null, customerId: "c1" }) },
    });
    await expect(svc.confirmRiderCash(orderId, "r1")).rejects.toThrow(/waiting on the customer/i);
  });

  it("rider confirms second — unlocked once the customer already confirmed", async () => {
    let updated = false;
    const { svc } = build({
      order: {
        findFirst: async () => ({ customerCashConfirmedAt: new Date(), riderCashConfirmedAt: null, cashHandshakeFrozenAt: null, customerId: "c1" }),
        updateMany: async () => {
          updated = true;
          return { count: 1 };
        },
      },
    });
    const res = await svc.confirmRiderCash(orderId, "r1");
    expect(res.riderCashConfirmedAt).toBeTruthy();
    expect(updated).toBe(true);
    expect(notified).toEqual([expect.objectContaining({ profileIds: ["c1"] })]);
  });

  it("a frozen handshake blocks the rider's confirm", async () => {
    const { svc } = build({
      order: { findFirst: async () => ({ customerCashConfirmedAt: new Date(), riderCashConfirmedAt: null, cashHandshakeFrozenAt: new Date(), customerId: "c1" }) },
    });
    await expect(svc.confirmRiderCash(orderId, "r1")).rejects.toThrow(/frozen/i);
  });

  it("R-05: the rider's explicit dispute freezes immediately (doesn't wait out N-19)", async () => {
    let frozen = false;
    const { svc } = build({
      order: {
        findFirst: async () => ({ customerCashConfirmedAt: new Date(), riderCashConfirmedAt: null }),
        updateMany: async (a: { data: Record<string, unknown> }) => {
          if (a.data.cashHandshakeFrozenAt) frozen = true;
          return { count: 1 };
        },
        findUnique: async () => ({ customerId: "c1", riderId: "r1" }),
      },
    });
    const res = await svc.disputeCash(orderId, "r1");
    expect(res.frozen).toBe(true);
    expect(frozen).toBe(true);
  });

  it("sweepFrozenHandshakes freezes every handshake past its N-19 deadline and notifies both parties", async () => {
    const { svc } = build({
      order: {
        findMany: async () => [{ id: orderId }],
        updateMany: async () => ({ count: 1 }),
        findUnique: async () => ({ customerId: "c1", riderId: "r1" }),
      },
    });
    const res = await svc.sweepFrozenHandshakes();
    expect(res).toEqual({ frozen: 1 });
    expect(notified).toEqual([expect.objectContaining({ profileIds: ["c1", "r1"] })]);
  });
});

describe("FoodDebtService — doorstep failure paths (N-10/R-08), reusing markUndelivered", () => {
  it("logDoorstepCall appends a timestamp and returns the running count", async () => {
    const { svc } = build({
      order: {
        findFirst: async () => ({ status: "en_route_dropoff", noShowCallTimestamps: [new Date()] }),
        update: async () => ({}),
      },
    });
    const res = await svc.logDoorstepCall(orderId, "r1");
    expect(res.callsLogged).toBe(2);
  });

  it("reportNoShow refuses under the N-10 minimum call count", async () => {
    const { svc } = build({ order: { findFirst: async () => ({ noShowCallTimestamps: [new Date()] }) } });
    await expect(svc.reportNoShow(orderId, "r1")).rejects.toThrow(/at least 2 calls/i);
  });

  it("reportNoShow refuses before the N-10 8:00 window has elapsed, even with 2 calls logged", async () => {
    const { svc } = build({ order: { findFirst: async () => ({ noShowCallTimestamps: [new Date(), new Date()] }) } });
    await expect(svc.reportNoShow(orderId, "r1")).rejects.toThrow(/keep waiting/i);
  });

  it("reportNoShow calls markUndelivered(unreachable) once the window + call count are satisfied — no cash-ban", async () => {
    const markUndelivered = vi.fn(async () => ({ orderId, status: "undelivered" as const }));
    const nineMinAgo = new Date(Date.now() - 9 * 60 * 1000);
    const { svc } = build(
      { order: { findFirst: async () => ({ noShowCallTimestamps: [nineMinAgo, new Date()] }) } },
      { markUndelivered },
    );
    const res = await svc.reportNoShow(orderId, "r1");
    expect(res).toEqual({ orderId, status: "undelivered" });
    expect(markUndelivered).toHaveBeenCalledWith(orderId, "r1", "unreachable");
  });

  it("reportCustomerRefused calls markUndelivered(refused) AND cash-bans the customer (R-08)", async () => {
    const markUndelivered = vi.fn(async () => ({ orderId, status: "undelivered" as const }));
    let banned: Record<string, unknown> | undefined;
    const { svc } = build(
      {
        order: { findFirst: async () => ({ customerId: "c1", customerCashConfirmedAt: null }) },
        profile: {
          updateMany: async (a: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
            banned = a.data;
            return { count: 1 };
          },
        },
      },
      { markUndelivered },
    );
    await svc.reportCustomerRefused(orderId, "r1");
    expect(markUndelivered).toHaveBeenCalledWith(orderId, "r1", "refused");
    expect(banned).toMatchObject({ cashBanned: true });
  });

  it("reportCustomerRefused refuses once the customer already confirmed payment", async () => {
    const { svc } = build({ order: { findFirst: async () => ({ customerId: "c1", customerCashConfirmedAt: new Date() }) } });
    await expect(svc.reportCustomerRefused(orderId, "r1")).rejects.toThrow(/already confirmed/i);
  });
});

describe("FoodDebtService — merchant debt settlement (R-06/R-07/N-20/N-21, D-06)", () => {
  it("confirmReturnedCash blocks a mismatched count and names the gap in dollars", async () => {
    const { svc } = build({
      merchant: { findUnique: async () => ({ id: "m1" }) },
      order: { findFirst: async () => ({ debtStatus: "open", debtAmount: 13, riderId: "r1" }) },
    });
    await expect(svc.confirmReturnedCash("p1", orderId, 10)).rejects.toThrow(/expected \$13\.00, got \$10\.00/i);
  });

  it("confirmReturnedCash settles the debt on an exact count and nets the ledger to zero", async () => {
    let ledgerAmount: number | undefined;
    const { svc } = build({
      merchant: { findUnique: async () => ({ id: "m1" }) },
      order: {
        findFirst: async () => ({ debtStatus: "open", debtAmount: 13, riderId: "r1" }),
        updateMany: async () => ({ count: 1 }),
      },
      merchantDebtLedger: {
        create: async (a: { data: { amount: number } }) => {
          ledgerAmount = a.data.amount;
          return {};
        },
      },
    });
    const res = await svc.confirmReturnedCash("p1", orderId, 13);
    expect(res.debtStatus).toBe("settled_cash");
    expect(ledgerAmount).toBe(-13);
  });

  it("confirmGoodsReturned requires the order to actually be back (status=undelivered)", async () => {
    const { svc } = build({
      merchant: { findUnique: async () => ({ id: "m1" }) },
      order: { findFirst: async () => ({ debtStatus: "open", debtAmount: 13, riderId: "r1", status: "picked_up" }) },
    });
    await expect(svc.confirmGoodsReturned("p1", orderId)).rejects.toThrow(/haven't come back/i);
  });

  it("confirmGoodsReturned settles via a physical return once undelivered", async () => {
    const { svc } = build({
      merchant: { findUnique: async () => ({ id: "m1" }) },
      order: {
        findFirst: async () => ({ debtStatus: "open", debtAmount: 13, riderId: "r1", status: "undelivered" }),
        updateMany: async () => ({ count: 1 }),
      },
      merchantDebtLedger: { create: async () => ({}) },
    });
    const res = await svc.confirmGoodsReturned("p1", orderId);
    expect(res.debtStatus).toBe("settled_goods");
  });

  it("reportNonReturn writes off the debt AND suspends + names the rider in one transaction", async () => {
    let riderUpdate: Record<string, unknown> | undefined;
    let sessionsRevoked = false;
    let audit: Record<string, unknown> | undefined;
    const { svc } = build({
      merchant: { findUnique: async () => ({ id: "m1" }) },
      order: {
        findFirst: async () => ({ debtStatus: "open", debtAmount: 13, riderId: "r1" }),
        updateMany: async () => ({ count: 1 }),
      },
      merchantDebtLedger: { create: async () => ({}) },
      rider: {
        findUnique: async () => ({ accountStatus: "active" }),
        updateMany: async (a: { data: Record<string, unknown> }) => {
          riderUpdate = a.data;
          return { count: 1 };
        },
      },
      session: {
        updateMany: async () => {
          sessionsRevoked = true;
          return { count: 1 };
        },
      },
      auditLog: {
        create: async (a: { data: Record<string, unknown> }) => {
          audit = a.data;
          return {};
        },
      },
    });
    const res = await svc.reportNonReturn("p1", orderId, "never showed up");
    expect(res.debtStatus).toBe("written_off");
    expect(riderUpdate).toMatchObject({ accountStatus: "suspended", suspendReason: "food_debt_non_return", isOnline: false });
    expect(sessionsRevoked).toBe(true);
    expect(audit).toMatchObject({ action: "rider.suspend_food_debt", target: "r1", note: "never showed up" });
    expect(notified).toEqual([expect.objectContaining({ profileIds: ["r1"] })]);
  });

  it("reportNonReturn never downgrades an already-banned rider back to suspended", async () => {
    let riderUpdateCalled = false;
    const { svc } = build({
      merchant: { findUnique: async () => ({ id: "m1" }) },
      order: {
        findFirst: async () => ({ debtStatus: "open", debtAmount: 13, riderId: "r1" }),
        updateMany: async () => ({ count: 1 }),
      },
      merchantDebtLedger: { create: async () => ({}) },
      rider: { findUnique: async () => ({ accountStatus: "banned" }), updateMany: async () => { riderUpdateCalled = true; return { count: 0 }; } },
    });
    await svc.reportNonReturn("p1", orderId);
    expect(riderUpdateCalled).toBe(false);
  });

  it("no path strands the debt — every settling event's ledger amount is the negative of the opened amount", async () => {
    const amounts: number[] = [];
    const record = (a: { data: { amount: number } }) => {
      amounts.push(a.data.amount);
      return Promise.resolve({});
    };
    const { svc } = build({
      merchant: { findUnique: async () => ({ id: "m1" }) },
      order: { findFirst: async () => ({ debtStatus: "open", debtAmount: 13, riderId: "r1", status: "undelivered" }), updateMany: async () => ({ count: 1 }) },
      merchantDebtLedger: { create: record },
    });
    await svc.confirmReturnedCash("p1", orderId, 13);
    await svc.confirmGoodsReturned("p1", orderId);
    // opened (+13, from FoodDebtService.openDebtIfNeeded's own spec above) nets to zero against either.
    expect(amounts).toEqual([-13, -13]);
  });
});

describe("FoodDebtService.refundOrder — D-12", () => {
  it("refuses a CASH order (nothing was paid to the merchant to refund)", async () => {
    const { svc } = build({
      merchant: { findUnique: async () => ({ id: "m1" }) },
      order: { findFirst: async () => ({ merchantPaymentMethod: "cash", merchantPaymentConfirmedAt: null }) },
    });
    await expect(svc.refundOrder("p1", orderId, "REF-1", 13)).rejects.toThrow(/confirmed wallet payment/i);
  });

  it("blocks a mismatched refund amount and names the gap", async () => {
    const { svc } = build({
      merchant: { findUnique: async () => ({ id: "m1" }) },
      order: {
        findFirst: async () => ({
          merchantPaymentMethod: "wallet",
          merchantPaymentConfirmedAt: new Date(),
          status: "requested",
          merchantPhase: "preparing",
          merchantGoodsTotal: 13,
        }),
      },
    });
    await expect(svc.refundOrder("p1", orderId, "REF-1", 10)).rejects.toThrow(/expected \$13\.00, got \$10\.00/i);
  });

  it("refuses once the order has already gone to dispatch (ready_for_pickup)", async () => {
    const { svc } = build({
      merchant: { findUnique: async () => ({ id: "m1" }) },
      order: {
        findFirst: async () => ({
          merchantPaymentMethod: "wallet",
          merchantPaymentConfirmedAt: new Date(),
          status: "requested",
          merchantPhase: "ready_for_pickup",
          merchantGoodsTotal: 13,
        }),
      },
    });
    await expect(svc.refundOrder("p1", orderId, "REF-1", 13)).rejects.toThrow(/already gone to dispatch/i);
  });

  it("cancels the order with the refund reference recorded, and notifies the customer", async () => {
    let updateData: Record<string, unknown> | undefined;
    const { svc } = build({
      merchant: { findUnique: async () => ({ id: "m1" }) },
      order: {
        findFirst: async () => ({
          merchantPaymentMethod: "wallet",
          merchantPaymentConfirmedAt: new Date(),
          status: "requested",
          merchantPhase: "preparing",
          merchantGoodsTotal: 13,
          customerId: "c1",
        }),
        updateMany: async (a: { data: Record<string, unknown> }) => {
          updateData = a.data;
          return { count: 1 };
        },
      },
      orderEvent: { create: async () => ({}) },
    });
    const res = await svc.refundOrder("p1", orderId, "REF-1", 13);
    expect(res).toEqual({ orderId, status: "cancelled" });
    expect(updateData).toMatchObject({ status: "cancelled", refundReference: "REF-1", refundAmount: 13 });
    expect(notified).toEqual([expect.objectContaining({ profileIds: ["c1"] })]);
  });
});
