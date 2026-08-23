import { Inject, Injectable } from "@nestjs/common";
import { ACTIVE_RIDE_STATUSES } from "@lynia/shared";
import { LIVE_FOOD_DISPATCH_OFFER_WHERE } from "../common/food-dispatch-lock";
import { PrismaService } from "../prisma/prisma.service";
import { TrackingService } from "../tracking/tracking.service";

export interface DispatchCandidate {
  riderId: string;
  distanceM: number;
}

/**
 * The pluggable "who gets offered next" decision (plan §0b/P4 "DispatchStrategy seam"). Distinct
 * from Express's own broadcast — Express fans a delivery out to EVERY nearby rider and lets the
 * customer pick; a food order auto-offers to exactly ONE candidate at a time (N-08), so this seam is
 * what a future ETA-ranked or acceptance-rate-weighted strategy would swap in without touching
 * FoodDispatchService's tick/retry/cap machinery.
 */
export interface DispatchStrategy {
  /** The single best candidate within `radiusM` of `(lat, lng)`, excluding `excludeRiderIds` (already
   *  tried this dispatch cycle) and anyone busy/ineligible — or null if nobody qualifies. */
  pickCandidate(params: {
    lat: number;
    lng: number;
    radiusM: number;
    excludeRiderIds: readonly string[];
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

    for (const r of nearby) {
      if (exclude.has(r.profileId) || busyIds.has(r.profileId) || offeredIds.has(r.profileId) || owingIds.has(r.profileId)) continue;
      return { riderId: r.profileId, distanceM: r.distanceM };
    }
    return null;
  }
}
