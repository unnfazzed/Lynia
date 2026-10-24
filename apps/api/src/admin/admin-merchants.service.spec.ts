import { describe, expect, it } from "vitest";
import type { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";
import { AdminMerchantsService } from "./admin-merchants.service";

/** Decimal-like stub — Prisma returns Decimal objects whose `.toString()` we serialize. */
const dec = (s: string) => ({ toString: () => s });

/** The shop front's item preview, for detail fixtures that aren't about it. */
const NO_DISHES = { findMany: async () => [], count: async () => 0 };

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
      // L2: the business's booking account (none yet).
      profile: { findUnique: async () => null },
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
      merchantDish: NO_DISHES,
      merchantDebtLedger: {
        findMany: async () => [
          { id: "l1", orderId: "o2", riderId: "r1", rider: { profile: { firstName: "Tendai", lastName: "M" } }, type: "opened", amount: dec("8.00"), note: null, actor: "system", createdAt: new Date("2026-07-29T00:00:00Z") },
          { id: "l2", orderId: "o2", riderId: "r1", type: "written_off", amount: dec("-8.00"), note: "non-return", actor: "m1", createdAt: new Date("2026-07-30T00:00:00Z") },
        ],
      },
    };
    const svc = new AdminMerchantsService(prisma as unknown as PrismaService);
    const d = (await svc.getMerchantDetail("m1"))!;
    expect(d.trail[0]).toMatchObject({ id: "o1", route: "Mama's Kitchen → Borrowdale", fare: "9.50" });
    expect(d.debtLedger).toEqual([
      { id: "l1", orderId: "o2", riderId: "r1", riderName: "Tendai M", type: "opened", amount: "8.00", note: null, actor: "system", at: "2026-07-29T00:00:00.000Z" },
      { id: "l2", orderId: "o2", riderId: "r1", riderName: null, type: "written_off", amount: "-8.00", note: "non-return", actor: "m1", at: "2026-07-30T00:00:00.000Z" },
    ]);
    expect(d.debtLedgerNextCursor).toBeNull();
    expect(d.bookingAccount).toBeNull();
  });

  it("auto-accept: the detail carries how the restaurant takes orders (defaults off)", async () => {
    let selected: Record<string, unknown> | undefined;
    const prismaFor = (m: object) => ({
      merchant: {
        findUnique: async (args: { select: Record<string, unknown> }) => {
          selected = args.select;
          return m;
        },
      },
      profile: { findUnique: async () => null },
      order: {
        count: async () => 0,
        aggregate: async () => ({ _sum: { debtAmount: null }, _count: { _all: 0 } }),
        findMany: async () => [],
      },
      merchantDish: NO_DISHES,
      merchantDebtLedger: { findMany: async () => [] },
    });
    const on = (await new AdminMerchantsService(
      prismaFor({ ...merchant, autoAccept: true, showPhoneToCustomers: true }) as unknown as PrismaService,
    ).getMerchantDetail("m1"))!;
    expect(selected).toMatchObject({ autoAccept: true, showPhoneToCustomers: true });
    expect(on).toMatchObject({ autoAccept: true, showPhoneToCustomers: true });
    const off = (await new AdminMerchantsService(prismaFor(merchant) as unknown as PrismaService).getMerchantDetail("m1"))!;
    expect(off).toMatchObject({ autoAccept: false, showPhoneToCustomers: false });
  });

  it("L2 (R2-5): the detail links the business's booking account, where ops holds a whole business's bookings", async () => {
    let asked: unknown;
    const prisma = {
      merchant: { findUnique: async () => merchant },
      profile: {
        findUnique: async (args: { where: { phone: string } }) => {
          asked = args.where.phone;
          return { id: "acct-1", onHold: true };
        },
      },
      order: {
        count: async () => 0,
        aggregate: async () => ({ _sum: { debtAmount: null }, _count: { _all: 0 } }),
        findMany: async () => [],
      },
      merchantDish: NO_DISHES,
      merchantDebtLedger: { findMany: async () => [] },
    };
    const d = (await new AdminMerchantsService(prisma as unknown as PrismaService).getMerchantDetail("m1"))!;
    expect(asked).toBe("business:m1");
    expect(d.bookingAccount).toEqual({ id: "acct-1", onHold: true });
  });

  it("lists the business's team (owner first) and its own bikers, phones masked (owner, 2026-10-24)", async () => {
    let selected: Record<string, unknown> = {};
    const prisma = {
      merchant: {
        findUnique: async (args: { select: Record<string, unknown> }) => {
          selected = args.select;
          return {
            ...merchant,
            members: [
              { profileId: "p-own", role: "owner", displayName: "Tendai M", isPharmacist: false, createdAt: new Date("2026-07-01T00:00:00Z"), profile: { phone: "+263771111111", role: "customer" } },
              { profileId: "p-stf", role: "staff", displayName: "Rudo", isPharmacist: true, createdAt: new Date("2026-08-01T00:00:00Z"), profile: { phone: "+263772222222", role: "merchant" } },
            ],
            fleetHomeRiders: [
              { profileId: "r-1", isOnline: true, accountStatus: "active", fleetJoinedAt: new Date("2026-10-20T00:00:00Z"), profile: { firstName: "Blessing", lastName: "C", phone: "+263773333333" } },
            ],
          };
        },
      },
      profile: { findUnique: async () => null },
      order: {
        count: async () => 0,
        aggregate: async () => ({ _sum: { debtAmount: null }, _count: { _all: 0 } }),
        findMany: async () => [],
      },
      merchantDish: NO_DISHES,
      merchantDebtLedger: { findMany: async () => [] },
    };
    const d = (await new AdminMerchantsService(prisma as unknown as PrismaService).getMerchantDetail("m1"))!;
    expect(selected).toHaveProperty("members");
    expect(selected).toHaveProperty("fleetHomeRiders");
    expect(d.team).toEqual([
      { profileId: "p-own", name: "Tendai M", role: "owner", isPharmacist: false, phoneMasked: "+263•••••1111", hasCustomerPage: true, since: "2026-07-01" },
      { profileId: "p-stf", name: "Rudo", role: "staff", isPharmacist: true, phoneMasked: "+263•••••2222", hasCustomerPage: false, since: "2026-08-01" },
    ]);
    expect(d.bikers).toEqual([
      { profileId: "r-1", name: "Blessing C", phoneMasked: "+263•••••3333", isOnline: true, accountStatus: "active", since: "2026-10-20" },
    ]);
  });

  /** One debt-ledger row builder, newest-first ids (l1 = newest). */
  function debtRow(id: string, at: string) {
    return {
      id,
      orderId: "o2",
      riderId: "r1",
      type: "opened" as const,
      amount: dec("8.00"),
      note: null,
      actor: "system",
      createdAt: new Date(at),
    };
  }

  // LC-D-T1: the debt ledger used to hard-cap at `take: 30` with no `nextCursor` and no way to page
  // back — the same shape D-D0f/LC-D07 fixed for the rider wallet ledger, just missed here. Mirrors
  // AdminRidersService.walletView's cursor tests exactly.
  it("LC-D-T1: a merchant with more than 30 debt-ledger entries gets a nextCursor instead of silently truncating", async () => {
    const rows = Array.from({ length: 31 }, (_, i) =>
      debtRow(`l${i + 1}`, new Date(new Date("2026-07-30T00:00:00Z").getTime() - i * 86_400_000).toISOString()),
    );
    const prisma = {
      merchant: { findUnique: async () => merchant },
      // L2: the business's booking account (none yet).
      profile: { findUnique: async () => null },
      order: {
        count: async () => 12,
        aggregate: async () => ({ _sum: { debtAmount: dec("8.00") }, _count: { _all: 1 } }),
        findMany: async () => [],
      },
      merchantDish: NO_DISHES,
      merchantDebtLedger: { findMany: async () => rows },
    };
    const svc = new AdminMerchantsService(prisma as unknown as PrismaService);
    const d = (await svc.getMerchantDetail("m1"))!;
    // Only the first 30 of the 31 fetched rows are returned — the 31st was fetched purely to detect
    // hasMore and must not leak into the page.
    expect(d.debtLedger).toHaveLength(30);
    expect(d.debtLedger[29]!.id).toBe("l30");
    expect(d.debtLedgerNextCursor).toBe("l30");
  });

  it("LC-D-T1: debtCursor pages past the first 30 entries instead of always returning the newest page", async () => {
    const prisma = {
      merchant: { findUnique: async () => merchant },
      // L2: the business's booking account (none yet).
      profile: { findUnique: async () => null },
      order: {
        count: async () => 12,
        aggregate: async () => ({ _sum: { debtAmount: dec("8.00") }, _count: { _all: 1 } }),
        findMany: async () => [],
      },
      merchantDish: NO_DISHES,
      merchantDebtLedger: {
        findMany: async (args: { orderBy: unknown; take: number; cursor?: { id: string }; skip?: number }) => {
          expect(args.orderBy).toEqual([{ createdAt: "desc" }, { id: "desc" }]);
          expect(args.take).toBe(31);
          expect(args.cursor).toEqual({ id: "l30" });
          expect(args.skip).toBe(1);
          return [debtRow("l31", "2026-06-30T00:00:00Z")];
        },
      },
    };
    const svc = new AdminMerchantsService(prisma as unknown as PrismaService);
    const d = (await svc.getMerchantDetail("m1", "l30"))!;
    expect(d.debtLedger).toHaveLength(1);
    expect(d.debtLedger[0]!.id).toBe("l31");
    expect(d.debtLedgerNextCursor).toBeNull();
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
          if ("debtNonReturnReportedAt" in args.where) return [];
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

describe("AdminMerchantsService — D3 (2026-10-07, MJ-RH1): a merchant's non-return report is a flag an admin decides", () => {
  it("listDisputes surfaces a flagged open debt with merchant, biker (id + name), amount and when it was reported", async () => {
    let nonReturnWhere: Record<string, unknown> | undefined;
    const prisma = {
      order: {
        findMany: async (args: { where: Record<string, unknown> }) => {
          if (!("debtNonReturnReportedAt" in args.where)) return [];
          nonReturnWhere = args.where;
          return [
            {
              id: "o9",
              status: "undelivered",
              debtAmount: dec("13.00"),
              debtNonReturnReportedAt: new Date("2026-10-07T09:30:00Z"),
              riderId: "r1",
              merchant: { name: "Mama's Kitchen" },
              rider: { profile: { firstName: "Tendai", lastName: "M" } },
            },
          ];
        },
      },
    };
    const svc = new AdminMerchantsService(prisma as unknown as PrismaService);
    const { nonReturnReports } = await svc.listDisputes();
    // Only a still-open, not-closed debt: "I got the food back" (or a cash count) takes it off the queue.
    expect(nonReturnWhere).toEqual({ orderType: "merchant", debtStatus: "open", merchantClosedAt: null, debtNonReturnReportedAt: { not: null } });
    expect(nonReturnReports).toEqual([
      {
        orderId: "o9",
        merchant: "Mama's Kitchen",
        riderId: "r1",
        rider: "Tendai M",
        amount: "13.00",
        orderStatus: "undelivered",
        reportedAt: "2026-10-07T09:30:00.000Z",
      },
    ]);
  });

  function writeOffTx(order: unknown = { orderType: "merchant", debtStatus: "open", debtAmount: dec("13.00"), merchantId: "m1", riderId: "r1" }, updateCount = 1) {
    const calls: { update?: { where: Record<string, unknown>; data: Record<string, unknown> }; ledger?: { data: Record<string, unknown> }; audit?: { data: Record<string, unknown> }; riderTouched: boolean } = { riderTouched: false };
    const tx = {
      order: {
        findUnique: async () => order,
        updateMany: async (a: { where: Record<string, unknown>; data: Record<string, unknown> }) => { calls.update = a; return { count: updateCount }; },
      },
      merchantDish: NO_DISHES,
      merchantDebtLedger: { create: async (a: { data: Record<string, unknown> }) => { calls.ledger = a; return {}; } },
      auditLog: { create: async (a: { data: Record<string, unknown> }) => { calls.audit = a; return { id: "audit-9" }; } },
      rider: { updateMany: async () => { calls.riderTouched = true; return { count: 1 }; } },
      session: { updateMany: async () => { calls.riderTouched = true; return { count: 1 }; } },
    };
    const prisma = { $transaction: async (fn: (t: unknown) => unknown) => fn(tx) };
    return { prisma, calls };
  }

  it("writeOffDebt: an admin writes the open debt off — settle CAS, negative ledger row and audit in one transaction", async () => {
    const { prisma, calls } = writeOffTx();
    const svc = new AdminMerchantsService(prisma as unknown as PrismaService);
    const res = await svc.writeOffDebt("admin-1", "o9", { reason: "Biker admitted keeping the food", note: "called 10:05" });
    expect(res).toEqual({ id: "o9", debtStatus: "written_off", auditId: "audit-9" });
    expect(calls.update).toEqual({ where: { id: "o9", debtStatus: "open" }, data: { debtStatus: "written_off", debtSettledAt: expect.any(Date) } });
    expect(calls.ledger!.data).toMatchObject({ orderId: "o9", merchantId: "m1", riderId: "r1", type: "written_off", amount: -13, actor: "admin-1" });
    expect(calls.audit!.data).toMatchObject({ actor: "admin-1", action: "order.debt_write_off", target: "o9", reasonCode: "Biker admitted keeping the food" });
  });

  it("writeOffDebt never suspends the biker — that stays the separate biker console action", async () => {
    const { prisma, calls } = writeOffTx();
    const svc = new AdminMerchantsService(prisma as unknown as PrismaService);
    await svc.writeOffDebt("admin-1", "o9", { reason: "x" });
    expect(calls.riderTouched).toBe(false);
  });

  it("writeOffDebt 409s with nothing open (already settled by the merchant) and 404s a non-merchant order", async () => {
    const settled = writeOffTx({ orderType: "merchant", debtStatus: "settled_goods", debtAmount: dec("13.00"), merchantId: "m1", riderId: "r1" });
    await expect(new AdminMerchantsService(settled.prisma as unknown as PrismaService).writeOffDebt("admin-1", "o9", { reason: "x" })).rejects.toThrow(/no open debt/i);
    expect(settled.calls.audit).toBeUndefined();
    const parcel = writeOffTx({ orderType: "parcel" });
    await expect(new AdminMerchantsService(parcel.prisma as unknown as PrismaService).writeOffDebt("admin-1", "o9", { reason: "x" })).rejects.toThrow(/order not found/i);
  });

  it("writeOffDebt: a settle racing the write-off (CAS miss) is a 409 with no ledger or audit row", async () => {
    const { prisma, calls } = writeOffTx(undefined, 0);
    const svc = new AdminMerchantsService(prisma as unknown as PrismaService);
    await expect(svc.writeOffDebt("admin-1", "o9", { reason: "x" })).rejects.toThrow(/refresh and try again/i);
    expect(calls.ledger).toBeUndefined();
    expect(calls.audit).toBeUndefined();
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

  it("sets riderCashConfirmedAt (the SAME release valve the biker's own confirm uses) and audits atomically", async () => {
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

  it("pushes both the biker (jobs unlocked) and customer (code ready) a best-effort notice, post-commit", async () => {
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

describe("AdminMerchantsService — merchant web upgrade L1 (ops queue)", () => {
  const PIN = { point: { lat: -17.8292, lng: 31.0522 }, landmark: "Next to the rank", contactPhone: "+263771234567" };

  it("listMerchants: awaiting_go_live is restaurants not yet on; shops is every shop; landmark shown, phone masked", async () => {
    const wheres: unknown[] = [];
    const prisma = {
      merchant: {
        findMany: async ({ where }: { where: unknown }) => {
          wheres.push(where);
          return [
            {
              id: "m1",
              name: "Sadza Republic",
              cashRule: "collect_and_return",
              pilotEnabled: false,
              busyMode: false,
              cuisineTags: [],
              createdAt: new Date("2026-09-29T08:00:00Z"),
              businessType: "restaurant",
              shopKind: null,
              location: PIN,
            },
          ];
        },
      },
      order: { groupBy: async () => [] },
    };
    const svc = new AdminMerchantsService(prisma as unknown as PrismaService);
    const [row] = await svc.listMerchants("awaiting_go_live");
    await svc.listMerchants("shops");
    await svc.listMerchants();
    expect(wheres).toEqual([{ AND: [{ pilotEnabled: false }, {}] }, { AND: [{ businessType: "shop" }, {}] }, { AND: [{}, {}] }]);
    expect(row).toMatchObject({ businessType: "restaurant", shopKind: null, landmark: "Next to the rank", contactPhoneMasked: "+263•••••4567" });
  });

  it("pages by a (createdAt, id) keyset, 100 a page, and `waiting` reads applied + in review together, oldest first", async () => {
    const calls: Record<string, unknown>[] = [];
    const at = new Date("2026-10-20T08:00:00Z");
    const CURSOR = "00000000-0000-4000-8000-000000000001";
    const prisma = {
      merchant: {
        findMany: async (args: Record<string, unknown>) => (calls.push(args), []),
        findUnique: async ({ where }: { where: { id: string } }) => (where.id === CURSOR ? { createdAt: at } : null),
      },
      order: { groupBy: async () => [] },
    };
    const svc = new AdminMerchantsService(prisma as unknown as PrismaService);
    await svc.listMerchants(undefined, undefined, CURSOR);
    expect(calls[0]).toMatchObject({
      take: 100,
      orderBy: [{ createdAt: "desc" }, { id: "desc" }],
      where: { AND: [{}, { OR: [{ createdAt: { lt: at } }, { createdAt: at, id: { lt: CURSOR } }] }] },
    });
    expect(calls[0]).not.toHaveProperty("skip");
    await svc.listMerchants(undefined, "waiting", CURSOR);
    expect(calls[1]).toMatchObject({
      orderBy: [{ createdAt: "asc" }, { id: "asc" }],
      where: {
        AND: [
          { OR: [{ applicationStatus: "applied", pilotEnabled: false }, { applicationStatus: "reviewing", pilotEnabled: false }] },
          { OR: [{ createdAt: { gt: at } }, { createdAt: at, id: { gt: CURSOR } }] },
        ],
      },
    });
    // A cursor that no longer exists reads as the end of the list, never as the first page again.
    await svc.listMerchants(undefined, undefined, "00000000-0000-4000-8000-000000000009");
    expect(calls[2]).toMatchObject({ where: { AND: [{}, { id: { in: [] } }] } });
  });
});

describe("AdminMerchantsService.recordRefund (N-12 — a refund paid outside the app)", () => {
  function refundHarness(order: Record<string, unknown> | null) {
    const audits: Record<string, unknown>[] = [];
    let update: Record<string, unknown> | undefined;
    const prisma: Record<string, unknown> = {
      order: {
        findUnique: async () => order,
        updateMany: async (args: Record<string, unknown>) => ((update = args), { count: 1 }),
      },
      auditLog: { create: async ({ data }: { data: Record<string, unknown> }) => (audits.push(data), { id: "audit-1" }) },
    };
    prisma.$transaction = async (cb: (tx: unknown) => unknown) => cb(prisma);
    return { svc: new AdminMerchantsService(prisma as unknown as PrismaService), audits, update: () => update };
  }
  const failed = { orderType: "merchant", merchantPaymentMethod: "wallet", merchantPaymentConfirmedAt: new Date(), status: "cancelled", refundedAt: null };

  it("records the refund time (no money moves), CAS on no refund yet, audited in the same transaction", async () => {
    const h = refundHarness(failed);
    await expect(h.svc.recordRefund("ops", "o1", { reason: "Merchant sent the refund — customer confirmed" })).resolves.toMatchObject({ id: "o1", auditId: "audit-1" });
    expect(h.update()).toMatchObject({ where: { id: "o1", refundedAt: null }, data: { refundedAt: expect.any(Date) } });
    expect(h.audits[0]).toMatchObject({ action: "order.refund_record", target: "o1", targetType: "order", before: { refundedAt: null } });
  });

  it("refuses an order with nothing to refund, or a refund already on record", async () => {
    await expect(refundHarness({ ...failed, merchantPaymentMethod: "cash" }).svc.recordRefund("ops", "o1", { reason: "x" })).rejects.toMatchObject({ response: { reason: "not_refundable" } });
    await expect(refundHarness({ ...failed, refundedAt: new Date() }).svc.recordRefund("ops", "o1", { reason: "x" })).rejects.toMatchObject({ response: { reason: "already_refunded" } });
    await expect(refundHarness(null).svc.recordRefund("ops", "o1", { reason: "x" })).rejects.toThrow(/not found/i);
  });
});

describe("AdminMerchantsService.transferOwner (merchant web upgrade L4 — support hands a business over)", () => {
  interface Member { id: string; merchantId: string; profileId: string; role: "owner" | "staff"; displayName: string; addedByProfileId?: string | null }
  interface Person { id: string; phone: string; firstName: string; lastName: string; onHold: boolean; rider: { accountStatus: string } | null }

  /** A small in-memory world: two businesses, their owners, and whoever a test adds. */
  function transferHarness() {
    const people = new Map<string, Person>();
    const merchants = new Map<string, { id: string; name: string; ownerProfileId: string | null }>([
      ["m1", { id: "m1", name: "Mbare Auto Spares", ownerProfileId: "farai" }],
      ["m2", { id: "m2", name: "Sadza Republic", ownerProfileId: "rudo" }],
    ]);
    const members: Member[] = [
      { id: "mm-farai", merchantId: "m1", profileId: "farai", role: "owner", displayName: "Farai Chari" },
      { id: "mm-rudo", merchantId: "m2", profileId: "rudo", role: "owner", displayName: "Rudo Dube" },
    ];
    const invites = [{ id: "inv-1", merchantId: "m1", phone: "+263773000003" }];
    const audit: Array<Record<string, unknown>> = [];
    const add = (p: Partial<Person> & Pick<Person, "id" | "phone">) =>
      people.set(p.id, { firstName: "", lastName: "", onHold: false, rider: null, ...p });
    add({ id: "farai", phone: "+263771000001", firstName: "Farai", lastName: "Chari" });
    add({ id: "rudo", phone: "+263772000002", firstName: "Rudo", lastName: "Dube" });

    let n = 0;
    const prisma: Record<string, unknown> = {
      $executeRaw: async () => 1,
      merchant: {
        findUnique: async ({ where }: { where: { id: string } }) => merchants.get(where.id) ?? null,
        findFirst: async ({ where }: { where: { ownerProfileId: string; id: { not: string } } }) =>
          [...merchants.values()].find((m) => m.ownerProfileId === where.ownerProfileId && m.id !== where.id.not) ?? null,
        update: async ({ where, data }: { where: { id: string }; data: { ownerProfileId: string } }) => Object.assign(merchants.get(where.id)!, data),
      },
      profile: {
        findUnique: async ({ where }: { where: { phone?: string; id?: string } }) =>
          [...people.values()].find((p) => (where.phone ? p.phone === where.phone : p.id === where.id)) ?? null,
      },
      merchantMember: {
        findUnique: async ({ where }: { where: { profileId_merchantId: { profileId: string; merchantId: string } } }) =>
          members.find((m) => m.profileId === where.profileId_merchantId.profileId && m.merchantId === where.profileId_merchantId.merchantId) ?? null,
        findFirst: async ({ where }: { where: { merchantId: string; role: string } }) =>
          members.find((m) => m.merchantId === where.merchantId && m.role === where.role) ?? null,
        // The new owner's other businesses ({ merchantId: { not } }), or everyone a person is on.
        count: async ({ where }: { where: { profileId: string; merchantId?: { not: string } } }) =>
          members.filter((m) => m.profileId === where.profileId && (where.merchantId === undefined || m.merchantId !== where.merchantId.not)).length,
        update: async ({ where, data }: { where: { id: string }; data: { role: "owner" | "staff" } }) => {
          const row = members.find((m) => m.id === where.id)!;
          // The partial unique index: one owner per business.
          if (data.role === "owner" && members.some((m) => m.merchantId === row.merchantId && m.role === "owner" && m.id !== row.id)) {
            throw new Error("unique violation: one owner per business");
          }
          return Object.assign(row, data);
        },
        create: async ({ data }: { data: Omit<Member, "id"> }) => {
          if (data.role === "owner" && members.some((m) => m.merchantId === data.merchantId && m.role === "owner")) {
            throw new Error("unique violation: one owner per business");
          }
          const row = { ...data, id: `mm-${++n}` };
          members.push(row);
          return row;
        },
      },
      merchantInvite: {
        deleteMany: async ({ where }: { where: { merchantId: string; phone: string } }) => {
          const i = invites.findIndex((x) => x.merchantId === where.merchantId && x.phone === where.phone);
          if (i >= 0) invites.splice(i, 1);
          return { count: i >= 0 ? 1 : 0 };
        },
      },
      auditLog: {
        create: async ({ data }: { data: Record<string, unknown> }) => {
          audit.push(data);
          return { id: `audit-${audit.length}` };
        },
      },
    };
    prisma.$transaction = async (cb: (tx: unknown) => unknown) => cb(prisma);
    const pushes: { profileIds: string[]; title: string }[] = [];
    const notifications = { notifyProfiles: async (profileIds: string[], msg: { title: string }) => (pushes.push({ profileIds, title: msg.title }), new Set<string>()) };
    return {
      svc: new AdminMerchantsService(prisma as unknown as PrismaService, notifications as unknown as NotificationsService),
      people,
      merchants,
      members,
      invites,
      audit,
      add,
      pushes,
    };
  }

  const NOTE = "Called Farai and Chipo; saw Chipo's ID at the shop";

  it("tells both people about a handover (the new owner, and the old one in case it's a takeover)", async () => {
    const h = transferHarness();
    h.add({ id: "chipo", phone: "+263773000003", firstName: "Chipo", lastName: "Moyo" });
    await h.svc.transferOwner("ops@lyniago", "m1", { phone: "0773 000 003", note: NOTE });
    expect(h.pushes).toEqual([
      { profileIds: ["chipo"], title: "You now own Mbare Auto Spares" },
      { profileIds: ["farai"], title: "Mbare Auto Spares has a new owner" },
    ]);
  });

  it("the owner of record with no owner row is already the owner (not a confusing 'works at another business')", async () => {
    const h = transferHarness();
    h.members.splice(h.members.findIndex((m) => m.id === "mm-farai"), 1);
    await expect(h.svc.transferOwner("ops", "m1", { phone: "0771 000 001", note: NOTE })).rejects.toMatchObject({ response: { reason: "already_owner" } });
    expect(h.audit).toEqual([]);
  });

  it("promotes a staff member: the old owner stays on as Staff, the column follows, and the audit row carries the note", async () => {
    const h = transferHarness();
    h.add({ id: "chipo", phone: "+263773000003", firstName: "Chipo", lastName: "Moyo" });
    h.members.push({ id: "mm-chipo", merchantId: "m1", profileId: "chipo", role: "staff", displayName: "Chipo" });

    const res = await h.svc.transferOwner("ops@lyniago", "m1", { phone: "0773 000 003", note: NOTE });

    expect(res).toEqual({ id: "m1", ownerProfileId: "chipo", previousOwnerProfileId: "farai", auditId: "audit-1" });
    expect(h.members.filter((m) => m.merchantId === "m1").map((m) => [m.profileId, m.role])).toEqual([
      ["farai", "staff"],
      ["chipo", "owner"],
    ]);
    expect(h.merchants.get("m1")!.ownerProfileId).toBe("chipo");
    expect(h.audit).toEqual([
      {
        actor: "ops@lyniago",
        action: "merchant.owner_transfer",
        target: "m1",
        reasonCode: null,
        note: NOTE,
        targetType: "merchant",
        before: { ownerProfileId: "farai" },
        after: { ownerProfileId: "chipo" },
      },
    ]);
    // A pending invite to the new owner's number has nothing left to do.
    expect(h.invites).toEqual([]);
  });

  it("hands the business to someone on no business, who joins as its owner under their profile name", async () => {
    const h = transferHarness();
    h.add({ id: "tino", phone: "+263774000004", firstName: "Tinashe", lastName: "Moyo" });
    await h.svc.transferOwner("ops", "m1", { phone: "+263774000004", note: NOTE });
    expect(h.members.find((m) => m.profileId === "tino")).toMatchObject({ merchantId: "m1", role: "owner", displayName: "Tinashe Moyo" });
    expect(h.members.find((m) => m.profileId === "farai")).toMatchObject({ role: "staff" });
  });

  it("refuses someone who works at, or owns, another business", async () => {
    const h = transferHarness();
    await expect(h.svc.transferOwner("ops", "m1", { phone: "+263772000002", note: NOTE })).rejects.toMatchObject({
      status: 409,
      response: { reason: "member_elsewhere" },
    });
    expect(h.members.find((m) => m.profileId === "farai")).toMatchObject({ role: "owner" });
    expect(h.audit).toEqual([]);
  });

  it("refuses a number with no account, a held or restricted account, the current owner, and a bad number", async () => {
    const h = transferHarness();
    await expect(h.svc.transferOwner("ops", "m1", { phone: "+263779999999", note: NOTE })).rejects.toMatchObject({ status: 404, response: { reason: "no_account" } });
    h.add({ id: "held", phone: "+263775000005", onHold: true });
    await expect(h.svc.transferOwner("ops", "m1", { phone: "+263775000005", note: NOTE })).rejects.toMatchObject({ response: { reason: "account_restricted" } });
    h.add({ id: "banned", phone: "+263776000006", rider: { accountStatus: "banned" } });
    await expect(h.svc.transferOwner("ops", "m1", { phone: "+263776000006", note: NOTE })).rejects.toMatchObject({ response: { reason: "account_restricted" } });
    await expect(h.svc.transferOwner("ops", "m1", { phone: "+263771000001", note: NOTE })).rejects.toMatchObject({ response: { reason: "already_owner" } });
    await expect(h.svc.transferOwner("ops", "m1", { phone: "12", note: NOTE })).rejects.toMatchObject({ status: 400, response: { reason: "bad_phone" } });
    await expect(h.svc.transferOwner("ops", "nope", { phone: "+263771000001", note: NOTE })).rejects.toMatchObject({ status: 404 });
    expect(h.audit).toEqual([]);
  });

  it("keeps the old owner on the team as Staff even when their owner row was never backfilled", async () => {
    const h = transferHarness();
    h.members.splice(h.members.findIndex((m) => m.profileId === "farai"), 1);
    h.add({ id: "tino", phone: "+263774000004", firstName: "Tinashe", lastName: "Moyo" });
    const res = await h.svc.transferOwner("ops", "m1", { phone: "+263774000004", note: NOTE });
    expect(res.previousOwnerProfileId).toBe("farai");
    expect(h.members.find((m) => m.profileId === "farai")).toMatchObject({ merchantId: "m1", role: "staff", displayName: "Farai Chari" });
  });

  const SHOP = {
    id: "m1",
    name: "Mama's Kitchen",
    cashRule: "collect_and_return",
    pilotEnabled: false,
    busyMode: false,
    cuisineTags: ["Zimbabwean"],
    createdAt: new Date("2026-07-01T00:00:00Z"),
  };

  it("the detail carries the shop front ops reviews before approving: signed logo and cover, about, the week's hours, the first items", async () => {
    let dishQuery: { take?: number; orderBy?: unknown } | undefined;
    const prisma = {
      merchant: {
        findUnique: async () => ({
          ...SHOP,
          logoUrl: "merchant/m1/logo.jpg",
          logoThumbKey: "merchant/m1/logo.jpg.thumb.jpg",
          coverPhotoUrl: "merchant/m1/cover.jpg",
          description: "  Sadza and stew since 1998.  ",
          priceLevel: 2,
          hours: { mon: { open: "08:00", close: "20:00" }, sat: { open: "09:00" } },
        }),
      },
      profile: { findUnique: async () => null },
      order: { count: async () => 0, aggregate: async () => ({ _sum: { debtAmount: null }, _count: { _all: 0 } }), findMany: async () => [] },
      merchantDebtLedger: { findMany: async () => [] },
      merchantDish: {
        findMany: async (args: { take?: number; orderBy?: unknown }) => {
          dishQuery = args;
          return [
            { id: "d1", name: "Sadza & beef", priceUsd: dec("4.50"), photoUrl: "dish/d1.jpg", photoThumbKey: null, isDraft: false, category: { name: "Mains" } },
            { id: "d2", name: "Maheu", priceUsd: dec("1.00"), photoUrl: null, photoThumbKey: null, isDraft: true, category: { name: "Drinks" } },
          ];
        },
        count: async () => 14,
      },
    };
    const storage = { createReadUrl: async (key: string) => `https://signed.example/${key}` };
    const svc = new AdminMerchantsService(prisma as unknown as PrismaService, undefined, undefined, storage as never);
    const { shopFront } = (await svc.getMerchantDetail("m1"))!;
    expect(dishQuery?.take).toBe(12);
    expect(shopFront).toMatchObject({
      // The logo is shown small, so its thumbnail is signed when it's the current one.
      logoUrl: "https://signed.example/merchant/m1/logo.jpg.thumb.jpg",
      coverPhotoUrl: "https://signed.example/merchant/m1/cover.jpg",
      hasLogo: true,
      hasCover: true,
      about: "Sadza and stew since 1998.",
      tags: ["Zimbabwean"],
      priceLevel: 2,
      itemCount: 14,
    });
    expect(shopFront.hours).toHaveLength(7);
    expect(shopFront.hours[0]).toEqual({ day: "mon", open: "08:00", close: "20:00" });
    // A day with only half a window reads as closed, never as a half-open day.
    expect(shopFront.hours[5]).toEqual({ day: "sat", open: null, close: null });
    expect(shopFront.items).toEqual([
      { id: "d1", name: "Sadza & beef", category: "Mains", priceUsd: "4.50", photoUrl: "https://signed.example/dish/d1.jpg", hasPhoto: true, draft: false },
      { id: "d2", name: "Maheu", category: "Drinks", priceUsd: "1.00", photoUrl: null, hasPhoto: false, draft: true },
    ]);
  });

  it("the shop front degrades to text when photos can't be signed (no storage, or signing fails)", async () => {
    const prisma = {
      merchant: { findUnique: async () => ({ ...SHOP, logoUrl: "k/logo.jpg", logoThumbKey: null, coverPhotoUrl: null, description: null, priceLevel: null, hours: null }) },
      profile: { findUnique: async () => null },
      order: { count: async () => 0, aggregate: async () => ({ _sum: { debtAmount: null }, _count: { _all: 0 } }), findMany: async () => [] },
      merchantDebtLedger: { findMany: async () => [] },
      merchantDish: NO_DISHES,
    };
    const failing = { createReadUrl: async () => Promise.reject(new Error("signBlob denied")) };
    const { shopFront } = (await new AdminMerchantsService(prisma as unknown as PrismaService, undefined, undefined, failing as never).getMerchantDetail("m1"))!;
    expect(shopFront).toMatchObject({ logoUrl: null, hasLogo: true, coverPhotoUrl: null, hasCover: false, about: null, itemCount: 0, items: [] });
    expect(shopFront.hours.every((h) => h.open === null)).toBe(true);
  });
});
