import { describe, expect, it } from "vitest";
import { PrismaService } from "../prisma/prisma.service";
import { AdminMerchantsService } from "./admin-merchants.service";

/** Decimal-like stub — Prisma returns Decimal objects whose `.toString()` we serialize. */
const dec = (s: string) => ({ toString: () => s });

describe("AdminMerchantsService.listMerchants + getMerchantDetail (X1)", () => {
  const merchant = {
    id: "m1",
    name: "Mama's Kitchen",
    cashRule: "collect_and_return",
    pilotEnabled: true,
    busyMode: false,
    cuisineTags: ["Zimbabwean"],
    createdAt: new Date("2026-07-01T00:00:00Z"),
  };

  it("aggregates order count + open-debt total per merchant", async () => {
    const prisma = {
      merchant: { findMany: async () => [merchant] },
      order: {
        groupBy: async (args: { where: { debtStatus?: string } }) =>
          args.where.debtStatus === "open"
            ? [{ merchantId: "m1", _sum: { debtAmount: dec("8.00") }, _count: { _all: 1 } }]
            : [{ merchantId: "m1", _count: { _all: 12 } }],
      },
    };
    const svc = new AdminMerchantsService(prisma as unknown as PrismaService);
    const rows = await svc.listMerchants();
    expect(rows[0]).toMatchObject({
      id: "m1",
      name: "Mama's Kitchen",
      cashRule: "collect_and_return",
      pilotEnabled: true,
      orders: 12,
      openDebtAmount: "8.00",
      openDebtCount: 1,
      joined: "2026-07-01",
    });
  });

  it("a merchant with no open debt reports $0.00 / 0, not undefined", async () => {
    const prisma = {
      merchant: { findMany: async () => [merchant] },
      order: { groupBy: async () => [] },
    };
    const svc = new AdminMerchantsService(prisma as unknown as PrismaService);
    const rows = await svc.listMerchants();
    expect(rows[0]).toMatchObject({ openDebtAmount: "0.00", openDebtCount: 0 });
  });

  it("detail returns null when the id isn't a merchant", async () => {
    const svc = new AdminMerchantsService({ merchant: { findUnique: async () => null } } as unknown as PrismaService);
    expect(await svc.getMerchantDetail("nope")).toBeNull();
  });

  it("detail includes the recent-orders trail and the full debt-ledger trail", async () => {
    const prisma = {
      merchant: { findUnique: async () => merchant },
      order: {
        count: async () => 12,
        aggregate: async () => ({ _sum: { debtAmount: dec("8.00") }, _count: { _all: 1 } }),
        findMany: async () => [
          {
            id: "o1",
            status: "completed",
            proposedFare: dec("9.50"),
            agreedFare: dec("9.50"),
            pickup: { landmark: "Mama's Kitchen" },
            dropoff: { landmark: "Borrowdale" },
            createdAt: new Date("2026-07-30T00:00:00Z"),
          },
        ],
      },
      merchantDebtLedger: {
        findMany: async () => [
          { id: "l1", orderId: "o2", riderId: "r1", type: "opened", amount: dec("8.00"), note: null, actor: "system", createdAt: new Date("2026-07-29T00:00:00Z") },
          { id: "l2", orderId: "o2", riderId: "r1", type: "written_off", amount: dec("-8.00"), note: "non-return", actor: "m1", createdAt: new Date("2026-07-30T00:00:00Z") },
        ],
      },
    };
    const svc = new AdminMerchantsService(prisma as unknown as PrismaService);
    const d = (await svc.getMerchantDetail("m1"))!;
    expect(d.trail[0]).toMatchObject({ id: "o1", route: "Mama's Kitchen → Borrowdale", fare: "9.50" });
    expect(d.debtLedger).toEqual([
      { id: "l1", orderId: "o2", riderId: "r1", type: "opened", amount: "8.00", note: null, actor: "system", at: "2026-07-29T00:00:00.000Z" },
      { id: "l2", orderId: "o2", riderId: "r1", type: "written_off", amount: "-8.00", note: "non-return", actor: "m1", at: "2026-07-30T00:00:00.000Z" },
    ]);
  });
});

