import { Inject, Injectable } from "@nestjs/common";
import { ACTIVE_RIDE_STATUSES } from "@lynia/shared";
import { PrismaService } from "../prisma/prisma.service";
import { TrackingService } from "../tracking/tracking.service";

export interface DispatchCandidate {
  riderId: string;
  distanceM: number;
  /** One of the restaurant's own riders, chosen ahead of the nearest (merchant web upgrade L3). */
  preferred?: boolean;
}

/**
 * How much farther than the nearest eligible rider one of the restaurant's own riders may be and still be
 * offered first (design doc L3: food goes cold). Beyond it, the nearest rider is offered, as today.
 */
export const PREFERRED_DISPATCH_SLACK_M = 2_000;
/** Riders of the restaurant's own at about the same distance (this close) are ordered by rating. */
const PREFERRED_DISTANCE_BUCKET_M = 100;

/**
 * The pluggable "who gets offered" decision (plan §0b/P4 "DispatchStrategy seam"). A food order is
 * offered to several riders at once (owner decision 2026-10-01, ledger D-54: the best 10 first, then
 * everyone after 60s; the first to accept gets it), so the strategy returns an ORDERED list — a future
 * ETA-ranked or acceptance-rate-weighted strategy swaps in here without touching FoodDispatchService's
 * round/retry/cap machinery.
 */
export interface DispatchStrategy {
  /** Eligible riders within `radiusM` of `(lat, lng)`, best first, excluding `excludeRiderIds` (passed or
   *  dropped this dispatch cycle) and anyone busy/ineligible; at most `limit` of them (all when null).
   *  `preferredRiderIds` (L3) are the restaurant's own riders: they only reorder riders who are already
   *  eligible, never let anyone else in. */
  pickCandidates(params: {
    lat: number;
    lng: number;
    radiusM: number;
    excludeRiderIds: readonly string[];
    preferredRiderIds?: readonly string[];
    limit: number | null;
  }): Promise<DispatchCandidate[]>;
}

export const DISPATCH_STRATEGY = Symbol("DISPATCH_STRATEGY");

/**
 * Default strategy: nearest eligible online riders. "Eligible" narrows TrackingService.nearbyRiders'
 * online/standing/KYC/heartbeat filter with what a food offer additionally can't tolerate: a rider
 * already mid-ride (ACTIVE_RIDE_STATUSES — one_active_ride would reject the accept anyway) and a rider
 * owing a restaurant cash (the C4 soft-lock). A rider already ringing for ANOTHER food order is still
 * offered this one: with every round going to several riders, locking them out would starve a second
 * order at the same kitchen.
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
    preferredRiderIds?: readonly string[];
    limit: number | null;
  }): Promise<DispatchCandidate[]> {
    const nearby = await this.tracking.nearbyRiders(params.lat, params.lng, params.radiusM);
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
    const owingDebt = await this.prisma.order.findMany({
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
    const nearest = eligible[0];
    if (!nearest) return [];

    // L3 (design doc "Restaurant auto-dispatch"): the restaurant's own riders go first — among the
    // eligible, so KYC, standing, holds, one active ride and the debt lock all still apply — unless
    // they're more than 2 km farther than the nearest. Several: by distance, then rating.
    const preferred = new Set(params.preferredRiderIds ?? []);
    const own = eligible.filter((r) => preferred.has(r.profileId) && r.distanceM - nearest.distanceM <= PREFERRED_DISPATCH_SLACK_M);
    let ordered: DispatchCandidate[] = eligible.map((r) => ({ riderId: r.profileId, distanceM: r.distanceM }));
    if (own.length > 0) {
      const ratings =
        own.length > 1
          ? new Map(
              (await this.prisma.rider.findMany({ where: { profileId: { in: own.map((r) => r.profileId) } }, select: { profileId: true, ratingAvg: true } })).map(
                (r) => [r.profileId, r.ratingAvg],
              ),
            )
          : new Map<string, number>();
      const bucket = (m: number) => Math.floor(m / PREFERRED_DISTANCE_BUCKET_M);
      const first = [...own].sort(
        (a, b) => bucket(a.distanceM) - bucket(b.distanceM) || (ratings.get(b.profileId) ?? 0) - (ratings.get(a.profileId) ?? 0) || a.distanceM - b.distanceM,
      );
      const firstIds = new Set(first.map((r) => r.profileId));
      ordered = [
        ...first.map((r) => ({ riderId: r.profileId, distanceM: r.distanceM, preferred: true })),
        ...ordered.filter((c) => !firstIds.has(c.riderId)),
      ];
    }
    return params.limit == null ? ordered : ordered.slice(0, params.limit);
  }
}
