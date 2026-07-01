import { Inject, Injectable, type OnModuleDestroy } from "@nestjs/common";
import type IORedis from "ioredis";
import { ACTIVE_RIDE_STATUSES } from "@lynia/shared";
import { createRedisClient } from "../common/redis";
import { ENV } from "../config/config.module";
import type { Env } from "../config/env";
import { PrismaService } from "../prisma/prisma.service";

export interface NearbyRider {
  profileId: string;
  distanceM: number;
}

export interface LivePosition {
  lat: number;
  lng: number;
  at: number;
}

const ACTIVE = ACTIVE_RIDE_STATUSES as string[];

/** Redis key TTL (s) for a rider's live position — long enough to outlive a flush cycle, short
 *  enough that a stale fix from a disconnected rider self-evicts. */
const POSITION_TTL_S = 120;

/** Max cadence (ms) for the heavy lat/lng/geog write to PG. The single-column heartbeat is NOT
 *  throttled (it gates offer selection — see the P0 note on recordFix). */
const POSITION_FLUSH_MS = 10_000;

/** Redis geospatial index of rider positions (GEOADD/GEOSEARCH). A prefilter for nearbyRiders — PG
 *  stays the is_online authority — so a stale/offline member here is harmless (the PG join drops it). */
const GEO_KEY = "rider:geo";

/** Cap on GEOSEARCH candidates fed into the PG is_online filter (mirrors the PG path's LIMIT 50). */
const GEO_SEARCH_COUNT = 100;

@Injectable()
export class TrackingService implements OnModuleDestroy {
  /** Lazily-created live-position client (Redis-backed). Null when REDIS_URL is unset (dev/test),
   *  in which case recordFix falls back to writing every fix straight through to PG. */
  private redis: IORedis | null = null;
  private redisInit = false;