describe("AdminMerchantsService.listDisputes (X1 — R-05 handshake freezes + N-12 refund overdue)", () => {
  it("surfaces a frozen handshake with merchant/customer/rider names", async () => {
    const prisma = {
      order: {
        findMany: async (args: { where: { cashHandshakeFrozenAt?: unknown } }) => {
          if ("cashHandshakeFrozenAt" in args.where) {
            return [
              {
                id: "o1",
                cashHandshakeFrozenAt: new Date("2026-07-30T11:02:01Z"),
                cashHandshakeAmount: dec("9.50"),
                customerCashConfirmedAt: new Date("2026-07-30T11:00:00Z"),
                merchant: { name: "Mama's Kitchen" },
                customer: { firstName: "Rudo", lastName: "K" },
                rider: { profile: { firstName: "Tendai", lastName: "M" } },
              },
            ];
          }
          return [];
        },
      },
    };
    const svc = new AdminMerchantsService(prisma as unknown as PrismaService);
    const { handshakeDisputes, refundsOverdue } = await svc.listDisputes();
    expect(handshakeDisputes).toEqual([
      {
        orderId: "o1",
        merchant: "Mama's Kitchen",
        customer: "Rudo K",
        rider: "Tendai M",
        amount: "9.50",
        customerConfirmedAt: "2026-07-30T11:00:00.000Z",
        frozenAt: "2026-07-30T11:02:01.000Z",
      },
    ]);
    expect(refundsOverdue).toEqual([]);
  });

  it("N-12: marks a refund overdue past the 2h SLA, and NOT overdue just under it", async () => {
    const now = Date.now();
    const overdueAt = new Date(now - 3 * 60 * 60 * 1000); // 3h ago — past SLA
    const withinSlaAt = new Date(now - 30 * 60 * 1000); // 30m ago — within SLA
    const prisma = {
      order: {
        findMany: async (args: { where: { cashHandshakeFrozenAt?: unknown } }) => {
          if ("cashHandshakeFrozenAt" in args.where) return [];
          return [
            {
              id: "overdue-1",
              merchantGoodsTotal: dec("8.00"),
              cancelledAt: overdueAt,
              undeliveredAt: null,
              updatedAt: overdueAt,
              merchant: { name: "Mama's Kitchen" },
              customer: { firstName: "Rudo", lastName: "K" },
            },
            {
              id: "fresh-1",
              merchantGoodsTotal: dec("5.00"),
              cancelledAt: withinSlaAt,
              undeliveredAt: null,
              updatedAt: withinSlaAt,
              merchant: { name: "Mama's Kitchen" },
              customer: { firstName: "Rudo", lastName: "K" },
            },
          ];
        },
      },
    };
    const svc = new AdminMerchantsService(prisma as unknown as PrismaService);
    const { refundsOverdue } = await svc.listDisputes();
    const overdue = refundsOverdue.find((r) => r.orderId === "overdue-1")!;
    const fresh = refundsOverdue.find((r) => r.orderId === "fresh-1")!;
    expect(overdue.overdue).toBe(true);
    expect(fresh.overdue).toBe(false);
  });
});

