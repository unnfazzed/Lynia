import { describe, expect, it, vi } from "vitest";
import type { Env } from "../config/env";
import type { MetricsService } from "../observability/metrics.service";
import { PrismaService } from "../prisma/prisma.service";
import { TrackingService } from "./tracking.service";

/** REDIS_URL unset ⇒ the no-Redis path (flush every fix), which is the dev/test default. */
const noRedisEnv = { REDIS_URL: undefined } as Env;

/** Spy metrics fake — broadcast-nearby recording is best-effort; keep tests off the OTel path. */
const fakeMetrics = () =>
  ({ startTimer: () => () => 0, recordBroadcastNearby: vi.fn() }) as unknown as MetricsService;

function svc(findUnique: () => Promise<unknown>) {
  return new TrackingService(noRedisEnv, { order: { findUnique } } as unknown as PrismaService, fakeMetrics());
}

/** Fakes only the rider.findUnique the board-eligibility check reads. */
function riderSvc(rider: unknown) {
  return new TrackingService(noRedisEnv, { rider: { findUnique: async () => rider } } as unknown as PrismaService, fakeMetrics());
}

/** A minimal in-memory Redis fake exposing the get/set/quit surface recordFix/getLivePosition use,
 *  plus geoadd/geosearch stubs for the nearbyRiders Redis prefilter. geosearch returns whatever is
 *  queued in `geoResult` (nearest-first [member, distance] rows, as WITHDIST would). */
function fakeRedis() {
  const store = new Map<string, string>();
  const geoResult: Array<[string, string]> = [];
  return {
    store,
    geoResult,
    get: vi.fn(async (k: string) => store.get(k) ?? null),
    set: vi.fn(async (k: string, v: string, ..._rest: unknown[]) => {
      store.set(k, v);
      return "OK";
    }),
    geoadd: vi.fn(async (..._args: unknown[]) => 1),
    geosearch: vi.fn(async (..._args: unknown[]) => geoResult),
    quit: vi.fn(async () => {}),
  };
}

describe("TrackingService.canAccessOrder", () => {
  it("denies access to a missing order", async () => {
    expect(await svc(async () => null).canAccessOrder("u1", "o1")).toBe(false);
  });
  it("allows the order's customer", async () => {
    const s = svc(async () => ({ customerId: "u1", riderId: "r9" }));
    expect(await s.canAccessOrder("u1", "o1")).toBe(true);
  });
  it("allows the assigned rider", async () => {
    const s = svc(async () => ({ customerId: "c9", riderId: "u1" }));
    expect(await s.canAccessOrder("u1", "o1")).toBe(true);
  });
  it("denies an unrelated user", async () => {
    const s = svc(async () => ({ customerId: "c9", riderId: "r9" }));
    expect(await s.canAccessOrder("u1", "o1")).toBe(false);
  });
});

describe("TrackingService.isAssignedRider", () => {
  it("denies a missing order", async () => {
    expect(await svc(async () => null).isAssignedRider("u1", "o1")).toBe(false);
  });
  it("denies a rider who is not assigned", async () => {
    const s = svc(async () => ({ riderId: "r9", status: "assigned" }));
    expect(await s.isAssignedRider("u1", "o1")).toBe(false);
  });
  it("denies the assigned rider when the ride is not active", async () => {
    const s = svc(async () => ({ riderId: "u1", status: "completed" }));
    expect(await s.isAssignedRider("u1", "o1")).toBe(false);
  });
  it("allows the assigned rider on an active ride", async () => {
    const s = svc(async () => ({ riderId: "u1", status: "en_route_pickup" }));
    expect(await s.isAssignedRider("u1", "o1")).toBe(true);
  });
});

