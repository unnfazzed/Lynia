import { Injectable } from "@nestjs/common";
import type { KycStatus, OrderStatus } from "@lynia/shared";
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

  /** Rider roster for ops — the KYC review queue when filtered to `pending`. */
  async listRiders(kyc?: KycStatus) {
    const riders = await this.prisma.rider.findMany({
      where: kyc ? { kycStatus: kyc } : {},
      orderBy: { updatedAt: "desc" },
      take: 100,
      select: {
        profileId: true,
        bikeReg: true,
        kycStatus: true,
        kycRef: true,
        idVerified: true,
        isOnline: true,
        ratingAvg: true,
        ratingCount: true,
        tripsCount: true,
        cancelStrikes: true,
        cooldownUntil: true,
        profile: { select: { firstName: true, lastName: true, phone: true } },
      },
    });
    return riders.map((r) => ({
      profileId: r.profileId,
      name: `${r.profile.firstName} ${r.profile.lastName}`.trim(),
      phone: r.profile.phone,
      bikeReg: r.bikeReg,
      kycStatus: r.kycStatus,
      kycRef: r.kycRef,
      idVerified: r.idVerified,
      isOnline: r.isOnline,
      ratingAvg: r.ratingAvg,
      ratingCount: r.ratingCount,
      tripsCount: r.tripsCount,
      cancelStrikes: r.cancelStrikes,
      cooldownUntil: r.cooldownUntil?.toISOString() ?? null,
    }));
  }

  /** Order monitor for ops — filter by status to watch live orders, cancellations, etc. */
  async listOrders(status?: OrderStatus) {
    const orders = await this.prisma.order.findMany({
      where: status ? { status } : {},
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        status: true,
        proposedFare: true,
        agreedFare: true,
        distanceKm: true,
        customerId: true,
        riderId: true,
        cancelledBy: true,
        cancelReason: true,
        createdAt: true,
      },
    });
    return orders.map((o) => ({
      id: o.id,
      status: o.status,
      proposedFare: o.proposedFare.toString(),
      agreedFare: o.agreedFare?.toString() ?? null,
      distanceKm: o.distanceKm,
      riderId: o.riderId,
      // Authoritative role of who cancelled — don't make the UI re-derive it from raw ids.
      cancelledByRole: o.cancelledBy === o.riderId ? "rider" : o.cancelledBy === o.customerId ? "customer" : null,
      cancelReason: o.cancelReason,
      createdAt: o.createdAt.toISOString(),
    }));
  }
}
