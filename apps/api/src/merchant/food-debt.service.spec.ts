import { describe, expect, it, vi } from "vitest";
import type { NotificationsService } from "../notifications/notifications.service";
import type { OrderLifecycleService } from "../orders/order-lifecycle.service";
import { PrismaService } from "../prisma/prisma.service";
import { RESTAURANTS_DEBT } from "@lynia/shared";
import { FoodDebtService, handshakeDeadline } from "./food-debt.service";
import { withMembershipShim } from "./testing/membership-shim";

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
  const prisma = withMembershipShim({ ...methods } as Record<string, unknown>);
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

  // D-71 regression: free delivery paid by the venue. The customer paid $13 (goods, $0 delivery); the
  // rider keeps the $2.50 fee out of it; the venue is owed back $10.50 — its settlement is reduced by the fare.
  it("D-71: on a free-delivery order the venue is owed goods − its delivery share, and the rider keeps the fee", async () => {
    const orderUpdateMany = vi.fn(async () => ({ count: 1 }));
    const ledgerCreate = vi.fn(async () => ({}));
    const { svc } = build({});
    await svc.openDebtIfNeeded(
      { order: { updateMany: orderUpdateMany }, merchantDebtLedger: { create: ledgerCreate } } as unknown as Parameters<typeof svc.openDebtIfNeeded>[0],
      {
        id: orderId,
        merchantId: "m1",
        riderId: "r1",
        merchantPaymentMethod: "cash",
        merchantCashRule: "collect_and_return",
        merchantGoodsTotal: 13,
        deliveryFee: 2.5,
        merchantDeliveryShare: 2.5,
      },
    );
    expect(orderUpdateMany).toHaveBeenCalledWith({
      where: { id: orderId, debtStatus: null },
      data: { debtStatus: "open", debtAmount: 10.5, debtOpenedAt: expect.any(Date) },
    });
    expect(ledgerCreate).toHaveBeenCalledWith({
      data: { orderId, merchantId: "m1", riderId: "r1", type: "opened", amount: 10.5, actor: "system" },
    });
  });

  it("D-71: an unfunded order (share null) still owes the full goods total", async () => {
    const orderUpdateMany = vi.fn(async () => ({ count: 1 }));
    const ledgerCreate = vi.fn(async () => ({}));
    const { svc } = build({});
    await svc.openDebtIfNeeded(
      { order: { updateMany: orderUpdateMany }, merchantDebtLedger: { create: ledgerCreate } } as unknown as Parameters<typeof svc.openDebtIfNeeded>[0],
      {
        id: orderId,
        merchantId: "m1",
        riderId: "r1",
        merchantPaymentMethod: "cash",
        merchantCashRule: "collect_and_return",
        merchantGoodsTotal: 13,
        deliveryFee: 2.5,
        merchantDeliveryShare: null,
      },
    );
    expect(ledgerCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ amount: 13 }) });
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

  it("D5: a customer confirm made on the way (rider not at the door yet) gets the trip ceiling, not the 2:00 window", async () => {
    let updateData: Record<string, unknown> | undefined;
    const { svc } = build({
      order: {
        findFirst: async () => ({ status: "en_route_dropoff", merchantPaymentMethod: "cash", agreedFare: 15.5, customerCashConfirmedAt: null, riderId: "r1", riderAtDropoffAt: null }),
        updateMany: async (a: { data: Record<string, unknown> }) => {
          updateData = a.data;
          return { count: 1 };
        },
      },
    });
    const before = Date.now();
    await svc.confirmCustomerCash(orderId, "c1");
    const deadline = (updateData!.cashHandshakeDeadlineAt as Date).getTime();
    expect(deadline - before).toBeGreaterThanOrEqual(RESTAURANTS_DEBT.handshakeTripCeilingMs - 1000);
  });

  it("D5: once the rider said \"I'm here\", the customer's confirm starts the normal 2:00 window", async () => {
    let updateData: Record<string, unknown> | undefined;
    const { svc } = build({
      order: {
        findFirst: async () => ({ status: "en_route_dropoff", merchantPaymentMethod: "cash", agreedFare: 15.5, customerCashConfirmedAt: null, riderId: "r1", riderAtDropoffAt: new Date() }),
        updateMany: async (a: { data: Record<string, unknown> }) => {
          updateData = a.data;
          return { count: 1 };
        },
      },
    });
    const before = Date.now();
    await svc.confirmCustomerCash(orderId, "c1");
    const left = (updateData!.cashHandshakeDeadlineAt as Date).getTime() - before;
    expect(left).toBeLessThanOrEqual(RESTAURANTS_DEBT.handshakeWindowMs + 1000);
    expect(left).toBeGreaterThan(RESTAURANTS_DEBT.handshakeWindowMs - 1000);
  });

  it("D5: handshakeDeadline is the 2:00 window at the door and the long ceiling on the road", () => {
    const t = new Date("2026-10-07T10:00:00Z");
    expect(handshakeDeadline(t, new Date()).getTime() - t.getTime()).toBe(RESTAURANTS_DEBT.handshakeWindowMs);
    expect(handshakeDeadline(t, null).getTime() - t.getTime()).toBe(RESTAURANTS_DEBT.handshakeTripCeilingMs);
    expect(RESTAURANTS_DEBT.handshakeTripCeilingMs).toBeGreaterThan(RESTAURANTS_DEBT.handshakeWindowMs);
  });

  it("D5: the rider's \"I'm here\" stamps once and starts the 2:00 window on a customer confirm made on the way", async () => {
    const updates: Array<{ where: Record<string, unknown>; data: Record<string, unknown> }> = [];
    const { svc } = build({
      order: {
        findFirst: async () => ({ status: "en_route_dropoff", riderAtDropoffAt: null }),
        updateMany: async (a: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
          updates.push(a);
          return { count: 1 };
        },
      },
    });
    const before = Date.now();
    const res = await svc.markAtDropoff(orderId, "r1");
    expect(res.riderAtDropoffAt).toBeTruthy();
    expect(updates[0]).toEqual({
      where: { id: orderId, riderId: "r1", riderAtDropoffAt: null, status: { in: ["picked_up", "en_route_dropoff"] } },
      data: { riderAtDropoffAt: expect.any(Date) },
    });
    // The window restarts only on an unresolved handshake the customer already started.
    expect(updates[1]!.where).toEqual({ id: orderId, customerCashConfirmedAt: { not: null }, riderCashConfirmedAt: null, cashHandshakeFrozenAt: null });
    const left = (updates[1]!.data.cashHandshakeDeadlineAt as Date).getTime() - before;
    expect(left).toBeLessThanOrEqual(RESTAURANTS_DEBT.handshakeWindowMs + 1000);
  });

  it("D5: a repeated \"I'm here\" is idempotent — no second stamp, no clock restart", async () => {
    const updateMany = vi.fn(async () => ({ count: 1 }));
    const at = new Date("2026-10-07T10:00:00Z");
    const { svc } = build({ order: { findFirst: async () => ({ status: "en_route_dropoff", riderAtDropoffAt: at }), updateMany } });
    const res = await svc.markAtDropoff(orderId, "r1");
    expect(res.riderAtDropoffAt).toBe(at.toISOString());
    expect(updateMany).not.toHaveBeenCalled();
  });

  it("D5: \"I'm here\" is refused before the rider has the food", async () => {
    const { svc } = build({ order: { findFirst: async () => ({ status: "en_route_pickup", riderAtDropoffAt: null }) } });
    await expect(svc.markAtDropoff(orderId, "r1")).rejects.toThrow(/taking the order to the customer/i);
  });

  it("D5: the rider can still complete — after an on-the-way customer confirm, the rider's confirm unlocks the code", async () => {
    let updated = false;
    const { svc } = build({
      order: {
        findFirst: async () => ({ customerCashConfirmedAt: new Date(Date.now() - 20 * 60_000), riderCashConfirmedAt: null, cashHandshakeFrozenAt: null, customerId: "c1" }),
        updateMany: async () => {
          updated = true;
          return { count: 1 };
        },
      },
    });
    const res = await svc.confirmRiderCash(orderId, "r1");
    expect(res.riderCashConfirmedAt).toBeTruthy();
    expect(updated).toBe(true);
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

  // LC-D-SIB-3: the freeze CAS must re-check the handshake is still unresolved, not only `frozenAt: null`.
  const UNRESOLVED_FREEZE_WHERE = { id: orderId, cashHandshakeFrozenAt: null, customerCashConfirmedAt: { not: null }, riderCashConfirmedAt: null };

  it("LC-D-SIB-3: a rider confirm racing the dispute makes it a conflict, not a false freeze — the CAS re-checks riderCashConfirmedAt", async () => {
    const updateMany = vi.fn(async () => ({ count: 0 })); // confirmRiderCash committed between the read and the CAS
    const { svc } = build({
      order: {
        findFirst: async () => ({ customerCashConfirmedAt: new Date(), riderCashConfirmedAt: null }),
        updateMany,
        findUnique: async () => ({ cashHandshakeFrozenAt: null, customerId: "c1", riderId: "r1" }),
      },
    });
    await expect(svc.disputeCash(orderId, "r1")).rejects.toThrow(/nothing to dispute/i);
    expect(updateMany).toHaveBeenCalledWith({ where: UNRESOLVED_FREEZE_WHERE, data: { cashHandshakeFrozenAt: expect.any(Date) } });
    expect(notified).toEqual([]);
  });

  it("LC-D-SIB-3: a double-tapped dispute on an already-frozen handshake stays an idempotent success, with no repeat push", async () => {
    const { svc } = build({
      order: {
        findFirst: async () => ({ customerCashConfirmedAt: new Date(), riderCashConfirmedAt: null }),
        updateMany: async () => ({ count: 0 }),
        findUnique: async () => ({ cashHandshakeFrozenAt: new Date() }),
      },
    });
    await expect(svc.disputeCash(orderId, "r1")).resolves.toEqual({ orderId, frozen: true });
    expect(notified).toEqual([]);
  });

  it("LC-D-SIB-3: the N-19 sweep's freeze uses the same unresolved-handshake CAS, and a miss neither counts nor notifies", async () => {
    const updateMany = vi.fn(async () => ({ count: 0 }));
    const { svc } = build({
      order: {
        findMany: async () => [{ id: orderId }],
        updateMany,
        findUnique: async () => ({ customerId: "c1", riderId: "r1" }),
      },
    });
    expect(await svc.sweepFrozenHandshakes()).toEqual({ frozen: 0 });
    expect(updateMany).toHaveBeenCalledWith({ where: UNRESOLVED_FREEZE_WHERE, data: { cashHandshakeFrozenAt: expect.any(Date) } });
    expect(notified).toEqual([]);
  });
});

