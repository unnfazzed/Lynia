import { Inject, Injectable } from "@nestjs/common";
import { resolveCommissionRatePct, RESTAURANTS_DEBT } from "@lynia/shared";
import { heartbeatMaxAgeMs } from "../common/broadcast-policy";
import { ENV } from "../config/config.module";
import type { Env } from "../config/env";
import { PrismaService } from "../prisma/prisma.service";
import { computeFunnel, fmtDate, routeOf, STUCK_AFTER_MS } from "./admin.shared";

/** One day's row from the utilization() raw query, before day formatting. */
type RawUtilizationRow = {
  day: Date;
  assignments: number;
  express: number;
  merchant: number;
  activeRiders: number;
  ridesPerActiveRider: number | null;
  expressRidesPerActiveRider: number | null;
  merchantRidesPerActiveRider: number | null;
  heartbeatArmIncluded: boolean;
};

export type UtilizationRow = Omit<RawUtilizationRow, "day"> & { day: string };

/** In-flight (assigned…drop-off) statuses — an order here that hasn't changed in a while is "stuck". */
const IN_FLIGHT_STATUSES = [
  "assigned",
  "confirmed",
  "en_route_pickup",
  "picked_up",
  "en_route_dropoff",
] as const;

/**
 * Dashboard-level reads for the admin console. The per-domain admin operations live in their own
 * services: AdminOrdersService, AdminRidersService, AdminCustomersService, AdminAuditService — with
 * the pure projection/timeline helpers shared via admin.shared.ts.
 */
