import { Inject, Injectable } from "@nestjs/common";
import { ACTIVE_RIDE_STATUSES } from "@lynia/shared";
import { LIVE_FOOD_DISPATCH_OFFER_WHERE } from "../common/food-dispatch-lock";
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
 * The pluggable "who gets offered next" decision (plan §0b/P4 "DispatchStrategy seam"). Distinct
 * from Express's own broadcast — Express fans a delivery out to EVERY nearby rider and lets the
 * customer pick; a food order auto-offers to exactly ONE candidate at a time (N-08), so this seam is
 * what a future ETA-ranked or acceptance-rate-weighted strategy would swap in without touching
 * FoodDispatchService's tick/retry/cap machinery.
 */
export interface DispatchStrategy {
  /** The single best candidate within `radiusM` of `(lat, lng)`, excluding `excludeRiderIds` (already
   *  tried this dispatch cycle) and anyone busy/ineligible — or null if nobody qualifies.
   *  `preferredRiderIds` (L3) are the restaurant's own riders: they only reorder riders who are already
   *  eligible, never let anyone else in. */
  pickCandidate(params: {
    lat: number;
    lng: number;
    radiusM: number;
    excludeRiderIds: readonly string[];
    preferredRiderIds?: readonly string[];
  }): Promise<DispatchCandidate | null>;
}

export const DISPATCH_STRATEGY = Symbol("DISPATCH_STRATEGY");

/**
 * Default strategy: nearest eligible online rider. "Eligible" narrows TrackingService.nearbyRiders'
 * online/standing/KYC/heartbeat filter with the two things a food auto-offer additionally can't
 * tolerate: a rider already mid-ride (ACTIVE_RIDE_STATUSES — one_active_ride would reject the accept
 * anyway, but skipping them here saves a wasted 60s offer window) and a rider already holding a
 * DIFFERENT live food offer (their own dispatchOfferedRiderId is unexpired elsewhere) — the C3
 * soft-lock's mirror image: not just "can't take a parcel", but "can't be offered a second food job".
 */
@Injectable()
export class NearestRiderDispatchStrategy implements DispatchStrategy {
  constructor(
    private readonly tracking: TrackingService,
    @Inject(PrismaService) private readonly prisma: PrismaService,
  ) {}

  async pickCandidate(params: {
    lat: number;
    lng: number;
    radiusM: number;
    excludeRiderIds: readonly string[];
    preferredRiderIds?: readonly string[];
  }): Promise<DispatchCandidate | null> {
    const nearby = await this.tracking.nearbyRiders(params.lat, params.lng, params.radiusM);
    if (nearby.length === 0) return null;
    const exclude = new Set(params.excludeRiderIds);
    const candidateIds = nearby.map((r) => r.profileId).filter((id) => !exclude.has(id));
    if (candidateIds.length === 0) return null;

    const busy = await this.prisma.order.findMany({
      where: {
        riderId: { in: candidateIds },
        status: { in: ACTIVE_RIDE_STATUSES },
      },
      select: { riderId: true },
    });
    const busyIds = new Set(busy.map((o) => o.riderId));

    const holdingOtherOffer = await this.prisma.order.findMany({
      where: {
        dispatchOfferedRiderId: { in: candidateIds },
        dispatchOfferExpiresAt: { gt: new Date() },
        ...LIVE_FOOD_DISPATCH_OFFER_WHERE,
      },
      select: { dispatchOfferedRiderId: true },
    });
    const offeredIds = new Set(holdingOtherOffer.map((o) => o.dispatchOfferedRiderId));

    // C4 soft-lock: a rider owing a merchant collect-and-return cash debt, or mid-doorstep handshake
    // (including frozen), isn't offered a SECOND food job until it settles (N-20/R-05) — same
    // condition as common/merchant-debt-lock.ts's hasOpenMerchantObligation, batched here for the
    // whole candidate list rather than one query per candidate.
    const owingDebt = await this.prisma.order.findMany({
      where: {
        riderId: { in: candidateIds },
        orderType: "merchant",
        OR: [{ debtStatus: "open" }, { customerCashConfirmedAt: { not: null }, riderCashConfirmedAt: null }],
      },
      select: { riderId: true },
    });
    const owingIds = new Set(owingDebt.map((o) => o.riderId));

    // `nearby` is nearest-first, so the first eligible rider is the nearest one.
    const eligible = nearby.filter(
      (r) => !exclude.has(r.profileId) && !busyIds.has(r.profileId) && !offeredIds.has(r.profileId) && !owingIds.has(r.profileId),
    );
    const nearest = eligible[0];
    if (!nearest) return null;

    // L3 (design doc "Restaurant auto-dispatch"): one of the restaurant's own riders goes first — among
    // the eligible, so KYC, standing, holds, one active ride and the debt lock all still apply — unless
    // they're more than 2 km farther than the nearest. Several: by distance, then rating.
    const preferred = new Set(params.preferredRiderIds ?? []);
    const own = eligible.filter((r) => preferred.has(r.profileId) && r.distanceM - nearest.distanceM <= PREFERRED_DISPATCH_SLACK_M);
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
      const [best] = [...own].sort(
        (a, b) => bucket(a.distanceM) - bucket(b.distanceM) || (ratings.get(b.profileId) ?? 0) - (ratings.get(a.profileId) ?? 0) || a.distanceM - b.distanceM,
      );
      return { riderId: best!.profileId, distanceM: best!.distanceM, preferred: true };
    }
    return { riderId: nearest.profileId, distanceM: nearest.distanceM };
  }
}
