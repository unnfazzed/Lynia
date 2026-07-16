import { Injectable } from "@nestjs/common";
import { COMMISSION, commissionBasis, perRideCommission } from "@lynia/shared";
import { PrismaService } from "../prisma/prisma.service";

/**
 * The commission-console payload shapes. The admin console reads exactly this JSON — they mirror
 * `CommissionRiderRow`/`CommissionOverview` in apps/admin/app/lib/adminTypes.ts. Re-declared here
 * (rather than imported across the app boundary) because the admin app is a separate package; the API
 * owns the wire shape. Keep the two in sync.
 */
export interface CommissionRiderRow {
  riderId: string;
  name: string;
  /** Completed rides in the window. */
  rides: number;
  /** Gross agreed fares on those rides (informational — riders keep this in full at 0%). */
  fares: string;
  /** Commission that would accrue at the current rate ({@link COMMISSION.ratePct}); $0.00 at 0%. */
  commission: string;
}

export interface CommissionOverview {
  /** How commission is collected — always `prepaid_per_ride` (see @lynia/shared COMMISSION). */
  model: typeof COMMISSION.model;
  /** Current commission rate as a percentage of the amount paid per ride (0 during the launch period). */
  ratePct: number;
  /** The window these figures cover, pre-formatted (e.g. "2026-06-29 – 2026-07-06"). */
  periodLabel: string;
  kpis: {
    ratePct: number;
    /** Total completed rides in the window. */
    rides: number;
    /** Total gross agreed fares delivered in the window. */
    fares: string;
    /** Total commission accrued at the current rate — $0.00 while the launch rate is 0%. */
    commission: string;
  };
  rows: CommissionRiderRow[];
}