@Injectable()
export class AdminService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** Cheap counts for the sidebar attention badges (KYC backlog, open disputes, un-acked SOS). Kept
   *  separate from `overview()` so the shell can render badges on every page without its heavy query set. */
  async navCounts() {
    // X1: foodDisputes = R-05 frozen doorstep handshakes (need admin resolveHandshake) + N-12
    // refund-overdue orders past the 2h SLA. Approximates "past SLA" off `updatedAt` (the same cheap
    // single-column-index style STUCK_AFTER_MS uses for the overview dashboard — see admin.shared.ts's
    // comment on why the badge and the detail queue are allowed to use different clocks) rather than
    // admin-merchants.service.ts's precise per-row cancelledAt/undeliveredAt computation — a nav badge
    // only needs to be a cheap, roughly-right attention signal, not the authoritative queue itself.
    const refundOverdueCutoff = new Date(Date.now() - RESTAURANTS_DEBT.refundSlaMs);
    const [kycPending, openIssues, sosPending, frozenHandshakes, refundsOverdue] = await Promise.all([
      this.prisma.rider.count({ where: { kycStatus: "pending" } }),
      this.prisma.issue.count({ where: { status: { in: ["open", "investigating"] } } }),
      this.prisma.sosEvent.count({ where: { acknowledgedAt: null } }),
      this.prisma.order.count({
        where: { orderType: "merchant", cashHandshakeFrozenAt: { not: null }, riderCashConfirmedAt: null },
      }),
      this.prisma.order.count({
        where: {
          orderType: "merchant",
          merchantPaymentMethod: "wallet",
          merchantPaymentConfirmedAt: { not: null },
          status: { in: ["cancelled", "undelivered"] },
          refundedAt: null,
          updatedAt: { lt: refundOverdueCutoff },
        },
      }),
    ]);
    return { kycPending, openIssues, sosPending, foodDisputes: frozenHandshakes + refundsOverdue };
  }

  /** Single read for the monitor dashboard: status counts, rider stats, pilot funnel, recent orders. */
  async overview() {
    // BR-01: match nearbyRiders' honesty — an "online" rider whose app died with is_online stuck true
    // keeps a stale heartbeat, so require a fresh heartbeat here too rather than counting ghosts. The
    // standing axis (suspended/held) is already handled: those paths now flip is_online:false.
    const hbCutoff = new Date(Date.now() - heartbeatMaxAgeMs());
    // "Today" = since the start of the current UTC day. Simple + deterministic for the pilot; the ops
    // console labels these figures "today" and they reset at 00:00 UTC (≈02:00 Harare).
    const now = new Date();
    const startOfDay = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
    // DS20-01: shared threshold (admin.shared.STUCK_AFTER_MS) so this dashboard aggregate and the
    // per-order detail badge (admin-orders.service) can't drift to different minutes. The dashboard
    // deliberately keys off `order.updatedAt` — one cheap indexed range query, no per-order OrderEvent
    // join — while the detail page uses the last OrderEvent.createdAt (more precise, already loaded).
    // Same threshold, different data source on purpose: don't "unify" the clock into an N+1 here.
    const stuckCutoff = new Date(now.getTime() - STUCK_AFTER_MS);
    const [
      byStatus,
      totalOrders,
      totalOffers,
      expired,
      ridersTotal,
      ridersOnline,
      ridersVerified,
      recent,
      ordersWithOfferRows,
      deliveredToday,
      undeliveredToday,
      faresTodayAgg,
      kycPending,
      openIssues,
      stuckCount,
      stuckOldest,
    ] = await Promise.all([
      this.prisma.order.groupBy({ by: ["status"], _count: { _all: true } }),
      // A-8 (status-keyed-query-audit): the pilot funnel (computeFunnel below) reads these as "Express
      // auction broadcasts" — a merchant order (this PR) was never broadcast to riders, so counting it
      // here would corrupt offersPerBroadcast/expiryRatePct the moment the first food order lands.
      this.prisma.order.count({ where: { orderType: "parcel" } }),
      this.prisma.offer.count(),
      this.prisma.order.count({ where: { status: "expired", orderType: "parcel" } }),
      this.prisma.rider.count(),
      this.prisma.rider.count({ where: { isOnline: true, lastHeartbeatAt: { gte: hbCutoff } } }),
      this.prisma.rider.count({ where: { kycStatus: "verified" } }),
      this.prisma.order.findMany({
        take: 20,
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          status: true,
          proposedFare: true,
          agreedFare: true,
          createdAt: true,
          pickup: true,
          dropoff: true,
          rider: { select: { profile: { select: { firstName: true, lastName: true } } } },
        },
      }),
      // LC-D-T1: was `offer.findMany({ distinct: ["orderId"] })`, an unbounded (no `where`, no
      // `take`) full-table scan feeding just a count — every other query in this Promise.all is
      // either a bounded `count()`/`aggregate()` or capped at `take: 20`. A single DB-side
      // `COUNT(DISTINCT ...)` gets the same exact number without pulling one row per distinct
      // orderId over the wire on every Overview load.
      this.prisma.$queryRaw<Array<{ count: number }>>`SELECT COUNT(DISTINCT order_id)::int AS count FROM offers`,
      // Today's throughput: orders CURRENTLY `completed` (not merely `deliveredAt`-stamped, which stays
      // set forever even if the order is later admin-cancelled post-delivery — WD-024) whose completion
      // landed today. `completedAt` is only ever written in the same update as `status:"completed"`
      // (order-lifecycle's `rate()`/`completeOrder`, `adjustFare`'s adjudication mirror, and
      // `adjudicateDelivered`'s force-complete of a disputed `undelivered` order all set both together),
      // so this also picks up an adjudicated-delivered order same-day (WD-026) that never got a
      // `deliveredAt` at all.
      this.prisma.order.count({ where: { status: "completed", completedAt: { gte: startOfDay } } }),
      // Mirror: only orders STILL `undelivered` today count toward the failure side of the completion
      // rate — one later adjudicated back to `completed` (WD-026) must stop counting here, even though
      // its `undeliveredAt` timestamp from the original failed hand-off is never cleared.
      this.prisma.order.count({ where: { status: "undelivered", undeliveredAt: { gte: startOfDay } } }),
      // A-9 (status-keyed-query-audit): a merchant order's `agreedFare` is its own goods+delivery
      // total, not a parcel fare — summing it into "Fares today" would misstate the parcel KPI once a
      // merchant order can complete (C3/C4). Merchant orders get their own settlement view later.
      this.prisma.order.aggregate({
        _sum: { agreedFare: true },
        where: { status: "completed", completedAt: { gte: startOfDay }, orderType: "parcel" },
      }),
      // Needs-attention signals.
      this.prisma.rider.count({ where: { kycStatus: "pending" } }),
      this.prisma.issue.count({ where: { status: { in: ["open", "investigating"] } } }),
      this.prisma.order.count({ where: { status: { in: [...IN_FLIGHT_STATUSES] }, updatedAt: { lt: stuckCutoff } } }),
      this.prisma.order.findFirst({
        where: { status: { in: [...IN_FLIGHT_STATUSES] }, updatedAt: { lt: stuckCutoff } },
        orderBy: { updatedAt: "asc" },
        select: { id: true },
      }),
    ]);

    const completionRatePct =
      deliveredToday + undeliveredToday > 0
        ? Math.round((deliveredToday / (deliveredToday + undeliveredToday)) * 100)
        : null;

    return {
      ordersByStatus: Object.fromEntries(byStatus.map((r) => [r.status, r._count._all])),
      riders: { total: ridersTotal, online: ridersOnline, verified: ridersVerified },
      metrics: computeFunnel({
        totalBroadcasts: totalOrders,
        totalOffers,
        ordersWithOffer: ordersWithOfferRows[0]?.count ?? 0,
        expired,
      }),
      // Today's throughput (drives the "Completed today" + "Fares today" headline KPIs).
      today: {
        completed: deliveredToday,
        completionRatePct,
        fares: (faresTodayAgg._sum.agreedFare ?? 0).toString(),
      },
      // Needs-attention queue signals for the overview (stuck order, open disputes, KYC backlog).
      attention: {
        kycPending,
        openIssues,
        stuckOrders: stuckCount,
        stuckOrderId: stuckOldest?.id ?? null,
      },
      // UX20-02: the live, server-authoritative commission rate — the needs-attention "Commission is 0%"
      // row used to be a hardcoded literal that could never reflect the real (operator-flippable) rate.
      commissionRatePct: resolveCommissionRatePct(this.env.COMMISSION_RATE_PCT),
      recentOrders: recent.map((o) => ({
        id: o.id,
        status: o.status,
        route: routeOf(o.pickup, o.dropoff),
        rider: o.rider ? `${o.rider.profile.firstName} ${o.rider.profile.lastName}`.trim() : null,
        proposedFare: o.proposedFare.toString(),
        agreedFare: o.agreedFare?.toString() ?? null,
        createdAt: o.createdAt.toISOString(),
      })),
    };
  }

  /**
   * Plan §5 C5, the last open Lane C box: ops-facing rides-per-active-rider, split Express (parcel)
   * vs Restaurants (merchant), over the trailing `days` window (default 14, clamped [1, 90]).
   * NOT merchant-facing — a fleet-ops read only, exactly like scripts/utilization-metric.sql's manual
   * tripwire (§0a of the 2026-07-26 plan), whose demand-side CTEs this mirrors exactly so the two can
   * never silently diverge. `activeRiders` is the SAME fleet-wide denominator for both verticals: a
   * rider isn't dedicated to Express or Restaurants, so splitting the denominator too would double-
   * count a rider who did both in a day rather than show how each vertical draws on the shared pool.
   * Today's row (only) folds in the heartbeat arm (an online-but-unassigned rider still counts as
   * active) since `Rider.lastHeartbeatAt` is a single overwritten column — it cannot be reconstructed
   * for past days, so historical rows are assignment-only and slightly overstate utilization on an
   * idle-rider day (documented in the script; `heartbeatArmIncluded` flags which row it applied to).
   * A day with zero active riders reports null ratios (SQL NULLIF), never a divide-by-zero throw.
   */
  async utilization(days?: number): Promise<UtilizationRow[]> {
    const span = Math.trunc(days ?? 14);
    const clamped = Number.isFinite(span) && span > 0 ? Math.min(90, span) : 14;
    const rows = await this.prisma.$queryRaw<RawUtilizationRow[]>`
      WITH days AS (
        SELECT d::date AS day
        FROM generate_series(
          current_date - (${clamped}::int - 1) * interval '1 day', current_date, interval '1 day'
        ) AS d
      ),
      assignment_events AS (
        SELECT date(e.created_at) AS day, e.order_id, o.rider_id, o.order_type
        FROM order_events e
        JOIN orders o ON o.id = e.order_id
        WHERE e.status = 'assigned'
          AND e.created_at >= current_date - (${clamped}::int - 1) * interval '1 day'
      ),
      supply AS (
        SELECT day, count(DISTINCT rider_id) AS active_riders
        FROM (
          SELECT day, rider_id FROM assignment_events WHERE rider_id IS NOT NULL
          UNION
          SELECT current_date AS day, r.profile_id AS rider_id
          FROM riders r
          WHERE date(r.last_heartbeat_at) = current_date
        ) s
        GROUP BY day
      ),
      demand AS (
        SELECT day,
               count(*) AS assignments,
               count(*) FILTER (WHERE order_type = 'parcel') AS express,
               count(*) FILTER (WHERE order_type = 'merchant') AS merchant
        FROM assignment_events
        GROUP BY day
      )
      SELECT
        days.day,
        COALESCE(d.assignments, 0)::int AS "assignments",
        COALESCE(d.express, 0)::int AS "express",
        COALESCE(d.merchant, 0)::int AS "merchant",
        COALESCE(s.active_riders, 0)::int AS "activeRiders",
        ROUND(COALESCE(d.assignments, 0)::numeric / NULLIF(s.active_riders, 0), 2)::float8
          AS "ridesPerActiveRider",
        ROUND(COALESCE(d.express, 0)::numeric / NULLIF(s.active_riders, 0), 2)::float8
          AS "expressRidesPerActiveRider",
        ROUND(COALESCE(d.merchant, 0)::numeric / NULLIF(s.active_riders, 0), 2)::float8
          AS "merchantRidesPerActiveRider",
        (days.day = current_date) AS "heartbeatArmIncluded"
      FROM days
      LEFT JOIN demand d ON d.day = days.day
      LEFT JOIN supply s ON s.day = days.day
      ORDER BY days.day`;

    return rows.map((r) => ({ ...r, day: fmtDate(r.day) }));
  }
}