describe("TrackingService.isBoardEligible", () => {
  // A rider in good standing + online (the eligible baseline the negative cases mutate one field from).
  const goodStanding = {
    kycStatus: "verified",
    isOnline: true,
    accountStatus: "active",
    onHold: false,
    cooldownUntil: null,
  };

  it("denies a non-rider (no row)", async () => {
    expect(await riderSvc(null).isBoardEligible("u1")).toBe(false);
  });
  it("denies an unverified rider", async () => {
    expect(await riderSvc({ ...goodStanding, kycStatus: "pending" }).isBoardEligible("u1")).toBe(false);
  });
  it("denies a verified rider who is offline", async () => {
    expect(await riderSvc({ ...goodStanding, isOnline: false }).isBoardEligible("u1")).toBe(false);
  });
  // The board gate MUST mirror the offer gate (offers.service §5d): a rider who can't make an offer
  // must not receive board broadcasts. These four mirror onlineRefusalReason's standing checks.
  it("denies a suspended rider (account standing)", async () => {
    expect(await riderSvc({ ...goodStanding, accountStatus: "suspended" }).isBoardEligible("u1")).toBe(false);
  });
  it("denies a banned rider (account standing)", async () => {
    expect(await riderSvc({ ...goodStanding, accountStatus: "banned" }).isBoardEligible("u1")).toBe(false);
  });
  it("denies an on_hold rider even though they stay isOnline:true (reliability gate)", async () => {
    // The exact bug: a reliability drop sets onHold without forcing offline, so an on_hold rider is
    // still isOnline:true and would slip through a kyc+online-only check — but can't make offers.
    expect(await riderSvc({ ...goodStanding, onHold: true }).isBoardEligible("u1")).toBe(false);
  });
  it("denies a rider on an active no-show cooldown", async () => {
    const future = new Date(Date.now() + 60_000);
    expect(await riderSvc({ ...goodStanding, cooldownUntil: future }).isBoardEligible("u1")).toBe(false);
  });
  it("allows a rider on an EXPIRED cooldown (past → no longer gating)", async () => {
    const past = new Date(Date.now() - 60_000);
    expect(await riderSvc({ ...goodStanding, cooldownUntil: past }).isBoardEligible("u1")).toBe(true);
  });
  it("allows a verified, online rider in good standing", async () => {
    expect(await riderSvc(goodStanding).isBoardEligible("u1")).toBe(true);
  });
});

describe("TrackingService.recordFix (no Redis — dev/test default)", () => {
  it("writes the position AND heartbeat on every fix (no throttle without Redis)", async () => {
    const executeRaw = vi.fn(async () => 1);
    const s = new TrackingService(noRedisEnv, { $executeRaw: executeRaw } as unknown as PrismaService, fakeMetrics());

    await s.recordFix("rider-1", -17.8, 31.0);
    await s.recordFix("rider-1", -17.81, 31.01);

    // Without Redis each fix does BOTH the single-column heartbeat and the full position write.
    // 2 fixes × 2 writes = 4 raw statements (no throttle).
    expect(executeRaw).toHaveBeenCalledTimes(4);
  });

  it("getLivePosition returns null without Redis", async () => {
    const s = new TrackingService(noRedisEnv, { $executeRaw: vi.fn(async () => 1) } as unknown as PrismaService, fakeMetrics());
    expect(await s.getLivePosition("rider-1")).toBeNull();
  });
});

