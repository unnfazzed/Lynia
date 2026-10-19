import { BadRequestException, Injectable, Logger, NotFoundException, type OnModuleDestroy, type OnModuleInit, Optional } from "@nestjs/common";
import { recordFleetRide } from "../common/fleet-ledger";
import { OwnerAlertsService } from "../owner-alerts/owner-alerts.service";
import { PrismaService } from "../prisma/prisma.service";

/** How often the reconciliation runs (four times a day; a missed ride is a bug, not a timing matter). */
export const FLEET_RECONCILE_INTERVAL_MS = 6 * 60 * 60 * 1000;
/** How far back it looks: a little over a week, so a ride missed late in a week is caught before that bill closes. */
export const FLEET_RECONCILE_LOOKBACK_MS = 8 * 24 * 60 * 60 * 1000;
/** Audit action for an admin correction to a fleet bill. */
export const FLEET_ADJUST_ACTION = "merchant.fleet.adjust";

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
  private startTimer?: ReturnType<typeof setTimeout>;

  constructor(
    private readonly prisma: PrismaService,
    // @Global in the app; optional only for the positional unit harnesses.
    @Optional() private readonly alerts?: OwnerAlertsService,
  ) {}

  onModuleInit(): void {
    // A random start offset (≤ 1 min) so several instances don't sweep in lockstep.
    this.startTimer = setTimeout(() => void this.runReconcile(), Math.floor(Math.random() * 60_000));
    this.startTimer.unref?.();
    this.timer = setInterval(() => void this.runReconcile(), FLEET_RECONCILE_INTERVAL_MS);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.startTimer) clearTimeout(this.startTimer);
    if (this.timer) clearInterval(this.timer);
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
  async adjust(actorProfileId: string, input: { merchantId: string; fee: number; reason: string; orderId?: string | null }): Promise<{ id: string }> {
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
          actorProfileId,
          reason,
        },
        select: { id: true },
      });
      await tx.auditLog.create({ data: { actor: actorProfileId, action: FLEET_ADJUST_ACTION, target: input.merchantId, note: `${input.fee} ${reason}` } });
      return row;
    });
  }
}
