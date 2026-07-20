import { Inject, Injectable } from "@nestjs/common";
import { resolveCommissionRatePct } from "@lynia/shared";
import { heartbeatMaxAgeMs } from "../common/broadcast-policy";
import { ENV } from "../config/config.module";
import type { Env } from "../config/env";
import { PrismaService } from "../prisma/prisma.service";
import { computeFunnel, routeOf } from "./admin.shared";

/** In-flight (assigned…drop-off) statuses — an order here that hasn't changed in a while is "stuck". */
const IN_FLIGHT_STATUSES = [
  "assigned",
  "confirmed",
  "en_route_pickup",
  "picked_up",
  "en_route_dropoff",
] as const;
/** No order-row write (status change) in this long, while in-flight ⇒ surface it on the ops dashboard. */
const STUCK_AFTER_MS = 25 * 60 * 1000;

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
    const [kycPending, openIssues, sosPending] = await Promise.all([
      this.prisma.rider.count({ where: { kycStatus: "pending" } }),
      this.prisma.issue.count({ where: { status: { in: ["open", "investigating"] } } }),
      this.prisma.sosEvent.count({ where: { acknowledgedAt: null } }),
    ]);
    return { kycPending, openIssues, sosPending };
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
      withOffer,
      deliveredToday,
      undeliveredToday,
      faresTodayAgg,
      kycPending,
      openIssues,
      stuckCount,
      stuckOldest,
    ] = await Promise.all([
      this.prisma.order.groupBy({ by: ["status"], _count: { _all: true } }),
      this.prisma.order.count(),
      this.prisma.offer.count(),
      this.prisma.order.count({ where: { status: "expired" } }),
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
      this.prisma.offer.findMany({ distinct: ["orderId"], select: { orderId: true } }),
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
      this.prisma.order.aggregate({
        _sum: { agreedFare: true },
        where: { status: "completed", completedAt: { gte: startOfDay } },
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
        ordersWithOffer: withOffer.length,
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
}