describe("TrackingService.recordFix (Redis path — injected fake)", () => {
  it("SETs the live-position key and getLivePosition reads it back (hit)", async () => {
    const redis = fakeRedis();
    const s = new TrackingService({ REDIS_URL: "redis://x" } as Env, { $executeRaw: vi.fn(async () => 1) } as unknown as PrismaService, fakeMetrics());
    s.setRedisClient(redis as never);

    await s.recordFix("rider-1", -17.8, 31.0);

    expect(redis.set).toHaveBeenCalledTimes(1);
    const [key, value, ex] = redis.set.mock.calls[0]!;
    expect(key).toBe("rider:pos:rider-1");
    expect(ex).toBe("EX");
    expect(JSON.parse(value as string)).toMatchObject({ lat: -17.8, lng: 31.0 });

    const live = await s.getLivePosition("rider-1");
    expect(live).toMatchObject({ lat: -17.8, lng: 31.0 });
    expect(typeof live!.at).toBe("number");
  });

  it("P0: heartbeat is written on EVERY fix even while the position flush is throttled", async () => {
    const redis = fakeRedis();
    // Capture the raw SQL text so we can distinguish the single-column heartbeat from the full
    // position write. Prisma tagged-template passes a TemplateStringsArray as the first arg.
    const calls: string[] = [];
    const executeRaw = vi.fn(async (strings: TemplateStringsArray) => {
      calls.push(strings.join("?"));
      return 1;
    });
    const s = new TrackingService({ REDIS_URL: "redis://x" } as Env, { $executeRaw: executeRaw } as unknown as PrismaService, fakeMetrics());
    s.setRedisClient(redis as never);

    await s.recordFix("rider-1", -17.8, 31.0);
    await s.recordFix("rider-1", -17.81, 31.01); // immediately after → position write throttled

    const heartbeats = calls.filter((c) => c.includes("last_heartbeat_at") && !c.includes("current_lat"));
    const positions = calls.filter((c) => c.includes("current_lat"));
    expect(heartbeats).toHaveLength(2); // heartbeat on BOTH fixes (P0 liveness never throttled)
    expect(positions).toHaveLength(1); // full position write only on the first fix (throttled after)
  });

  it("getLivePosition returns null (no throw) when the Redis GET rejects", async () => {
    const redis = { ...fakeRedis(), get: vi.fn(async () => Promise.reject(new Error("redis down"))) };
    const s = new TrackingService({ REDIS_URL: "redis://x" } as Env, { $executeRaw: vi.fn(async () => 1) } as unknown as PrismaService, fakeMetrics());
    s.setRedisClient(redis as never);
    await expect(s.getLivePosition("rider-1")).resolves.toBeNull(); // fallback, never 500s the snapshot
  });

  it("flushToPg writes the last Redis position to PG and evicts the throttle entry", async () => {
    const redis = fakeRedis();
    redis.store.set("rider:pos:rider-1", JSON.stringify({ lat: -17.9, lng: 31.1, at: 1 }));
    const positioned: string[] = [];
    const executeRaw = vi.fn(async (strings: TemplateStringsArray) => {
      if (strings.join("?").includes("current_lat")) positioned.push("pos");
      return 1;
    });
    const s = new TrackingService({ REDIS_URL: "redis://x" } as Env, { $executeRaw: executeRaw } as unknown as PrismaService, fakeMetrics());
    s.setRedisClient(redis as never);
    await s.flushToPg("rider-1");
    expect(positioned).toHaveLength(1); // the last-known position was persisted on disconnect
  });

  it("DS13-02: flushToPg does NOT evict the rider from the geo index (backgrounded-but-online stays a candidate)", async () => {
    // A socket disconnect (phone backgrounded/locked) must NOT remove an is_online=true rider from the
    // GEOSEARCH candidate set — that set is the primary source of the new-order FCM broadcast + supply
    // counts, and PG is_online is the authority. Eviction happens ONLY on explicit go-offline.
    const redis = { ...fakeRedis(), zrem: vi.fn(async () => 1) };
    redis.store.set("rider:pos:rider-1", JSON.stringify({ lat: -17.9, lng: 31.1, at: 1 }));
    const executeRaw = vi.fn(async () => 1);
    const s = new TrackingService({ REDIS_URL: "redis://x" } as Env, { $executeRaw: executeRaw } as unknown as PrismaService, fakeMetrics());
    s.setRedisClient(redis as never);

    await s.flushToPg("rider-1");

    // No geo eviction on disconnect …
    expect(redis.zrem).not.toHaveBeenCalled();
    // … but the last-known position is still flushed to PG so it isn't lost when the Redis key TTLs.
    expect(executeRaw).toHaveBeenCalled();
  });

  it("DS13-02: explicit go-offline eviction still removes the rider (evictFromGeo unchanged)", async () => {
    // The eviction path itself is untouched: setOnline(false) → evictFromGeo → ZREM. Asserted directly
    // so the disconnect-path change above doesn't weaken the go-offline invariant.
    const redis = { ...fakeRedis(), zrem: vi.fn(async () => 1) };
    const s = new TrackingService({ REDIS_URL: "redis://x" } as Env, { $executeRaw: vi.fn(async () => 1) } as unknown as PrismaService, fakeMetrics());
    s.setRedisClient(redis as never);

    await s.evictFromGeo("rider-1");

    expect(redis.zrem).toHaveBeenCalledWith("rider:geo", "rider-1");
  });

  it("recordFix GEOADDs the rider into the geo index (best-effort, alongside the position SET)", async () => {
    const redis = fakeRedis();
    const s = new TrackingService({ REDIS_URL: "redis://x" } as Env, { $executeRaw: vi.fn(async () => 1) } as unknown as PrismaService, fakeMetrics());
    s.setRedisClient(redis as never);

    await s.recordFix("rider-1", -17.8, 31.0);

    expect(redis.geoadd).toHaveBeenCalledTimes(1);
    // ioredis geoadd order is (key, lng, lat, member).
    expect(redis.geoadd).toHaveBeenCalledWith("rider:geo", 31.0, -17.8, "rider-1");
  });

  it("recordFix still writes the heartbeat when GEOADD rejects (Redis error never starves the heartbeat)", async () => {
    const redis = { ...fakeRedis(), geoadd: vi.fn(async () => Promise.reject(new Error("redis down"))) };
    const executeRaw = vi.fn(async () => 1);
    const s = new TrackingService({ REDIS_URL: "redis://x" } as Env, { $executeRaw: executeRaw } as unknown as PrismaService, fakeMetrics());
    s.setRedisClient(redis as never);
    await expect(s.recordFix("rider-1", -17.8, 31.0)).resolves.toBeUndefined();
    expect(executeRaw).toHaveBeenCalled(); // heartbeat + flush still ran
  });
});

