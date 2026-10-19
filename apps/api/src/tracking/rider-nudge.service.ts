import { Injectable, Logger } from "@nestjs/common";
import { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";
import { TrackingService } from "./tracking.service";

/**
 * Demand nudge (owner 2026-10-12, cold start): when a job is waiting with too few riders online, push the
 * riders who are OFFLINE nearby to come online. With a handful of riders the supply that exists is mostly
 * asleep in pockets; the board's demand zones only reach riders already online.
 *
 * Copy is the handoffs' own, verbatim: the title is the rider board's count row (rider-v2 `nearYou`
 * "4 parcels near you"; the mixed-board "jobs near you" count the owner approved 2026-10-01, RF.jobsNearYou
 * in the app) and the body is first-run-v2 `doneBody`. Best-effort throughout: a nudge never affects the
 * order that triggered it, and with no Redis (no per-rider throttle) it sends nothing rather than spam.
 */
export const RIDER_NUDGE = {
  /** How far (straight line) from the waiting job an offline rider's last position may be. */
  radiusM: 15_000,
  /** At most one nudge per rider in this long. */
  perRiderTtlS: 30 * 60,
  /** Riders nudged per trigger, nearest first. */
  maxRiders: 30,
  /** first-run-v2 copy.ts `doneBody`. */
  body: "Go online when you want jobs.",
} as const;

/** The board's count row: rider-v2 `nearYou` for parcels, the owner-approved mixed count for any job. */
export function nudgeTitle(kind: "parcel" | "job", n: number): string {
  const count = Math.max(1, n);
  if (kind === "parcel") return count === 1 ? "1 parcel near you" : `${count} parcels near you`;
  return count === 1 ? "1 job near you" : `${count} jobs near you`;
}

@Injectable()
export class RiderNudgeService {
  private readonly logger = new Logger(RiderNudgeService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tracking: TrackingService,
    private readonly notifications: NotificationsService,
  ) {}

  /**
   * Nudge offline riders near `point` that `kind` jobs are waiting. `parcel`: a parcel auction opened in a
   * quiet market. `job`: a food order went into the no-rider hold. Never throws.
   */
  async nudgeOfflineRiders(point: { lat: number; lng: number }, kind: "parcel" | "job"): Promise<void> {
    try {
      const candidates = await this.tracking.offlineRidersNear(point.lat, point.lng, RIDER_NUDGE.radiusM, RIDER_NUDGE.maxRiders);
      if (candidates.length === 0) return;
      const claimed = await this.tracking.claimRiderNudges(candidates, RIDER_NUDGE.perRiderTtlS);
      if (!claimed || claimed.length === 0) return;
      const waiting = await this.waitingJobsNear(point, kind);
      await this.notifications.notifyProfiles(claimed, {
        title: nudgeTitle(kind, waiting),
        body: RIDER_NUDGE.body,
        data: { kind: "rider_demand_nudge" },
        collapseKey: "rider:demand_nudge",
      });
    } catch (err) {
      this.logger.warn(`biker demand nudge failed: ${(err as Error).message}`);
    }
  }

  /** Jobs waiting for a rider within the nudge radius: open parcel auctions, plus (for `job`) restaurant /
   *  shop / pharmacy orders still looking for one. At least the triggering job, so never below 1 in use. */
  private async waitingJobsNear(point: { lat: number; lng: number }, kind: "parcel" | "job"): Promise<number> {
    const rows = await this.prisma.$queryRaw<Array<{ n: bigint | number }>>`
      SELECT count(*) AS n
      FROM orders
      WHERE pickup_geog IS NOT NULL
        AND fleet_merchant_id IS NULL
        AND ST_DWithin(pickup_geog, ST_SetSRID(ST_MakePoint(${point.lng}, ${point.lat}), 4326)::geography, ${RIDER_NUDGE.radiusM})
        AND (
          (order_type = 'parcel' AND status = 'open_for_offers')
          OR (${kind === "job"}::boolean AND order_type = 'merchant' AND status = 'requested' AND rider_id IS NULL)
        )`;
    return Number(rows[0]?.n ?? 1);
  }
}
