import { Injectable } from "@nestjs/common";
import { PrismaService } from "../prisma/prisma.service";

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Pilot funnel (CONCEPT §8) from raw counts. Pure, so it's unit-tested. */
export function computeFunnel(i: {
  totalBroadcasts: number;
  totalOffers: number;
  ordersWithOffer: number;
  expired: number;
}) {
  const b = i.totalBroadcasts || 0;
  return {
    totalBroadcasts: b,
    offersPerBroadcast: b ? round(i.totalOffers / b) : 0,
    pctBroadcastsWithOffer: b ? round((i.ordersWithOffer / b) * 100) : 0,
    expiryRatePct: b ? round((i.expired / b) * 100) : 0,
  };
}

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService) {}

  /** Single read for the monitor dashboard: status counts, rider stats, pilot funnel, recent orders. */
  async overview() {
    const [byStatus, totalOrders, totalOffers, expired, ridersTotal, ridersOnline, ridersVerified, recent, withOffer] =
      await Promise.all([
        this.prisma.order.groupBy({ by: ["status"], _count: { _all: true } }),
        this.prisma.order.count(),
        this.prisma.offer.count(),
        this.prisma.order.count({ where: { status: "expired" } }),
        this.prisma.rider.count(),
        this.prisma.rider.count({ where: { isOnline: true } }),
        this.prisma.rider.count({ where: { kycStatus: "verified" } }),
        this.prisma.order.findMany({
          take: 20,
          orderBy: { createdAt: "desc" },
          select: { id: true, status: true, proposedFare: true, agreedFare: true, createdAt: true },
        }),
        this.prisma.offer.findMany({ distinct: ["orderId"], select: { orderId: true } }),
      ]);

    return {
      ordersByStatus: Object.fromEntries(byStatus.map((r) => [r.status, r._count._all])),
      riders: { total: ridersTotal, online: ridersOnline, verified: ridersVerified },
      metrics: computeFunnel({
        totalBroadcasts: totalOrders,
        totalOffers,
        ordersWithOffer: withOffer.length,
        expired,
      }),
      recentOrders: recent.map((o) => ({
        id: o.id,
        status: o.status,
        proposedFare: o.proposedFare.toString(),
        agreedFare: o.agreedFare?.toString() ?? null,
        createdAt: o.createdAt.toISOString(),
      })),
    };
  }
}
