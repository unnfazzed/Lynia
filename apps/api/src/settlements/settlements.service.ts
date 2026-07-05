import { Injectable, NotFoundException } from "@nestjs/common";
import { RiderAccountStatus, SETTLEMENT, SettlementStatus, commissionOn } from "@lynia/shared";
import { PrismaService } from "../prisma/prisma.service";

/**
 * The cash-console payload shapes. These mirror `SettlementRow`/`SettlementWeek` in
 * apps/admin/app/lib/adminTypes.ts — the console reads exactly this JSON. They are re-declared here
 * (rather than imported across the app boundary) because the admin app is a separate package; the
 * API owns the wire shape. Keep the two in sync.
 */
export interface SettlementRow {
  id: string;
  name: string;
  trips: number;
  cash: string;
  commission: string;
  adjustment?: string;
  status: "due" | "overdue" | "settled" | "none";
  note: string;
}

export interface SettlementWeek {
  weekLabel: string;
  settlementDay: string;
  kpis: {
    cashCollected: string;
    commissionOwed: string;
    settledThisWeek: string;
    overdueCount: number;
    overdueNote?: string;
  };
  rows: SettlementRow[];
}

/** 2dp round — same money rounding the rest of the API (and policy.commissionOn) uses. */
function round(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Calendar date (YYYY-MM-DD), UTC — stable + testable, no locale/timezone drift (mirrors admin.service). */
function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

const WEEKDAY_NAMES = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"] as const;

/**
 * The weekly settlement window that closes on {@link SETTLEMENT.settleWeekday} (Fri = 5). `periodEnd`
 * is the most recent settle-weekday at 00:00 UTC (today if `ref` IS that weekday); `periodStart` is 7
 * days earlier; `dueDate` is the settle-weekday the period closes on (= `periodEnd`). Orders that
 * complete in `[periodStart, periodEnd)` belong to this settlement. Pure → unit-tested.
 */
export function weeklyPeriod(ref: Date = new Date()): { periodStart: Date; periodEnd: Date; dueDate: Date } {
  const day = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), ref.getUTCDate()));
  const diff = (day.getUTCDay() - SETTLEMENT.settleWeekday + 7) % 7; // days since the last settle weekday
  const periodEnd = new Date(day);
  periodEnd.setUTCDate(day.getUTCDate() - diff);
  const periodStart = new Date(periodEnd);
  periodStart.setUTCDate(periodEnd.getUTCDate() - 7);
  return { periodStart, periodEnd, dueDate: new Date(periodEnd) };
}

/** Map a persisted SettlementStatus to the admin console's cash-row status vocabulary. */
function rowStatus(s: string): SettlementRow["status"] {
  if (s === SettlementStatus.PAID) return "settled";
  if (s === SettlementStatus.OVERDUE) return "overdue";
  return "due"; // pending
}

/**
 * A-06 cash settlement engine. Riders collect fares in cash; Lynia bills a weekly commission
 * ({@link SETTLEMENT.commissionPct}). Every figure here derives from policy.ts — no magic numbers.
 *
 * DEFERRALS (documented, pilot-simple):
 *  - `refundsNetted` is always 0: there is no refund ledger in the schema yet. `amountDue` therefore
 *    equals `commission` today; the netting arithmetic (`commission − refundsNetted`) is already wired
 *    so a real refund source drops straight in. Product/Finance still owe the whole model (see the
 *    cash-console caveat banner).
 *  - Auto-pause runs on demand via {@link autoPauseOverdue} (exposed as a method + the admin callable
 *    endpoint POST /admin/cash/settlements/auto-pause). No @nestjs/schedule interval is wired — for the
 *    pilot the pause is triggered by that endpoint (or a cron hitting it) rather than an in-process timer.
 */
