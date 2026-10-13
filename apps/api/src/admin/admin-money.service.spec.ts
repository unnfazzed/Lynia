import { describe, expect, it, vi } from "vitest";
import type { PrismaService } from "../prisma/prisma.service";
import type { WalletService } from "../wallet/wallet.service";
import { AdminMoneyService, harareDay, STATEMENT_PAGE_SIZE, TOPUP_PAGE_SIZE } from "./admin-money.service";

/** Admin console v2 §6: the top-ups page, biker statement, platform money panel and money owed. */

const dec = (s: string | number) => ({ toString: () => String(s), valueOf: () => Number(s) }) as never;
const R = "11111111-1111-4111-8111-111111111111";
const ADMIN = "99999999-9999-4999-8999-999999999999";

function walletStub(over: Partial<Record<string, unknown>> = {}) {
  return {
    ratePct: 10,
    topupRailLive: true,
    reconcileTopup: vi.fn(async () => "credited"),
    creditTopupShortfall: vi.fn(async () => ({ balance: 3, credited: 3, alreadyCredited: false })),
    reverseEntry: vi.fn(async () => ({ balance: 1, balanceBefore: 2, alreadyApplied: false })),
    ...over,
  } as unknown as WalletService;
}

function topUpRow(over: Record<string, unknown> = {}) {
  return {
    id: "t1",
    riderId: R,
    rail: "ecocash",
    amount: dec("5.00"),
    charged: dec("5.13"),
    phone: "0771111111",
    providerRef: "1234567",
    status: "pending",
    declineReason: null,
    initiatedAt: new Date("2026-10-13T10:00:00Z"),
    resolvedAt: null,
    rider: { profile: { firstName: "Tendai", lastName: "Moyo" } },
    ledgerEntry: null,
    ...over,
  };
}

describe("AdminMoneyService.listTopups", () => {
  function prismaFor(rows: unknown[], events: Array<{ subjectId: string; type: string; data: unknown; createdAt?: Date }> = []) {
    const findMany = vi.fn(async () => rows);
    return {
      findMany,
      prisma: {
        topUp: { findMany, groupBy: async () => [{ status: "pending", _count: { _all: 2 } }, { status: "confirmed", _count: { _all: 7 } }], count: async () => 1 },
        domainEvent: {
          findMany: async ({ where }: { where: { type: string | { in: string[] }; subjectId?: { in: string[] }; data?: { equals: string } } }) =>
            events
              .filter((e) => (typeof where.type === "string" ? e.type === where.type : where.type.in.includes(e.type)))
              .filter((e) => !where.subjectId || where.subjectId.in.includes(e.subjectId))
              .filter((e) => !where.data || (e.data as { kind?: string }).kind === where.data.equals)
              .map((e) => ({ ...e, createdAt: e.createdAt ?? new Date("2026-10-13T10:01:00Z") })),
        },
      } as unknown as PrismaService,
    };
  }

  it("shows amount, fee, charged, rail and reference; a manual credit hides its idempotency key", async () => {
    const { prisma } = prismaFor([
      topUpRow(),
      topUpRow({ id: "t2", rail: "manual", phone: null, charged: null, providerRef: "8c1f-key", status: "confirmed", ledgerEntry: { amount: dec("10.00") }, amount: dec("10.00") }),
    ]);
    const out = await new AdminMoneyService(prisma, walletStub()).listTopups();
    expect(out.rows[0]).toMatchObject({ riderName: "Tendai Moyo", amount: "5.00", fee: "0.13", charged: "5.13", providerRef: "1234567", manual: false, anomaly: null });
    expect(out.rows[1]).toMatchObject({ manual: true, providerRef: null, fee: null, credited: "10.00" });
    expect(out.counts).toMatchObject({ pending: 2, confirmed: 7, declined: 0 });
    expect(out).toMatchObject({ page: 1, hasMore: false, pageSize: TOPUP_PAGE_SIZE });
  });

  it("a status chip filters by status and pages 50 at a time", async () => {
    const { prisma, findMany } = prismaFor(Array.from({ length: TOPUP_PAGE_SIZE + 1 }, (_, i) => topUpRow({ id: `t${i}` })));
    const out = await new AdminMoneyService(prisma, walletStub()).listTopups("declined", 3);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { status: "declined" }, skip: 2 * TOPUP_PAGE_SIZE, take: TOPUP_PAGE_SIZE + 1 }));
    expect(out.rows).toHaveLength(TOPUP_PAGE_SIZE);
    expect(out.hasMore).toBe(true);
  });

  it("an anomaly chip lists only open anomalies of that kind (not resolved, not confirmed)", async () => {
    const { prisma, findMany } = prismaFor([topUpRow({ id: "a" })], [
      { subjectId: "a", type: "topup.anomaly", data: { kind: "short_paid", paid: 3 } },
      { subjectId: "b", type: "topup.anomaly", data: { kind: "short_paid", paid: 1 } },
      { subjectId: "b", type: "topup.anomaly_resolved", data: { kind: "short_paid" } },
      { subjectId: "c", type: "topup.anomaly", data: { kind: "paid_on_declined", paid: 5 } },
    ]);
    const out = await new AdminMoneyService(prisma, walletStub()).listTopups("short_paid");
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: { in: ["a"] }, status: { not: "confirmed" } } }));
    expect(out.rows[0]!.anomaly).toMatchObject({ kind: "short_paid", paid: 3, resolved: false });
    expect(out.counts.short_paid).toBe(1);
  });
});