describe("TrackingService.nearbyRiders (Redis prefilter path)", () => {
  it("GEOSEARCHes candidates then keeps only PG-confirmed online riders, preserving nearest-first order", async () => {
    const redis = fakeRedis();
    // GEOSEARCH yields three candidates nearest-first; PG will confirm only two are still online.
    redis.geoResult.push(["rider-near", "100"], ["rider-off", "200"], ["rider-far", "300"]);
    const queryRaw = vi.fn(async () => [{ profile_id: "rider-near" }, { profile_id: "rider-far" }]);
    const s = new TrackingService(
      { REDIS_URL: "redis://x" } as Env,
      { $queryRaw: queryRaw } as unknown as PrismaService,
      fakeMetrics(),
    );
    s.setRedisClient(redis as never);

    const hits = await s.nearbyRiders(-17.8, 31.0, 5000);

    expect(redis.geosearch).toHaveBeenCalledTimes(1);
    expect(queryRaw).toHaveBeenCalledTimes(1); // ONE PG is_online query for the whole candidate set
    // Only PG-online riders survive, in the GEOSEARCH nearest-first order (rider-off dropped).
    expect(hits).toEqual([
      { profileId: "rider-near", distanceM: 100 },
      { profileId: "rider-far", distanceM: 300 },
    ]);
  });

  it("skips the PG round-trip when GEOSEARCH returns no candidates", async () => {
    const redis = fakeRedis(); // geoResult empty
    const queryRaw = vi.fn(async () => []);
    const s = new TrackingService(
      { REDIS_URL: "redis://x" } as Env,
      { $queryRaw: queryRaw } as unknown as PrismaService,
      fakeMetrics(),
    );
    s.setRedisClient(redis as never);

    const hits = await s.nearbyRiders(-17.8, 31.0, 5000);

    expect(hits).toEqual([]);
    expect(queryRaw).not.toHaveBeenCalled();
  });

  it("falls back to the PG ST_DWithin path when GEOSEARCH errors (resilient to a transient Redis blip)", async () => {
    const redis = fakeRedis();
    redis.geosearch = vi.fn(async () => Promise.reject(new Error("redis down"))) as never;
    const queryRaw = vi.fn(async (strings: TemplateStringsArray) => {
      expect(strings.join("?")).toContain("ST_DWithin"); // fell through to the PG path
      return [{ profile_id: "rider-1", distance_m: 42 }];
    });
    const s = new TrackingService(
      { REDIS_URL: "redis://x" } as Env,
      { $queryRaw: queryRaw } as unknown as PrismaService,
      fakeMetrics(),
    );
    s.setRedisClient(redis as never);

    const hits = await s.nearbyRiders(-17.8, 31.0, 5000);
    expect(hits).toEqual([{ profileId: "rider-1", distanceM: 42 }]);
    expect(queryRaw).toHaveBeenCalledTimes(1);
  });

  it("DEGRADE: without Redis it uses the PG ST_DWithin path unchanged (setRedisClient(null))", async () => {
    // The no-Redis path must be byte-identical to before the prefilter: one $queryRaw with the
    // ST_DWithin filter + ST_Distance ordering, returning {profileId, distanceM}. No geosearch.
    const redis = fakeRedis();
    const queryRaw = vi.fn(async (strings: TemplateStringsArray) => {
      expect(strings.join("?")).toContain("ST_DWithin");
      return [{ profile_id: "rider-1", distance_m: 42 }];
    });
    const s = new TrackingService(
      { REDIS_URL: undefined } as Env,
      { $queryRaw: queryRaw } as unknown as PrismaService,
      fakeMetrics(),
    );
    s.setRedisClient(null); // explicit degrade — no Redis client

    const hits = await s.nearbyRiders(-17.8, 31.0, 5000);

    expect(redis.geosearch).not.toHaveBeenCalled();
    expect(hits).toEqual([{ profileId: "rider-1", distanceM: 42 }]);
  });
});

