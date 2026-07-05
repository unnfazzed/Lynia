import { SETTLEMENT, commissionOn } from "@lynia/shared";
import { describe, expect, it } from "vitest";
import { PrismaService } from "../prisma/prisma.service";
import { SettlementsService, weeklyPeriod } from "./settlements.service";

const DAY = 24 * 60 * 60 * 1000;

describe("weeklyPeriod (A-06 period math)", () => {
  it("closes on the configured settle weekday, is exactly 7 days, dueDate = periodEnd", () => {
    // 2026-07-08 is a Wednesday; the most recent Friday (settleWeekday=5) before/at it is 2026-07-03.
    const { periodStart, periodEnd, dueDate } = weeklyPeriod(new Date("2026-07-08T12:00:00Z"));
    expect(periodEnd.getUTCDay()).toBe(SETTLEMENT.settleWeekday);
    expect(periodEnd.toISOString().slice(0, 10)).toBe("2026-07-03");
    expect(periodStart.toISOString().slice(0, 10)).toBe("2026-06-26");
    expect(periodEnd.getTime() - periodStart.getTime()).toBe(7 * DAY);
    expect(dueDate.getTime()).toBe(periodEnd.getTime());
  });

  it("when ref IS the settle weekday, closes that day (the just-ended week)", () => {
    const { periodEnd } = weeklyPeriod(new Date("2026-07-03T09:00:00Z")); // a Friday
    expect(periodEnd.toISOString().slice(0, 10)).toBe("2026-07-03");
  });
});

// A per-rider $transaction tx double: records the settlement upsert + refund query/stamp. `refunds`
// seeds the rows refund.findMany returns; `existing` is what settlement.findUnique returns (the current
// open row, if any, so a regeneration re-nets the already-stamped rows).
function genTx(opts: { refunds?: Array<{ id: string; amount: number }>; existing?: { id: string } | null } = {}) {
  const captured: {
    upsert: { where: unknown; create: Record<string, unknown>; update: Record<string, unknown> } | null;
    refundWhere: Record<string, unknown> | null;
    stamped: { where: Record<string, unknown>; data: Record<string, unknown> } | null;
  } = { upsert: null, refundWhere: null, stamped: null };
  const tx = {
    settlement: {
      findUnique: async () => opts.existing ?? null,
      upsert: async (args: NonNullable<typeof captured.upsert>) => { captured.upsert = args; return { id: "s-new" }; },
    },
    refund: {
      findMany: async (args: { where: Record<string, unknown> }) => { captured.refundWhere = args.where; return opts.refunds ?? []; },
      updateMany: async (args: NonNullable<typeof captured.stamped>) => { captured.stamped = args; return { count: (opts.refunds ?? []).length }; },
    },
  };
  return { tx, captured };
}