/** 2dp round — the same money rounding the rest of the API uses. */
function round(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Calendar date (YYYY-MM-DD), UTC — stable + testable, no locale/timezone drift (mirrors admin.service). */
function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Commission overview for the admin console (`GET /admin/cash/settlements`).
 *
 * The revenue model is **prepaid per-ride** (see @lynia/shared `COMMISSION`): riders pre-fund a
 * commission account and each completed ride debits {@link perRideCommission} of the amount paid. The
 * rate is **0% for the launch period**, so nothing is collected yet — this console is purely a
 * read-only view of ride volume and the commission that *would* accrue at the current rate.
 *
 * This deliberately does NOT bill, settle, net refunds, mark payments or auto-pause riders: those were
 * the old post-paid weekly cash-settlement mechanics, which the prepaid model replaces. The prepaid
 * wallet itself (balance ledger, top-ups, per-ride deduction — `apps/api/src/wallet/*`) shipped
 * 2026-07-15 (docs/plans/2026-rider-wallet-design.md); this console stays read-only by design (it never
 * bills/mints — that's `WalletService`'s job), and no money moves through it, but it's not "not built" —
 * it's a deliberately separate reporting surface over the live wallet.
 */
@Injectable()
export class SettlementsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Read-only overview of completed rides in the last 7 UTC calendar days INCLUDING the current
   * (partial) day — `[start of (ref − 6d), start of (ref + 1d))` — grouped by rider: ride count, gross
   * fares, and the commission that would accrue at {@link COMMISSION.ratePct} ($0.00 at the launch
   * rate). Windowing to whole days ending at the START of ref's day would silently drop every ride
   * completed today while the label still advertised today as covered — an ops console must show the
   * current day's activity. No settlement rows are written or read — the figures come straight from
   * completed orders. Rows are ordered by fares delivered, descending.
   */
  async commissionOverview(ref: Date = new Date(), ratePct: number = COMMISSION.ratePct): Promise<CommissionOverview> {
    // Exclusive end = start of TOMORROW (UTC), so the current day counts as it fills in; the label's
    // inclusive last day is ref's own date, matching exactly what the query covers.
    const periodEnd = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), ref.getUTCDate() + 1));
    const periodStart = new Date(periodEnd);
    periodStart.setUTCDate(periodEnd.getUTCDate() - 7);

    // Read the individual completed rides (not a groupBy _sum) so commission is summed PER RIDE:
    // perRideCommission is applied+rounded on each ride's fare, then summed — matching the prepaid
    // wallet, which debits per completed ride. Applying the rate to a rider's ROUNDED aggregate fare
    // instead diverges by rounding once the rate is non-zero, so the console would never reconcile with
    // the ledger. At the 7-day window's pilot volume this per-ride read is cheap.
    const orders = await this.prisma.order.findMany({
      where: { status: "completed", completedAt: { gte: periodStart, lt: periodEnd }, riderId: { not: null } },
      select: { id: true, riderId: true, agreedFare: true, suggestedFare: true },
    });

    // WD-006: prefer what was ACTUALLY charged per order (the ledger — `ride_commission` plus any
    // fare-adjust `adjustment` delta, see WalletService/AdminOrdersService.adjustFare) over a fresh
    // fare × CURRENT rate projection. The projection silently drifts from the ledger the moment `ratePct`
    // changes mid-window — an order completed earlier in the window at the OLD rate would otherwise be
    // re-priced at the new one here, so the console would never match the dollars actually debited.
    // Falls back to the projection only for orders with no ledger row at all (the 0% launch period, where
    // chargeCommission intentionally writes none — this keeps the console's pre-flip $0.00 behavior
    // unchanged) or an order predating a rate flip that hasn't been charged/adjusted.
    const orderIds = orders.map((o) => o.id);
    const ledgerRows = orderIds.length
      ? await this.prisma.commissionLedger.findMany({
          where: { orderId: { in: orderIds }, type: { in: ["ride_commission", "adjustment"] } },
          select: { orderId: true, amount: true },
        })
      : [];
    const chargedByOrder = new Map<string, number>();
    for (const r of ledgerRows) {
      if (!r.orderId) continue;
      chargedByOrder.set(r.orderId, (chargedByOrder.get(r.orderId) ?? 0) + Number(r.amount));
    }

    // Aggregate per rider in JS: ride count, gross fares, and per-ride-summed commission.
    const byRider = new Map<string, { rides: number; fares: number; commission: number }>();
    for (const o of orders) {
      if (!o.riderId) continue;
      const fare = Number(o.agreedFare ?? 0);
      const agg = byRider.get(o.riderId) ?? { rides: 0, fares: 0, commission: 0 };
      agg.rides += 1;
      agg.fares += fare;
      const charged = chargedByOrder.get(o.id);
      // Ledger amounts are signed (debit −, a downward fare-adjust credit +); negate to a positive
      // "commission collected" figure matching the projection's sign. WD-012: the projection floors its
      // basis the same way chargeCommission now does, so this console's "would accrue" figure doesn't
      // silently diverge from what a flip would actually charge on a lowballed agreedFare.
      agg.commission += charged != null ? -charged : perRideCommission(commissionBasis(fare, o.suggestedFare != null ? Number(o.suggestedFare) : null), ratePct);
      byRider.set(o.riderId, agg);
    }

    const riderIds = [...byRider.keys()];
    const profiles = riderIds.length
      ? await this.prisma.profile.findMany({
          where: { id: { in: riderIds } },
          select: { id: true, firstName: true, lastName: true },
        })
      : [];
    const nameBy = new Map(profiles.map((p) => [p.id, `${p.firstName} ${p.lastName}`.trim()]));

    let totalRides = 0;
    let totalFares = 0;
    let totalCommission = 0;

    const rows: CommissionRiderRow[] = [...byRider.entries()]
      // Order by fares delivered, descending (was the DB orderBy _sum.agreedFare desc).
      .sort((a, b) => b[1].fares - a[1].fares)
      .map(([riderId, agg]) => {
        totalRides += agg.rides;
        totalFares += agg.fares;
        totalCommission += agg.commission;
        return {
          riderId,
          name: nameBy.get(riderId) ?? "Unknown rider",
          rides: agg.rides,
          fares: round(agg.fares).toFixed(2),
          // agg.commission is the sum of already-rounded per-ride amounts; round() only cleans float drift.
          commission: round(agg.commission).toFixed(2),
        };
      });

    return {
      model: COMMISSION.model,
      ratePct,
      // Inclusive calendar-day span: the last labeled day is ref's own date (periodEnd is exclusive).
      periodLabel: `${fmtDate(periodStart)} – ${fmtDate(ref)}`,
      kpis: {
        ratePct,
        rides: totalRides,
        fares: round(totalFares).toFixed(2),
        commission: round(totalCommission).toFixed(2),
      },
      rows,
    };
  }
}
