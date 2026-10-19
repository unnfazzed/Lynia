import { BadRequestException, Injectable, Logger, NotFoundException, type OnModuleDestroy, type OnModuleInit, Optional } from "@nestjs/common";
import { recordFleetRide } from "../common/fleet-ledger";
import { addDaysToKey, harareWeekKey, harareWeekStart } from "./harare-clock";
import { OwnerAlertsService } from "../owner-alerts/owner-alerts.service";
import { PrismaService } from "../prisma/prisma.service";

/** How often the reconciliation runs (four times a day; a missed ride is a bug, not a timing matter). */
export const FLEET_RECONCILE_INTERVAL_MS = 6 * 60 * 60 * 1000;
/** How far back it looks: a little over a week, so a ride missed late in a week is caught before that bill closes. */
export const FLEET_RECONCILE_LOOKBACK_MS = 8 * 24 * 60 * 60 * 1000;
/** Audit action for an admin correction to a fleet bill. */
export const FLEET_ADJUST_ACTION = "merchant.fleet.adjust";
/** How often closed weeks are turned into bills (hourly: a Monday-morning bill appears within the hour). */
export const FLEET_CLOSE_INTERVAL_MS = 60 * 60 * 1000;
/** A bill is due the Friday after its week ends (handoff OB-M14 / OB-A1: "due Fri"): Monday + 11 days. */
export const FLEET_BILL_DUE_DAYS_AFTER_MONDAY = 11;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** A calendar day (`YYYY-MM-DD`) as the Date Prisma writes to a `@db.Date` column. */
const dayDate = (key: string) => new Date(`${key}T00:00:00.000Z`);

/**
 * Own bikers T5 (docs/designs/own-bikers.md "Commission and billing", D-117): the safety net under the fleet bill,
 * and its corrections.
 *
 * Every billable terminal transaction writes its own ledger row (common/fleet-ledger.ts). This sweep finds any
 * billable fleet ride that has none (a path that ends orders and was never taught to bill), writes it (the write
 * is idempotent) and tells the owner on Telegram, because a miss means a bug to fix, not just a row to add.
 *
 * Corrections (E3, OV-F6) are append-only `adjustment` rows with the admin and a reason, landing on the open week
 * (no statement yet). The admin route is T7's; the rule lives here.
 */
