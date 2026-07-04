import { Injectable } from "@nestjs/common";
import { ACTIVE_RIDE_STATUSES, type KycStatus, type OrderStatus } from "@lynia/shared";
import { maskPhone } from "../common/phone-mask";
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

    // A-03 (P0): mask each rider's phone UNLESS they're on a LIVE order right now. The reveal set is
    // ACTIVE_RIDE_STATUSES (mid-delivery) — NOT PHONE_REVEAL_STATUSES, which includes the permanent
    // terminal states (delivered/completed/undelivered): using those would leave any rider who ever
    // finished one order unmasked forever, defeating the roster-scrape protection. The per-order
    // reveal window (getSnapshot) still uses PHONE_REVEAL_STATUSES — that's scoped to one live order.
    const revealingRiderIds = new Set(
      (
        await this.prisma.order.findMany({
          where: { riderId: { in: riders.map((r) => r.profileId) }, status: { in: ACTIVE_RIDE_STATUSES } },
          select: { riderId: true },
          distinct: ["riderId"],
        })
      ).flatMap((o) => (o.riderId ? [o.riderId] : [])),
    );

    return riders.map((r) => ({
      profileId: r.profileId,
      name: `${r.profile.firstName} ${r.profile.lastName}`.trim(),
      phone: revealingRiderIds.has(r.profileId) ? r.profile.phone : maskPhone(r.profile.phone),
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

  /**
   * Single-rider KYC review detail (admin A-02) — the doc-review screen behind the KYC queue. Returns
   * the real, persisted KYC state: status, the resubmission counter + derived lock/attempt, the last
   * decline reason, and the applicant fields ops compare against the documents. Phone is masked (A-03)
   * — the reviewer matches the ID number, not the phone.
   *
   * Didit's granular scores (face-match, doc authenticity, liveness) are NOT persisted in the pilot —
   * only the overall verdict flows through the webhook into `kycStatus`. Those fields are therefore
   * omitted here; the console renders the checks panel from `kycStatus` + the reviewer's own compare.
   */
  async getKycReview(profileId: string) {
    const rider = await this.prisma.rider.findUnique({
      where: { profileId },
      select: {
        profileId: true,
        bikeReg: true,
        kycStatus: true,
        kycRef: true,
        kycAttempts: true,
        kycDeclineReason: true,
        idVerified: true,
        updatedAt: true,
        profile: { select: { firstName: true, lastName: true, phone: true, idNumber: true } },
      },
    });
    if (!rider) return null;

    // kycAttempts counts declines. The current attempt number is declines + 1 (1 on first review, 2 on
    // the single allowed resubmit). >= 2 declines = locked → support, no further attempts.
    const locked = rider.kycAttempts >= 2;
    return {
      id: rider.profileId,
      name: `${rider.profile.firstName} ${rider.profile.lastName}`.trim(),
      phone: maskPhone(rider.profile.phone),
      idNumber: rider.profile.idNumber,
      bike: rider.bikeReg,
      status: rider.kycStatus,
      kycRef: rider.kycRef,
      kycAttempts: rider.kycAttempts,
      attempt: Math.min(rider.kycAttempts + 1, 2),
      locked,
      declineReason: rider.kycDeclineReason,
      submittedAt: rider.updatedAt.toISOString(),
    };
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
