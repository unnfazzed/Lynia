import { Inject, Injectable } from "@nestjs/common";
import { ACTIVE_RIDE_STATUSES } from "@lynia/shared";
import { heartbeatMaxAgeMsForPush } from "../common/broadcast-policy";
import { penaltiesSuspended } from "../common/penalties";
import { PrismaService } from "../prisma/prisma.service";
import { TrackingService } from "../tracking/tracking.service";

export interface DispatchCandidate {
  riderId: string;
  distanceM: number;
}

/**
 * The pluggable "who gets offered" decision (plan §0b/P4 "DispatchStrategy seam"). A food order is
 * offered to several riders at once (owner decision 2026-10-01, ledger D-54: the best 10 first, then
 * everyone after 60s; the first to accept gets it), so the strategy returns an ORDERED list — a future
 * ETA-ranked or acceptance-rate-weighted strategy swaps in here without touching FoodDispatchService's
 * round/retry/cap machinery.
 */
export interface DispatchStrategy {
  /** Eligible riders within `radiusM` of `(lat, lng)`, best first, excluding `excludeRiderIds` (dropped it,
   *  passed on it within the decline cooldown, or on the business's own team) and anyone busy/ineligible;
   *  at most `limit` of them (all when null). */
  pickCandidates(params: {
    lat: number;
    lng: number;
    radiusM: number;
    excludeRiderIds: readonly string[];
    limit: number | null;
  }): Promise<DispatchCandidate[]>;
}

export const DISPATCH_STRATEGY = Symbol("DISPATCH_STRATEGY");

/**
 * Default strategy: nearest eligible online riders. "Eligible" narrows TrackingService.nearbyRiders'
 * online/standing/KYC/heartbeat filter (at the push cutoff) with what a food offer additionally can't
 * tolerate: a rider already mid-ride (ACTIVE_RIDE_STATUSES — one_active_ride would reject the accept
 * anyway) and a rider owing a restaurant cash (the C4 soft-lock). A rider already ringing for ANOTHER
 * food order is still offered this one: with every round going to several riders, locking them out
 * would starve a second order at the same kitchen.
 */
@Injectable()
export class NearestRiderDispatchStrategy implements DispatchStrategy {
  constructor(
    private readonly tracking: TrackingService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  async pickCandidates(params: {
    lat: number;
    lng: number;
    radiusM: number;
    excludeRiderIds: readonly string[];
    limit: number | null;
  }): Promise<DispatchCandidate[]> {
    // The permissive push heartbeat cutoff (~15 min), as the parcel broadcast uses: a rider with the app
    // in their pocket stops heartbeating ~2 min after backgrounding but is still online, and the offer's
    // FCM push wakes the phone. The strict ~120 s cutoff dropped them from food dispatch (owner 2026-10-12).
    const nearby = await this.tracking.nearbyRiders(params.lat, params.lng, params.radiusM, heartbeatMaxAgeMsForPush());
    if (nearby.length === 0) return [];
    const exclude = new Set(params.excludeRiderIds);
    const candidateIds = nearby.map((r) => r.profileId).filter((id) => !exclude.has(id));
    if (candidateIds.length === 0) return [];

    const busy = await this.prisma.order.findMany({
      where: {
        riderId: { in: candidateIds },
        status: { in: ACTIVE_RIDE_STATUSES },
      },
      select: { riderId: true },
    });
    const busyIds = new Set(busy.map((o) => o.riderId));

    // C4 soft-lock: a rider owing a merchant collect-and-return cash debt, or mid-doorstep handshake
    // (including frozen), isn't offered a SECOND food job until it settles (N-20/R-05) — same
    // condition as common/merchant-debt-lock.ts's hasOpenMerchantObligation, batched here for the
    // whole candidate list rather than one query per candidate.
    // Penalty suspension (common/penalties.ts): the soft-lock excludes nobody while suspended.
    const owingDebt = penaltiesSuspended() ? [] : await this.prisma.order.findMany({
      where: {
        riderId: { in: candidateIds },
        OR: [
          { orderType: "merchant", debtStatus: "open", merchantClosedAt: null },
          { orderType: "merchant", customerCashConfirmedAt: { not: null }, riderCashConfirmedAt: null },
          { orderType: "parcel", debtStatus: "open", merchantClosedAt: null },
        ],
      },
      select: { riderId: true },
    });
    const owingIds = new Set(owingDebt.map((o) => o.riderId));

    // `nearby` is nearest-first, so `eligible` is too.
    const eligible = nearby.filter((r) => !exclude.has(r.profileId) && !busyIds.has(r.profileId) && !owingIds.has(r.profileId));
    const ordered: DispatchCandidate[] = eligible.map((r) => ({ riderId: r.profileId, distanceM: r.distanceM }));
    return params.limit == null ? ordered : ordered.slice(0, params.limit);
  }
}