@Injectable()
export class FleetLedgerService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FleetLedgerService.name);
  private timer?: ReturnType<typeof setInterval>;
  private closeTimer?: ReturnType<typeof setInterval>;
  private startTimer?: ReturnType<typeof setTimeout>;

  constructor(
    private readonly prisma: PrismaService,
    // @Global in the app; optional only for the positional unit harnesses.
    @Optional() private readonly alerts?: OwnerAlertsService,
  ) {}

  onModuleInit(): void {
    // A random start offset (≤ 1 min) so several instances don't sweep in lockstep.
    this.startTimer = setTimeout(() => {
      void this.runReconcile();
      void this.runClose();
    }, Math.floor(Math.random() * 60_000));
    this.startTimer.unref?.();
    this.timer = setInterval(() => void this.runReconcile(), FLEET_RECONCILE_INTERVAL_MS);
    this.timer.unref?.();
    this.closeTimer = setInterval(() => void this.runClose(), FLEET_CLOSE_INTERVAL_MS);
    this.closeTimer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.startTimer) clearTimeout(this.startTimer);
    if (this.timer) clearInterval(this.timer);
    if (this.closeTimer) clearInterval(this.closeTimer);
  }

  private async runClose(): Promise<void> {
    try {
      await this.closeWeeks();
    } catch (err) {
      this.logger.error(`fleet bill close failed: ${(err as Error).message}`);
    }
  }

  /**
   * E7/R3: turn every finished Harare week's ledger rows into one stored bill per owner (`merchant_fleet_statements`,
   * status `sent`, due the Friday after). Idempotent: the bill is keyed on (owner, Monday), only rows with no bill
   * are claimed, and its total is re-summed from its rows. A correction written this week stays on this week.
   */
  async closeWeeks(now: Date = new Date()): Promise<{ closed: number }> {
    const rows = await this.prisma.merchantFleetLedger.findMany({
      where: { statementId: null, createdAt: { lt: harareWeekStart(now) } },
      select: { id: true, ownerProfileId: true, createdAt: true },
      orderBy: { createdAt: "asc" },
      take: 5000,
    });
    const groups = new Map<string, { owner: string; monday: string; ids: string[] }>();
    for (const r of rows) {
      const monday = harareWeekKey(r.createdAt);
      const key = `${r.ownerProfileId}|${monday}`;
      const g = groups.get(key) ?? { owner: r.ownerProfileId, monday, ids: [] };
      g.ids.push(r.id);
      groups.set(key, g);
    }
    for (const g of groups.values()) {
      await this.prisma.$transaction(async (tx) => {
        const bill = await tx.merchantFleetStatement.upsert({
          where: { ownerProfileId_periodStart: { ownerProfileId: g.owner, periodStart: dayDate(g.monday) } },
          create: {
            ownerProfileId: g.owner,
            periodStart: dayDate(g.monday),
            periodEnd: dayDate(addDaysToKey(g.monday, 6)),
            dueOn: dayDate(addDaysToKey(g.monday, FLEET_BILL_DUE_DAYS_AFTER_MONDAY)),
            status: "sent",
          },
          update: {},
          select: { id: true },
        });
        await tx.merchantFleetLedger.updateMany({ where: { id: { in: g.ids }, statementId: null }, data: { statementId: bill.id } });
        const sum = await tx.merchantFleetLedger.aggregate({ where: { statementId: bill.id }, _sum: { fee: true } });
        await tx.merchantFleetStatement.update({ where: { id: bill.id }, data: { total: sum._sum.fee ?? 0 } });
      });
    }
    if (groups.size > 0) this.logger.log(`fleet bills closed: ${groups.size} (rows ${rows.length})`);
    return { closed: groups.size };
  }

  private async runReconcile(): Promise<void> {
    try {
      await this.reconcile();
    } catch (err) {
      this.logger.error(`fleet ledger reconciliation failed: ${(err as Error).message}`);
    }
  }

  /** Bill every recent billable fleet ride that has no ledger row. Returns the orders it repaired. */
  async reconcile(now: Date = new Date()): Promise<{ repaired: string[] }> {
    const since = new Date(now.getTime() - FLEET_RECONCILE_LOOKBACK_MS);
    const missing = await this.prisma.$queryRaw<Array<{ id: string }>>`
      SELECT o.id
      FROM orders o
      WHERE o.fleet_merchant_id IS NOT NULL
        AND o.updated_at >= ${since}
        AND (o.status IN ('completed', 'undelivered') OR (o.status = 'cancelled' AND o.collected_at IS NOT NULL))
        AND NOT EXISTS (SELECT 1 FROM merchant_fleet_ledger l WHERE l.order_id = o.id AND l.kind <> 'adjustment')
      ORDER BY o.updated_at ASC
      LIMIT 500`;
    const repaired: string[] = [];
    for (const { id } of missing) {
      // Another instance may have repaired it a moment ago: only the write that lands counts.
      if (await recordFleetRide(this.prisma, id)) repaired.push(id);
    }
    if (repaired.length > 0) {
      this.logger.error(`fleet_ledger_reconcile_miss count=${repaired.length} orders=${repaired.slice(0, 20).join(",")}`);
      this.alerts?.notify(
        `⚠️ Own bikers: ${repaired.length} fleet ride(s) had no bill row and were billed by the reconciliation. ` +
          `A path that ends orders isn't billing. First: ${repaired.slice(0, 5).join(", ")}`,
      );
    }
    return { repaired };
  }

  /**
   * E3/OV-F6: an admin correction to a branch's fleet bill (usually negative, e.g. "wrong fee"). Append-only, with
   * the admin and a reason; it lands on the open week. `orderId`, when given, must be one of the branch's rides.
   */
  async adjust(actor: string, input: { merchantId: string; fee: number; reason: string; orderId?: string | null }): Promise<{ id: string }> {
    const reason = input.reason.trim();
    if (reason.length < 3) throw new BadRequestException({ reason: "reason_required", message: "Say why you're changing the bill." });
    if (!Number.isFinite(input.fee) || input.fee === 0 || Math.round(input.fee * 100) !== input.fee * 100) {
      throw new BadRequestException({ reason: "bad_amount", message: "Enter an amount in dollars and cents, not zero." });
    }
    const merchant = await this.prisma.merchant.findUnique({ where: { id: input.merchantId }, select: { ownerProfileId: true } });
    if (!merchant?.ownerProfileId) throw new NotFoundException("Branch not found");
    if (input.orderId) {
      const ride = await this.prisma.merchantFleetLedger.findFirst({
        where: { orderId: input.orderId, merchantId: input.merchantId, kind: { not: "adjustment" } },
        select: { id: true },
      });
      if (!ride) throw new NotFoundException({ reason: "ride_not_found", message: "That ride isn't on this branch's bill." });
    }
    return this.prisma.$transaction(async (tx) => {
      const row = await tx.merchantFleetLedger.create({
        data: {
          ownerProfileId: merchant.ownerProfileId!,
          merchantId: input.merchantId,
          orderId: input.orderId ?? null,
          kind: "adjustment",
          fee: input.fee,
          // An ops actor is the operator's email (X-Operator), not a profile: the audit row carries it then.
          actorProfileId: UUID_RE.test(actor) ? actor : null,
          actor: UUID_RE.test(actor) ? null : actor,
          reason,
        },
        select: { id: true },
      });
      await tx.auditLog.create({ data: { actor, action: FLEET_ADJUST_ACTION, target: input.merchantId, note: `${input.fee} ${reason}` } });
      return row;
    });
  }
}