describe("SettlementsService.generateForPeriod (math + idempotent upsert)", () => {
  it("computes gross/commission/amountDue from policy and upserts one row per rider", async () => {
    const { tx, captured } = genTx(); // no refunds
    const prisma = {
      order: { groupBy: async () => [{ riderId: "r1", _sum: { agreedFare: 200 } }] },
      $transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
    };
    const svc = new SettlementsService(prisma as unknown as PrismaService);
    await svc.generateForPeriod(new Date("2026-07-08T00:00:00Z"));

    expect(captured.upsert!.create).toMatchObject({
      riderId: "r1",
      grossFares: 200,
      commission: commissionOn(200), // 15% → 30
      refundsNetted: 0,
      amountDue: commissionOn(200), // max(0, commission − 0)
      status: "pending",
    });
    // Idempotent regeneration must NOT reset an already-actioned settlement's status/paidAt/method.
    expect(captured.upsert!.update).not.toHaveProperty("status");
    expect(captured.upsert!.update).not.toHaveProperty("paidAt");
    expect(captured.upsert!.update).toMatchObject({ grossFares: 200, commission: commissionOn(200) });
    // Keyed on the (riderId, periodStart) unique index.
    expect(captured.upsert!.where).toHaveProperty("riderId_periodStart");
    // Nothing to net → no refund rows stamped.
    expect(captured.stamped).toBeNull();
  });

  it("nets in-window refunds off the commission and stamps them with the settlement id", async () => {
    const { tx, captured } = genTx({ refunds: [{ id: "rf1", amount: 5 }, { id: "rf2", amount: 7.5 }] });
    const prisma = {
      order: { groupBy: async () => [{ riderId: "r1", _sum: { agreedFare: 200 } }] },
      $transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
    };
    const svc = new SettlementsService(prisma as unknown as PrismaService);
    await svc.generateForPeriod(new Date("2026-07-08T00:00:00Z"));

    // refundsNetted = 5 + 7.5 = 12.5; amountDue = 30 − 12.5 = 17.5.
    expect(captured.upsert!.create).toMatchObject({ refundsNetted: 12.5, amountDue: commissionOn(200) - 12.5 }); // 30 − 12.5 = 17.5
    // Refund window is the settlement period; only un-netted rows are eligible on a first generation.
    expect(captured.refundWhere).toMatchObject({ riderId: "r1", OR: [{ settlementId: null }] });
    expect((captured.refundWhere!.createdAt as { gte: Date; lt: Date }).gte.toISOString().slice(0, 10)).toBe("2026-06-26");
    // Netted rows are stamped exactly once with the settlement id (netted once).
    expect(captured.stamped!.where).toEqual({ id: { in: ["rf1", "rf2"] } });
    expect(captured.stamped!.data).toEqual({ settlementId: "s-new" });
  });

  it("floors amountDue at 0 when refunds exceed the commission (never bills negative)", async () => {
    const { tx, captured } = genTx({ refunds: [{ id: "rf1", amount: 999 }] });
    const prisma = {
      order: { groupBy: async () => [{ riderId: "r1", _sum: { agreedFare: 200 } }] },
      $transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
    };
    const svc = new SettlementsService(prisma as unknown as PrismaService);
    await svc.generateForPeriod(new Date("2026-07-08T00:00:00Z"));
    expect(captured.upsert!.create).toMatchObject({ refundsNetted: 999, amountDue: 0 });
  });

  it("re-nets the current open period by including refunds already stamped to THIS settlement", async () => {
    // Regeneration: the settlement already exists (id s-open) and its refunds carry that id — they must
    // stay in the sum, so the netting query matches settlementId null OR the existing settlement id.
    const { tx, captured } = genTx({ existing: { id: "s-open" }, refunds: [{ id: "rf1", amount: 4 }] });
    const prisma = {
      order: { groupBy: async () => [{ riderId: "r1", _sum: { agreedFare: 200 } }] },
      $transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
    };
    const svc = new SettlementsService(prisma as unknown as PrismaService);
    await svc.generateForPeriod(new Date("2026-07-08T00:00:00Z"));
    expect(captured.refundWhere!.OR).toEqual([{ settlementId: null }, { settlementId: "s-open" }]);
    expect(captured.upsert!.update).toMatchObject({ refundsNetted: 4 });
  });
});

describe("SettlementsService.autoPauseOverdue (overdue → suspend rider)", () => {
  it("marks overdue AND suspends ONLY an active rider + audits, in a tx per rider", async () => {
    const calls: Array<{ op: string; args: Record<string, unknown> }> = [];
    const tx = {
      settlement: { update: (args: Record<string, unknown>) => calls.push({ op: "settlement.update", args }) },
      // updateMany reports it suspended an ACTIVE rider (count 1) → the pause + audit fire.
      rider: { updateMany: (args: Record<string, unknown>) => { calls.push({ op: "rider.updateMany", args }); return { count: 1 }; } },
      auditLog: { create: (args: Record<string, unknown>) => calls.push({ op: "auditLog.create", args }) },
    };
    const prisma = {
      settlement: {
        findMany: async (args: { where: { dueDate: { lt: Date } } }) => {
          const spanDays = Math.round((Date.now() - args.where.dueDate.lt.getTime()) / DAY);
          expect(spanDays).toBe(SETTLEMENT.overduePauseDays);
          return [{ id: "s1", riderId: "r1" }];
        },
      },
      $transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
    };
    const svc = new SettlementsService(prisma as unknown as PrismaService);
    const res = await svc.autoPauseOverdue(new Date());
    expect(res).toEqual({ paused: 1 });
    const riderUpdate = calls.find((c) => c.op === "rider.updateMany") as unknown as { args: { where: Record<string, unknown>; data: Record<string, unknown> } };
    // Guarded to active riders only — never downgrades a ban / admin suspension.
    expect(riderUpdate.args.where).toEqual({ profileId: "r1", accountStatus: "active" });
    expect(riderUpdate.args.data).toEqual({ accountStatus: "suspended", suspendReason: "settlement_overdue" });
    // The automated state change is audited (A-01).
    expect(calls.some((c) => c.op === "auditLog.create")).toBe(true);
  });

  it("marks overdue but does NOT re-pause / audit a non-active (banned/suspended) rider", async () => {
    const calls: string[] = [];
    const tx = {
      settlement: { update: () => calls.push("settlement.update") },
      rider: { updateMany: () => { calls.push("rider.updateMany"); return { count: 0 }; } }, // not active → 0
      auditLog: { create: () => calls.push("auditLog.create") },
    };
    const prisma = {
      settlement: { findMany: async () => [{ id: "s1", riderId: "r1" }] },
      $transaction: async (fn: (t: typeof tx) => Promise<unknown>) => fn(tx),
    };
    const svc = new SettlementsService(prisma as unknown as PrismaService);
    expect(await svc.autoPauseOverdue(new Date())).toEqual({ paused: 0 });
    expect(calls).toContain("settlement.update"); // still marked overdue
    expect(calls).not.toContain("auditLog.create"); // no pause → no audit
  });

  it("pauses nothing when no settlement is past the cutoff", async () => {
    const prisma = {
      settlement: { findMany: async () => [] },
      $transaction: async (fn: (t: unknown) => Promise<unknown>) => fn({}),
    };
    const svc = new SettlementsService(prisma as unknown as PrismaService);
    expect(await svc.autoPauseOverdue()).toEqual({ paused: 0 });
  });
});

