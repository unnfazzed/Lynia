import { BadRequestException, ForbiddenException, Inject, Injectable, Logger, NotFoundException, type OnModuleDestroy } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type IORedis from "ioredis";
import { ACTIVE_RIDE_STATUSES, type BoardNewOrderEvent, COMPLETED_ORDER_STATUSES, type CreateOrderRequest, CUSTOMER_ACTIVE_STATUSES, haversineKm, type LatLng, OFFER_WINDOW_MS, type OrderItem, PHONE_REVEAL_STATUSES, quoteFare, SERVICE_CORRIDOR, summarizeItems } from "@lynia/shared";
import { STORAGE, type StorageAdapter } from "../adapters/storage/storage.interface";
import { baseBroadcastRadiusM, effectiveBroadcastRadiusM, heartbeatMaxAgeMsForPush, maxBroadcastRadiusM } from "../common/broadcast-policy";
import { MicroCache, type MicroCacheL2 } from "../common/micro-cache";
import { createRedisClient, REDIS_FAIL_FAST } from "../common/redis";
import { ENV } from "../config/config.module";
import type { Env } from "../config/env";
import { MetricsService } from "../observability/metrics.service";
import { TrackingGateway } from "../tracking/tracking.gateway";
import { OfferExpiryService } from "../matching/offer-expiry.service";
import { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";
import { TrackingService } from "../tracking/tracking.service";
import { customerSafeCancelReason } from "./cancel-reason";
import { buildBoardNewOrderEvent, pickupPoint, publicWaypoint } from "./waypoints";

const REVEAL = new Set<string>(PHONE_REVEAL_STATUSES);

/** R8: how far back activeForRider looks for a cancelled-but-collected order to surface the hand-back
 *  state on reopen (a job the rider still physically holds after a missed `job:cancelled`). One day. */
const HANDBACK_LOOKBACK_MS = 24 * 60 * 60 * 1_000;

/** Q1 — Launch service corridor: the coverage disc's centre (from policy.ts SERVICE_CORRIDOR). */
const CORRIDOR_CENTRE: LatLng = { lat: SERVICE_CORRIDOR.centerLat, lng: SERVICE_CORRIDOR.centerLng };

/**
 * Q1 — reject an order whose pickup OR drop-off falls outside the launch service corridor (a single
 * coverage disc, {@link SERVICE_CORRIDOR.radiusKm} of the centre — no magic numbers). ONE check reused
 * for both waypoints via {@link haversineKm}. Throws a clear 4xx so the customer sees "outside our
 * service area" rather than a silent failure downstream.
 */
function assertWithinServiceCorridor(pickup: LatLng, dropoff: LatLng): void {
  for (const [label, point] of [["pickup", pickup], ["drop-off", dropoff]] as const) {
    if (haversineKm(point, CORRIDOR_CENTRE) > SERVICE_CORRIDOR.radiusKm) {
      throw new BadRequestException(`That ${label} is outside our service area.`);
    }
  }
}

/** TTL for the pickup-photo signed read URL on the snapshot — comfortably longer than the 15s poll
 *  that refreshes it, short enough that a leaked URL goes stale fast (matches the admin KYC-photo
 *  review TTL). */
const PICKUP_PHOTO_READ_URL_TTL_SECONDS = 900;

/** How long a minted pickup-photo URL is served from cache: 2/3 of its signed validity, so a cached
 *  URL always reaches the client with ≥5 minutes of life left — ample to download a photo on 2G.
 *  Reusing the SAME URL string across the 15s snapshot polls is the point, not just saving the mint:
 *  the device's image cache is keyed on the URL, so a per-poll fresh signature made the phone
 *  re-download an identical photo every poll for the whole delivery (and burned a GCP `signBlob`
 *  IAM call each time — a project-shared quota, see uploads.controller.ts DS-07). */
const PICKUP_PHOTO_URL_CACHE_TTL_MS = (PICKUP_PHOTO_READ_URL_TTL_SECONDS * 1000 * 2) / 3;

/** Freshness window for the informational nearby-rider count (2·b1). The client polls it at 15s; a
 *  10s TTL means a rider coming online is still seen promptly, while concurrent auctions from the
 *  same block (and the create→first-poll pair) coalesce onto one PostGIS radius query instead of
 *  each running their own. Counts only — broadcast/push TARGETING never reads this cache. */
const NEARBY_COUNT_TTL_MS = 10_000;

/** C-O4 (DoorDash lesson 8, serve-stale-on-upstream-failure): hard bound on top of NEARBY_COUNT_TTL_MS
 *  for surviving a PostGIS/geo blip on this READ. A poll during a dead zone or a transient query
 *  failure reuses the last known-good count instead of collapsing to "supply unknown" — counts only,
 *  never assignment/money/auth, so a couple of minutes of staleness on an informational number is a
 *  strictly better answer than losing it. Past this bound the existing honest-null fallback applies. */
const NEARBY_COUNT_STALE_TTL_MS = 120_000;

// Customer-safe cancel-reason mapping (Fix 6) now lives in ./cancel-reason (roadmap 3.4), unit-tested there.

/** The fields `create`'s response is built from, shared by the fresh-create path and both
 *  idempotent-replay paths (pre-existing match, and the loser of a concurrent create race). */
const CREATE_RESPONSE_SELECT = {
  id: true,
  status: true,
  itemDesc: true,
  proposedFare: true,
  suggestedFare: true,
  distanceKm: true,
  createdAt: true,
} satisfies Prisma.OrderSelect;
type CreateResponseOrder = Prisma.OrderGetPayload<{ select: typeof CREATE_RESPONSE_SELECT }>;

/** A-O5: every snapshot consumer (mobile `Stepper`, the parcel/food live-tracker cards, the
 *  order-detail screen's completed/delivered timestamp lookups) only ever reads the FIRST
 *  occurrence of each status — `Array.find`/a `status in times` guard walking the ascending-order
 *  array. A normal forward-only order never repeats a status, but a food job that gets dropped and
 *  re-dispatched (`FoodDispatchService.dropDispatch`) cycles the same order back through
 *  `requested`/`assigned` again for each rider who bails pre-pickup — rows the client discards on
 *  arrival. Deduping server-side to one row per status (keeping the earliest, so the kept
 *  `createdAt` is byte-for-byte identical to what every consumer already computes client-side)
 *  caps the payload at the small fixed set of distinct statuses instead of growing with drop
 *  cycles, with zero behavior change for any consumer. */
function dedupeEventsByStatus<T extends { status: string }>(events: readonly T[]): T[] {
  const seen = new Set<string>();
  const deduped: T[] = [];
  for (const event of events) {
    if (seen.has(event.status)) continue;
    seen.add(event.status);
    deduped.push(event);
  }
  return deduped;
}

/** Waypoint as the ASSIGNED rider sees it inside the reveal window — contactPhone included, since
 *  they need to call the sender/recipient at the doors (§5d / design E1). Every other viewer and
 *  every listing path goes through {@link publicWaypoint}. */
function riderWaypoint(w: Prisma.JsonValue): { point: unknown; landmark: unknown; contactPhone: string | null } {
  const o = (w ?? {}) as { point?: unknown; landmark?: unknown; contactPhone?: unknown };
  return {
    point: o.point ?? null,
    landmark: o.landmark ?? null,
    contactPhone: typeof o.contactPhone === "string" ? o.contactPhone : null,
  };
}

@Injectable()
export class OrdersService implements OnModuleDestroy {
  private readonly logger = new Logger(OrdersService.name);

  // Read-through micro-caches on the snapshot hot path (DoorDash-style request coalescing, scaled to
  // this API): in-memory L1, single-flight, bounded — plus the wave-2 standardized-caching upgrades:
  // hit/miss/coalesced metrics (closed vocabularies, see MetricsService.recordMicroCache), ±10% TTL
  // jitter (stampede hardening), and an OPT-IN shared Redis L2 (MICRO_CACHE_REDIS_L2) so the 2-3
  // Cloud Run instances share warm entries. Strictly for reads whose few seconds of staleness is
  // explicitly fine — never for anything that gates money, assignment, or auth (broadcast targeting,
  // bid acceptance and pricing all bypass these). The closures below resolve `this.metricsSvc`/L2 at
  // CALL time, so field-initializer order vs constructor params is never a hazard.
  private readonly nearbyCountCache = new MicroCache<number>(200, {
    ttlJitterRatio: 0.1,
    onEvent: (o) => this.metricsSvc?.recordMicroCache("nearby_count", o),
    l2: () => this.microCacheL2(),
    l2KeyPrefix: "mc:nearby:",
  });
  private readonly pickupPhotoUrlCache = new MicroCache<string>(500, {
    ttlJitterRatio: 0.1,
    onEvent: (o) => this.metricsSvc?.recordMicroCache("pickup_photo_url", o),
    l2: () => this.microCacheL2(),
    l2KeyPrefix: "mc:photo:",
  });

  // Lazy, optional Redis client backing the micro-cache L2 (its OWN client, deliberately not
  // TrackingService's — that one carries the live-position/waitlist planes and must never queue
  // behind cache traffic). Created on first use only when BOTH flags allow; quit on shutdown.
  private microCacheL2Client: IORedis | null = null;
  private microCacheL2Started = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly expiry: OfferExpiryService,
    private readonly tracking: TrackingService,
    private readonly notifications: NotificationsService,
    private readonly gateway: TrackingGateway,
    // Optional in the TS signature only, so the many existing unit specs that never exercise the
    // pickup-photo path keep their 5-arg construction; Nest always injects it in production (the
    // storage adapter module is @Global) and getSnapshot degrades to a null URL without it.
    @Inject(STORAGE) private readonly storage?: StorageAdapter,
    // Both @Global-provided (ConfigModule / ObservabilityModule) so Nest always injects them in
    // production; TS-optional keeps the existing ≤6-arg spec constructions valid — with them absent
    // the caches run flagless (wave-1 behavior) and metrics are a no-op.
    @Inject(ENV) private readonly env?: Env,
    private readonly metricsSvc?: MetricsService,
  ) {}

  /** Resolve the shared L2 adapter, or null when not enabled/configured. Every command the adapter
   *  runs is best-effort inside MicroCache — a Redis blip degrades to L1-only, never to an error. */
  private microCacheL2(): MicroCacheL2 | null {
    if (this.env?.MICRO_CACHE_REDIS_L2 !== "true" || !this.env.REDIS_URL) return null;
    if (!this.microCacheL2Started) {
      this.microCacheL2Started = true;
      // LC-C01: request-path client (MicroCache L2) fails fast so a Redis blip degrades to L1-only
      // immediately instead of hanging the coalesced snapshot flight until reconnect.
      this.microCacheL2Client = createRedisClient(this.env.REDIS_URL, REDIS_FAIL_FAST);
      this.microCacheL2Client.on("error", (err: Error) =>
        this.logger.warn(`micro-cache L2 redis error: ${err.message}`),
      );
    }
    const client = this.microCacheL2Client;
    if (!client) return null;
    return {
      get: (key) => client.get(key),
      set: async (key, value, ttlMs) => {
        await client.set(key, value, "PX", Math.max(1, Math.round(ttlMs)));
      },
    };
  }

  /** The runtime kill-switch (MICRO_CACHE_DISABLED) plus the per-cache "TTL 0 disables it" rule. */
  private microCacheBypassed(ttlMs: number): boolean {
    return this.env?.MICRO_CACHE_DISABLED === "true" || ttlMs <= 0;
  }

  async onModuleDestroy(): Promise<void> {
    if (this.microCacheL2Client) await this.microCacheL2Client.quit().catch(() => {});
  }

  /** Customer creates a delivery and broadcasts it: it opens for offers immediately. */
  async create(input: CreateOrderRequest, customerId: string) {
    // S·2: a held customer can't broadcast. Checked first — before the corridor gate and any write —
    // and thrown in the same { reason, message } shape the rider online-gate uses, so the app's
    // ApiError.code pipeline routes it straight to the "account on hold" screen (gates.ts).
    // Read the caller's hold flag AND (if they're a rider) their account standing in one query, so the
    // gate below is a single round-trip on the hot create path.
    const account = await this.prisma.profile.findUnique({
      where: { id: customerId },
      select: { onHold: true, rider: { select: { accountStatus: true } } },
    });
    if (account?.onHold) {
      throw new ForbiddenException({ reason: "on_hold", message: "Your account is on hold." });
    }

    // F-01: a banned/suspended rider must not participate in the marketplace AT ALL — not even as a
    // sender. `Role` is a single enum (becoming a rider flips role→rider), and the customer-hold lever
    // 404s on a rider-role profile, so `onHold` alone can't stop them broadcasting. Reject on the rider's
    // own account standing. Thrown in the same { reason, message } shape as the onHold gate so the app's
    // ApiError.code pipeline routes it. A non-rider profile (no rider row) or an `active` rider is
    // unaffected.
    const accountStatus = account?.rider?.accountStatus;
    if (accountStatus === "banned" || accountStatus === "suspended") {
      throw new ForbiddenException({
        reason: accountStatus === "banned" ? "account_banned" : "account_suspended",
        message: "Your account is not in good standing.",
      });
    }

    // Idempotent replay (BUG-HUNT): a client-generated key lets a timeout+retry or a double-tap on
    // "Broadcast" return the SAME order instead of opening a second live auction — and double-pushing
    // every nearby rider — for one physical trip. Checked before any other work so a replay is cheap.
    if (input.idempotencyKey) {
      const existing = await this.prisma.order.findFirst({
        where: { customerId, idempotencyKey: input.idempotencyKey },
        select: CREATE_RESPONSE_SELECT,
      });
      if (existing) return this.toCreateResponse(existing, null);
    }

    // Q1: gate on the service corridor before doing any work — both waypoints must be in coverage.
    assertWithinServiceCorridor(input.pickup.point, input.dropoff.point);

    // Distance-based anchor the customer sees alongside their own proposal (CONCEPT §1).
    const { distanceKm, suggestedFare } = quoteFare(input.pickup.point, input.dropoff.point);

    // CANONICAL DIRECTION: `items` is the line-item source of truth for every order this API
    // writes; `itemDesc` is ALWAYS the derived summary (summarizeItems). A legacy client's
    // `itemDescription` normalizes to one qty-1 row, whose summary is the raw string — so old
    // clients, old rows, and every itemDesc consumer (board, history, admin) are byte-identical
    // to before. The contract guarantees at least one shape; when both arrive, `items` wins.
    // The derived row is clamped to OrderItem's 140-char cap (legacy itemDescription allows 280)
    // so stored `items` JSON always round-trips through the contract; itemDesc keeps the raw string.
    const items: OrderItem[] = input.items ?? [{ description: (input.itemDescription ?? "").slice(0, 140), quantity: 1 }];

    let order;
    try {
      order = await this.prisma.order.create({
        data: {
          customerId,
          orderType: "parcel",
          pickup: input.pickup as unknown as Prisma.InputJsonValue,
          dropoff: input.dropoff as unknown as Prisma.InputJsonValue,
          itemDesc: input.items ? summarizeItems(input.items) : (input.itemDescription ?? ""),
          items: items as unknown as Prisma.InputJsonValue,
          note: input.note ?? null,
          itemPhotoUrl: input.itemPhotoUrl ?? null,
          declaredValue: input.declaredValue,
          distanceKm,
          suggestedFare,
          proposedFare: input.proposedFare,
          // A1-8: record the liability-disclaimer consent on the order (version + timestamp) so it
          // survives with the order, not just as a client-side flag. Absent for old clients → null.
          disclaimerVersion: input.disclaimerVersion ?? null,
          disclaimerAcceptedAt: input.disclaimerVersion ? new Date() : null,
          idempotencyKey: input.idempotencyKey ?? null,
          status: "open_for_offers",
          events: { create: { status: "open_for_offers" } },
        },
        select: CREATE_RESPONSE_SELECT,
      });
    } catch (err) {
      // A concurrent replay of the same idempotency key raced us and won (P2002 on the partial unique
      // (customer_id, idempotency_key) index) — return their order instead of a spurious 5xx.
      if (input.idempotencyKey && err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        const winner = await this.prisma.order.findFirst({
          where: { customerId, idempotencyKey: input.idempotencyKey },
          select: CREATE_RESPONSE_SELECT,
        });
        if (winner) return this.toCreateResponse(winner, null);
      }
      throw err;
    }

    // Server-side window expiry (ET1). No-op if Redis isn't configured. Fire-and-forget, NOT awaited
    // (F-17): the order row has already committed, and with ioredis `maxRetriesPerRequest: null` a
    // Redis outage makes queue.add() buffer forever — awaiting it here would hang the create request
    // past the client timeout, and its idempotent retry would replay the existing order and skip the
    // rider fan-out below. Correctness is preserved because reconcileStaleOffers already backstops the
    // window transition off the DB even when this enqueue never lands. A .catch keeps a rejected
    // enqueue from surfacing as an unhandledRejection.
    void this.expiry.schedule(order.id).catch((err) => {
      this.logger.error(`expiry schedule failed for order ${order.id}: ${(err as Error).message}`);
    });

    // 2·b1 supply signal: resolve how many online riders are nearby BEFORE returning, so the auction
    // opens knowing whether anyone was actually pinged. Best-effort (null = unknown → calm fallback).
    const ridersNearby = await this.countNearbyForPickup(input.pickup as unknown as Prisma.JsonValue);

    // Post-commit, best-effort: push the broadcast to nearby online riders (CONCEPT §3.10 — push is
    // the primary new-order channel for riders, alongside the WS board). Never blocks the create.
    void this.broadcastToNearbyRiders(order.id, input.pickup as unknown as Prisma.JsonValue, input.dropoff as unknown as Prisma.JsonValue, {
      itemDesc: order.itemDesc,
      suggestedFare: order.suggestedFare.toString(),
      proposedFare: order.proposedFare.toString(),
      distanceKm: order.distanceKm,
      createdAt: order.createdAt.toISOString(),
    });

    return this.toCreateResponse(order, ridersNearby);
  }

  /** Shared response shape for `create`, on both a fresh broadcast and an idempotent replay (either
   *  a pre-existing match or one that won a concurrent create race). `ridersNearby` is null on a
   *  replay — it's supply info for a fresh broadcast, not meaningful for a returned old order. */
  private toCreateResponse(order: CreateResponseOrder, ridersNearby: number | null) {
    return {
      id: order.id,
      status: order.status,
      proposedFare: order.proposedFare.toString(),
      suggestedFare: order.suggestedFare.toString(),
      distanceKm: order.distanceKm,
      // Auction countdown: the client renders the window off createdAt + OFFER_WINDOW_MS (the same
      // window the server schedules expiry against). Status is open_for_offers on create.
      expiresAt: new Date(order.createdAt.getTime() + OFFER_WINDOW_MS).toISOString(),
      // 2·b1: online riders within the broadcast radius at broadcast time. null = supply unknown.
      ridersNearby,
    };
  }

  /** Acknowledge the customer's pre-broadcast disclaimer consent (A1-8). The binding record is the
   *  order's `disclaimerVersion`/`disclaimerAcceptedAt`, stamped when the order is created; this
   *  returns the server-authoritative acceptance timestamp for the gate the client shows first. */
  acceptDisclaimer(policyVersion: string, _customerId: string): { policyVersion: string; acceptedAt: string } {
    return { policyVersion, acceptedAt: new Date().toISOString() };
  }

  /**
   * 2·b1: register the customer to be pinged when a rider comes online near their pickup — the "notify
   * me" affordance on the no-riders-online auction state. Best-effort: the waiting-list store is
   * Redis-backed, so without Redis this simply doesn't persist (the customer just won't get the ping).
   * `queued` reflects whether it was actually stored, so the client can be honest if it wasn't.
   */
  async requestNotifyWhenAvailable(
    customerId: string,
    pickup: { lat: number; lng: number },
    orderId?: string,
  ): Promise<{ queued: boolean }> {
    // DS15-09: an `orderId` in this DTO must belong to the CALLER before we associate their waiter
    // registration with it. Without this check any authenticated profile (e.g. a rider who sees live
    // order ids on the open board) could pass a victim customer's order id — later routing the "a rider
    // is online near your request" push to the ATTACKER with `data.orderId` set to someone else's order
    // (a spoofed, cross-party notification and a coarse "is this order still open" oracle). Verify the
    // order exists AND its customerId matches the caller; on any mismatch (or a non-existent order)
    // silently DROP the association and register a plain, order-less notify-me — degrading gracefully to
    // the feature's pre-orderId behaviour rather than 4xx-ing a request that's still perfectly valid as
    // a generic "ping me when a rider's nearby". (addNotifyRequest HDELs any stale association when the
    // orderId is absent, so dropping it here leaves no orphan pointer.)
    let ownedOrderId: string | undefined;
    if (orderId) {
      const order = await this.prisma.order.findUnique({ where: { id: orderId }, select: { customerId: true } });
      if (order?.customerId === customerId) ownedOrderId = orderId;
    }
    // KB-NOTIFY-ORDERID: thread the caller's OWN still-open order through so its fulfillment push can
    // route the tap to that live auction. Absent/foreign orderId clears any stale association (see
    // addNotifyRequest).
    const queued = await this.tracking.addNotifyRequest(customerId, pickup.lat, pickup.lng, ownedOrderId);
    return { queued };
  }

  /**
   * Resolve the online riders within the base broadcast radius of the pickup (PostGIS ST_DWithin, ET6)
   * and push them the new order. Fully best-effort: any failure here — no nearby riders, a geo-query
   * error, a push outage — is swallowed so it can never affect the order the customer just created.
   */
  private async broadcastToNearbyRiders(
    orderId: string,
    pickup: Prisma.JsonValue,
    dropoff: Prisma.JsonValue,
    meta: { itemDesc: string; suggestedFare: string; proposedFare: string; distanceKm: number | null; createdAt: string },
  ): Promise<void> {
    try {
      const pt = pickupPoint(pickup);
      if (!pt) return;
      // Emit the in-process WS board push FIRST and UNCONDITIONALLY — board rooms are geo-scoped per
      // subscriber already (boardSubscribe joins the pickup's cell neighbourhood), so a rider already
      // staring at the board must see this order regardless of what the position index reports. Gating
      // this on the `nearby` list would silently drop the board emit whenever no rider happens to be
      // mid-delivery indexed nearby — the exact false-empty this fix addresses. Only the FCM fan-out
      // below stays gated on nearby.length. The board-event build is guarded on its own so a schema/emit
      // failure can't suppress the FCM push (and vice versa) — the two channels are independent.
      try {
        const boardEvent: BoardNewOrderEvent = buildBoardNewOrderEvent(orderId, pickup, dropoff, meta);
        this.safeEmitBoardNewOrder(boardEvent, pt.lat, pt.lng);
      } catch (err) {
        this.logger.warn(`board event build/emit failed for order ${orderId}: ${(err as Error).message}`);
      }
      // FCM push for riders NOT currently on the board — gated on the position index having someone to
      // fan out to (no candidates ⇒ no tokens to push). Only this channel depends on `nearby`.
      // Uses the PERMISSIVE heartbeat cutoff (heartbeatMaxAgeMsForPush): FCM is designed to wake a
      // backgrounded app, whose foreground heartbeat stopped beating ~120 s after backgrounding — the
      // strict cutoff would wrongly drop that still-online rider from the broadcast audience (Fix 4 /
      // DS13-02). The customer-facing count and the offer gate keep the strict cutoff.
      const nearby = await this.tracking.nearbyRiders(pt.lat, pt.lng, baseBroadcastRadiusM(), heartbeatMaxAgeMsForPush());
      if (nearby.length === 0) return;
      // Claim the recipients in the per-order sent set BEFORE pushing, seeding it for the widening
      // ticks (MatchingService.expandBroadcast) so a later ring never re-pings these riders. null =
      // no Redis / Redis error → push everyone found (the ticks then also can't run — same degrade).
      const ids = nearby.map((r) => r.profileId);
      const claimed = (await this.tracking.claimBroadcastRecipients(orderId, ids)) ?? ids;
      if (claimed.length === 0) return;
      // best-effort, never throws, un-awaited.
      void this.notifications.notifyNewBroadcast(orderId, claimed, { pickup: pt.landmark, fare: meta.proposedFare });
    } catch {
      /* best-effort: a broadcast-push failure never affects the created order */
    }
  }

  /**
   * Supply signal for the "no riders online" state (2·b1): how many online riders are within the same
   * radius the push + board use, so the client can tell "no offers yet, riders were pinged" (calm
   * wait) apart from "there's nobody nearby to ping" (honest empty). With `createdAt` the count is
   * taken at the order's CURRENT widened radius (policy BROADCAST.expansion) — the 15 s snapshot poll
   * passes it so the count grows with the reach; a fresh create counts the base disc. Best-effort — a
   * malformed point returns `null` ("supply unknown") straight away; a geo-query failure instead falls
   * back to the last known-good count (C-O4 serve-stale, below) for up to NEARBY_COUNT_STALE_TTL_MS,
   * and only degrades to `null` once that bound is also exceeded.
   */
  private async countNearbyForPickup(pickup: Prisma.JsonValue, createdAt?: Date): Promise<number | null> {
    try {
      const pt = pickupPoint(pickup);
      if (!pt) return null;
      const radiusM = createdAt ? effectiveBroadcastRadiusM(createdAt) : baseBroadcastRadiusM();
      // Micro-cached (NEARBY_COUNT_TTL_MS, env-overridable) + single-flighted: this runs on EVERY
      // open-auction snapshot poll, and the count is informational — a few seconds of staleness is
      // invisible next to the 15s poll cadence, while dense areas stop fanning identical PostGIS
      // radius queries at the DB. The key buckets coordinates to ~110 m (3 decimals) — noise against
      // a ≥3 km radius — and carries the radius so the policy-widened reach of an ageing auction
      // still gets its own count. C-O4: a loader failure with a still-within-bound count on hand
      // serves that (outcome `stale`) instead of propagating — a poll during a dead zone or a
      // transient PostGIS blip keeps showing the last real supply signal rather than losing it; a
      // COLD failure (nothing cached yet) still propagates to the catch below unchanged.
      // MICRO_CACHE_DISABLED / TTL 0 route straight to the loader (bypasses serve-stale too).
      const ttlMs = this.env?.MICRO_CACHE_TTL_MS_NEARBY_COUNT ?? NEARBY_COUNT_TTL_MS;
      const load = async (): Promise<number> => (await this.tracking.nearbyRiders(pt.lat, pt.lng, radiusM)).length;
      if (this.microCacheBypassed(ttlMs)) return await load();
      const key = `${pt.lat.toFixed(3)},${pt.lng.toFixed(3)}:${radiusM}`;
      const staleTtlMs = this.env?.MICRO_CACHE_STALE_TTL_MS_NEARBY_COUNT ?? NEARBY_COUNT_STALE_TTL_MS;
      return await this.nearbyCountCache.getOrLoad(key, ttlMs, load, { staleTtlMs });
    } catch {
      return null; // supply unknown — never let a geo blip surface a false "no riders online"
    }
  }

  /**
   * Re-announce an already-created open order onto the board (F-01 rider-cancel auto re-broadcast).
   * Reuses the EXACT create() post-commit path: schedule the window expiry, then push to nearby riders
   * + the board. Best-effort and idempotent-safe — it no-ops if the order isn't open_for_offers (e.g.
   * it was picked up or cancelled between the clone and this call). Called after the cancel transaction
   * commits, so a push failure can never affect the terminal state of the order that was cancelled.
   */
  async announceOpenOrder(orderId: string): Promise<void> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        status: true,
        pickup: true,
        dropoff: true,
        itemDesc: true,
        suggestedFare: true,
        proposedFare: true,
        distanceKm: true,
        createdAt: true,
      },
    });
    if (!order || order.status !== "open_for_offers") return;
    // Fire-and-forget, NOT awaited (F-17), exactly like create(): a Redis outage makes queue.add()
    // buffer forever under `maxRetriesPerRequest: null`, so awaiting it would both hang this call and
    // gate the board announce below behind it. reconcileStaleOffers backstops the window transition.
    void this.expiry.schedule(order.id).catch((err) => {
      this.logger.error(`expiry schedule failed for order ${order.id}: ${(err as Error).message}`);
    });
    await this.broadcastToNearbyRiders(order.id, order.pickup, order.dropoff, {
      itemDesc: order.itemDesc,
      suggestedFare: order.suggestedFare.toString(),
      proposedFare: order.proposedFare.toString(),
      distanceKm: order.distanceKm,
      createdAt: order.createdAt.toISOString(),
    });
  }

  /** Fire-and-forget board push, scoped to the pickup's geo cell. Wrapped so a WS failure can never
   *  affect the created order. */
  private safeEmitBoardNewOrder(event: BoardNewOrderEvent, pickupLat: number, pickupLng: number): void {
    try {
      this.gateway.emitBoardNewOrder(event, pickupLat, pickupLng);
    } catch (err) {
      this.logger.warn(`board push failed for order ${event.id}: ${(err as Error).message}`);
    }
  }

  /**
   * Open orders a rider can bid on. With a caller position (lat & lng) the board is scoped to the
   * broadcast-radius neighbourhood and distance-sorted server-side (PostGIS ST_DWithin over the
   * pickup JSON point). Without a position it falls back to the city-wide, newest-first list so
   * the endpoint stays backward-compatible. Either way contactPhone is redacted (§5d reveal window).
   */
  async listOpen(lat?: number, lng?: number, radiusM?: number) {
    if (lat !== undefined && lng !== undefined) {
      return this.listOpenNearby(lat, lng, radiusM ?? baseBroadcastRadiusM());
    }
    const orders = await this.prisma.order.findMany({
      // A-3 (status-keyed-query-audit): the Express bid board is a parcel-only surface — a merchant
      // order's rider comes from C3's dispatch decision, never a rider browsing this board.
      where: { status: "open_for_offers", orderType: "parcel" },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        pickup: true,
        dropoff: true,
        itemDesc: true,
        suggestedFare: true,
        proposedFare: true,
        distanceKm: true,
        createdAt: true,
      },
    });
    return orders.map((o) => ({
      id: o.id,
      // Redact contactPhone — a pre-assignment rider has no business with the customer's/recipient's
      // phone. That's exactly what the OTP-gated §5d reveal window (getSnapshot) controls.
      pickup: publicWaypoint(o.pickup),
      dropoff: publicWaypoint(o.dropoff),
      itemDesc: o.itemDesc,
      suggestedFare: o.suggestedFare.toString(),
      proposedFare: o.proposedFare.toString(),
      distanceKm: o.distanceKm,
      createdAt: o.createdAt.toISOString(),
    }));
  }

  /**
   * Geo-scoped open board: open orders whose pickup is within reach of the caller, nearest-first.
   * "Within reach" is per-order: at least `radiusM` (the rider's own neighbourhood), and wider for an
   * order whose broadcast has expanded (policy BROADCAST.expansion — a rider FCM-pinged at 10 km must
   * find the order on their board to bid). The SQL scans one disc at the schedule's max radius and the
   * per-order age cut is applied in TS on the returned distance; the LIMIT 50 pre-filter is accepted
   * at pilot scale. Filters and sorts directly on the indexed `pickup_geog` generated column (GiST,
   * migration 0006) instead of re-extracting lat/lng from the pickup JSON per row. Rows whose pickup
   * JSON is malformed have a NULL `pickup_geog` and are skipped by the WHERE guard rather than 500-ing
   * the board. Fares are serialized and contactPhone is redacted just like the city-wide path.
   */
  private async listOpenNearby(lat: number, lng: number, radiusM: number) {
    const scanRadiusM = Math.max(radiusM, maxBroadcastRadiusM());
    const rows = await this.prisma.$queryRaw<
      Array<{
        id: string;
        pickup: Prisma.JsonValue;
        dropoff: Prisma.JsonValue;
        item_desc: string;
        suggested_fare: Prisma.Decimal;
        proposed_fare: Prisma.Decimal;
        distance_km: number | null;
        created_at: Date;
        pickup_distance_m: number;
      }>
    >`
      SELECT id,
             pickup,
             dropoff,
             item_desc,
             suggested_fare,
             proposed_fare,
             distance_km,
             created_at,
             ST_Distance(pickup_geog, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography) AS pickup_distance_m
      FROM orders
      WHERE status = 'open_for_offers'
        AND order_type = 'parcel'
        AND pickup_geog IS NOT NULL
        AND ST_DWithin(pickup_geog, ST_SetSRID(ST_MakePoint(${lng}, ${lat}), 4326)::geography, ${scanRadiusM})
      ORDER BY pickup_distance_m ASC
      LIMIT 50`;
    const now = Date.now();
    return rows
      .filter((o) => Number(o.pickup_distance_m) <= Math.max(radiusM, effectiveBroadcastRadiusM(o.created_at, now)))
      .map((o) => ({
        id: o.id,
        pickup: publicWaypoint(o.pickup),
        dropoff: publicWaypoint(o.dropoff),
        itemDesc: o.item_desc,
        suggestedFare: o.suggested_fare.toString(),
        proposedFare: o.proposed_fare.toString(),
        distanceKm: o.distance_km,
        createdAt: o.created_at.toISOString(),
      }));
  }

  /** The rider's current active job (assigned through en_route_dropoff), or null — so they can find
   *  and drive it after assignment or an app restart. Returns the same snapshot shape as getSnapshot. */
  async activeForRider(riderId: string) {
    const order = await this.prisma.order.findFirst({
      where: { riderId, status: { in: ACTIVE_RIDE_STATUSES } },
      orderBy: { updatedAt: "desc" },
      select: { id: true },
    });
    if (order) return this.getSnapshot(order.id, riderId);
    // R8: a job the rider had already COLLECTED but the customer cancelled while the rider's app was
    // backgrounded (the `job:cancelled` push was missed) drops out of the active feed — so on reopen the
    // rider would see "No active job" while still holding the parcel. Surface a recently-cancelled order
    // this rider had collected so the app can render the hand-back state instead of a dead end. Bounded
    // to the last day so an old cancellation never resurfaces.
    const cutoff = new Date(Date.now() - HANDBACK_LOOKBACK_MS);
    // DS16-02: surface the OLDEST still-outstanding hand-back first (`cancelledAt: "asc"`). If the same
    // rider had two collected-then-backgrounded-cancelled parcels inside the lookback window (two missed
    // pushes), ordering newest-first would pin the app on the newer one forever and let the older stuck
    // parcel — a real item the rider is physically holding — silently drop off their radar. Oldest-first
    // gives the longest-outstanding parcel first claim on attention; the app surfaces the next-oldest
    // once the current one is handled (resolution removes it from `status: "cancelled"` candidacy). This
    // still returns a single snapshot (contract unchanged) — it doesn't show two at once, it just stops
    // starving the oldest.
    const handback = await this.prisma.order.findFirst({
      where: { riderId, status: "cancelled", collectedAt: { not: null }, cancelledAt: { gt: cutoff } },
      orderBy: { cancelledAt: "asc" },
      select: { id: true },
    });
    if (handback) return this.getSnapshot(handback.id, riderId);
    return null;
  }

  /** The customer's current live order (the auction or an active ride through `delivered`), or null —
   *  so the app can return them to their tracking screen on a cold start / app-icon reopen instead of a
   *  blank compose form. Mirrors {@link activeForRider}; returns the same snapshot shape as getSnapshot.
   *  Picks the most recently updated when (rarely) more than one is live. */
  async activeForCustomer(customerId: string) {
    const order = await this.prisma.order.findFirst({
      where: { customerId, status: { in: CUSTOMER_ACTIVE_STATUSES } },
      orderBy: { updatedAt: "desc" },
      select: { id: true },
    });
    return order ? this.getSnapshot(order.id, customerId) : null;
  }

  /** EVERY live order the customer is running, newest-updated first — the home screen renders one
   *  LiveOrderCard per running job (design `AppHome`: "one LiveOrderCard per running job, rides and
   *  food alike, newest first"), so unlike {@link activeForCustomer} this must not collapse a food
   *  order + a parcel running side-by-side into a single row. Food orders additionally count while
   *  still with the kitchen (`requested` + a merchantPhase — no dispatch status yet), since a meal
   *  being prepared is a running job to the customer even before a rider exists. Capped at 10: the
   *  home rail is a glanceable stack, not a history. */
  async activeOrdersForCustomer(customerId: string) {
    const orders = await this.prisma.order.findMany({
      where: {
        customerId,
        OR: [{ status: { in: CUSTOMER_ACTIVE_STATUSES } }, { orderType: "merchant", status: "requested" }],
      },
      orderBy: { updatedAt: "desc" },
      take: 10,
      select: { id: true },
    });
    return Promise.all(orders.map((o) => this.getSnapshot(o.id, customerId)));
  }

  /** A caller's order history across both roles (any order where they're the customer or the rider),
   *  newest first — feeds the trip-history screen AND the earnings screen (both share this one cached
   *  fetch client-side). Redacts contactPhone like listOpen and never carries a counterparty phone; only
   *  the counterparty's display name + the rating on the order.
   *
   *  UX-2026-07-15: capped at 50 (was 100) — a metered-data mobile list has no use for "the last 100"
   *  full trip rows on open; 50 still comfortably covers a rider's typical week while roughly halving
   *  the payload. A "load more"/cursor UI is a proportionate follow-up if riders ever need deeper
   *  history, not a reason to keep shipping twice the rows every screen open needs today. */
  async historyForUser(userId: string) {
    const orders = await this.prisma.order.findMany({
      // Only completed trips belong in the Orders/Trips history lists — a `delivered` trip counts as
      // completed even before the customer rates it (COMPLETED_ORDER_STATUSES); drafts and in-flight
      // orders, plus cancelled/expired/undelivered, are excluded. Filtering in SQL (not client-side
      // after the fact) keeps the `take: 50` cap meaningful: 50 completed rows, not 50 recent-of-any-
      // status of which only a handful are completed. Same set `earningsSummary` credits, so the
      // Trips list and the earnings trip-count never disagree.
      where: { AND: [{ OR: [{ customerId: userId }, { riderId: userId }] }, { status: { in: COMPLETED_ORDER_STATUSES } }] },
      orderBy: { createdAt: "desc" },
      take: 50,
      select: {
        id: true,
        orderType: true,
        customerId: true,
        riderId: true,
        pickup: true,
        dropoff: true,
        itemDesc: true,
        note: true,
        proposedFare: true,
        agreedFare: true,
        status: true,
        createdAt: true,
        rating: { select: { score: true, comment: true, byProfileId: true } },
        customer: { select: { firstName: true, lastName: true } },
        rider: { select: { profile: { select: { firstName: true, lastName: true } } } },
        // plan §5 A3: the Orders tab is one cross-service list — a `merchant` row's own title is the
        // restaurant name, not its pickup/dropoff landmarks (those are the kitchen/customer address).
        merchant: { select: { name: true } },
      },
    });
    return orders.map((o) => {
      const isCustomer = o.customerId === userId;
      const counterparty = isCustomer ? o.rider?.profile : o.customer;
      const counterpartyName = counterparty ? `${counterparty.firstName} ${counterparty.lastName}`.trim() || null : null;
      return {
        id: o.id,
        orderType: o.orderType,
        merchantName: o.merchant?.name ?? null,
        role: isCustomer ? "customer" : "rider",
        pickup: publicWaypoint(o.pickup),
        dropoff: publicWaypoint(o.dropoff),
        itemDesc: o.itemDesc,
        // UX-2026-07-16: needed so "Send again" from Trip History can carry the sender's note forward
        // (buildRebroadcastParams), matching what the order-tracking screen's own reorder CTA now does.
        note: o.note,
        proposedFare: o.proposedFare.toString(),
        agreedFare: o.agreedFare ? o.agreedFare.toString() : null,
        status: o.status,
        createdAt: o.createdAt.toISOString(),
        // `rating` is a to-many relation since two-way rating (migration 0015): both the customer's
        // rating of the rider (byProfileId = customerId) AND the rider's rating of the sender
        // (byProfileId = riderId) can be present. The trip row shows the customer→rider score, so pick
        // that direction deterministically instead of an arbitrary `rating[0]`.
        rating: (() => {
          const r = o.rating.find((x) => x.byProfileId === o.customerId);
          return r ? { score: r.score, comment: r.comment } : null;
        })(),
        counterpartyName,
      };
    });
  }

  /** WD-004: the rider's true lifetime earnings total + delivered-trip count, computed with a server-side
   *  aggregate over ALL matching orders — never derived by summing the capped 50-row `historyForUser`
   *  page, which silently understates a rider with more than 50 lifetime orders (across both roles).
   *  `_sum` ignores NULL `agreedFare` rows in SQL (a documented completion anomaly — see
   *  wallet.service.ts's `chargeCommission`), so an anomalous row can't inflate the total either. */
  async earningsSummary(riderId: string): Promise<{ total: string; count: number }> {
    const agg = await this.prisma.order.aggregate({
      where: { riderId, status: { in: COMPLETED_ORDER_STATUSES } },
      _sum: { agreedFare: true },
      _count: { _all: true },
    });
    return { total: (agg._sum.agreedFare ?? new Prisma.Decimal(0)).toString(), count: agg._count._all };
  }

  /**
   * Order snapshot — the REST source of truth the tracking client reads on (re)connect (ET4),
   * carrying status, last rider position, and the append-only event timeline. The counterparty's
   * real phone is revealed only to a party on the order and only inside the reveal window (§5d).
   */
  async getSnapshot(orderId: string, callerId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        id: true,
        status: true,
        orderType: true,
        merchantPhase: true,
        merchantPaymentMethod: true,
        merchant: { select: { name: true } },
        agreedFare: true,
        proposedFare: true,
        customerId: true,
        riderId: true,
        createdAt: true,
        pickup: true,
        dropoff: true,
        items: true,
        note: true,
        itemsCollected: true,
        undeliveredReason: true,
        deliveryAttempts: true,
        deliveryOtpAttempts: true,
        deliveryCodeRotatedAt: true,
        cancelReason: true,
        cancelledBy: true,
        expiryNoSupply: true,
        collectedAt: true,
        pickupPhotoKey: true,
        customer: { select: { phone: true } },
        rider: {
          select: {
            profileId: true,
            currentLat: true,
            currentLng: true,
            positionUpdatedAt: true,
            profile: { select: { phone: true } },
          },
        },
        // Wave-2 payload trim: every OrderEvent writer in the codebase creates {orderId, status} only
        // — lat/lng have never been written non-null, and no client (mobile Stepper/receipt, admin
        // timeline) reads them. Serializing two forever-null fields per event on the hottest response
        // was pure bytes; the DB columns stay (additive schema, nothing dropped).
        events: {
          select: { status: true, createdAt: true },
          orderBy: { createdAt: "asc" },
        },
      },
    });
    if (!order) throw new NotFoundException("Order not found");

    const isCustomer = order.customerId === callerId;
    const isRider = order.riderId === callerId;
    // P2-2: the snapshot carries live rider GPS + pickup/drop-off coordinates + the event timeline, so
    // only a party on the order may read it — not any authenticated caller holding the order id (IDOR).
    if (!isCustomer && !isRider) throw new ForbiddenException("Not your order");
    const revealed = REVEAL.has(order.status);
    // R8: on a cancelled order the assigned rider had already COLLECTED, still reveal the sender's phone
    // to that rider so the reopen hand-back can offer a "call sender". Scoped to the rider on a
    // collected-cancel only — deliberately NOT a broad PHONE_REVEAL_STATUSES change (which would also
    // reveal to the customer and on pre-pickup cancels).
    const handbackReveal = order.status === "cancelled" && isRider && order.collectedAt != null;
    // Only a party on the order, only during the reveal window, sees the other side's phone.
    let counterpartyPhone: string | null = null;
    if (revealed && isCustomer) counterpartyPhone = order.rider?.profile.phone ?? null;
    else if ((revealed || handbackReveal) && isRider) counterpartyPhone = order.customer.phone;

    // The snapshot's side-reads are independent of one another, and this is the hottest read path in
    // the API (polled every 15s per live order + refetched on every WS event) — so they run in
    // PARALLEL rather than as a sequential await chain. Each slot resolves null when its status gate
    // is off; behavior per slot is unchanged from the sequential version it replaces.
    const storage = this.storage; // consts (not `this.`/`order.` members) so the closures below narrow
    const pickupPhotoKey = order.pickupPhotoKey;
    const [rider, ridersNearby, rebroadcastedToId, hadOffers, pickupPhotoUrl] = await Promise.all([
      // Freshest rider position: the live-position index (Redis) leads the PG columns, which only
      // hold the last throttled flush. Fall back to the PG snapshot on a miss / no-Redis.
      (async () => {
        if (!order.rider) return null;
        const live = await this.tracking.getLivePosition(order.rider.profileId);
        return {
          profileId: order.rider.profileId,
          currentLat: live ? live.lat : order.rider.currentLat,
          currentLng: live ? live.lng : order.rider.currentLng,
          // F-02: on a Redis miss use the dedicated position timestamp — NOT `updatedAt` (@updatedAt,
          // bumped by any rider-row write) — so a stale position can't render as live off a fresh stamp.
          updatedAt: live ? new Date(live.at) : order.rider.positionUpdatedAt,
        };
      })(),

      // 2·b1: live supply count while the auction is open, so a 15s poll self-heals a transient "no
      // riders online" the moment a rider comes online. Null on every non-open status (like expiresAt),
      // and best-effort — a geo blip yields null → the client keeps the calm "finding riders" state.
      order.status === "open_for_offers" ? this.countNearbyForPickup(order.pickup, order.createdAt) : null,

      // F-01: if this (cancelled) order was auto re-broadcast after the assigned rider bailed, expose the
      // NEW clone's id so the customer's cancelled terminal can offer a "follow your re-sent request" link.
      // Forward link only — the clone back-links via `rebroadcastOfId`; nothing on the original points at
      // the clone, so resolve it on demand. Scoped to `cancelled` so it's a single extra read on a terminal
      // status, never on the hot live-tracking path.
      order.status === "cancelled"
        ? this.prisma.order
            .findFirst({ where: { rebroadcastOfId: order.id }, select: { id: true } })
            .then((clone) => clone?.id ?? null)
        : null,

      // Fix 1: on an expired order, did any rider ever bid? Offer rows are never deleted on expiry (only
      // flipped to `expired`), so a plain count recovers "riders engaged" on a COLD read into an
      // already-expired order — where the client's live `bidCount` query sees nothing, because it queries
      // only `pending` offers, which no longer exist post-expiry. Lets the expired terminal show honest
      // "riders offered, the window closed" copy instead of "raise your price". Scoped to `expired`
      // (a cheap indexed count); null on every other status. Additive — older clients ignore it.
      order.status === "expired"
        ? this.prisma.offer.count({ where: { orderId: order.id } }).then((n) => n > 0)
        : null,

      // §5c proof-of-pickup: resolve the stored object key to a short-lived signed read URL for BOTH
      // parties — the customer seeing "parcel is with your rider — photo attached" is the whole trust
      // point, and the rider gets their own attach confirmed. Same on-demand minting as the admin KYC
      // review (createReadUrl over the stored key, never a stored URL), and best-effort: a storage blip
      // serves null rather than failing the snapshot the tracker depends on. Micro-cached at 2/3 of the
      // signed TTL so consecutive polls reuse the SAME URL string — that keeps the device's image cache
      // valid across polls (no more re-downloading an identical photo every 15s) and spares a `signBlob`
      // IAM call per poll. A mint failure is not cached: the next poll re-tries.
      pickupPhotoKey && storage
        ? (() => {
            const ttlMs = this.env?.MICRO_CACHE_TTL_MS_PICKUP_PHOTO_URL ?? PICKUP_PHOTO_URL_CACHE_TTL_MS;
            const mint = (): Promise<string> => storage.createReadUrl(pickupPhotoKey, PICKUP_PHOTO_READ_URL_TTL_SECONDS);
            return (this.microCacheBypassed(ttlMs) ? mint() : this.pickupPhotoUrlCache.getOrLoad(pickupPhotoKey, ttlMs, mint)).catch(
              () => null,
            );
          })()
        : null,
    ]);

    return {
      id: order.id,
      status: order.status,
      // D5: lets a generic snapshot (activeForRider / getOrder) tell a food job apart from a parcel
      // one — e.g. so the board/rider job screen can route to the food-specific active-job UI instead
      // of rendering the parcel flow against merchant-order fields that don't exist on this shape.
      orderType: order.orderType,
      // RC.home / RC.orders alignment: a food job's customer-recognizable headline is the RESTAURANT
      // (its pickup/dropoff landmarks are the kitchen/customer address), and the design's home card
      // meta is payment + total ("Cash at the door · $15.50"). All three are null on parcel orders,
      // additive for old clients. merchantPhase drives the food 7-step progress strip's two
      // pre-dispatch steps (see mobile foodCustomerStepIndex).
      merchantName: order.merchant?.name ?? null,
      merchantPhase: order.merchantPhase ?? null,
      merchantPaymentMethod: order.merchantPaymentMethod ?? null,
      // Which party is looking — derived from the same customer/rider check that gates this snapshot
      // above (never a new auth path). Lets the tracking screen voice customer-only copy correctly for
      // a rider viewing their own trip (rating card, cancel-blame line, counterparty-phone label).
      viewerRole: isRider ? ("rider" as const) : ("customer" as const),
      agreedFare: order.agreedFare,
      proposedFare: order.proposedFare,
      // Map context for the tracker — point + landmark. The assigned rider additionally gets the
      // waypoint contactPhones inside the reveal window (E1: they call the sender/recipient at the
      // doors); everyone else, and every listing path, stays redacted.
      pickup: revealed && isRider ? riderWaypoint(order.pickup) : publicWaypoint(order.pickup),
      dropoff: revealed && isRider ? riderWaypoint(order.dropoff) : publicWaypoint(order.dropoff),
      // Full line-items for the tracker + assigned-rider job view; null on pre-0008 rows (the
      // client falls back to nothing). Listing paths deliberately stay on the itemDesc summary
      // (data budget); no PII lives in items.
      items: (order.items as OrderItem[] | null) ?? null,
      // The sender's note for the rider ("ask for Rita at reception") — parties on the order only;
      // listing paths stay on the itemDesc summary and never carry it.
      note: order.note,
      // Per-item pickup confirmation, so the rider's checklist state survives a reconnect/refetch.
      itemsCollected: (order.itemsCollected as number[] | null) ?? null,
      // §5c proof-of-pickup photo as a viewable (signed, short-lived) URL — null when no photo was
      // attached, on a storage blip, or on every pre-0022 row. Additive: old clients ignore it.
      pickupPhotoUrl,
      // C6: the failed-hand-off reason + attempt count, shown verbatim on the customer's terminal
      // screen. Null until the order is `undelivered`.
      undeliveredReason: order.undeliveredReason,
      undeliveredAttempts: order.deliveryAttempts,
      // R9/07-11: the rider's delivery-code attempt count, so the app can resync its lockout state from
      // the server instead of a purely local counter — a customer re-issuing the code resets this to 0
      // server-side (order-lifecycle.service.ts rotateDeliveryCode) with no other way for the rider's
      // screen to learn that and clear its own lockout.
      deliveryOtpAttempts: order.deliveryOtpAttempts,
      // KB-DELIVERY-CODE-ROTATION-SIGNAL: when the delivery code was last (re)issued (ISO string, or
      // null on a pre-0026 row / an order never assigned a code). The rider app compares this across
      // snapshots to detect a rotation (customer re-issued after a lockout) robustly — even across an
      // app-kill that the DS14-09 attempts-counter high-water mark can't survive. Same party gating as
      // deliveryOtpAttempts: the whole snapshot is already scoped to the order's own customer/rider above.
      codeRotatedAt: order.deliveryCodeRotatedAt ? order.deliveryCodeRotatedAt.toISOString() : null,
      // 3·b3: the recorded cancel reason + who cancelled, shown on the cancelled terminal. The DB
      // stores the canceller's profile id; the wire carries only their role (no id leak). An admin
      // cancel's actor id matches neither party, so it correctly falls through to null (the terminal
      // renders neutral "This order is cancelled" copy) instead of defaulting to "rider" — a rider who
      // never touched this order shouldn't be blamed for an ops-initiated cancel (mirrors the same
      // three-way check already used in admin-orders.service.ts's list projection).
      cancelReason: order.status === "cancelled" ? customerSafeCancelReason(order.cancelReason) : null,
      cancelledBy:
        order.status === "cancelled" && order.cancelledBy
          ? order.cancelledBy === order.customerId
            ? ("customer" as const)
            : order.cancelledBy === order.riderId
              ? ("rider" as const)
              : null
          : null,
      // F-01: on a rider-bail cancel, the id of the fresh clone the job was re-broadcast to (else null),
      // so the cancelled terminal can link the customer forward to the re-sent request.
      rebroadcastedToId,
      // UX-2026-07-12 #11: on a no-supply expiry (zero bids AND nobody online near pickup), so the
      // expired terminal can pick the honest "no riders were online" copy over "nudge the price up".
      // Scoped to `expired`; null on every other status and on a normal (had-supply) expiry.
      expiryNoSupply: order.status === "expired" ? (order.expiryNoSupply ?? null) : null,
      // Fix 1: whether any rider bid on this (expired) order, for the honest expired-terminal copy on a
      // cold start. Null on every non-expired status. See the `hadOffers` computation above.
      hadOffers,
      rider,
      // A-O5: deduped to one row per status (earliest occurrence) — see {@link dedupeEventsByStatus}.
      events: dedupeEventsByStatus(order.events),
      counterpartyPhone,
      // Auction countdown: present only while the order is still open for offers.
      expiresAt:
        order.status === "open_for_offers"
          ? new Date(order.createdAt.getTime() + OFFER_WINDOW_MS).toISOString()
          : null,
      // 2·b1 supply signal: online riders nearby while open (null otherwise / on a geo miss).
      ridersNearby,
    };
  }
}
