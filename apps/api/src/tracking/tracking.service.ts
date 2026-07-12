import { Inject, Injectable, type OnModuleDestroy } from "@nestjs/common";
import type IORedis from "ioredis";
import { ACTIVE_RIDE_STATUSES } from "@lynia/shared";
import { createRedisClient } from "../common/redis";
import { ENV } from "../config/config.module";
import type { Env } from "../config/env";
import { MetricsService } from "../observability/metrics.service";
import { PrismaService } from "../prisma/prisma.service";
import { onlineRefusalReason } from "../riders/online-gate";

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

/** Cap on GEOSEARCH candidates fed into the PG is_online filter. Over-fetches (vs the PG LIMIT 50)
 *  so the online filter still has ≥50 after dropping offline members; the result is then sliced to 50. */
const GEO_SEARCH_COUNT = 100;

/** 2·b1 "notify me when a rider's online" waiting list. `notify:geo` is a geo index keyed by the
 *  customer's profile id at their pickup point; `notify:exp` is a companion sorted set (member =
 *  profile id, score = expiry epoch ms) that gives the per-entry TTL the geo set lacks. Both are pruned
 *  of expired entries on every add/drain, and a drained/expired entry is removed from BOTH. */
const NOTIFY_GEO_KEY = "notify:geo";
const NOTIFY_EXP_KEY = "notify:exp";
/** How long a waiting-list entry lives before it's pruned (1h — past the ~90s auction, generous for a
 *  customer who'll come back when pinged, bounded so a stale entry can't ping hours later). */
