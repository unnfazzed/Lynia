import { Injectable } from "@nestjs/common";
import { COMMISSION, perRideCommission } from "@lynia/shared";
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
 * wallet itself (balance ledger, top-ups, per-ride deduction) is a later build — see
 * docs/plans/2026-biker-prepaid-commission.md — so no money moves here.
 */
@Injectable()
export class SettlementsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Read-only overview of completed rides in the trailing 7-day window `[ref−7d, ref)`, grouped by
   * rider: ride count, gross fares, and the commission that would accrue at {@link COMMISSION.ratePct}
   * ($0.00 at the launch rate). No settlement rows are written or read — the figures come straight from
   * completed orders. Rows are ordered by fares delivered, descending.
   */
  async commissionOverview(ref: Date = new Date()): Promise<CommissionOverview> {
    const periodEnd = new Date(Date.UTC(ref.getUTCFullYear(), ref.getUTCMonth(), ref.getUTCDate()));
    const periodStart = new Date(periodEnd);
    periodStart.setUTCDate(periodEnd.getUTCDate() - 7);

    // Read the individual completed rides (not a groupBy _sum) so commission is summed PER RIDE:
    // perRideCommission is applied+rounded on each ride's fare, then summed — matching the prepaid
    // wallet, which debits per completed ride. Applying the rate to a rider's ROUNDED aggregate fare
    // instead diverges by rounding once the rate is non-zero, so the console would never reconcile with
    // the ledger. At the 7-day window's pilot volume this per-ride read is cheap.
    const orders = await this.prisma.order.findMany({
      where: { status: "completed", completedAt: { gte: periodStart, lt: periodEnd }, riderId: { not: null } },
      select: { riderId: true, agreedFare: true },
    });

    // Aggregate per rider in JS: ride count, gross fares, and per-ride-summed commission.
    const byRider = new Map<string, { rides: number; fares: number; commission: number }>();
    for (const o of orders) {
      if (!o.riderId) continue;
      const fare = Number(o.agreedFare ?? 0);
      const agg = byRider.get(o.riderId) ?? { rides: 0, fares: 0, commission: 0 };
      agg.rides += 1;
      agg.fares += fare;
      agg.commission += perRideCommission(fare);
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
      ratePct: COMMISSION.ratePct,
      periodLabel: `${fmtDate(periodStart)} – ${fmtDate(periodEnd)}`,
      kpis: {
        ratePct: COMMISSION.ratePct,
        rides: totalRides,
        fares: round(totalFares).toFixed(2),
        commission: round(totalCommission).toFixed(2),
      },
      rows,
    };
  }
}
