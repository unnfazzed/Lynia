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

describe("SettlementsService.generateForPeriod (math + idempotent upsert)", () => {
  it("computes gross/commission/amountDue from policy and upserts one row per rider", async () => {
    let upsertArgs: { where: unknown; create: Record<string, unknown>; update: Record<string, unknown> } | null = null;
    const prisma = {
      order: {
        groupBy: async () => [{ riderId: "r1", _sum: { agreedFare: 200 } }],
      },
      settlement: {
        upsert: async (args: typeof upsertArgs) => { upsertArgs = args; return {}; },
      },
    };
    const svc = new SettlementsService(prisma as unknown as PrismaService);
    await svc.generateForPeriod(new Date("2026-07-08T00:00:00Z"));

    expect(upsertArgs!.create).toMatchObject({
      riderId: "r1",
      grossFares: 200,
      commission: commissionOn(200), // 15% → 30
      refundsNetted: 0,
      amountDue: commissionOn(200), // commission − 0
      status: "pending",
    });
    // Idempotent regeneration must NOT reset an already-actioned settlement's status/paidAt/method.
    expect(upsertArgs!.update).not.toHaveProperty("status");
    expect(upsertArgs!.update).not.toHaveProperty("paidAt");
    expect(upsertArgs!.update).toMatchObject({ grossFares: 200, commission: commissionOn(200) });
    // Keyed on the (riderId, periodStart) unique index.
    expect(upsertArgs!.where).toHaveProperty("riderId_periodStart");
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
        upsert: async () => ({}),
        findMany: async () => [
          { id: "s1", riderId: "r1", grossFares: 100, commission: 15, refundsNetted: 0, status: "pending", rider: rider("Tendai") },
          { id: "s2", riderId: "r2", grossFares: 40, commission: 6, refundsNetted: 0, status: "paid", rider: rider("Rudo") },
        ],
      },
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