describe("FoodDebtService — doorstep failure paths (N-10/R-08), reusing markUndelivered", () => {
  it("logDoorstepCall appends a timestamp and returns the running count", async () => {
    const { svc } = build({
      order: {
        findFirst: async () => ({ status: "en_route_dropoff", noShowCallTimestamps: [new Date()] }),
        update: async () => ({ noShowCallTimestamps: [new Date(), new Date()] }),
      },
    });
    const res = await svc.logDoorstepCall(orderId, "r1");
    expect(res.callsLogged).toBe(2);
  });

  it("LC-D-SIB-4: logDoorstepCall appends atomically (DB-side push), never writes back the stale array it read", async () => {
    const stale = [new Date(Date.now() - 60_000)];
    // A concurrent call already landed after our read — the DB now holds 2, and our push makes 3.
    const update = vi.fn(async () => ({ noShowCallTimestamps: [stale[0], new Date(), new Date()] }));
    const { svc } = build({
      order: { findFirst: async () => ({ status: "en_route_dropoff", noShowCallTimestamps: stale }), update },
    });
    const res = await svc.logDoorstepCall(orderId, "r1");
    expect(update).toHaveBeenCalledWith({
      where: { id: orderId },
      data: { noShowCallTimestamps: { push: expect.any(Date) } },
      select: { noShowCallTimestamps: true },
    });
    expect(res.callsLogged).toBe(3);
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

  it("LC-D-SIB-3 sibling: confirmGoodsReturned's settle CAS re-checks status=undelivered — an adjudicated-delivered order can't settle as goods", async () => {
    const updateMany = vi.fn(async () => ({ count: 0 })); // adjudicateDelivered flipped it to completed after the read
    const ledgerCreate = vi.fn();
    const { svc } = build({
      merchant: { findUnique: async () => ({ id: "m1" }) },
      order: { findFirst: async () => ({ debtStatus: "open", debtAmount: 13, riderId: "r1", status: "undelivered" }), updateMany },
      merchantDebtLedger: { create: ledgerCreate },
    });
    await expect(svc.confirmGoodsReturned("p1", orderId)).rejects.toThrow(/order changed/i);
    expect(updateMany).toHaveBeenCalledWith({
      where: { id: orderId, debtStatus: "open", OR: [{ status: "undelivered" }, { status: "cancelled", collectedAt: { not: null } }] },
      data: { debtStatus: "settled_goods", debtSettledAt: expect.any(Date) },
    });
    expect(ledgerCreate).not.toHaveBeenCalled();
  });

  // ── D3 (2026-10-07, MJ-RH1): "It wasn't returned" is a flag for support — never a write-off or suspension ──

  /** A fake order row the spies below act on, so a report followed by a "got it back" reads like the DB. */
  function nonReturnHarness(initial: Record<string, unknown> = {}) {
    const row: Record<string, unknown> = { debtStatus: "open", debtAmount: 13, riderId: "r1", status: "undelivered", collectedAt: new Date(), debtNonReturnReportedAt: null, ...initial };
    const matches = (where: Record<string, unknown>): boolean =>
      Object.entries(where).every(([k, v]): boolean => {
        if (k === "id") return true;
        if (k === "OR") return (v as Record<string, unknown>[]).some((alt): boolean => matches(alt));
        if (v && typeof v === "object" && "not" in (v as object)) return row[k] != null;
        return row[k] === v;
      });
    const orderUpdateMany = vi.fn(async (a: { where: Record<string, unknown>; data: Record<string, unknown> }) => {
      if (!matches(a.where)) return { count: 0 };
      Object.assign(row, a.data);
      return { count: 1 };
    });
    const ledgerCreate = vi.fn(async () => ({}));
    const auditCreate = vi.fn(async () => ({}));
    const riderUpdateMany = vi.fn(async () => ({ count: 1 }));
    const riderUpdate = vi.fn(async () => ({}));
    const sessionUpdateMany = vi.fn(async () => ({ count: 1 }));
    const { svc } = build({
      merchant: { findUnique: async () => ({ id: "m1" }) },
      order: { findFirst: async () => ({ ...row }), findUnique: async () => ({ ...row }), updateMany: orderUpdateMany },
      merchantDebtLedger: { create: ledgerCreate },
      auditLog: { create: auditCreate },
      rider: { findUnique: async () => ({ accountStatus: "active" }), updateMany: riderUpdateMany, update: riderUpdate },
      session: { updateMany: sessionUpdateMany },
    });
    return { svc, row, orderUpdateMany, ledgerCreate, auditCreate, riderUpdateMany, riderUpdate, sessionUpdateMany };
  }

  it("D3: reportNonReturn flags the order for support — the debt stays open, no ledger write-off", async () => {
    const h = nonReturnHarness();
    const res = await h.svc.reportNonReturn("p1", orderId, "never showed up");
    expect(res).toEqual({ orderId, debtStatus: "open", reportedAt: expect.any(String) });
    expect(h.row.debtStatus).toBe("open");
    expect(h.row.debtNonReturnReportedAt).toBeInstanceOf(Date);
    expect(h.orderUpdateMany).toHaveBeenCalledWith({
      where: { id: orderId, debtStatus: "open", debtNonReturnReportedAt: null },
      data: { debtNonReturnReportedAt: expect.any(Date) },
    });
    expect(h.ledgerCreate).not.toHaveBeenCalled();
    expect(h.auditCreate).toHaveBeenCalledWith({
      data: expect.objectContaining({ actor: "p1", action: "merchant.report_non_return", target: orderId, note: "never showed up" }),
    });
  });

  it("D3: reportNonReturn never suspends the rider, never revokes a session and never pushes the rider", async () => {
    const h = nonReturnHarness();
    await h.svc.reportNonReturn("p1", orderId);
    expect(h.riderUpdateMany).not.toHaveBeenCalled();
    expect(h.riderUpdate).not.toHaveBeenCalled();
    expect(h.sessionUpdateMany).not.toHaveBeenCalled();
    expect(notified).toEqual([]);
  });

  it("D3: after a report, \"I got the food back\" still settles the debt (and so clears the flag off the admin queue)", async () => {
    const h = nonReturnHarness();
    await h.svc.reportNonReturn("p1", orderId);
    const res = await h.svc.confirmGoodsReturned("p1", orderId);
    expect(res.debtStatus).toBe("settled_goods");
    expect(h.row.debtStatus).toBe("settled_goods");
    expect(h.ledgerCreate).toHaveBeenCalledWith({ data: expect.objectContaining({ type: "settled_goods", amount: -13 }) });
  });

  it("D3: a second report of the same order is an idempotent success — one flag, one audit row", async () => {
    const h = nonReturnHarness();
    const first = await h.svc.reportNonReturn("p1", orderId);
    const second = await h.svc.reportNonReturn("p1", orderId);
    expect(second.reportedAt).toBe(first.reportedAt);
    expect(h.auditCreate).toHaveBeenCalledTimes(1);
  });

  it("D3: nothing to report once the debt is settled", async () => {
    const h = nonReturnHarness({ debtStatus: "settled_goods" });
    await expect(h.svc.reportNonReturn("p1", orderId)).rejects.toThrow(/no open debt/i);
    expect(h.auditCreate).not.toHaveBeenCalled();
  });

  // ── MJ-RB1 (2026-10-07): a customer cancel after the rider collected rides the food back (K5c) ──

  it("MJ-RB1: confirmGoodsReturned accepts a cancelled order the rider had collected", async () => {
    const h = nonReturnHarness({ status: "cancelled", collectedAt: new Date() });
    const res = await h.svc.confirmGoodsReturned("p1", orderId);
    expect(res.debtStatus).toBe("settled_goods");
    expect(h.orderUpdateMany).toHaveBeenCalledWith({
      where: { id: orderId, debtStatus: "open", OR: [{ status: "undelivered" }, { status: "cancelled", collectedAt: { not: null } }] },
      data: { debtStatus: "settled_goods", debtSettledAt: expect.any(Date) },
    });
  });

  it("MJ-RB1: confirmGoodsReturned still refuses a cancelled order that was never collected", async () => {
    const h = nonReturnHarness({ status: "cancelled", collectedAt: null });
    await expect(h.svc.confirmGoodsReturned("p1", orderId)).rejects.toThrow(/haven't come back/i);
    expect(h.orderUpdateMany).not.toHaveBeenCalled();
  });

  it("MJ-RB1: the settle CAS is exactly the widened condition — a delivered order can't settle as goods even if read as cancelled", async () => {
    const h = nonReturnHarness({ status: "cancelled", collectedAt: new Date() });
    // An admin flipped it after the read (say to completed): the CAS's OR no longer matches.
    const read = { ...h.row };
    h.row.status = "completed";
    const prismaOrder = (h.svc as unknown as { prisma: { order: { findFirst: () => Promise<unknown> } } }).prisma.order;
    prismaOrder.findFirst = async () => read;
    await expect(h.svc.confirmGoodsReturned("p1", orderId)).rejects.toThrow(/order changed/i);
    expect(h.ledgerCreate).not.toHaveBeenCalled();
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