describe("AdminMerchantsService.resolveHandshake (X1/R-05 — the only lever out of a frozen handshake)", () => {
  interface Calls {
    update: { where: Record<string, unknown>; data: Record<string, unknown> } | null;
    audit: { data: Record<string, unknown> } | null;
  }
  function makeTx(
    order: unknown = {
      orderType: "merchant",
      cashHandshakeFrozenAt: new Date("2026-07-30T11:02:01Z"),
      riderCashConfirmedAt: null,
      customerId: "c1",
      riderId: "r1",
    },
    updateCount = 1,
  ) {
    const calls: Calls = { update: null, audit: null };
    const tx = {
      order: {
        findUnique: async () => order,
        updateMany: async (args: Calls["update"]) => { calls.update = args; return { count: updateCount }; },
      },
      auditLog: { create: async (args: Calls["audit"]) => { calls.audit = args; return { id: "audit-7" }; } },
    };
    const prisma = { $transaction: async (fn: (t: unknown) => unknown) => fn(tx) };
    return { prisma, calls };
  }

  it("sets riderCashConfirmedAt (the SAME release valve the rider's own confirm uses) and audits atomically", async () => {
    const { prisma, calls } = makeTx();
    const svc = new AdminMerchantsService(prisma as unknown as PrismaService);
    const res = await svc.resolveHandshake("admin-1", "o1", { reason: "Called both parties — amounts matched" });
    expect(calls.update!.data.riderCashConfirmedAt).toBeInstanceOf(Date);
    expect(calls.audit!.data).toMatchObject({
      actor: "admin-1",
      action: "order.handshake_resolve",
      target: "o1",
      reasonCode: "Called both parties — amounts matched",
    });
    expect(res).toEqual({ id: "o1", resolved: true, auditId: "audit-7" });
  });

  it("404s when the order isn't a merchant order", async () => {
    const { prisma } = makeTx({ orderType: "parcel" });
    const svc = new AdminMerchantsService(prisma as unknown as PrismaService);
    await expect(svc.resolveHandshake("admin-1", "o1", { reason: "x" })).rejects.toThrow(/order not found/i);
  });

  it("409s when the handshake isn't actually frozen — nothing to resolve", async () => {
    const { prisma, calls } = makeTx({ orderType: "merchant", cashHandshakeFrozenAt: null, riderCashConfirmedAt: null, customerId: "c1", riderId: "r1" });
    const svc = new AdminMerchantsService(prisma as unknown as PrismaService);
    await expect(svc.resolveHandshake("admin-1", "o1", { reason: "x" })).rejects.toThrow(/isn't frozen/i);
    expect(calls.audit).toBeNull();
  });

  it("409s when the dispute was already resolved (riderCashConfirmedAt already set) — no double-resolve", async () => {
    const { prisma, calls } = makeTx({
      orderType: "merchant",
      cashHandshakeFrozenAt: new Date(),
      riderCashConfirmedAt: new Date(),
      customerId: "c1",
      riderId: "r1",
    });
    const svc = new AdminMerchantsService(prisma as unknown as PrismaService);
    await expect(svc.resolveHandshake("admin-1", "o1", { reason: "x" })).rejects.toThrow(/already resolved/i);
    expect(calls.audit).toBeNull();
  });

  it("CAS conflict (0 rows) → 409, no audit committed", async () => {
    const { prisma, calls } = makeTx(undefined, 0);
    const svc = new AdminMerchantsService(prisma as unknown as PrismaService);
    await expect(svc.resolveHandshake("admin-1", "o1", { reason: "x" })).rejects.toThrow(/refresh and try again/i);
    expect(calls.audit).toBeNull();
  });

  it("pushes both the rider (jobs unlocked) and customer (code ready) a best-effort notice, post-commit", async () => {
    const { prisma } = makeTx();
    const notified: Array<{ profileIds: string[]; msg: { title: string } }> = [];
    const notifications = {
      notifyProfiles: async (profileIds: string[], msg: { title: string }) => { notified.push({ profileIds, msg }); },
    } as unknown as import("../notifications/notifications.service").NotificationsService;
    const svc = new AdminMerchantsService(prisma as unknown as PrismaService, notifications);
    await svc.resolveHandshake("admin-1", "o1", { reason: "x" });
    expect(notified).toHaveLength(2);
    expect(notified.find((n) => n.profileIds[0] === "r1")!.msg).toMatchObject({ title: "Support resolved the payment dispute" });
    expect(notified.find((n) => n.profileIds[0] === "c1")!.msg).toMatchObject({ title: "Your delivery code is ready" });
  });
});
