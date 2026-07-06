import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
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
 * REFUND NETTING (A-06): `refundsNetted` = the sum of the rider's un-netted {@link Refund} rows whose
 * `createdAt` falls in the settlement window. Those rows are stamped with this settlement's id in the
 * same transaction so each refund is netted exactly once; `amountDue = max(0, commission −
 * refundsNetted)` (floored so a refund-heavy week never bills the rider a negative amount).
 *
 * DEFERRALS (documented, pilot-simple):
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
   * periodEnd)`; `commission = commissionOn(grossFares)`; `refundsNetted` = sum of the rider's un-netted
   * refunds created in the window; `amountDue = max(0, commission − refundsNetted)`; `dueDate` = the
   * period's settle weekday; status `pending`. Each rider's upsert and the stamping of its netted
   * refunds commit in one `$transaction`.
   *
   * Idempotent: keyed on the `(riderId, periodStart)` unique index, re-running recomputes the money
   * fields in place. It deliberately does NOT touch `status`/`paidAt`/`method` on update, so a
   * regeneration can never un-pay or un-overdue a settlement that was already actioned. The refund sum
   * matches rows that are un-netted (`settlementId IS NULL`) OR already stamped to THIS settlement, so
   * re-generating the open period re-nets to the same figure (a stamp doesn't drop out of the sum).
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

      await this.prisma.$transaction(async (tx) => {
        // Net refunds created in this window. Match un-netted rows OR ones already stamped to this
        // settlement (found by its (riderId, periodStart) key) so a regeneration re-nets to the same
        // figure instead of dropping stamped rows to 0. Refunds absorbed by a PAST (paid) settlement
        // carry that settlement's id → excluded here, so a paid row's money is never re-netted.
        const existing = await tx.settlement.findUnique({
          where: { riderId_periodStart: { riderId, periodStart } },
          select: { id: true },
        });
        const settlementIdFilter = existing
          ? [{ settlementId: null }, { settlementId: existing.id }]
          : [{ settlementId: null }];
        const refunds = await tx.refund.findMany({
          where: { riderId, createdAt: { gte: periodStart, lt: periodEnd }, OR: settlementIdFilter },
          select: { id: true, amount: true },
        });
        const refundsNetted = round(refunds.reduce((sum, r) => sum + Number(r.amount), 0));
        // Floor at 0 — a refund-heavy week nets the commission to nothing, never bills the rider negative.
        const amountDue = round(Math.max(0, commission - refundsNetted));

        const settlement = await tx.settlement.upsert({
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
          // INVARIANT: only call generateForPeriod for the current OPEN period. Regenerating a past
          // period whose rows are already `paid` would recompute the money upward (e.g. a late-completing
          // order) while the status stays `paid` → silent under-collection. currentWeek() only ever
          // generates the current (pending) period, so this holds.
          update: { periodEnd, grossFares, commission, refundsNetted, amountDue, dueDate },
          select: { id: true },
        });

        // Stamp the netted refunds with this settlement's id so they're absorbed exactly once. Re-runs
        // re-stamp the same (already-linked) rows — a no-op change — keeping the operation idempotent.
        if (refunds.length > 0) {
          await tx.refund.updateMany({
            where: { id: { in: refunds.map((r) => r.id) } },
            data: { settlementId: settlement.id },
          });
        }
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

    let paused = 0;
    for (const s of overdue) {
      await this.prisma.$transaction(async (tx) => {
        // The settlement is overdue regardless of account standing.
        await tx.settlement.update({ where: { id: s.id }, data: { status: SettlementStatus.OVERDUE } });
        // Only pause an ACTIVE account — never downgrade an admin ban/suspension or overwrite its
        // reason (guarded via updateMany's compound where). A rider with several overdue settlements
        // is suspended once: subsequent rows match 0 rows here, so no double audit.
        const res = await tx.rider.updateMany({
          where: { profileId: s.riderId, accountStatus: RiderAccountStatus.ACTIVE },
          data: { accountStatus: RiderAccountStatus.SUSPENDED, suspendReason: "settlement_overdue" },
        });
        if (res.count > 0) {
          paused++;
          // A-01: an automated state change is audited too, actor "system".
          await tx.auditLog.create({
            data: {
              actor: "system",
              action: "rider.auto_pause",
              target: s.riderId,
              reasonCode: "settlement_overdue",
              note: `settlement ${s.id} overdue past ${SETTLEMENT.overduePauseDays}d`,
            },
          });
        }
      });
    }
    return { paused };
  }

  /**
   * Record a settlement as paid — `status=paid`, `paidAt=now`, `method` (cash-at-agent / EcoCash /
   * netted). Does not auto-lift a `settlement_overdue` suspension: an admin lifts the rider explicitly
   * (POST /admin/riders/:id/lift) so the reinstatement is a deliberate, audited action.
   */
  async recordPayment(settlementId: string, method: string, actor: string) {
    // P2-4: the one destructive money action must be attributed and idempotent — write the audit row in
    // the same transaction as the status flip, and reject a re-pay of an already-paid settlement.
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.settlement.findUnique({ where: { id: settlementId }, select: { id: true, status: true } });
      if (!existing) throw new NotFoundException("Settlement not found");
      if (existing.status === SettlementStatus.PAID) throw new ConflictException("Settlement is already paid");
      const s = await tx.settlement.update({
        where: { id: settlementId },
        data: { status: SettlementStatus.PAID, paidAt: new Date(), method },
      });
      await tx.auditLog.create({
        data: { actor, action: "settlement.pay", target: settlementId, reasonCode: null, note: `method ${method}` },
      });
      return { id: s.id, status: s.status, paidAt: s.paidAt?.toISOString() ?? null, method: s.method };
    });
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
      const amountDue = Number(s.amountDue);
      const status = rowStatus(s.status);
      cashCollected += gross;
      // The rider pays amountDue (commission net of refunds), not gross commission — the KPIs must
      // reflect the collectible cash, otherwise "commission owed" overstates it by the netted refunds.
      if (status === "settled") settledThisWeek += amountDue;
      else commissionOwed += amountDue; // due + overdue are still owed (net of refunds)
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