  /** Per-rider last PG position-flush time (ms). In-memory is fine: a rider's socket lives on one
   *  API instance, so the throttle only needs to be correct for that instance. */
  private readonly lastFlush = new Map<string, number>();

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly prisma: PrismaService,
  ) {}

  /** Lazily create the single position client the first time it's needed. Null without REDIS_URL. */
  private getRedis(): IORedis | null {
    if (this.redisInit) return this.redis;
    this.redisInit = true;
    if (this.env.REDIS_URL) this.redis = createRedisClient(this.env.REDIS_URL);
    return this.redis;
  }

  /** TEST SEAM: inject a fake client so the Redis path is unit-testable without a live server. */
  setRedisClient(client: IORedis | null): void {
    this.redis = client;
    this.redisInit = true;
  }

  async onModuleDestroy(): Promise<void> {
    await this.redis?.quit();
  }

  private posKey(riderId: string): string {
    return `rider:pos:${riderId}`;
  }

  /** Customer who created the order, or its assigned rider, may watch it. */
  async canAccessOrder(userId: string, orderId: string): Promise<boolean> {
    const o = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { customerId: true, riderId: true },
    });
    return !!o && (o.customerId === userId || o.riderId === userId);
  }

  /** Only the assigned rider on an active ride may stream position for an order. */
  async isAssignedRider(userId: string, orderId: string): Promise<boolean> {
    const o = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { riderId: true, status: true },
    });
    return !!o && o.riderId === userId && ACTIVE.includes(o.status);
  }

  /** Only a KYC-verified, online rider may join the open-order board (mirrors the offer gating §5d). */
  async isBoardEligible(riderId: string): Promise<boolean> {
    const rider = await this.prisma.rider.findUnique({
      where: { profileId: riderId },
      select: { kycStatus: true, isOnline: true },
    });
    return !!rider && rider.kycStatus === "verified" && rider.isOnline === true;
  }

  /**
   * Record a rider position fix (ET3/ET4).
   *
   * P0 (offer-selection liveness): the ET3 gate reads riders.last_heartbeat_at (matching.service).
   * If we throttled the whole write, a live rider streaming faster than the flush cadence would look
   * stale and get starved out of offer selection. So the single-column heartbeat is written on EVERY
   * fix; only the heavy lat/lng/geog write to PG is throttled to POSITION_FLUSH_MS.
   *
   * With Redis configured, the freshest position lives in Redis (SET … EX) and getSnapshot reads it
   * first; the throttled PG flush keeps the REST snapshot warm for after the key expires. WITHOUT
   * Redis, there is no throttle — every fix flushes lat/lng/geog + heartbeat, exactly as today.
   */
  async recordFix(riderId: string, lat: number, lng: number): Promise<void> {
    const redis = this.getRedis();

    // (a) Freshest position → Redis (best-effort; a Redis error must not starve the heartbeat below).
    if (redis) {
      const value = JSON.stringify({ lat, lng, at: Date.now() } satisfies LivePosition);
      try {
        await redis.set(this.posKey(riderId), value, "EX", POSITION_TTL_S);
      } catch {
        /* best-effort: a Redis outage falls back to the PG heartbeat + flush below */
      }
      // Also index the position in the geo set so nearbyRiders can prefilter candidates via GEOSEARCH
      // (Postgres stays the is_online authority). Best-effort — a GEOADD failure never affects the
      // heartbeat/flush; nearbyRiders degrades to the pure-PG path if the set is empty/unavailable.
      try {
        await redis.geoadd(GEO_KEY, lng, lat, riderId);
      } catch {
        /* best-effort: nearbyRiders falls through to the PG ST_DWithin path on a Redis miss */
      }
    }

    // (b) ALWAYS write the ET3 liveness heartbeat — single-column, never throttled (P0).
    await this.prisma.$executeRaw`
      UPDATE riders
      SET last_heartbeat_at = now(),
          updated_at = now()
      WHERE profile_id = ${riderId}::uuid`;

    // (c) Throttle the heavy lat/lng/geog write. No Redis ⇒ no throttle (behaviour == today).
    const now = Date.now();
    const last = this.lastFlush.get(riderId) ?? 0;
    if (!redis || now - last >= POSITION_FLUSH_MS) {
      this.lastFlush.set(riderId, now);
      await this.writePosition(riderId, lat, lng);
    }
  }

  /** The heavy position write: lat/lng + geography point for ST_DWithin (ET6). */
  private async writePosition(riderId: string, lat: number, lng: number): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE riders
      SET current_lat = ${lat},
          current_lng = ${lng},
          geog = ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
          updated_at = now()
      WHERE profile_id = ${riderId}::uuid`;
  }

  /**
   * Legacy full-write kept for the geo integration test (updateRiderLocation persisted lat/lng/geog
   * AND the heartbeat in one UPDATE). Equivalent to the no-Redis recordFix path.
   */
  async updateRiderLocation(riderId: string, lat: number, lng: number): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE riders
      SET current_lat = ${lat},
          current_lng = ${lng},
          geog = ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography,
          last_heartbeat_at = now(),
          updated_at = now()
      WHERE profile_id = ${riderId}::uuid`;
  }

  /** Redis-first live position, or null on miss / no-Redis / parse failure. */
  async getLivePosition(riderId: string): Promise<LivePosition | null> {
    const redis = this.getRedis();
    if (!redis) return null;
    try {
      const raw = await redis.get(this.posKey(riderId));
      if (!raw) return null;
      const parsed = JSON.parse(raw) as LivePosition;
      if (typeof parsed?.lat !== "number" || typeof parsed?.lng !== "number") return null;
      return parsed;
    } catch {
      return null;
    }
  }

  /** Flush the last known Redis position to PG (on disconnect, so it isn't lost when the key TTLs).
   *  Also evicts the rider's throttle bookkeeping — the session ended, so the in-memory `lastFlush`
   *  entry must not linger (otherwise the Map grows unbounded over an instance's lifetime). */
  async flushToPg(riderId: string): Promise<void> {
    this.lastFlush.delete(riderId);
    const pos = await this.getLivePosition(riderId);
    if (!pos) return;
    await this.writePosition(riderId, pos.lat, pos.lng);
  }

  /**
   * Nearby online riders for a broadcast (ET6).
   *
   * With Redis: GEOSEARCH the rider:geo index for candidate ids ordered nearest-first (carrying the
   * approximate distance), then ONE PG query keeps only the ones still online with a live geog — PG
   * remains the is_online authority, so a stale/offline set member is harmlessly dropped. The distance
   * is only used to order/annotate the notify, so the GEOSEARCH value is good enough.
   *
   * WITHOUT Redis (getRedis() null — dev/test + no-REDIS_URL prod): fall through to the PG ST_DWithin
   * path over the GiST geog index, byte-identical to before this Redis prefilter existed (degrade).
   */
  async nearbyRiders(lat: number, lng: number, radiusM: number): Promise<NearbyRider[]> {
    const redis = this.getRedis();
    if (redis) {
      const candidates = await this.geoSearchCandidates(redis, lat, lng, radiusM);
      // No candidates ⇒ no online riders in range (empty set / all filtered). Skip the PG round-trip.
      if (candidates.length === 0) return [];
      const ids = candidates.map((c) => c.profileId);
      const online = await this.prisma.$queryRaw<Array<{ profile_id: string }>>`
        SELECT profile_id
        FROM riders
        WHERE profile_id = ANY(${ids}::uuid[])
          AND is_online = true
          AND geog IS NOT NULL`;
      const onlineSet = new Set(online.map((r) => r.profile_id));
      // Preserve the GEOSEARCH nearest-first order; keep only the PG-confirmed online riders.
      return candidates.filter((c) => onlineSet.has(c.profileId));
    }

    const rows = await this.prisma.$queryRaw<Array<{ profile_id: string; distance_m: number }>>`
      SELECT profile_id,
             ST_Distance(geog, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography) AS distance_m
      FROM riders
      WHERE is_online = true
        AND geog IS NOT NULL
        AND ST_DWithin(geog, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography, ${radiusM})
      ORDER BY distance_m ASC
      LIMIT 50`;
    return rows.map((r) => ({ profileId: r.profile_id, distanceM: Number(r.distance_m) }));
  }

  /** GEOSEARCH the rider geo index → nearest-first candidates with their approximate distance (m).
   *  Best-effort: a Redis error yields an empty candidate set, so nearbyRiders returns [] (the same
   *  "no nearby riders" outcome the caller already treats as best-effort). */
  private async geoSearchCandidates(
    redis: IORedis,
    lat: number,
    lng: number,
    radiusM: number,
  ): Promise<NearbyRider[]> {
    try {
      const res = (await redis.geosearch(
        GEO_KEY,
        "FROMLONLAT",
        lng,
        lat,
        "BYRADIUS",
        radiusM,
        "m",
        "ASC",
        "COUNT",
        GEO_SEARCH_COUNT,
        "WITHDIST",
      )) as Array<[string, string]>;
      // WITHDIST rows are [member, distance]; without it ioredis would return bare member strings.
      return res.map((row) => ({ profileId: row[0], distanceM: Number(row[1]) }));
    } catch {
      return [];
    }
  }
}