describe("TrackingService.nearbyRiders — heartbeat freshness (ghost filter)", () => {
  it("applies the last_heartbeat_at cutoff in the Redis-confirm PG query", async () => {
    const redis = fakeRedis();
    redis.geoResult.push(["rider-1", "100"]);
    let sql = "";
    const queryRaw = vi.fn(async (strings: TemplateStringsArray) => {
      sql = strings.join("?");
      return [{ profile_id: "rider-1" }];
    });
    const s = new TrackingService({ REDIS_URL: "redis://x" } as Env, { $queryRaw: queryRaw } as unknown as PrismaService, fakeMetrics());
    s.setRedisClient(redis as never);

    await s.nearbyRiders(-17.8, 31.0, 5000);

    // A rider whose app died with is_online stuck true must not be pushed / counted (policy
    // BROADCAST.heartbeatMaxAgeMs) — the online-confirm leg carries the same cutoff as the fallback.
    expect(sql).toContain("last_heartbeat_at");
  });

  it("applies the last_heartbeat_at cutoff in the PG ST_DWithin fallback", async () => {
    let sql = "";
    const queryRaw = vi.fn(async (strings: TemplateStringsArray) => {
      sql = strings.join("?");
      return [];
    });
    const s = new TrackingService({ REDIS_URL: undefined } as Env, { $queryRaw: queryRaw } as unknown as PrismaService, fakeMetrics());
    s.setRedisClient(null);

    await s.nearbyRiders(-17.8, 31.0, 5000);

    expect(sql).toContain("ST_DWithin");
    expect(sql).toContain("last_heartbeat_at");
  });
});