describe("AdminMoneyService top-up actions", () => {
  function prismaWith(topUp: unknown, events: unknown[] = []) {
    const audits: Array<Record<string, unknown>> = [];
    const created: Array<Record<string, unknown>> = [];
    const tx = {
      auditLog: { create: async ({ data }: { data: Record<string, unknown> }) => audits.push(data) },
      domainEvent: { create: async ({ data }: { data: Record<string, unknown> }) => created.push(data) },
    };
    const prisma = {
      ...tx,
      topUp: { findUnique: vi.fn(async () => topUp) },
      domainEvent: { ...tx.domainEvent, findMany: async () => events },
      $transaction: async (fn: (t: unknown) => unknown) => fn(tx),
    } as unknown as PrismaService;
    return { prisma, audits, created };
  }

  it("Re-poll asks Paynow through the sweep's path and audits the outcome", async () => {
    const { prisma, audits } = prismaWith({ id: "t1", status: "pending", phone: "077", riderId: R });
    vi.mocked(prisma.topUp.findUnique).mockResolvedValueOnce({ id: "t1", status: "pending", phone: "077", riderId: R } as never).mockResolvedValueOnce({ status: "confirmed" } as never);
    const wallet = walletStub();
    const out = await new AdminMoneyService(prisma, wallet).repollTopup(ADMIN, "t1", { reason: "Biker says they paid" });
    expect(wallet.reconcileTopup).toHaveBeenCalledWith("t1");
    expect(out).toEqual({ outcome: "credited", status: "confirmed" });
    expect(audits[0]).toMatchObject({ action: "topup.repoll", target: "t1", targetType: "topup", reasonCode: "Biker says they paid", before: { status: "pending" }, after: { status: "confirmed", outcome: "credited" } });
  });

  it("Re-poll refuses a manual credit, and refuses while Paynow is off", async () => {
    const manual = prismaWith({ id: "t1", status: "confirmed", phone: null, riderId: R });
    await expect(new AdminMoneyService(manual.prisma, walletStub()).repollTopup(ADMIN, "t1", { reason: "r" })).rejects.toThrow(/manual credit/);
    const off = prismaWith({ id: "t1", status: "pending", phone: "077", riderId: R });
    await expect(new AdminMoneyService(off.prisma, walletStub({ topupRailLive: false })).repollTopup(ADMIN, "t1", { reason: "r" })).rejects.toThrow(/isn't switched on/);
    expect(manual.audits).toHaveLength(0);
  });

  it("Re-poll: a Paynow transport failure is a 503, not a 500, and nothing is audited", async () => {
    const { prisma, audits } = prismaWith({ id: "t1", status: "pending", phone: "077", riderId: R });
    const wallet = walletStub({ reconcileTopup: vi.fn(async () => Promise.reject(new Error("timeout"))) });
    await expect(new AdminMoneyService(prisma, wallet).repollTopup(ADMIN, "t1", { reason: "r" })).rejects.toThrow(/Couldn't reach Paynow/);
    expect(audits).toHaveLength(0);
  });

  it("Credit the paid amount goes through WalletService with the reason", async () => {
    const { prisma } = prismaWith(null);
    const wallet = walletStub();
    await new AdminMoneyService(prisma, wallet).creditTopupShortfall(ADMIN, "t1", { reason: "Part payment confirmed", note: "called" });
    expect(wallet.creditTopupShortfall).toHaveBeenCalledWith({ topUpId: "t1", actorProfileId: ADMIN, reasonCode: "Part payment confirmed", note: "called" });
  });

  it("Mark resolved records the event + audit once; a second call is a no-op", async () => {
    const open = prismaWith({ id: "t1", status: "pending", riderId: R }, [{ type: "topup.anomaly", data: { kind: "short_paid", paid: 3 } }]);
    const out = await new AdminMoneyService(open.prisma, walletStub()).resolveTopupAnomaly(ADMIN, "t1", { reason: "Refunded by Paynow" });
    expect(out).toEqual({ resolved: true, alreadyResolved: false });
    expect(open.created[0]).toMatchObject({ type: "topup.anomaly_resolved", actorRole: "admin", subjectId: "t1", data: { kind: "short_paid", reasonCode: "Refunded by Paynow" } });
    expect(open.audits[0]).toMatchObject({ action: "topup.anomaly_resolve", targetType: "topup", before: { anomaly: "short_paid" }, after: { anomaly: null } });

    const done = prismaWith({ id: "t1", status: "pending", riderId: R }, [
      { type: "topup.anomaly_resolved", data: { kind: "short_paid" } },
      { type: "topup.anomaly", data: { kind: "short_paid", paid: 3 } },
    ]);
    expect(await new AdminMoneyService(done.prisma, walletStub()).resolveTopupAnomaly(ADMIN, "t1", { reason: "r" })).toEqual({ resolved: true, alreadyResolved: true });
    expect(done.audits).toHaveLength(0);
  });

  it("Mark resolved refuses a top-up Paynow raised nothing on", async () => {
    const { prisma } = prismaWith({ id: "t1", status: "pending", riderId: R }, []);
    await expect(new AdminMoneyService(prisma, walletStub()).resolveTopupAnomaly(ADMIN, "t1", { reason: "r" })).rejects.toThrow(/nothing to resolve/);
  });
});

describe("AdminMoneyService.statement (the biker statement)", () => {
  function row(id: string, over: Record<string, unknown> = {}) {
    return {
      id,
      type: "topup",
      amount: dec("10.00"),
      balanceAfter: dec("12.50"),
      note: "launch grace",
      actor: ADMIN,
      orderId: null,
      ratePct: null,
      fare: null,
      reversesId: null,
      createdAt: new Date("2026-07-18T10:00:00Z"),
      topUp: null,
      ...over,
    };
  }

  function prismaFor(opts: { rows?: unknown[]; trips?: number; delivered?: unknown[]; lastTopup?: unknown; reversed?: unknown[]; onLedger?: (a: Record<string, unknown>) => void }) {
    return {
      commissionAccount: { findUnique: async () => ({ balance: dec("12.50") }) },
      commissionLedger: {
        findMany: async (a: Record<string, unknown>) => {
          opts.onLedger?.(a);
          return opts.rows ?? [row("l1")];
        },
        groupBy: async () => opts.reversed ?? [],
      },
      rider: { findUnique: async () => ({ tripsCount: opts.trips ?? 0 }) },
      profile: { findMany: async () => [{ id: ADMIN, firstName: "Rudo", lastName: "Ops" }] },
      order: { findMany: async () => opts.delivered ?? [] },
      topUp: { findFirst: async () => opts.lastTopup ?? null },
    } as unknown as PrismaService;
  }

  it("keeps the old wallet view's fields and adds the actor's name, top-up rail/fee and commission rate/basis", async () => {
    const svc = new AdminMoneyService(
      prismaFor({
        rows: [
          row("l1", { topUp: { id: "t1", rail: "ecocash", providerRef: "1234567", amount: dec("5.00"), charged: dec("5.13"), phone: "077" }, amount: dec("5.00"), actor: "system" }),
          row("l2", { type: "ride_commission", amount: dec("-0.30"), ratePct: dec("10.00"), fare: dec("3.00"), orderId: "o1", actor: "system" }),
          row("l3"),
        ],
        reversed: [{ reversesId: "l3", _sum: { amount: dec("-4.00") } }],
      }),
      walletStub(),
    );
    const out = await svc.statement(R);
    expect(out.balance).toBe("12.50");
    expect(out.ledger[0]).toMatchObject({ type: "topup", topUp: { rail: "ecocash", ref: "1234567", fee: "0.13", charged: "5.13", manual: false }, actorName: "system" });
    expect(out.ledger[1]).toMatchObject({ type: "ride_commission", ratePct: "10.00", fare: "3.00", orderId: "o1" });
    expect(out.ledger[2]).toMatchObject({ actor: ADMIN, actorName: "Rudo Ops", reversed: "4.00" });
    expect(out.ledger[2]!.at).toBe("2026-07-18T10:00:00.000Z");
    expect(out.nextCursor).toBeNull();
  });

  it("pages 20 at a time by cursor (LC-D07, carried over from the wallet view)", async () => {
    const rows = Array.from({ length: STATEMENT_PAGE_SIZE + 1 }, (_, i) => row(`l${i + 1}`));
    let args: Record<string, unknown> = {};
    const out = await new AdminMoneyService(prismaFor({ rows, onLedger: (a) => (args = a) }), walletStub()).statement(R, "l0");
    expect(args).toMatchObject({ take: STATEMENT_PAGE_SIZE + 1, cursor: { id: "l0" }, skip: 1, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
    expect(out.ledger).toHaveLength(STATEMENT_PAGE_SIZE);
    expect(out.nextCursor).toBe(`l${STATEMENT_PAGE_SIZE}`);
  });

  it("header: free jobs left, and pending commission on delivered jobs — the ones past the free allowance only", async () => {
    // 9 trips done: the next delivered job is job 10 (free), the one after is job 11 (paid).
    const delivered = [
      { id: "o1", orderType: "parcel", agreedFare: dec("4.00"), suggestedFare: dec("4.00"), deliveryFee: null },
      { id: "o2", orderType: "parcel", agreedFare: dec("6.00"), suggestedFare: dec("6.00"), deliveryFee: null },
      { id: "o3", orderType: "merchant", agreedFare: dec("25.00"), suggestedFare: null, deliveryFee: dec("3.00") },
    ];
    const out = await new AdminMoneyService(
      prismaFor({ trips: 9, delivered, lastTopup: { id: "t9", amount: dec("10.00"), rail: "ecocash", phone: "077", resolvedAt: new Date("2026-10-12T09:00:00Z"), initiatedAt: new Date(), ledgerEntry: { amount: dec("9.50") } } }),
      walletStub(),
    ).statement(R);
    expect(out.summary).toMatchObject({ freeJobsLeft: 1, tripsCount: 9, pendingJobs: 3, commissionActive: true, ratePct: 10 });
    // o1 is free; o2 = 10% of 6.00; o3 = 10% of the 3.00 delivery fee (not the 25.00 food total).
    expect(out.summary.pendingCommission).toBe("0.90");
    expect(out.summary.lastTopup).toMatchObject({ amount: "9.50", rail: "ecocash", manual: false, at: "2026-10-12T09:00:00.000Z" });
  });

  it("header: no pending commission while the rate is 0%", async () => {
    const delivered = [{ id: "o1", orderType: "parcel", agreedFare: dec("40.00"), suggestedFare: dec("40.00"), deliveryFee: null }];
    const out = await new AdminMoneyService(prismaFor({ trips: 50, delivered }), walletStub({ ratePct: 0 })).statement(R);
    expect(out.summary).toMatchObject({ pendingCommission: "0.00", pendingJobs: 1, commissionActive: false, freeJobsLeft: 0, lastTopup: null });
  });
});

describe("AdminMoneyService.moneyPanel / moneyCsv", () => {
  const ref = new Date("2026-10-14T10:00:00Z");
  function prismaFor(sums: unknown[], check: unknown = null) {
    const queryRaw = vi.fn(async () => sums);
    return {
      queryRaw,
      prisma: {
        $queryRaw: queryRaw,
        commissionAccount: {
          aggregate: async ({ where }: { where: { balance: { gt?: number; lt?: number } } }) =>
            where.balance.gt !== undefined ? { _sum: { balance: dec("120.50") } } : { _sum: { balance: dec("-7.25") }, _count: { _all: 2 } },
        },
        domainEvent: { findFirst: async () => check },
      } as unknown as PrismaService,
    };
  }

  it("fills every Harare day (newest first), sums the totals, and reports float, receivable and the last check", async () => {
    const { prisma } = prismaFor(
      [
        { day: "2026-10-14", topups_in: "10.00", fees: "0.25", commission: "1.20", manual_credits: "5.00", reversals: "2.00", free_jobs: 3 },
        { day: "2026-10-12", topups_in: "5.00", fees: "0.13", commission: "0.30", manual_credits: "0", reversals: "0", free_jobs: 1 },
      ],
      { createdAt: new Date("2026-10-14T00:00:00Z"), data: { ok: false, accountsChecked: 40, confirmedTopUps: 9, totalDrift: 1, balance_mismatch: 1, missing_receipt: 0 } },
    );
    const out = await new AdminMoneyService(prisma, walletStub()).moneyPanel(7, ref);
    expect(out.rows.map((r) => r.day)).toEqual(["2026-10-14", "2026-10-13", "2026-10-12", "2026-10-11", "2026-10-10", "2026-10-09", "2026-10-08"]);
    expect(out.rows[1]).toMatchObject({ topupsIn: "0.00", freeJobs: 0 });
    expect(out.totals).toEqual({ topupsIn: "15.00", fees: "0.38", commission: "1.50", manualCredits: "5.00", reversals: "2.00", freeJobs: 4 });
    expect(out).toMatchObject({ float: "120.50", receivable: "7.25", owedCount: 2 });
    expect(out.integrity).toEqual({ at: "2026-10-14T00:00:00.000Z", ok: false, totalDrift: 1, accountsChecked: 40, drift: { balance_mismatch: 1, missing_receipt: 0 } });
  });

  it("30 days when asked; anything else is 7", async () => {
    expect((await new AdminMoneyService(prismaFor([]).prisma, walletStub()).moneyPanel(30, ref)).rows).toHaveLength(30);
    expect((await new AdminMoneyService(prismaFor([]).prisma, walletStub()).moneyPanel(12, ref)).rows).toHaveLength(7);
  });

  it("CSV: a header, one line per day oldest first, then the total", async () => {
    const { prisma } = prismaFor([{ day: "2026-10-14", topups_in: "10.00", fees: "0.25", commission: "1.20", manual_credits: "0", reversals: "0", free_jobs: 0 }]);
    const csv = await new AdminMoneyService(prisma, walletStub()).moneyCsv(7, ref);
    const lines = csv.trim().split("\n");
    expect(lines[0]).toBe("day,top_ups_in,fees,commission,manual_credits,reversals,free_jobs");
    expect(lines[1]).toMatch(/^2026-10-08,0\.00/);
    expect(lines[7]).toBe("2026-10-14,10.00,0.25,1.20,0.00,0.00,0");
    expect(lines[8]).toBe("total,10.00,0.25,1.20,0.00,0.00,0");
  });

  it("harareDay is the Harare calendar date (UTC+2)", () => {
    expect(harareDay(new Date("2026-10-13T21:59:00Z"))).toBe("2026-10-13");
    expect(harareDay(new Date("2026-10-13T22:00:00Z"))).toBe("2026-10-14");
  });
});

describe("AdminMoneyService.owed (money owed)", () => {
  it("lists negative balances with the amount owed, since when, last job and last top-up", async () => {
    const prisma = {
      $queryRaw: async () => [
        { rider_id: R, balance: "-2.50", negative_since: new Date("2026-10-01T09:00:00Z") },
        { rider_id: "r2", balance: "-0.75", negative_since: null },
      ],
      profile: { findMany: async () => [{ id: R, firstName: "Tendai", lastName: "Moyo", phone: "+263772451180" }] },
      order: { groupBy: async () => [{ riderId: R, _max: { deliveredAt: new Date("2026-10-02T09:00:00Z") } }] },
      topUp: { groupBy: async () => [] },
    } as unknown as PrismaService;
    const out = await new AdminMoneyService(prisma, walletStub()).owed();
    expect(out.total).toBe("3.25");
    expect(out.rows[0]).toEqual({
      riderId: R,
      name: "Tendai Moyo",
      phone: "+263772451180",
      owed: "2.50",
      negativeSince: "2026-10-01T09:00:00.000Z",
      lastJobAt: "2026-10-02T09:00:00.000Z",
      lastTopupAt: null,
    });
    expect(out.rows[1]).toMatchObject({ name: "Unknown biker", phone: null, owed: "0.75" });
  });

  it("nobody owes anything: an empty list, no further reads", async () => {
    const prisma = { $queryRaw: async () => [] } as unknown as PrismaService;
    expect(await new AdminMoneyService(prisma, walletStub()).owed()).toEqual({ rows: [], total: "0.00" });
  });
});
