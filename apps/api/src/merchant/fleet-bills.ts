import { Prisma } from "@prisma/client";
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

/** One branch's share of a set of ledger rows: billed rides and the fee total, corrections included. */
type Tally = { statementId: string | null; merchantId: string; rides: number; total: number };

/**
 * Rides and totals per (statement, branch) for the ledger rows `filter` picks, summed in the database so a busy
 * fleet is never cut off. A ride counts while it is still billed: one credited back to nothing by a correction in
 * the same set is not a ride (OB-M14: "#B190 was charged, then credited, so Avondale is 15 rides · $22.50 net").
 * A ride billed at nothing (the commission rate at 0%, or an app order with no delivery fee) still counts: it was
 * never charged, so nothing credited it away.
 */
async function tally(prisma: PrismaService, filter: Prisma.Sql): Promise<Tally[]> {
  const rows = await prisma.$queryRaw<Array<{ statement_id: string | null; merchant_id: string; rides: number; total: Prisma.Decimal | string | null }>>`
    SELECT statement_id, merchant_id,
           COUNT(*) FILTER (WHERE kind <> 'adjustment' AND (net > 0 OR (fee = 0 AND net = 0)))::int AS rides,
           SUM(fee) AS total
    FROM (SELECT statement_id, merchant_id, kind, fee,
                 SUM(fee) OVER (PARTITION BY statement_id, COALESCE(order_id, id)) AS net
          FROM merchant_fleet_ledger
          WHERE ${filter}) x
    GROUP BY statement_id, merchant_id`;
  return rows.map((r) => ({ statementId: r.statement_id, merchantId: r.merchant_id, rides: Number(r.rides), total: Number(r.total ?? 0) }));
}

const sumOf = (rows: readonly Tally[]) => ({
  rides: rows.reduce((n, r) => n + r.rides, 0),
  total: rows.reduce((t, r) => t + Math.round(r.total * 100), 0) / 100,
});

/** The owner's last `take` closed weekly bills, newest first, each with a line per branch. */
export async function ownerBills(prisma: PrismaService, ownerProfileId: string, now: Date, take = 12): Promise<AdminFleetBill[]> {
  const statements = await prisma.merchantFleetStatement.findMany({ where: { ownerProfileId }, orderBy: { periodStart: "desc" }, take });
  if (statements.length === 0) return [];
  const [lines, branches] = await Promise.all([
    tally(prisma, Prisma.sql`statement_id = ANY(${statements.map((s) => s.id)}::uuid[])`),
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
        .map((l) => ({ merchantId: l.merchantId, name: nameOf.get(l.merchantId) ?? "Branch", rides: l.rides, total: l.total.toFixed(2) })),
    };
  });
}

/** This (open) week so far, across all the owner's branches and per branch (OB-M14's branch lines): billed rides and total. */
export async function ownerThisWeek(
  prisma: PrismaService,
  ownerProfileId: string,
  now: Date,
): Promise<{ rides: number; total: string; branches: Array<{ merchantId: string; name: string; rides: number; total: string }> }> {
  const [lines, names] = await Promise.all([
    tally(prisma, Prisma.sql`owner_profile_id = ${ownerProfileId}::uuid AND statement_id IS NULL AND created_at >= ${harareWeekStart(now)}`),
    prisma.merchant.findMany({ where: { ownerProfileId }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const all = sumOf(lines);
  const branches = names
    .map((b) => ({ b, t: sumOf(lines.filter((l) => l.merchantId === b.id)) }))
    .filter(({ t }) => t.rides > 0 || t.total !== 0)
    .map(({ b, t }) => ({ merchantId: b.id, name: b.name, rides: t.rides, total: t.total.toFixed(2) }));
  return { rides: all.rides, total: all.total.toFixed(2), branches };
}

/** OB-M13: one branch's fleet rides for the Harare week holding `at` (default this week), newest first, each named by its biker. */
export async function branchRides(prisma: PrismaService, merchantId: string, at: Date): Promise<FleetRidesResponse> {
  const weekStart = harareWeekKey(at);
  const weekEnd = addDaysToKey(weekStart, 6);
  const from = harareDayBounds(weekStart)!.start;
  const to = harareDayBounds(weekEnd)!.end;
  const [rows, lines] = await Promise.all([
    prisma.merchantFleetLedger.findMany({
      where: { merchantId, createdAt: { gte: from, lte: to } },
      orderBy: { createdAt: "desc" },
      take: 500,
      select: { orderId: true, riderId: true, createdAt: true, kind: true, fee: true, reason: true },
    }),
    tally(prisma, Prisma.sql`merchant_id = ${merchantId}::uuid AND created_at >= ${from} AND created_at <= ${to}`),
  ]);
  const riderIds = [...new Set(rows.flatMap((r) => (r.riderId ? [r.riderId] : [])))];
  const people = riderIds.length ? await prisma.profile.findMany({ where: { id: { in: riderIds } }, select: { id: true, firstName: true } }) : [];
  const firstName = new Map(people.map((p) => [p.id, p.firstName.trim().split(/\s+/)[0] || null]));
  const out: FleetRideLine[] = rows.map((r) => ({
    orderId: r.orderId,
    ref: r.orderId ? `#${orderShortId(r.orderId)}` : null,
    at: r.createdAt.toISOString(),
    kind: r.kind,
    fee: Number(r.fee).toFixed(2),
    reason: r.reason,
    biker: r.riderId ? (firstName.get(r.riderId) ?? null) : null,
  }));
  const t = sumOf(lines);
  return { weekStart, weekEnd, rides: t.rides, total: t.total.toFixed(2), lines: out };
}