describe("TrackingService.claimBroadcastRecipients (widening-broadcast dedupe)", () => {
  /** Fake pipeline capturing SADD/EXPIRE; exec returns the queued per-SADD replies. */
  function pipelineRedis(saddReplies: Array<0 | 1>, opts: { rejectExec?: boolean } = {}) {
    const sadds: Array<[string, string]> = [];
    const expires: Array<[string, number]> = [];
    const pipeline = {
      sadd: vi.fn((key: string, id: string) => sadds.push([key, id])),
      expire: vi.fn((key: string, ttl: number) => expires.push([key, ttl])),
      exec: vi.fn(async () => {
        if (opts.rejectExec) throw new Error("redis down");
        return [...saddReplies.map((r) => [null, r] as [null, number]), [null, 1] as [null, number]];
      }),
    };
    return { ...fakeRedis(), pipeline: vi.fn(() => pipeline), _pipeline: pipeline };
  }

  const mk = (redis: unknown) => {
    const s = new TrackingService({ REDIS_URL: "redis://x" } as Env, {} as PrismaService, fakeMetrics());
    s.setRedisClient(redis as never);
    return s;
  };

  it("returns only the NEWLY-claimed ids (SADD reply 1) and stamps the set's TTL", async () => {
    const redis = pipelineRedis([1, 0, 1]); // r-2 already in the set from an earlier disc
    const s = mk(redis);

    const claimed = await s.claimBroadcastRecipients("ord-1", ["r-1", "r-2", "r-3"]);

    expect(claimed).toEqual(["r-1", "r-3"]);
    expect(redis._pipeline.sadd).toHaveBeenCalledWith("broadcast:sent:ord-1", "r-1");
    expect(redis._pipeline.expire).toHaveBeenCalledWith("broadcast:sent:ord-1", expect.any(Number));
  });

  it("returns [] for an empty id list without touching Redis", async () => {
    const redis = pipelineRedis([]);
    const s = mk(redis);
    await expect(s.claimBroadcastRecipients("ord-1", [])).resolves.toEqual([]);
    expect(redis.pipeline).not.toHaveBeenCalled();
  });

  it("returns null without Redis so the caller falls back to ring geometry", async () => {
    const s = new TrackingService(noRedisEnv, {} as PrismaService, fakeMetrics());
    s.setRedisClient(null);
    await expect(s.claimBroadcastRecipients("ord-1", ["r-1"])).resolves.toBeNull();
  });

  it("returns null (never throws) when the pipeline exec rejects", async () => {
    const s = mk(pipelineRedis([1], { rejectExec: true }));
    await expect(s.claimBroadcastRecipients("ord-1", ["r-1"])).resolves.toBeNull();
  });
});

describe("TrackingService.claimPresenceEscalation / releasePresenceEscalation (multi-instance dedup)", () => {
  const svcOnly = () => new TrackingService({ REDIS_URL: "redis://x" } as Env, {} as PrismaService, fakeMetrics());

  it("grants unconditionally with no Redis (single-instance / dev / test)", async () => {
    const s = new TrackingService(noRedisEnv, {} as PrismaService, fakeMetrics());
    s.setRedisClient(null);
    expect(await s.claimPresenceEscalation("rider:ord-1", 600)).toBe(true);
  });

  it("claims via SET NX EX and grants only the first caller (winner true, loser false)", async () => {
    const store = new Set<string>();
    const redis = {
      set: vi.fn(async (k: string, _v: string, _ex: string, _ttl: number, nx: string) => {
        if (nx === "NX" && store.has(k)) return null; // key already present → NX fails
        store.add(k);
        return "OK";
      }),
      del: vi.fn(async (k: string) => (store.delete(k) ? 1 : 0)),
    };
    const s = svcOnly();
    s.setRedisClient(redis as never);

    expect(await s.claimPresenceEscalation("rider:ord-1", 600)).toBe(true); // first wins
    expect(await s.claimPresenceEscalation("rider:ord-1", 600)).toBe(false); // second loses
    const [key, one, ex, ttl, nx] = redis.set.mock.calls[0]!;
    expect(key).toBe("presence:stale:rider:ord-1");
    expect([one, ex, ttl, nx]).toEqual(["1", "EX", 600, "NX"]);

    await s.releasePresenceEscalation("rider:ord-1"); // release → the next dark period re-arms
    expect(redis.del).toHaveBeenCalledWith("presence:stale:rider:ord-1");
    expect(await s.claimPresenceEscalation("rider:ord-1", 600)).toBe(true);
  });

  it("grants (not silences) on a Redis error — a duplicate beats a missed escalation", async () => {
    const redis = { set: vi.fn(async () => { throw new Error("redis down"); }), del: vi.fn(async () => 0) };
    const s = svcOnly();
    s.setRedisClient(redis as never);
    expect(await s.claimPresenceEscalation("customer:ord-1", 600)).toBe(true);
  });
});