const NOTIFY_TTL_MS = 60 * 60 * 1000;
/** Cap on waiting customers drained per rider-online event — a backstop against a pathological set. */
const NOTIFY_DRAIN_COUNT = 200;

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
    private readonly metrics: MetricsService,
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

  private static presenceKey(token: string): string {
    return `presence:stale:${token}`;
  }

  /**
   * Cluster-wide one-shot gate for a presence escalation (C5, multi-instance). Every API instance runs
   * the presence watchdog, so without coordination a dark counterparty is escalated once PER INSTANCE —
   * each broadcast fans out cluster-wide through the Socket.IO Redis adapter, so the counterparty's app
   * gets N "live paused" events instead of one. A `SET NX` with a TTL lets only the FIRST instance to
   * notice a given (role, order) staleness emit. The key is released on recovery (see
   * {@link releasePresenceEscalation}) so a later re-dark re-arms; the TTL is a backstop if the
   * releasing instance dies first. With no Redis (single instance / dev / test) there is nothing to
   * coordinate — always grant, preserving today's single-instance behaviour exactly. A Redis hiccup
   * also grants: a duplicate escalation is a far better failure than a silenced one.
   */
  async claimPresenceEscalation(token: string, ttlSeconds: number): Promise<boolean> {
    const redis = this.getRedis();
    if (!redis) return true;
    try {
      const res = await redis.set(TrackingService.presenceKey(token), "1", "EX", ttlSeconds, "NX");
      return res === "OK";
    } catch {
      return true;
    }
  }

  /** Release a presence-escalation claim so the next dark period for the same (role, order) re-arms
   *  cluster-wide. Called when the counterparty recovers or the ride ends. Best-effort / idempotent —
   *  a no-op without Redis, and a DEL failure just leaves the TTL backstop to expire the key. */
  async releasePresenceEscalation(token: string): Promise<void> {
    const redis = this.getRedis();
    if (!redis) return;
    try {
      await redis.del(TrackingService.presenceKey(token));
    } catch {
      /* best-effort: the TTL backstop still expires the key */
    }
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

  /**
   * Presence watchdog query (INTERFACE-AUDIT C5): active rides whose assigned rider's heartbeat is
   * older than `thresholdMs` (or has none). `lastHeartbeatAt` is the DB liveness authority (written on
   * every fix by recordFix), so it doubles as the presence signal without new infra. NOTE these are
   * CANDIDATES, not verdicts: fixes are distance-gated client-side, so a parked rider's heartbeat goes
   * stale while their socket is fine — the gateway refutes each candidate against cluster-wide room
   * membership (riderLiveInRoom) before escalating, and touches the heartbeat when refuted. Pilot-scale
   * scan (bounded `take`); the gateway runs it on one interval.
   */
  async findStaleRiderPresence(
    thresholdMs: number,
  ): Promise<Array<{ orderId: string; riderId: string; lastSeenAt: Date | null }>> {
    const cutoff = new Date(Date.now() - thresholdMs);
    const rows = await this.prisma.order.findMany({
      where: {
        status: { in: ACTIVE_RIDE_STATUSES },
        riderId: { not: null },
        rider: { OR: [{ lastHeartbeatAt: null }, { lastHeartbeatAt: { lt: cutoff } }] },
      },
      select: { id: true, riderId: true, rider: { select: { lastHeartbeatAt: true } } },
      take: 500,
    });
    return rows.map((o) => ({
      orderId: o.id,
      riderId: o.riderId as string,
      lastSeenAt: o.rider?.lastHeartbeatAt ?? null,
    }));
  }

  /** Refresh a rider's liveness heartbeat WITHOUT a position fix. The client only streams fixes when
   *  the rider moves (`distanceInterval` gating), so a parked-but-connected rider's heartbeat goes
   *  stale; the presence watchdog calls this when the cluster-wide socket check refutes "gone dark",
   *  making the DB authority truthful again (same single-column write as recordFix step b). */
  async touchRiderHeartbeat(riderId: string): Promise<void> {
    await this.prisma.$executeRaw`
      UPDATE riders
      SET last_heartbeat_at = now(),
          updated_at = now()
      WHERE profile_id = ${riderId}::uuid`;
  }

  /**
   * Of the given candidate order ids, which are still an active ride (INTERFACE-AUDIT C5, customer
   * mirror). The gateway tracks customer-socket presence in memory (no DB heartbeat exists for the
   * customer side), then gates a `presence:stale` escalation on the order still being live — so a
   * customer who closed the app on a finished/cancelled order is never escalated. Bounded `in` set
   * (only the handful of orders whose customer went dark this scan); mirrors findStaleRiderPresence.
   */
  async filterActiveOrders(orderIds: string[]): Promise<Set<string>> {
    if (orderIds.length === 0) return new Set();
    const rows = await this.prisma.order.findMany({
      where: { id: { in: orderIds }, status: { in: ACTIVE_RIDE_STATUSES } },
      select: { id: true },
    });
    return new Set(rows.map((r) => r.id));
  }

  /**
   * Only a rider in good standing AND online may join the open-order board — the SAME gate offers use
   * (offers.service §5d). Board-eligibility must not be looser than the offer gate: a rider who can't
   * make an offer must not receive new-order board broadcasts. `onlineRefusalReason` is the shared
   * standing authority (KYC + banned/suspended + reliability on_hold + no-show cooldown); the separate
   * `isOnline` check mirrors the offer gate's online invariant. NB an on_hold rider stays isOnline:true
   * (a reliability drop sets onHold without forcing offline), so the standing check is load-bearing here.
   */
  async isBoardEligible(riderId: string): Promise<boolean> {
    const rider = await this.prisma.rider.findUnique({
      where: { profileId: riderId },
      select: { kycStatus: true, isOnline: true, accountStatus: true, onHold: true, cooldownUntil: true },
    });
    return !!rider && onlineRefusalReason(rider) === null && rider.isOnline === true;
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
          position_updated_at = now(),
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
          position_updated_at = now(),
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
    // The session ended — evict this rider from the geo index so a disconnected rider's stale last
    // position can't keep occupying a nearest-first GEOSEARCH slot (see evictFromGeo).
    await this.evictFromGeo(riderId);
    if (!pos) return;
    await this.writePosition(riderId, pos.lat, pos.lng);
  }

  /** Remove a rider from the `rider:geo` index. The geo set has no per-member TTL, so a member left
   *  behind lingers at its last fix forever and keeps occupying a nearest-first GEOSEARCH slot — call
   *  this whenever a rider stops being biddable (socket disconnect, or an explicit go-offline). PG
   *  stays the is_online authority, so a missed eviction is harmless; hence best-effort. No-op without
   *  Redis (getRedis() null — the pure-PG nearbyRiders path). */
  async evictFromGeo(riderId: string): Promise<void> {
    const redis = this.getRedis();
    if (!redis) return;
    try {
      await redis.zrem(GEO_KEY, riderId);
    } catch {
      /* best-effort: the PG is_online filter still drops a stale member */
    }
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
    const done = this.metrics.startTimer();
    const redis = this.getRedis();
    if (redis) {
      const candidates = await this.geoSearchCandidates(redis, lat, lng, radiusM);
      // null ⇒ GEOSEARCH errored → fall through to the PG path (resilient to a transient Redis blip).
      // [] ⇒ Redis answered with no candidates → no PG round-trip needed.
      if (candidates !== null) {
        // The GEOSEARCH path served this call — label the duration source="redis".
        if (candidates.length === 0) {
          this.metrics.recordBroadcastNearby(done(), "redis");
          return [];
        }
        const ids = candidates.map((c) => c.profileId);
        const online = await this.prisma.$queryRaw<Array<{ profile_id: string }>>`
          SELECT profile_id
          FROM riders
          WHERE profile_id = ANY(${ids}::uuid[])
            AND is_online = true
            AND geog IS NOT NULL`;
        const onlineSet = new Set(online.map((r) => r.profile_id));
        // Preserve GEOSEARCH nearest-first order; keep PG-confirmed online riders; cap at 50 for
        // true parity with the PG path's LIMIT 50.
        const result = candidates.filter((c) => onlineSet.has(c.profileId)).slice(0, 50);
        this.metrics.recordBroadcastNearby(done(), "redis");
        return result;
      }
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
    // The PG ST_DWithin fallback served this call (no Redis, or a GEOSEARCH miss) — source="pg".
    this.metrics.recordBroadcastNearby(done(), "pg");
    return rows.map((r) => ({ profileId: r.profile_id, distanceM: Number(r.distance_m) }));
  }

  /** GEOSEARCH the rider geo index → nearest-first candidates with their approximate distance (m).
   *  Returns null on a Redis error so the caller can fall back to the PG ST_DWithin path (vs an empty
   *  array, which legitimately means "Redis answered: no riders in range"). */
  private async geoSearchCandidates(
    redis: IORedis,
    lat: number,
    lng: number,
    radiusM: number,
  ): Promise<NearbyRider[] | null> {
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
      return null;
    }
  }

  /** Prune expired waiting-list entries from BOTH the geo index and the expiry ZSET (the geo set has no
   *  per-member TTL, so `notify:exp` is the source of truth for expiry). Best-effort. */
  private async pruneNotify(redis: IORedis, now: number): Promise<void> {
    try {
      const expired = await redis.zrangebyscore(NOTIFY_EXP_KEY, 0, now);
      if (expired.length > 0) {
        await redis.zrem(NOTIFY_EXP_KEY, ...expired);
        await redis.zrem(NOTIFY_GEO_KEY, ...expired);
      }
    } catch {
      /* best-effort: a prune miss only means a stale entry lingers until the next drain */
    }
  }

  /**
   * 2·b1: register a customer to be pinged when a rider comes online near `(lat, lng)` (their pickup).
   * Indexes the customer's profile id at that point + stamps its expiry. Idempotent — re-registering the
   * same customer just refreshes their point/expiry (GEOADD/ZADD overwrite the member). Best-effort and
   * a no-op without Redis (returns false), so it can never fail the request that triggered it.
   */
  async addNotifyRequest(profileId: string, lat: number, lng: number, now: number = Date.now()): Promise<boolean> {
    const redis = this.getRedis();
    if (!redis) return false;
    try {
      await this.pruneNotify(redis, now);
      await redis.geoadd(NOTIFY_GEO_KEY, lng, lat, profileId);
      await redis.zadd(NOTIFY_EXP_KEY, now + NOTIFY_TTL_MS, profileId);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 2·b1: drain the waiting customers within `radiusM` of `(lat, lng)` — a rider just came online here,
   * so everyone who was waiting for supply nearby should be pinged and removed from the list (removed so
   * they're pinged once, not on every subsequent rider that comes online). Returns their profile ids for
   * the caller to push. Best-effort and a no-op without Redis (returns []); a Redis error yields [].
   */
  async drainNotifyNear(lat: number, lng: number, radiusM: number, now: number = Date.now()): Promise<string[]> {
    const redis = this.getRedis();
    if (!redis) return [];
    try {
      await this.pruneNotify(redis, now);
      // F-18: claim-and-remove in ONE atomic round trip via Lua (mirrors RedisOtpStore's incr+expire
      // script). GEOSEARCH then ZREM-from-both used to be three separate calls, so two API instances
      // draining the same newly-online rider could both read a waiter before either removed it → the
      // customer got pinged twice. Reading and removing inside a single eval means the first instance
      // claims each member and the second's GEOSEARCH no longer sees it — at most one ping per waiter.
      // Removes from BOTH the geo index (KEYS[1]) and the expiry ZSET (KEYS[2]) so no half-entry lingers.
      const members = (await redis.eval(
        "local m = redis.call('geosearch', KEYS[1], 'FROMLONLAT', ARGV[1], ARGV[2], 'BYRADIUS', ARGV[3], 'm', 'ASC', 'COUNT', ARGV[4]); if #m > 0 then redis.call('zrem', KEYS[1], unpack(m)); redis.call('zrem', KEYS[2], unpack(m)) end; return m",
        2,
        NOTIFY_GEO_KEY,
        NOTIFY_EXP_KEY,
        lng,
        lat,
        radiusM,
        NOTIFY_DRAIN_COUNT,
      )) as string[];
      return members ?? [];
    } catch {
      return [];
    }
  }
}
