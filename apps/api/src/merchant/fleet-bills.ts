import { type AdminFleetBill, type FleetBillState, type FleetRideLine, type FleetRidesResponse, orderShortId } from "@lynia/shared";
import type { PrismaService } from "../prisma/prisma.service";
import { addDaysToKey, harareDayBounds, harareDayKey, harareWeekKey, harareWeekStart } from "./harare-clock";

/**
 * Own bikers (D-117, E7): the fleet bill as both sides read it, from one place. The console (OB-A2), the owner's bill
 * card (OB-M14), the branch's ride list (OB-M13) and the weekly statement all build their numbers here, so they
 * can never disagree.
 */

const DAY_MS = 24 * 60 * 60 * 1000;
/** A `@db.Date` value as its calendar day. */
export const dayKey = (d: Date): string => d.toISOString().slice(0, 10);

/** Whole days a bill due on `dueOn` is past due as of Harare day `today` (0 while not yet due). */
export function overdueDays(dueOn: Date | null, today: string): number {
  if (!dueOn) return 0;
  return Math.max(0, Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${dayKey(dueOn)}T00:00:00Z`)) / DAY_MS));
}

/** The owner's last `take` closed weekly bills, newest first, each with a line per branch. */
export async function ownerBills(prisma: PrismaService, ownerProfileId: string, now: Date, take = 12): Promise<AdminFleetBill[]> {
  const statements = await prisma.merchantFleetStatement.findMany({ where: { ownerProfileId }, orderBy: { periodStart: "desc" }, take });
  if (statements.length === 0) return [];
  const [lines, branches] = await Promise.all([
    prisma.merchantFleetLedger.groupBy({
      by: ["statementId", "merchantId"],
      where: { statementId: { in: statements.map((s) => s.id) } },
      _sum: { fee: true },
      _count: { orderId: true },
    }),
    prisma.merchant.findMany({ where: { ownerProfileId }, select: { id: true, name: true } }),
  ]);
  const nameOf = new Map(branches.map((b) => [b.id, b.name]));
  const today = harareDayKey(now);
  return statements.map((s) => {
    const state: FleetBillState = s.status === "paid" ? "paid" : overdueDays(s.dueOn, today) > 0 ? "overdue" : "unpaid";
    return {
      id: s.id,
      periodStart: dayKey(s.periodStart),
      periodEnd: dayKey(s.periodEnd),
      dueOn: s.dueOn ? dayKey(s.dueOn) : null,
      total: Number(s.total).toFixed(2),
      state,
      daysOverdue: state === "overdue" ? overdueDays(s.dueOn, today) : 0,
      paidAt: s.paidAt?.toISOString() ?? null,
      branches: lines
        .filter((l) => l.statementId === s.id)
        .map((l) => ({ merchantId: l.merchantId, name: nameOf.get(l.merchantId) ?? "Branch", rides: l._count.orderId, total: Number(l._sum.fee ?? 0).toFixed(2) })),
    };
  });
}

/** This (open) week so far, across all the owner's branches: rides (corrections don't count as rides) and total. */
export async function ownerThisWeek(prisma: PrismaService, ownerProfileId: string, now: Date): Promise<{ rides: number; total: string }> {
  const sum = await prisma.merchantFleetLedger.aggregate({
    where: { ownerProfileId, statementId: null, createdAt: { gte: harareWeekStart(now) } },
    _sum: { fee: true },
    _count: { orderId: true },
  });
  return { rides: sum._count.orderId, total: Number(sum._sum.fee ?? 0).toFixed(2) };
}

/** OB-M13: one branch's fleet rides for the Harare week holding `at` (default this week), newest first. */
export async function branchRides(prisma: PrismaService, merchantId: string, at: Date): Promise<FleetRidesResponse> {
  const weekStart = harareWeekKey(at);
  const weekEnd = addDaysToKey(weekStart, 6);
  const rows = await prisma.merchantFleetLedger.findMany({
    where: { merchantId, createdAt: { gte: harareDayBounds(weekStart)!.start, lte: harareDayBounds(weekEnd)!.end } },
    orderBy: { createdAt: "desc" },
    take: 500,
    select: { orderId: true, createdAt: true, kind: true, fee: true, reason: true },
  });
  const lines: FleetRideLine[] = rows.map((r) => ({
    orderId: r.orderId,
    ref: r.orderId ? `#${orderShortId(r.orderId)}` : null,
    at: r.createdAt.toISOString(),
    kind: r.kind,
    fee: Number(r.fee).toFixed(2),
    reason: r.reason,
  }));
  const total = rows.reduce((t, r) => t + Math.round(Number(r.fee) * 100), 0) / 100;
  return { weekStart, weekEnd, rides: rows.filter((r) => r.kind !== "adjustment").length, total: total.toFixed(2), lines };
}