describe("TrackingService notify-me waiting list (2·b1)", () => {
  const noRedis = () => new TrackingService(noRedisEnv, {} as PrismaService, fakeMetrics());
  const withRedis = () => new TrackingService({ REDIS_URL: "redis://x" } as Env, {} as PrismaService, fakeMetrics());
  // A fake exposing the geo + zset surface the notify-me store uses. `members` is what the atomic drain
  // (the Lua `eval`) claims and returns; `expired` is what a prune (zrangebyscore) finds.
  function notifyRedis(members: string[] = [], expired: string[] = [], orderByMember: Record<string, string> = {}) {
    return {
      geoadd: vi.fn(async (..._a: unknown[]) => 1),
      geosearch: vi.fn(async (..._a: unknown[]) => members),
      zadd: vi.fn(async (..._a: unknown[]) => 1),
      zrem: vi.fn(async (..._a: unknown[]) => 1),
      zrangebyscore: vi.fn(async (..._a: unknown[]) => expired),
      // KB-NOTIFY-ORDERID companion HASH surface (member → orderId).
      hset: vi.fn(async (..._a: unknown[]) => 1),
      hdel: vi.fn(async (..._a: unknown[]) => 1),
      hmget: vi.fn(async (_key: string, ...fields: string[]) => fields.map((f) => orderByMember[f] ?? null)),
      // The drain now claims-and-removes atomically in one Lua eval; it returns the claimed members.
      eval: vi.fn(async (..._a: unknown[]) => members),
    };
  }

  it("addNotifyRequest indexes the customer at the pickup + stamps an expiry (Redis path)", async () => {
    const redis = notifyRedis();
    const s = withRedis();
    s.setRedisClient(redis as never);
    // No orderId passed → geo/zset stamped, and any stale order association HDEL'd (not HSET).
    expect(await s.addNotifyRequest("cust-1", -17.8, 31.0, undefined, 1000)).toBe(true);
    // ioredis geoadd order is (key, lng, lat, member).
    expect(redis.geoadd).toHaveBeenCalledWith("notify:geo", 31.0, -17.8, "cust-1");
    // zadd stamps expiry = now + TTL (1h) as the score.
    expect(redis.zadd).toHaveBeenCalledWith("notify:exp", 1000 + 60 * 60 * 1000, "cust-1");
    // KB-NOTIFY-ORDERID: no order supplied → clear any stale association, never leave one behind.
    expect(redis.hdel).toHaveBeenCalledWith("notify:order", "cust-1");
    expect(redis.hset).not.toHaveBeenCalled();
  });

  it("addNotifyRequest stores the order association in the companion hash when an orderId is given (KB-NOTIFY-ORDERID)", async () => {
    const redis = notifyRedis();
    const s = withRedis();
    s.setRedisClient(redis as never);
    expect(await s.addNotifyRequest("cust-1", -17.8, 31.0, "ord-9", 1000)).toBe(true);
    expect(redis.hset).toHaveBeenCalledWith("notify:order", "cust-1", "ord-9");
    expect(redis.hdel).not.toHaveBeenCalled();
  });

  it("addNotifyRequest is a no-op (false) without Redis", async () => {
    expect(await noRedis().addNotifyRequest("cust-1", -17.8, 31.0)).toBe(false);
  });

  it("claimNotifyWaitersNear claims nearby waiters under a per-waiter lock in ONE eval (GEOSEARCH + SET NX) and returns them", async () => {
    const redis = notifyRedis(["cust-1", "cust-2"]);
    const s = withRedis();
    s.setRedisClient(redis as never);
    const claimed = await s.claimNotifyWaitersNear(-17.8, 31.0, 5000);
    // KB-NOTIFY-ORDERID: pairs now, with orderId undefined when the hash has no association.
    expect(claimed).toEqual([{ profileId: "cust-1" }, { profileId: "cust-2" }]);
    // F-18 durability: a single Lua round trip that GEOSEARCHes the geo index (numkeys=1) and SET-NX
    // locks each hit — the claim, NOT a delete, is what dedups (concurrent instances / a burst of riders
    // ping each waiter at most once). Removal happens later, only for delivered waiters (clearNotifyWaiters).
    expect(redis.eval).toHaveBeenCalledTimes(1);
    const [script, numkeys, geoKey] = redis.eval.mock.calls[0] as [string, number, string];
    expect(numkeys).toBe(1);
    expect(geoKey).toBe("notify:geo");
    expect(script).toMatch(/geosearch/i);
    expect(script).toMatch(/set/i);
    expect(script).toMatch(/nx/i);
    // Deliberately does NOT delete in the claim step — the waiter survives an undelivered push.
    expect(script).not.toMatch(/zrem/i);
  });

  it("claimNotifyWaitersNear reads back each claimed waiter's order association from the companion hash (KB-NOTIFY-ORDERID)", async () => {
    // cust-1 registered against a live order; cust-2 registered with no order (older/plain register).
    const redis = notifyRedis(["cust-1", "cust-2"], [], { "cust-1": "ord-9" });
    const s = withRedis();
    s.setRedisClient(redis as never);
    const claimed = await s.claimNotifyWaitersNear(-17.8, 31.0, 5000);
    expect(claimed).toEqual([{ profileId: "cust-1", orderId: "ord-9" }, { profileId: "cust-2" }]);
    // The association read is a follow-up HMGET over the claimed members (the SET-NX claim dedups).
    expect(redis.hmget).toHaveBeenCalledWith("notify:order", "cust-1", "cust-2");
  });

  it("claimNotifyWaitersNear prunes expired entries first, and returns [] with no Redis / on no matches", async () => {
    const redis = notifyRedis([], ["stale-1"]);
    const s = withRedis();
    s.setRedisClient(redis as never);
    expect(await s.claimNotifyWaitersNear(-17.8, 31.0, 5000, 9999)).toEqual([]);
    // The prune removed the expired member from both structures before searching.
    expect(redis.zrem).toHaveBeenCalledWith("notify:exp", "stale-1");
    expect(redis.zrem).toHaveBeenCalledWith("notify:geo", "stale-1");
    // No Redis → empty, never throws.
    expect(await noRedis().claimNotifyWaitersNear(-17.8, 31.0, 5000)).toEqual([]);
  });

  it("clearNotifyWaiters removes the delivered waiters from BOTH structures (and no-ops on empty / no Redis)", async () => {
    const redis = notifyRedis();
    const s = withRedis();
    s.setRedisClient(redis as never);
    await s.clearNotifyWaiters(["cust-1", "cust-2"]);
    expect(redis.zrem).toHaveBeenCalledWith("notify:geo", "cust-1", "cust-2");
    expect(redis.zrem).toHaveBeenCalledWith("notify:exp", "cust-1", "cust-2");
    // KB-NOTIFY-ORDERID: the companion order association is cleared in the same place.
    expect(redis.hdel).toHaveBeenCalledWith("notify:order", "cust-1", "cust-2");
    // Empty list is a no-op (no Redis call); no Redis never throws.
    redis.zrem.mockClear();
    await s.clearNotifyWaiters([]);
    expect(redis.zrem).not.toHaveBeenCalled();
    await expect(noRedis().clearNotifyWaiters(["cust-1"])).resolves.toBeUndefined();
  });
});