describe("SettlementsService.recordPayment", () => {
  it("sets status=paid, paidAt and the method", async () => {
    let updateArgs: { where: unknown; data: Record<string, unknown> } | null = null;
    const paidAt = new Date("2026-07-03T10:00:00Z");
    const prisma = {
      settlement: {
        findUnique: async () => ({ id: "s1" }),
        update: async (args: typeof updateArgs) => {
          updateArgs = args;
          return { id: "s1", status: "paid", paidAt, method: "EcoCash" };
        },
      },
    };
    const svc = new SettlementsService(prisma as unknown as PrismaService);
    const res = await svc.recordPayment("s1", "EcoCash");
    expect(updateArgs!.data).toMatchObject({ status: "paid", method: "EcoCash" });
    expect(updateArgs!.data.paidAt).toBeInstanceOf(Date);
    expect(res).toEqual({ id: "s1", status: "paid", paidAt: paidAt.toISOString(), method: "EcoCash" });
  });

  it("404s when the settlement is missing", async () => {
    const prisma = { settlement: { findUnique: async () => null } };
    const svc = new SettlementsService(prisma as unknown as PrismaService);
    await expect(svc.recordPayment("nope", "netted")).rejects.toThrow("Settlement not found");
  });
});

describe("SettlementsService.currentWeek (SettlementWeek shape + KPIs)", () => {
  it("projects rows and splits owed vs settled KPIs", async () => {
    const rider = (fn: string) => ({ profile: { firstName: fn, lastName: "M" } });
    const prisma = {
      // groupBy is called with _sum (generate) and _count (trips) — branch on the args.
      order: {
        groupBy: async (args: { _sum?: unknown; _count?: unknown }) => {
          if (args._sum) return [{ riderId: "r1", _sum: { agreedFare: 100 } }, { riderId: "r2", _sum: { agreedFare: 40 } }];
          return [{ riderId: "r1", _count: { _all: 5 } }, { riderId: "r2", _count: { _all: 2 } }];
        },
      },
      settlement: {
        findUnique: async () => null,
        upsert: async () => ({ id: "s-new" }),
        findMany: async () => [
          { id: "s1", riderId: "r1", grossFares: 100, commission: 15, refundsNetted: 0, status: "pending", rider: rider("Tendai") },
          { id: "s2", riderId: "r2", grossFares: 40, commission: 6, refundsNetted: 0, status: "paid", rider: rider("Rudo") },
        ],
      },
      refund: { findMany: async () => [], updateMany: async () => ({ count: 0 }) },
      $transaction: async (fn: (t: unknown) => Promise<unknown>) => fn({
        settlement: { findUnique: async () => null, upsert: async () => ({ id: "s-new" }) },
        refund: { findMany: async () => [], updateMany: async () => ({ count: 0 }) },
      }),
    };
    const svc = new SettlementsService(prisma as unknown as PrismaService);
    const week = await svc.currentWeek(new Date("2026-07-08T00:00:00Z"));

    expect(week.settlementDay).toBe("Friday");
    expect(week.rows).toHaveLength(2);
    expect(week.rows[0]).toMatchObject({ id: "s1", name: "Tendai M", trips: 5, cash: "100.00", commission: "15.00", status: "due", note: "due" });
    expect(week.rows[1]).toMatchObject({ id: "s2", name: "Rudo M", trips: 2, status: "settled" });
    // cash = 100 + 40; owed = pending commission (15); settled = paid commission (6).
    expect(week.kpis.cashCollected).toBe("140.00");
    expect(week.kpis.commissionOwed).toBe("15.00");
    expect(week.kpis.settledThisWeek).toBe("6.00");
    expect(week.kpis.overdueCount).toBe(0);
  });
});