@Injectable()
export class SettlementsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Generate (idempotent upsert) one settlement row per rider who completed at least one order in the
   * window. `grossFares` = sum of `agreedFare` on that rider's orders completed in `[periodStart,
   * periodEnd)`; `commission = commissionOn(grossFares)`; `refundsNetted` = 0 (stub); `amountDue =
   * commission − refundsNetted`; `dueDate` = the period's settle weekday; status `pending`.
   *
   * Idempotent: keyed on the `(riderId, periodStart)` unique index, re-running recomputes the money
   * fields in place. It deliberately does NOT touch `status`/`paidAt`/`method` on update, so a
   * regeneration can never un-pay or un-overdue a settlement that was already actioned.
   */
  async generateForPeriod(ref: Date = new Date()): Promise<void> {
    const { periodStart, periodEnd, dueDate } = weeklyPeriod(ref);
    const groups = await this.prisma.order.groupBy({
      by: ["riderId"],
      where: { status: "completed", completedAt: { gte: periodStart, lt: periodEnd }, riderId: { not: null } },
      _sum: { agreedFare: true },
    });

    for (const g of groups) {
      const riderId = g.riderId;
      if (!riderId) continue;
      const grossFares = round(Number(g._sum.agreedFare ?? 0));
      const commission = commissionOn(grossFares);
      const refundsNetted = 0; // no refund ledger yet (A-06 deferral) — netting wired, source stubbed
      const amountDue = round(commission - refundsNetted);
      await this.prisma.settlement.upsert({
        where: { riderId_periodStart: { riderId, periodStart } },
        create: {
          riderId,
          periodStart,
          periodEnd,
          grossFares,
          commission,
          refundsNetted,
          amountDue,
          dueDate,
          status: SettlementStatus.PENDING,
        },
        // Recompute money only — never reset an already-actioned status/paidAt/method (idempotency).
        update: { periodEnd, grossFares, commission, refundsNetted, amountDue, dueDate },
      });
    }
  }

  /**
   * Auto-pause: any still-`pending` settlement whose due date is more than
   * {@link SETTLEMENT.overduePauseDays} in the past becomes `overdue` AND its rider is suspended
   * (`accountStatus=suspended`, `suspendReason="settlement_overdue"`). Each rider's two writes commit in
   * one `$transaction`. Returns how many were paused. Exposed as the admin callable endpoint.
   */
  async autoPauseOverdue(ref: Date = new Date()): Promise<{ paused: number }> {
    const cutoff = new Date(ref);
    cutoff.setUTCDate(cutoff.getUTCDate() - SETTLEMENT.overduePauseDays);
    const overdue = await this.prisma.settlement.findMany({
      where: { status: SettlementStatus.PENDING, dueDate: { lt: cutoff } },
      select: { id: true, riderId: true },
    });

    for (const s of overdue) {
      await this.prisma.$transaction([
        this.prisma.settlement.update({ where: { id: s.id }, data: { status: SettlementStatus.OVERDUE } }),
        this.prisma.rider.update({
          where: { profileId: s.riderId },
          data: { accountStatus: RiderAccountStatus.SUSPENDED, suspendReason: "settlement_overdue" },
        }),
      ]);
    }
    return { paused: overdue.length };
  }

  /**
   * Record a settlement as paid — `status=paid`, `paidAt=now`, `method` (cash-at-agent / EcoCash /
   * netted). Does not auto-lift a `settlement_overdue` suspension: an admin lifts the rider explicitly
   * (POST /admin/riders/:id/lift) so the reinstatement is a deliberate, audited action.
   */
  async recordPayment(settlementId: string, method: string) {
    const existing = await this.prisma.settlement.findUnique({ where: { id: settlementId }, select: { id: true } });
    if (!existing) throw new NotFoundException("Settlement not found");
    const s = await this.prisma.settlement.update({
      where: { id: settlementId },
      data: { status: SettlementStatus.PAID, paidAt: new Date(), method },
    });
    return { id: s.id, status: s.status, paidAt: s.paidAt?.toISOString() ?? null, method: s.method };
  }

  /**
   * Current-period cash console payload (`GET /admin/cash/settlements`) in the `SettlementWeek` shape.
   * Generates the period first (idempotent) so the console is always live, then projects the rows +
   * KPIs. Money strings are 2dp — the API owns rounding (adminTypes contract).
   */
  async currentWeek(ref: Date = new Date()): Promise<SettlementWeek> {
    await this.generateForPeriod(ref);
    const { periodStart, periodEnd } = weeklyPeriod(ref);

    const [settlements, tripGroups] = await Promise.all([
      this.prisma.settlement.findMany({
        where: { periodStart },
        orderBy: { commission: "desc" },
        include: { rider: { select: { profile: { select: { firstName: true, lastName: true } } } } },
      }),
      this.prisma.order.groupBy({
        by: ["riderId"],
        where: { status: "completed", completedAt: { gte: periodStart, lt: periodEnd }, riderId: { not: null } },
        _count: { _all: true },
      }),
    ]);
    const tripsBy = new Map(tripGroups.map((g) => [g.riderId, g._count._all]));

    let cashCollected = 0;
    let commissionOwed = 0;
    let settledThisWeek = 0;
    let overdueCount = 0;

    const rows: SettlementRow[] = settlements.map((s) => {
      const gross = Number(s.grossFares);
      const commission = Number(s.commission);
      const refunds = Number(s.refundsNetted);
      const status = rowStatus(s.status);
      cashCollected += gross;
      if (status === "settled") settledThisWeek += commission;
      else commissionOwed += commission; // due + overdue are still owed
      if (status === "overdue") overdueCount += 1;

      return {
        id: s.id,
        name: `${s.rider.profile.firstName} ${s.rider.profile.lastName}`.trim(),
        trips: tripsBy.get(s.riderId) ?? 0,
        cash: gross.toFixed(2),
        commission: commission.toFixed(2),
        adjustment: refunds > 0 ? `−$${refunds.toFixed(2)} refunds` : undefined,
        status,
        note: status === "overdue" ? "past settlement day" : status === "settled" ? "settled" : "due",
      };
    });

    return {
      weekLabel: `${fmtDate(periodStart)} – ${fmtDate(periodEnd)}`,
      settlementDay: WEEKDAY_NAMES[SETTLEMENT.settleWeekday] ?? String(SETTLEMENT.settleWeekday),
      kpis: {
        cashCollected: round(cashCollected).toFixed(2),
        commissionOwed: round(commissionOwed).toFixed(2),
        settledThisWeek: round(settledThisWeek).toFixed(2),
        overdueCount,
        overdueNote: overdueCount > 0 ? `${overdueCount} rider${overdueCount === 1 ? "" : "s"} past settlement day` : undefined,
      },
      rows,
    };
  }
}
