import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  type OnModuleDestroy,
  type OnModuleInit,
  Optional,
  UnauthorizedException,
} from "@nestjs/common";
import { CUSTOMER_CANCELLABLE_STATUSES, customerRatingCarriesWeight, DELIVERY_OTP_MAX_ATTEMPTS, HeldReason, RELIABILITY, RIDER_CANCELLABLE_STATUSES, RIDER_STRIKE_COOLDOWN_MS, UNDELIVERED_ABUSE } from "@lynia/shared";
import { type OrderStatus, Prisma } from "@prisma/client";
import { applyReliabilityDelta, shouldFlagUndeliveredVelocity, undeliveredPenalty } from "../riders/reliability";
import { Queue, Worker } from "bullmq";
import { TokenService } from "../auth/token.service";
import { ENV } from "../config/config.module";
import type { Env } from "../config/env";
import { NotificationsService } from "../notifications/notifications.service";
import { OrdersService } from "./orders.service";
import { PrismaService } from "../prisma/prisma.service";
import { STORAGE, type StorageAdapter } from "../adapters/storage/storage.interface";
import { TrackingGateway } from "../tracking/tracking.gateway";
import { WalletService } from "../wallet/wallet.service";

/** Forward, rider-driven transitions. `delivered` (OTP-gated) and `completed` (rating/auto-close)
 *  are handled by their own methods, not this map. Each edge stamps one milestone timestamp. */
const FORWARD = {
  confirmed: { from: "assigned", stamp: "confirmedAt" },
  en_route_pickup: { from: "confirmed", stamp: "pickupStartedAt" },
  picked_up: { from: "en_route_pickup", stamp: "collectedAt" },
  en_route_dropoff: { from: "picked_up", stamp: undefined },
} as const;

/** Cancellation matrix (INTERFACE-AUDIT C3), server-enforced. Customer: any live status (pre- OR
 *  post-pickup). Rider: ONLY up to arrival at pickup — blocked from `picked_up` onward (the parcel is
 *  on the bike; a post-pickup failure is an `undelivered(breakdown)`, not a cancel). Both sets are the
 *  shared source of truth the clients import for the cancel affordance. */
const CUSTOMER_CANCELLABLE = new Set<string>(CUSTOMER_CANCELLABLE_STATUSES);
const RIDER_CANCELLABLE = new Set<string>(RIDER_CANCELLABLE_STATUSES);
/** A hand-off can only FAIL after the parcel is collected (C6/F-02): picked_up or en_route_dropoff. */
const POST_PICKUP_FOR_UNDELIVERED = new Set<string>(["picked_up", "en_route_dropoff"]);
/** The pickup-photo attach window (§5c "Mark collected (+ pickup photo)"): at the pickup, or just
 *  collected. Wider than the checklist's en_route_pickup-only gate on purpose — the photo is optional
 *  and must never delay the collect, so an upload still in flight when the rider taps "Confirm
 *  collected" can land after the advance to picked_up instead of 409ing into the void. Typed as the
 *  Prisma enum (not a Set<string>) because the CAS `where` reuses it verbatim. */
const PICKUP_PHOTO_STATUSES: readonly OrderStatus[] = ["en_route_pickup", "picked_up"];
/** KB-POD-DISPUTE Phase A — the proof-of-drop attach window: at the door before giving up
 *  (en_route_dropoff) OR just after marking the hand-off failed (undelivered), so a rider can attach
 *  evidence either while disputing or right after. Optional, never gates a status. Typed as the Prisma
 *  enum because the CAS `where` reuses it verbatim. */
const DELIVERY_PROOF_STATUSES: readonly OrderStatus[] = ["en_route_dropoff", "undelivered"];
/** Repeated rider cancels earn a cooldown that blocks going online (T4 no-show penalty). */
const CANCEL_STRIKE_LIMIT = 3;
// DS20-03: the cooldown duration is the shared RIDER_STRIKE_COOLDOWN_MS (policy.ts) — the same value
// the dispute-strike path in issues.service uses, both writing `riders.cooldownUntil`. Sourced from one
// constant so the two axes can't drift into a silent-truncation bug.
/** How long after delivery a customer has to rate before the order auto-closes (so completion
 *  metrics never stall on an un-rated order — D6a / T3). Pilot value; tune on real behaviour. */
export const RATING_WINDOW_MS = 6 * 60 * 60 * 1000;
/** How often the DB reconciler sweeps for orphaned delivered orders (Redis-independent backstop). */
const RECONCILE_INTERVAL_MS = 15 * 60 * 1000;
const QUEUE_NAME = "rating-autoclose";

type ForwardStatus = keyof typeof FORWARD;
export interface LifecycleResult {
  orderId: string;
  status: string;
}
export interface CancelResult {
  orderId: string;
  status: "cancelled";
  cancelledBy: "customer" | "rider";
  cooldownUntil: Date | null;
}

/** Plain ioredis options so BullMQ owns its connections (mirrors offer-expiry.service.ts). */
function connectionFromUrl(url: string) {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: u.port ? Number(u.port) : 6379,
    username: u.username || undefined,
    password: u.password || undefined,
    maxRetriesPerRequest: null,
  };
}

/**
 * The post-assignment delivery lifecycle (CONCEPT §5 tracker). Every transition is a guarded CAS
 * mirroring MatchingService.selectOffer: it flips the order only from the expected prior state and
 * only for the assigned rider, so concurrent/duplicate calls can never skip or repeat a step.
 */
@Injectable()
export class OrderLifecycleService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(OrderLifecycleService.name);
  private queue?: Queue;
  private worker?: Worker;

  constructor(
    @Inject(ENV) private readonly env: Env,
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    private readonly gateway: TrackingGateway,
    private readonly notifications: NotificationsService,
    private readonly orders: OrdersService,
    private readonly wallet: WalletService,
    // DS18-03: needed to purge a photo object superseded by a retake. @Optional so the unit harness (and
    // any trimmed module) can construct the service without wiring StorageModule; a missing adapter just
    // no-ops the best-effort cleanup. StorageModule is @Global in the app, so it's injected in production.
    @Optional() @Inject(STORAGE) private readonly storage?: StorageAdapter,
  ) {}

  private sweep?: ReturnType<typeof setInterval>;

  /** DS18-03: best-effort purge of a GCS object a retake superseded — a delete failure must never fail the
   *  attach it runs behind (mirrors the erasure GCS purge). deleteObject is itself best-effort by contract
   *  (a missing object is success); the try/catch is belt-and-braces so a transient error can't bubble. */
  private async deleteSupersededObject(key: string): Promise<void> {
    try {
      await this.storage?.deleteObject(key);
    } catch (err) {
      this.logger.warn(`superseded photo delete failed for ${key}: ${(err as Error).message}`);
    }
  }

  onModuleInit(): void {
    const url = this.env.REDIS_URL;
    if (url) {
      const connection = connectionFromUrl(url);
      this.queue = new Queue(QUEUE_NAME, { connection });
      this.worker = new Worker(QUEUE_NAME, async (job) => this.completeOrder(job.data.orderId as string), {
        connection,
      });
      this.worker.on("failed", (job, err) =>
        this.logger.error(`auto-close job ${job?.id ?? "?"} failed: ${err.message}`),
      );
      // DS-02: attach an EventEmitter `error` listener on both the queue and worker. Without it, a
      // Redis connection error (BullMQ re-emits ioredis errors as `error`) is an unhandled EventEmitter
      // event → synchronous throw → uncaughtException → the instance exits on a Redis blip. Log and keep
      // serving; the reconcileStaleDeliveries backstop closes orders while Redis is unavailable.
      this.queue.on("error", (err) => this.logger.error(`auto-close queue error: ${err.message}`));
      this.worker.on("error", (err) => this.logger.error(`auto-close worker error: ${err.message}`));
      this.logger.log("Rating auto-close worker started");
    } else {
      this.logger.warn("REDIS_URL not set — relying on the DB reconciler to auto-close delivered orders");
    }

    // DB-driven reconciler (does NOT depend on Redis). Closes any delivered order past the rating
    // window even if the per-order job was never enqueued or was lost — the self-healing backstop
    // for a crash between commit and schedule, or a Redis outage. Runs at boot and on an interval.
    void this.reconcileStaleDeliveries();
    this.sweep = setInterval(() => void this.reconcileStaleDeliveries(), RECONCILE_INTERVAL_MS);
    this.sweep.unref?.();
  }

  async onModuleDestroy(): Promise<void> {
    if (this.sweep) clearInterval(this.sweep);
    await this.worker?.close();
    await this.queue?.close();
  }

  /** Close every delivered-but-unrated order older than the rating window. Idempotent via completeOrder. */
  async reconcileStaleDeliveries(): Promise<{ closed: number }> {
    let closed = 0;
    // Fire-and-forget from onModuleInit (boot + interval), so the WHOLE body — the findMany included,
    // not just the per-order loop — must be guarded (F-12): an un-caught rejection here escapes the
    // `void` call site and, with no unhandledRejection handler, crashes the process fleet-wide. Mirrors
    // the tracking.gateway disconnect-flush guard. On a top-level failure we log and fall through to the
    // zero result, keeping the { closed } return-shape contract intact.
    try {
      const cutoff = new Date(Date.now() - RATING_WINDOW_MS);
      const stale = await this.prisma.order.findMany({
        where: { status: "delivered", deliveredAt: { lt: cutoff } },
        select: { id: true },
        take: 500,
      });
      for (const o of stale) {
        try {
          if ((await this.completeOrder(o.id)).completed) closed++;
        } catch (err) {
          this.logger.error(`reconcile failed for order ${o.id}: ${(err as Error).message}`);
        }
      }
      if (closed > 0) this.logger.log(`Reconciler auto-closed ${closed} stale delivered order(s)`);
    } catch (err) {
      this.logger.error(`reconcileStaleDeliveries sweep failed: ${(err as Error).message}`);
    }
    return { closed };
  }

  /** Best-effort live status push (ET4): the WS fan-out for an open tracking screen, plus an FCM push
   *  for whoever isn't looking. Both are fire-and-forget — neither can fail a committed transition. */
  private safeEmit(orderId: string, status: string): void {
    try {
      this.gateway.emitOrderStatus(orderId, status);
    } catch (err) {
      this.logger.warn(`status emit failed for order ${orderId}: ${(err as Error).message}`);
    }
    void this.notifications.notifyOrderStatus(orderId, status);
  }

  /** Take a row lock on the rider before a read-modify-write of its aggregate columns (reliability
   *  score, rating average/count, trips, cancel strikes). These updates compute absolute values in JS
   *  from a prior read, so under READ COMMITTED two concurrent order transitions for the same rider
   *  (e.g. a delivered order being rated while the rider cancels a freshly-assigned one) would each
   *  read the same stale row and the second write would clobber the first. Locking serialises them.
   *  Every caller CASes the order row first, so the lock order is always order→rider (no deadlock). */
  private async lockRiderRow(tx: Prisma.TransactionClient, profileId: string): Promise<void> {
    await tx.$executeRaw`SELECT 1 FROM riders WHERE profile_id = ${profileId}::uuid FOR UPDATE`;
  }

  /** Rider advances the trip one forward step (the non-OTP, non-completion edges). */
  async advance(orderId: string, riderId: string, to: ForwardStatus): Promise<LifecycleResult> {
    const edge = FORWARD[to];
    if (!edge) throw new ConflictException("Unsupported transition");

    await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: orderId },
        select: { status: true, riderId: true },
      });
      if (!order) throw new NotFoundException("Order not found");
      if (order.riderId !== riderId) throw new ForbiddenException("Not the assigned rider");
      if (order.status !== edge.from) throw new ConflictException(`Order is not ${edge.from}`);

      const now = new Date();
      // Single typed object — undefined timestamp fields are ignored by Prisma (no union/XOR friction).
      const data = {
        status: to,
        confirmedAt: edge.stamp === "confirmedAt" ? now : undefined,
        pickupStartedAt: edge.stamp === "pickupStartedAt" ? now : undefined,
        collectedAt: edge.stamp === "collectedAt" ? now : undefined,
      };
      // CAS guard — first writer wins even under a concurrent duplicate tap.
      const claimed = await tx.order.updateMany({ where: { id: orderId, status: edge.from }, data });
      if (claimed.count === 0) throw new ConflictException("Order changed, retry");
      await tx.orderEvent.create({ data: { orderId, status: to } });
    });

    this.safeEmit(orderId, to);
    return { orderId, status: to };
  }

  /** Rider ticks off the sender's items at pickup before riding on (rider "pickup item
   *  verification"). Persists which line-item indexes were physically collected; does NOT advance the
   *  status (the rider's next tap runs `advance` to `picked_up`). Guarded to the assigned rider and
   *  allowed only at `en_route_pickup` (at the pickup, before collection). */
  async confirmItems(
    orderId: string,
    riderId: string,
    confirmedIndexes: number[],
  ): Promise<{ orderId: string; confirmedIndexes: number[] }> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { status: true, riderId: true, items: true },
    });
    if (!order) throw new NotFoundException("Order not found");
    if (order.riderId !== riderId) throw new ForbiddenException("Not the assigned rider");
    if (order.status !== "en_route_pickup") {
      throw new ConflictException("Items can only be confirmed at the pickup");
    }
    // De-dupe + sort, and bound to the order's actual item count so a stale/oversized index (the
    // contract allows 0–9) can't persist a phantom row the checklist would render.
    const itemCount = Array.isArray(order.items) ? order.items.length : 0;
    const indexes = [...new Set(confirmedIndexes)].filter((i) => i < itemCount).sort((a, b) => a - b);
    // CAS guard — a concurrent `advance` to picked_up between the read above and this write must not
    // let a stale confirmItems call persist onto the now-later status.
    const claimed = await this.prisma.order.updateMany({
      where: { id: orderId, status: "en_route_pickup" },
      data: { itemsCollected: indexes as unknown as Prisma.InputJsonValue },
    });
    if (claimed.count === 0) throw new ConflictException("Order changed, retry");
    return { orderId, confirmedIndexes: indexes };
  }

  /** Rider attaches the optional proof-of-pickup photo (§5c "parcel is with your rider — photo
   *  attached"). `key` is the object key from POST /uploads/pickup-photo after the signed PUT; the
   *  snapshot mints a read URL from it for BOTH parties. Guarded to the assigned rider and to the
   *  attach window ({@link PICKUP_PHOTO_STATUSES}); does NOT advance the status. Idempotent by
   *  design — re-attaching simply replaces the key (a retake wins, no duplicate-photo state). */
  async attachPickupPhoto(
    orderId: string,
    riderId: string,
    key: string,
  ): Promise<{ orderId: string; pickupPhotoKey: string }> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { status: true, riderId: true, pickupPhotoKey: true },
    });
    if (!order) throw new NotFoundException("Order not found");
    if (order.riderId !== riderId) throw new ForbiddenException("Not the assigned rider");
    if (!PICKUP_PHOTO_STATUSES.includes(order.status)) {
      throw new ConflictException("A pickup photo can only be added while collecting the parcel");
    }
    // The key must live under this caller's own pickup namespace — POST /uploads/pickup-photo mints
    // keys as `pickup/<callerId>/<uuid>` — so a rider can't persist a key that points at another
    // user's object (mirrors the becomeRider KYC-key guard in rider.service.ts).
    if (!key.startsWith(`pickup/${riderId}/`)) {
      throw new BadRequestException("Invalid photo key");
    }
    // CAS on the attach window — a concurrent advance past picked_up (or a cancel) between the read
    // above and this write must not let a stale attach land on the now-later status.
    const claimed = await this.prisma.order.updateMany({
      where: { id: orderId, status: { in: [...PICKUP_PHOTO_STATUSES] } },
      data: { pickupPhotoKey: key },
    });
    if (claimed.count === 0) throw new ConflictException("Order changed, retry");
    // DS18-03: a retake just overwrote the DB pointer to a NEW object. The PREVIOUS object would otherwise
    // orphan in GCS forever — no DB pointer is left for the right-to-erasure purge to find it (a residual
    // leak). Best-effort delete of the superseded object, post-CAS; never fails the attach.
    if (order.pickupPhotoKey && order.pickupPhotoKey !== key) {
      await this.deleteSupersededObject(order.pickupPhotoKey);
    }
    return { orderId, pickupPhotoKey: key };
  }

  /**
   * KB-POD-DISPUTE Phase A — rider attaches proof-of-drop evidence when a hand-off is disputed (recipient
   * took the goods but withheld the delivery code). Records the photo key + the rider's GPS + a
   * server-stamped time, so the admin order-detail can surface real evidence for a Phase-B adjudicated
   * "delivered — code bypass" decision. Optional and additive: it NEVER advances or gates a status — a
   * rider can still `markUndelivered` with or without it. Party-gated to the assigned rider, scoped to the
   * attach window ({@link DELIVERY_PROOF_STATUSES}), and the key must sit under the caller's own
   * `delivery-proof/<riderId>/` namespace (mirrors attachPickupPhoto). Idempotent — a retake replaces.
   */
  async attachDeliveryProof(
    orderId: string,
    riderId: string,
    key: string,
    lat?: number,
    lng?: number,
  ): Promise<{ orderId: string; deliveryProofKey: string }> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { status: true, riderId: true, deliveryProofKey: true },
    });
    if (!order) throw new NotFoundException("Order not found");
    if (order.riderId !== riderId) throw new ForbiddenException("Not the assigned rider");
    if (!DELIVERY_PROOF_STATUSES.includes(order.status)) {
      throw new ConflictException("Proof of drop-off can only be added at the door or right after marking it undelivered");
    }
    if (!key.startsWith(`delivery-proof/${riderId}/`)) {
      throw new BadRequestException("Invalid photo key");
    }
    // CAS on the attach window so a concurrent transition (e.g. the customer cancels, or the rider
    // confirms delivery) between the read and this write can't land a stale proof on a now-terminal order.
    const claimed = await this.prisma.order.updateMany({
      where: { id: orderId, status: { in: [...DELIVERY_PROOF_STATUSES] } },
      data: {
        deliveryProofKey: key,
        deliveryProofLat: lat ?? null,
        deliveryProofLng: lng ?? null,
        deliveryProofAt: new Date(),
      },
    });
    if (claimed.count === 0) throw new ConflictException("Order changed, retry");
    // DS18-03: same retake-orphan cleanup as attachPickupPhoto — purge the object the previous key pointed
    // at, so a replaced proof photo doesn't become permanently unreachable by the erasure purge.
    if (order.deliveryProofKey && order.deliveryProofKey !== key) {
      await this.deleteSupersededObject(order.deliveryProofKey);
    }
    return { orderId, deliveryProofKey: key };
  }

  /** Rider confirms the handover with the recipient's delivery code → `delivered`. */
  async confirmDelivery(orderId: string, riderId: string, code: string): Promise<LifecycleResult> {
    // Serialize attempts with a row lock so the count gate, the otp compare, and the increment are
    // point-in-time consistent: no concurrent-guess bypass of the 5-attempt cap, and no rotate race
    // (a rotate must wait for the lock). The wrong-code increment is RETURNED (committed), not
    // thrown, so it persists; only the error cases (which have nothing to persist) roll back.
    const expectedHash = this.tokens.hash(code);
    const outcome = await this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<
        Array<{ status: string; rider_id: string | null; otp_hash: string | null; delivery_otp_attempts: number }>
      >`SELECT status, rider_id, otp_hash, delivery_otp_attempts FROM orders WHERE id = ${orderId}::uuid FOR UPDATE`;
      const o = rows[0];
      if (!o) throw new NotFoundException("Order not found");
      if (o.rider_id !== riderId) throw new ForbiddenException("Not the assigned rider");
      if (o.status !== "en_route_dropoff") throw new ConflictException("Order is not ready for delivery");
      if (o.delivery_otp_attempts >= DELIVERY_OTP_MAX_ATTEMPTS) {
        throw new ForbiddenException("Too many attempts — ask the customer to re-issue the code");
      }

      const ok = !!o.otp_hash && this.tokens.safeEqualHex(expectedHash, o.otp_hash);
      if (!ok) {
        await tx.order.update({ where: { id: orderId }, data: { deliveryOtpAttempts: { increment: 1 } } });
        // Committed count AFTER this failure — the 401 message tells the rider how many tries remain
        // before the lockout (rider-journey 4·b1 "That code doesn't match. N attempts left.").
        return { ok: false as const, attemptsUsed: o.delivery_otp_attempts + 1 };
      }
      // Row is locked and validated en_route_dropoff — safe to flip directly.
      await tx.order.update({ where: { id: orderId }, data: { status: "delivered", deliveredAt: new Date() } });
      await tx.orderEvent.create({ data: { orderId, status: "delivered" } });
      return { ok: true as const };
    });

    if (!outcome.ok) {
      const remaining = Math.max(0, DELIVERY_OTP_MAX_ATTEMPTS - outcome.attemptsUsed);
      throw new UnauthorizedException(
        remaining > 0
          ? `That code doesn't match. ${remaining} attempt${remaining === 1 ? "" : "s"} left.`
          : "That code doesn't match — no attempts left. Ask the customer to re-issue the code.",
      );
    }
    this.safeEmit(orderId, "delivered");
    // Fire-and-forget, NOT awaited (F-17): the `delivered` row has already committed, and with ioredis
    // `maxRetriesPerRequest: null` a Redis outage makes queue.add() buffer forever — awaiting it would
    // hang the confirm-delivery response the rider is waiting on. reconcileStaleDeliveries already
    // backstops the auto-close off the DB even when this enqueue never lands. A .catch keeps a rejected
    // enqueue from surfacing as an unhandledRejection.
    void this.scheduleAutoClose(orderId).catch((err) => {
      this.logger.error(`scheduleAutoClose failed for order ${orderId}: ${(err as Error).message}`);
    });
    return { orderId, status: "delivered" };
  }

  /**
   * Rider marks a hand-off as failed → terminal `undelivered` (INTERFACE-AUDIT C6 / F-02). Allowed
   * ONLY post-pickup (picked_up / en_route_dropoff) and only for the assigned rider — a guarded CAS
   * like every other transition. The reason enum + timestamp are persisted and shown verbatim to the
   * customer; `undelivered` is terminal and not an active-ride status, so it frees the rider for the
   * next job exactly like `delivered`/`cancelled`. The customer's phone-reveal survives (undelivered
   * ∈ PHONE_REVEAL_STATUSES) so the "call the rider" action stays live on the terminal screen.
   */
  async markUndelivered(
    orderId: string,
    riderId: string,
    reason: string,
  ): Promise<{ orderId: string; status: "undelivered" }> {
    // Set when an automated hold is newly applied below, so we can pull the rider out of the live geo
    // index after commit (the same eviction setOnline(false) does) — see the isOnline:false note there.
    let newlyHeldRiderId: string | null = null;
    await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: orderId },
        select: { status: true, riderId: true },
      });
      if (!order) throw new NotFoundException("Order not found");
      if (order.riderId !== riderId) throw new ForbiddenException("Not the assigned rider");
      if (!POST_PICKUP_FOR_UNDELIVERED.has(order.status)) {
        throw new ConflictException("A hand-off can only fail after the parcel is picked up");
      }

      const claimed = await tx.order.updateMany({
        where: { id: orderId, status: order.status },
        data: {
          status: "undelivered",
          undeliveredReason: reason,
          undeliveredAt: new Date(),
          // Record the failed hand-off attempt that led the rider to give up, so the customer's
          // terminal shows a real count (C6 "recipient unreachable · N attempts") instead of a
          // hardcoded 0. markUndelivered is the single guarded "gave up" edge (CAS to undelivered,
          // fires at most once), so this is the one place the attempt becomes durable.
          deliveryAttempts: { increment: 1 },
        },
      });
      if (claimed.count === 0) throw new ConflictException("Order changed, retry");
      await tx.orderEvent.create({ data: { orderId, status: "undelivered" } });

      // Reliability (Q2): a failed hand-off dings the rider only when it's their fault — `breakdown`
      // (post-pickup bail) → postPickupCancel, `unreachable` (recipient no-show) → noShow; `refused`
      // / `wrong_address` are recipient/customer faults → no hit. NOTE(Q2): weights in policy.ts.
      // Same transaction as the undelivered CAS.
      const penalty = undeliveredPenalty(reason);
      if (order.riderId) {
        await this.lockRiderRow(tx, order.riderId);
        const rider = await tx.rider.findUnique({
          where: { profileId: order.riderId },
          select: { reliabilityScore: true, onHold: true, heldReason: true },
        });
        if (rider) {
          // FRAUD P0-3 velocity guard: `refused`/`wrong_address` carry no score penalty, so a rider
          // could serially abandon/keep parcels for free. We don't punish the one-off (the counts
          // include THIS undelivered, already written above), but auto-`on_hold` a rider whose recent
          // undelivered RATE is abnormally high for a human to review — independent of the score, so it
          // holds even when the penalty is 0. Both counts read inside the same locked tx.
          const windowStart = new Date(Date.now() - UNDELIVERED_ABUSE.windowDays * 86_400_000);
          const undeliveredCount = await tx.order.count({
            where: { riderId: order.riderId, status: "undelivered", undeliveredAt: { gte: windowStart } },
          });
          const completedCount = await tx.order.count({
            where: { riderId: order.riderId, status: "completed", completedAt: { gte: windowStart } },
          });
          const velocityHold = shouldFlagUndeliveredVelocity(undeliveredCount, completedCount);
          const next = applyReliabilityDelta({ ...rider, heldReason: rider.heldReason as HeldReason }, -penalty); // penalty may be 0 → score unchanged
          const onHold = next.onHold || velocityHold;
          // RH-01: a velocity trip stamps `velocity` (a fraud hold the score hysteresis must never
          // clear); otherwise persist whatever applyReliabilityDelta computed (which itself preserves an
          // already-set velocity hold through a recovery/dead-band).
          const heldReason: HeldReason = velocityHold ? HeldReason.VELOCITY : next.heldReason;
          // BR-01: an automated hold must also pull the rider offline — the admin suspend/ban paths
          // (admin-riders.service) flip isOnline:false in the same write so a held rider actually leaves
          // the live-supply plane; a hold that left isOnline:true relied solely on the nearbyRiders query
          // filter. Force offline the moment the hold is newly applied and evict from geo after commit.
          const newlyHeld = onHold && !rider.onHold;
          if (
            next.reliabilityScore !== rider.reliabilityScore ||
            onHold !== rider.onHold ||
            heldReason !== rider.heldReason
          ) {
            await tx.rider.update({
              where: { profileId: order.riderId },
              data: {
                reliabilityScore: next.reliabilityScore,
                onHold,
                heldReason,
                ...(newlyHeld ? { isOnline: false } : {}),
              },
            });
          }
          if (newlyHeld) newlyHeldRiderId = order.riderId;
          if (velocityHold && !rider.onHold) {
            this.logger.warn(
              `Rider ${order.riderId} auto-held for review: ${undeliveredCount} undelivered / ${completedCount} completed in ${UNDELIVERED_ABUSE.windowDays}d (FRAUD P0-3 velocity)`,
            );
          }
        }
      }
    });

    // Best-effort, post-commit: evict a newly auto-held rider from the Redis geo index (mirrors
    // setOnline(false)). PG's is_online — now false — is the authority for nearbyRiders, so a missed
    // eviction is harmless; this just stops the held rider lingering in a GEOSEARCH result until the
    // key TTLs. Never allowed to affect the committed undelivered transition.
    if (newlyHeldRiderId) {
      void this.gateway.evictRiderFromGeo(newlyHeldRiderId).catch((err) => {
        this.logger.warn(`geo eviction after auto-hold failed for ${newlyHeldRiderId}: ${(err as Error).message}`);
      });
      // KB-BOARD-REVOKE: an auto-held rider is no longer board-eligible (offers.service gates on
      // standing), so also kick their live socket(s) off the board rooms — otherwise they keep getting
      // board:new-order / bid:expired pushes for jobs they can no longer bid on until they disconnect.
      // Best-effort, mirrors the geo eviction; never affects the committed undelivered transition.
      void this.gateway.kickRiderFromBoard(newlyHeldRiderId).catch((err) => {
        this.logger.warn(`board kick after auto-hold failed for ${newlyHeldRiderId}: ${(err as Error).message}`);
      });
    }
    this.safeEmit(orderId, "undelivered");
    return { orderId, status: "undelivered" };
  }

  /** Customer rates the rider after delivery; this closes the order and updates the rider's score. */
  async rate(orderId: string, customerId: string, score: number, comment?: string): Promise<LifecycleResult> {
    // DS19-01: set when a low rating's reliability penalty NEWLY trips the hold below, so we can evict the
    // rider from the live-supply planes after commit — the same standing demotion markUndelivered's
    // velocity hold and cancel()'s strike limit perform (see the newlyHeld note at the rider.update below).
    let newlyHeldRiderId: string | null = null;
    await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: orderId },
        select: { status: true, customerId: true, riderId: true, agreedFare: true, suggestedFare: true },
      });
      if (!order) throw new NotFoundException("Order not found");
      if (order.customerId !== customerId) throw new ForbiddenException("Not your order");
      if (order.status !== "delivered") throw new ConflictException("Order is not awaiting a rating");

      const claimed = await tx.order.updateMany({
        where: { id: orderId, status: "delivered", customerId },
        data: { status: "completed", completedAt: new Date() },
      });
      if (claimed.count === 0) throw new ConflictException("Order already completed");

      // WD-005: re-read agreedFare now that the CAS update above holds the row lock for the rest of
      // this transaction — the pre-CAS read at the top of this method (order.agreedFare) isn't part of
      // the CAS predicate, so a concurrent admin fare-adjust landing between that read and this CAS
      // would otherwise let chargeCommission below debit commission on a fare the order no longer has.
      // Mirrors the safe read-after-CAS ordering completeOrder() already uses for the same debit.
      const lockedOrder = await tx.order.findUnique({ where: { id: orderId }, select: { agreedFare: true } });
      const agreedFare = lockedOrder?.agreedFare ?? order.agreedFare;

      await tx.rating.create({ data: { orderId, byProfileId: customerId, score, comment: comment ?? null } });
      await tx.orderEvent.create({ data: { orderId, status: "completed" } });

      if (order.riderId) {
        await this.lockRiderRow(tx, order.riderId);
        const rider = await tx.rider.findUnique({
          where: { profileId: order.riderId },
          select: { ratingAvg: true, ratingCount: true, tripsCount: true, reliabilityScore: true, onHold: true, heldReason: true },
        });
        if (rider) {
          // FRAUD P1-6: distinct-counterparty cap on the reputation aggregate. A colluding customer+rider
          // pair can run repeated real (but fake-purpose) orders between two accounts and 5-star each other,
          // inflating the rider's public star average and recovering their reliability for free — the
          // self-bid guard only blocks rider===customer on ONE account, not two colluding accounts. So the
          // FIRST rating a given customer gives a given rider counts toward the aggregate; a REPEAT rating
          // from the same customer to the same rider is still recorded (audit/history + the one-per-order
          // unique) but does NOT move ratingAvg/ratingCount. Fail-safe & asymmetric: a LOW rating (penalty)
          // ALWAYS applies — accountability can't be dodged by being a repeat counterparty — but positive
          // reliability RECOVERY is only granted on a distinct pair, so farmed 5-stars can't lift a held
          // rider. (Residual: many sock-puppet customers each rating once is gated by identity-binding cost,
          // the separate open P2-5/P2-8 items; tripsCount still reflects the real completed delivery.)
          const priorPairRatings = await tx.rating.count({
            where: { byProfileId: customerId, order: { riderId: order.riderId, id: { not: orderId } } },
          });
          // FRAUD P1-6 residual / KB-IDENTITY-BINDING (demand side): the per-pair cap above stops ONE pair
          // farming; this stops MANY DISTINCT sock-puppet customers each rating once (cheap while identity
          // is phone-only). Only an ESTABLISHED customer — one who has completed >= CUSTOMER_TRUST orders —
          // moves a rider's public aggregate + reliability. `status:"completed"` was just set by the CAS
          // above for THIS order, so exclude it to count PRIOR completions. Untrusted → the rating is still
          // recorded (one-per-order unique + ops visibility) but carries ZERO weight in BOTH directions,
          // which also closes the mirror Sybil-DOWNVOTE attack (fresh accounts 1-starring a rival's rider).
          const priorCompletedByCustomer = await tx.order.count({
            where: { customerId, status: "completed", id: { not: orderId } },
          });
          const customerTrusted = customerRatingCarriesWeight(priorCompletedByCustomer);

          // Distinct-pair (P1-6) AND established-customer (trust tier) both required to move the aggregate.
          const countsTowardAggregate = customerTrusted && priorPairRatings === 0;
          const isPenalty = score <= RELIABILITY.LOW_RATING_AT;

          const ratingCount = countsTowardAggregate ? rider.ratingCount + 1 : rider.ratingCount;
          const ratingAvg = countsTowardAggregate
            ? (rider.ratingAvg * rider.ratingCount + score) / ratingCount
            : rider.ratingAvg;

          // Reliability (Q2): a delivered trip rated <= LOW_RATING_AT is a penalty; any better-rated
          // completion is a clean delivery that slowly recovers the score. NOTE(Q2): weights +
          // thresholds in packages/shared/src/policy.ts RELIABILITY. Same transaction as the rating.
          // RH-01: applyReliabilityDelta returns the new heldReason too (spread below) so this recovery
          // can't silently clear a velocity/fraud hold. Weighting: an UNTRUSTED customer moves reliability
          // in NEITHER direction (no Sybil up- or down-vote of a rider's hold gate). For a trusted customer,
          // P1-6 applies — a penalty always counts, positive recovery only on a distinct pair.
          const reliability =
            customerTrusted && (isPenalty || countsTowardAggregate)
              ? applyReliabilityDelta(
                  { ...rider, heldReason: rider.heldReason as HeldReason },
                  isPenalty ? -RELIABILITY.PENALTY.lowRating : RELIABILITY.RECOVER_PER_COMPLETION,
                )
              : {};
          // DS19-01: a low rating's -lowRating penalty can push reliabilityScore below ON_HOLD_BELOW and
          // flip onHold:true — the same standing demotion markUndelivered (velocity) and cancel() (strike
          // limit) perform. Those paths force isOnline:false in the same write and evict the rider from the
          // live-supply planes post-commit; this one didn't, leaving a rating-held rider isOnline:true with
          // their board rooms + `rider:geo` entry until an admin cleared the hold or they went offline — a
          // GEOSEARCH/board ghost inflating the admin online count. `reliability` is `{}` when the rating
          // carried no weight, so guard with an `in` check before reading onHold; only a NEW hold demotes.
          const newlyHeld = "onHold" in reliability && reliability.onHold === true && !rider.onHold;
          if (newlyHeld) newlyHeldRiderId = order.riderId;
          await tx.rider.update({
            where: { profileId: order.riderId },
            data: { ratingAvg, ratingCount, tripsCount: rider.tripsCount + 1, ...reliability, ...(newlyHeld ? { isOnline: false } : {}) },
          });
        }
        // Prepaid commission debit (design Flow 1): same transaction as completion, after the rider row
        // lock above. No-op at ratePct 0. Never blocks a delivered parcel from completing. Uses the
        // re-read `agreedFare` (WD-005), not the pre-CAS snapshot. `suggestedFare` feeds the WD-012
        // commission-basis floor.
        await this.wallet.chargeCommission(tx, { orderId, riderId: order.riderId, agreedFare, suggestedFare: order.suggestedFare });
      }
    });

    // DS19-01: a rating that newly tripped the reliability hold above forced the rider offline in-tx —
    // now pull them out of BOTH live-supply planes (geo + board) through the standing-demotion funnel,
    // mirroring the cancel-strike-limit and markUndelivered auto-hold evictions. Best-effort, post-commit;
    // evictRiderFromSupply never throws, so the `void`/`.catch` can't surface an unhandled rejection and it
    // can never affect the committed rating/completion.
    if (newlyHeldRiderId) {
      void this.gateway.evictRiderFromSupply(newlyHeldRiderId).catch((err) => {
        this.logger.warn(`supply eviction after rating hold failed for ${newlyHeldRiderId}: ${(err as Error).message}`);
      });
    }
    this.safeEmit(orderId, "completed");
    return { orderId, status: "completed" };
  }

  /** Rider rates the sender after delivery (rider-journey 4·7). Recorded-only — unlike the customer's
   *  rate() this does NOT change the order status or any score; it's an optional flag that protects
   *  other riders (a no-show / cash problem). It writes the OTHER direction of the two-way `ratings`
   *  table (byProfileId = the rider), so the (orderId, byProfileId) composite unique (migration 0015)
   *  lets it coexist with the customer's rating and makes a repeat a conflict, not a duplicate. */
  async rateSender(orderId: string, riderId: string, score: number, comment?: string): Promise<LifecycleResult> {
    try {
      const status = await this.prisma.$transaction(async (tx) => {
        const order = await tx.order.findUnique({
          where: { id: orderId },
          select: { status: true, riderId: true },
        });
        if (!order) throw new NotFoundException("Order not found");
        if (order.riderId !== riderId) throw new ForbiddenException("Not your order");
        // A post-delivery signal — allowed once delivered, and still after the customer's rate() has
        // closed the order to `completed` (the two ratings are independent, so completion mustn't block it).
        if (order.status !== "delivered" && order.status !== "completed")
          throw new ConflictException("Order is not awaiting a rating");

        // One rating per rater — the (orderId, byProfileId) composite unique makes a repeat a conflict.
        const existing = await tx.rating.findUnique({
          where: { orderId_byProfileId: { orderId, byProfileId: riderId } },
          select: { id: true },
        });
        if (existing) throw new ConflictException("Order already rated");
        await tx.rating.create({ data: { orderId, byProfileId: riderId, score, comment: comment ?? null } });
        return order.status;
      });

      return { orderId, status };
    } catch (err) {
      // The check-then-create above races a concurrent duplicate post; the (orderId, byProfileId)
      // unique index is the real guard, so map its violation to the same conflict as the pre-check
      // instead of leaking a 500.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw new ConflictException("Order already rated");
      }
      throw err;
    }
  }

  /**
   * Either party cancels an order (T4 / INTERFACE-AUDIT C3). The cancellation matrix is server-
   * enforced (CUSTOMER_CANCELLABLE / RIDER_CANCELLABLE):
   *  - **Customer** may cancel at ANY live status. If a rider is assigned we push `job:cancelled` to
   *    them with `collected` (post-pickup → hand-back path; pre-pickup → back to the board). NO
   *    reliability impact on the rider — a customer cancel never strikes.
   *  - **Rider** may cancel ONLY pre-pickup (assigned…en_route_pickup); `picked_up`+ is rejected. A
   *    rider cancel IS a no-show strike (every CANCEL_STRIKE_LIMIT forces offline on a cooldown) and
   *    auto re-broadcasts the job as a NEW open order (F-01) — the old row stays terminal `cancelled`.
   */
  async cancel(orderId: string, callerId: string, reason?: string): Promise<CancelResult> {
    // Side effects resolved inside the tx but fired AFTER commit (best-effort pushes must never sit
    // inside the transaction). rebroadcastId: the new open order to announce; jobCancelledCollected:
    // non-null ⇒ tell the assigned rider the customer cancelled, carrying the collected flag.
    let rebroadcastId: string | null = null;
    let jobCancelledCollected: boolean | null = null;
    // Captured in-tx for the post-commit rebroadcast push (F-01) — the customer to point at the fresh clone.
    let customerId: string | null = null;
    // DS13-07: captured in-tx for the post-commit board-close signal. A cancel of an `open_for_offers`
    // order otherwise only touches the order room, leaving browsing riders/bidders a dead board card until
    // a 409/countdown. When the observed status was open_for_offers we emit bid:expired to the pickup geo
    // rooms so the board sees the truthful terminal state immediately (mirrors the expiry path).
    let cancelledWhileOpen = false;
    let boardClosePickup: { lat: number; lng: number } | undefined;
    // DS17-02: set to the rider id when this cancel is their CANCEL_STRIKE_LIMIT-th strike (forced offline
    // + cooldown below). The transaction flips isOnline:false, but — unlike the admin suspend/ban and
    // auto-hold paths — nothing here evicted the demoted rider from the live-supply planes, so they kept
    // their board subscription + `rider:geo` entry (still receiving board pushes, still a GEOSEARCH ghost)
    // for up to the whole 2h cooldown. Captured in-tx and funnelled through evictRiderFromSupply post-commit.
    let strikeLimitRiderId: string | null = null;
    // DS19-01: set when a BELOW-limit rider cancel (strike 1 or 2) still pushes reliability under the hold
    // threshold and newly trips onHold — a standing demotion the pre-existing strike-limit branch handled
    // but this branch didn't. Forced offline in-tx + funnelled through evictRiderFromSupply post-commit, the
    // same as strikeLimitRiderId (the two are mutually exclusive — a cancel hits exactly one branch).
    let reliabilityHoldRiderId: string | null = null;

    const result = await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: orderId },
        select: { status: true, customerId: true, riderId: true, collectedAt: true, pickup: true },
      });
      if (!order) throw new NotFoundException("Order not found");
      customerId = order.customerId;
      if (order.status === "open_for_offers") {
        cancelledWhileOpen = true;
        boardClosePickup = (order.pickup as { point?: { lat: number; lng: number } } | null)?.point;
      }

      const isCustomer = order.customerId === callerId;
      const isRider = order.riderId === callerId;
      if (!isCustomer && !isRider) throw new ForbiddenException("Not your order");
      const allowed = isCustomer ? CUSTOMER_CANCELLABLE : RIDER_CANCELLABLE;
      // Plain language, no raw status enum (e.g. "en_route_dropoff") leaking to the app — the client
      // just renders exception messages verbatim (apps/mobile/src/ui/index.tsx ErrorText).
      if (!allowed.has(order.status)) throw new ConflictException("This order can't be cancelled anymore — it's already past that point.");

      const claimed = await tx.order.updateMany({
        where: { id: orderId, status: order.status },
        data: { status: "cancelled", cancelledAt: new Date(), cancelledBy: callerId, cancelReason: reason ?? null },
      });
      if (claimed.count === 0) throw new ConflictException("Order changed, retry");
      await tx.orderEvent.create({ data: { orderId, status: "cancelled" } });
      // Release any offers still pending against this order.
      await tx.offer.updateMany({ where: { orderId, status: "pending" }, data: { status: "declined" } });

      // Post-pickup? `collectedAt` is stamped at the picked_up edge (drives the rider's hand-back UI).
      const collected = order.collectedAt != null;

      let cooldownUntil: Date | null = null;
      if (isRider && order.riderId) {
        // Reliability decrement for a rider-initiated cancel (cancelStrike).
        await this.lockRiderRow(tx, order.riderId);
        const rider = await tx.rider.findUnique({
          where: { profileId: order.riderId },
          // DS20-03: read the current cooldownUntil under the same row lock so the write below can
          // extend (never shorten) an already-active cooldown a sibling strike axis may have set.
          select: { cancelStrikes: true, reliabilityScore: true, onHold: true, heldReason: true, cooldownUntil: true },
        });
        const strikes = (rider?.cancelStrikes ?? 0) + 1;
        // Reliability (Q2): a rider cancel is server-blocked post-pickup, so it's ALWAYS a pre-pickup
        // cancel → prePickupCancel penalty, clamped + on_hold-hysteresis'd in the same transaction as
        // the strike bump. NOTE(Q2): weights/threshold in packages/shared/src/policy.ts RELIABILITY.
        // The cancelStrike/cooldown gate is a separate, coarser axis kept alongside the score.
        // RH-01: carry heldReason through so a rider-cancel penalty can't clear a velocity/fraud hold.
        const reliability = applyReliabilityDelta(
          {
            reliabilityScore: rider?.reliabilityScore ?? RELIABILITY.START,
            onHold: rider?.onHold ?? false,
            heldReason: (rider?.heldReason ?? null) as HeldReason,
          },
          -RELIABILITY.PENALTY.prePickupCancel,
        );
        if (strikes >= CANCEL_STRIKE_LIMIT) {
          // Hit the limit: reset the counter, force offline, start the cooldown.
          // DS20-03: never SHORTEN an already-active cooldown — take the later of the fresh window and
          // any existing future cooldownUntil a sibling strike axis (dispute-strike, issues.service) set.
          const fresh = new Date(Date.now() + RIDER_STRIKE_COOLDOWN_MS);
          cooldownUntil = rider?.cooldownUntil && rider.cooldownUntil > fresh ? rider.cooldownUntil : fresh;
          await tx.rider.update({
            where: { profileId: order.riderId },
            data: { cancelStrikes: 0, cooldownUntil, isOnline: false, ...reliability },
          });
          // DS17-02: this is a standing demotion (forced offline), so the rider must also leave the geo +
          // board supply planes — evictRiderFromSupply post-commit, like every other demotion path.
          strikeLimitRiderId = order.riderId;
        } else {
          // DS19-01: below the strike limit the rider stays online — but the -prePickupCancel penalty can
          // itself drop reliabilityScore below ON_HOLD_BELOW and flip onHold:true (the same standing
          // demotion markUndelivered's velocity hold performs). When it NEWLY holds, force the rider offline
          // in this same write and evict them from the supply planes post-commit via the shared block below,
          // mirroring the strike-limit branch — else a cancel-held rider stays isOnline:true, a board/geo ghost.
          const newlyHeld = reliability.onHold === true && !(rider?.onHold ?? false);
          if (newlyHeld) reliabilityHoldRiderId = order.riderId;
          await tx.rider.update({
            where: { profileId: order.riderId },
            data: { cancelStrikes: strikes, ...reliability, ...(newlyHeld ? { isOnline: false } : {}) },
          });
        }
        // F-01: the rider bailed on an assigned-but-not-collected job (rider cancels are blocked
        // post-pickup, so it's never collected here) — clone the job back onto the board as a NEW
        // open order in the SAME transaction. The old row stays terminal; never reopened.
        rebroadcastId = await this.cloneForRebroadcast(tx, orderId);
      } else if (isCustomer && order.riderId) {
        // C3: a rider was already working this job — signal them the customer pulled out.
        jobCancelledCollected = collected;
      }

      return {
        orderId,
        status: "cancelled" as const,
        cancelledBy: (isRider ? "rider" : "customer") as "customer" | "rider",
        cooldownUntil,
      };
    });

    // DS17-02: a 3rd-strike rider was forced offline in the transaction above — evict them from the board
    // rooms + `rider:geo` Redis index through the standing-demotion funnel (mirrors the markUndelivered
    // auto-hold eviction and the admin suspend/ban/KYC-lapse paths). Best-effort, post-commit; never throws,
    // so a `void` can't surface an unhandled rejection and it can never affect the committed cancel.
    if (strikeLimitRiderId) {
      void this.gateway.evictRiderFromSupply(strikeLimitRiderId).catch((err) => {
        this.logger.warn(`supply eviction after cancel-strike limit failed for ${strikeLimitRiderId}: ${(err as Error).message}`);
      });
    }
    // DS19-01: a below-strike-limit cancel whose reliability penalty newly tripped the hold above forced the
    // rider offline in-tx — evict them from the supply planes too (mutually exclusive with the strike-limit
    // branch, so no double eviction). Same best-effort/never-throws shape as every other post-commit eviction.
    if (reliabilityHoldRiderId) {
      void this.gateway.evictRiderFromSupply(reliabilityHoldRiderId).catch((err) => {
        this.logger.warn(`supply eviction after cancel reliability hold failed for ${reliabilityHoldRiderId}: ${(err as Error).message}`);
      });
    }
    // Live WS status for any open tracking screen (both cancel shapes). Raw emit rather than safeEmit,
    // because the customer PUSH below is branched — a rider-bail rebroadcast must NOT fire the generic
    // "Order cancelled" push (see below).
    try {
      this.gateway.emitOrderStatus(orderId, "cancelled");
    } catch (err) {
      this.logger.warn(`status emit failed for order ${orderId}: ${(err as Error).message}`);
    }
    // Best-effort post-commit pushes. emitJobCancelled is guarded (the gateway swallows a null server),
    // and the re-broadcast announce is fire-and-forget like the create() path.
    if (jobCancelledCollected !== null) this.gateway.emitJobCancelled(orderId, jobCancelledCollected, "customer");
    if (rebroadcastId) {
      // F-01: tell the customer watching the (now cancelled) order to re-attach to the fresh auction,
      // then announce the new open order to the board. Both are best-effort post-commit pushes.
      this.gateway.emitOrderRebroadcast(orderId, rebroadcastId);
      // A rider bailed but the job is already back on the board at the SAME price. A bare "Order cancelled"
      // push would alarm the customer (and would also ping the bailing rider about their own action), so
      // instead send the CUSTOMER a distinct notice carrying the NEW clone's id — a tap follows the
      // re-sent request. notifyProfiles is best-effort and never throws.
      if (customerId) {
        void this.notifications.notifyProfiles([customerId], {
          title: "Your rider had to cancel",
          body: "We've already sent your request back out to nearby riders at the same price — tap to follow it.",
          data: { orderId: rebroadcastId, kind: "rebroadcast" },
        });
      }
      // F-12: announceOpenOrder is async and fire-and-forget, so a synchronous try/catch can't catch its
      // rejection — attach a .catch so a post-commit rebroadcast blip (findUnique / queue enqueue) can't
      // surface as an unhandledRejection and crash the instance. The DB reconciler still backstops the
      // new open order's expiry, so losing this best-effort announce is acceptable.
      void this.orders.announceOpenOrder(rebroadcastId).catch((err) => {
        this.logger.error(`announceOpenOrder failed for order ${rebroadcastId}: ${(err as Error).message}`);
      });
    } else {
      // Plain cancel (customer-initiated / admin, no rebroadcast). Push "Order cancelled" to the affected
      // party but EXCLUDE the canceller — a push about your own action is noise. The assigned rider still
      // gets it when the customer pulls out; a customer cancelling their own open order now pings no one.
      void this.notifications.notifyOrderStatus(orderId, "cancelled", {}, callerId);
    }
    // DS13-07: a cancel of an order that was still `open_for_offers` closes the board card for browsing
    // riders and the "offer sent" state for bidders — reuse the expiry path's board-close event so they
    // see the terminal state immediately instead of running the countdown to a 409. Best-effort, guarded.
    if (cancelledWhileOpen) {
      try {
        this.gateway.emitBidExpired(orderId, boardClosePickup?.lat, boardClosePickup?.lng);
      } catch (err) {
        this.logger.warn(`board-close emit failed for cancelled order ${orderId}: ${(err as Error).message}`);
      }
    }
    return result;
  }

  /**
   * Clone an order's broadcast params into a NEW `open_for_offers` row inside the caller's transaction
   * (F-01 rider-cancel auto re-broadcast). `rebroadcastOfId` back-links to the order it replaced so the
   * lineage is traceable; the append-only OrderEvent timeline of the old order stays clean (it's just
   * `cancelled`). Returns the new order's id for the post-commit board announce. Same-price: proposed/
   * suggested fares are copied verbatim.
   */
  private async cloneForRebroadcast(tx: Prisma.TransactionClient, sourceOrderId: string): Promise<string> {
    const src = await tx.order.findUnique({
      where: { id: sourceOrderId },
      select: {
        customerId: true,
        orderType: true,
        pickup: true,
        dropoff: true,
        itemDesc: true,
        items: true,
        note: true,
        itemPhotoUrl: true,
        declaredValue: true,
        size: true,
        distanceKm: true,
        suggestedFare: true,
        proposedFare: true,
        currency: true,
        disclaimerVersion: true,
        disclaimerAcceptedAt: true,
      },
    });
    if (!src) throw new NotFoundException("Order not found");

    const clone = await tx.order.create({
      data: {
        customerId: src.customerId,
        orderType: src.orderType,
        pickup: src.pickup as Prisma.InputJsonValue,
        dropoff: src.dropoff as Prisma.InputJsonValue,
        itemDesc: src.itemDesc,
        items: (src.items as Prisma.InputJsonValue | null) ?? Prisma.DbNull,
        note: src.note,
        itemPhotoUrl: src.itemPhotoUrl,
        declaredValue: src.declaredValue,
        size: src.size,
        distanceKm: src.distanceKm,
        suggestedFare: src.suggestedFare,
        proposedFare: src.proposedFare,
        currency: src.currency,
        // Same customer + same terms → carry the disclaimer consent forward (A1-8); a re-broadcast
        // isn't a fresh order the customer restarts, so it shouldn't drop their recorded consent.
        disclaimerVersion: src.disclaimerVersion,
        disclaimerAcceptedAt: src.disclaimerAcceptedAt,
        status: "open_for_offers",
        rebroadcastOfId: sourceOrderId,
        events: { create: { status: "open_for_offers" } },
      },
      select: { id: true },
    });
    return clone.id;
  }

  /** Auto-close a delivered-but-unrated order so completion metrics don't stall (T3). Idempotent. */
  async completeOrder(orderId: string): Promise<{ completed: boolean }> {
    const done = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.order.updateMany({
        where: { id: orderId, status: "delivered" },
        data: { status: "completed", completedAt: new Date() },
      });
      if (claimed.count === 0) return false; // already completed/rated, or never delivered — no-op
      await tx.orderEvent.create({ data: { orderId, status: "completed" } });
      const order = await tx.order.findUnique({
        where: { id: orderId },
        select: { riderId: true, agreedFare: true, suggestedFare: true },
      });
      if (order?.riderId) {
        // A delivered order that auto-closes with no complaint is a clean completion → slow
        // reliability recovery (Q2). NOTE(Q2): RECOVER_PER_COMPLETION in policy.ts. This is the
        // unrated counterpart to rate()'s recovery — the two completion edges are mutually exclusive
        // (both CAS on status=delivered), so recovery is never double-counted.
        await this.lockRiderRow(tx, order.riderId);
        const rider = await tx.rider.findUnique({
          where: { profileId: order.riderId },
          select: { reliabilityScore: true, onHold: true, heldReason: true },
        });
        // RH-01: recovery runs applyReliabilityDelta, which now preserves a velocity/fraud hold — a
        // clean auto-close no longer silently un-holds a velocity-flagged rider via the score clear.
        const reliability = rider
          ? applyReliabilityDelta({ ...rider, heldReason: rider.heldReason as HeldReason }, RELIABILITY.RECOVER_PER_COMPLETION)
          : {};
        await tx.rider.update({
          where: { profileId: order.riderId },
          data: { tripsCount: { increment: 1 }, ...reliability },
        });
        // Prepaid commission debit (design Flow 1) — the auto-close counterpart to rate()'s debit. The
        // two completion edges are mutually exclusive (both CAS on status=delivered), so it fires once
        // per order. No-op at ratePct 0; idempotent (unique (riderId, orderId, ride_commission)).
        await this.wallet.chargeCommission(tx, {
          orderId,
          riderId: order.riderId,
          agreedFare: order.agreedFare,
          suggestedFare: order.suggestedFare,
        });
      }
      return true;
    });
    if (done) this.safeEmit(orderId, "completed");
    return { completed: done };
  }

  /** Customer re-issues the delivery code (e.g. after a lockout or a lost code). CAS-guarded on the
   *  observed status like every sibling transition in this file — without it, a rotate that read a
   *  valid status can still land its write after a concurrent confirmDelivery has already moved the
   *  order to `delivered` (confirmDelivery's `FOR UPDATE` transaction only blocks this call's own
   *  UPDATE while it holds the lock; it doesn't make the earlier, already-stale status read atomic
   *  with this write). Harmless today (nothing reads `otpHash` post-delivery), but a silent TOCTOU
   *  inconsistent with the pattern everywhere else in this file. */
  async rotateDeliveryCode(orderId: string, customerId: string): Promise<{ deliveryCode: string }> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { customerId: true, status: true },
    });
    if (!order) throw new NotFoundException("Order not found");
    if (order.customerId !== customerId) throw new ForbiddenException("Not your order");
    if (!ACTIVE_FOR_CODE.includes(order.status)) throw new ConflictException("No active delivery for this order");

    const deliveryCode = this.tokens.randomOtp();
    // KB-DELIVERY-CODE-ROTATION-SIGNAL: rotate the hash, zero the attempt counter, and stamp
    // deliveryCodeRotatedAt (DB now() — the same clock domain fix 2 unifies the heartbeat writers
    // onto) so the rider app can robustly detect this re-issue. CAS-guarded on the observed status
    // like every sibling transition in this file (see doc comment above) — a concurrent
    // confirmDelivery landing between the read and this write must not silently re-arm a code for
    // an already-delivered order.
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.order.updateMany({
        where: { id: orderId, status: { in: [...ACTIVE_FOR_CODE] } },
        data: { otpHash: this.tokens.hash(deliveryCode), deliveryOtpAttempts: 0 },
      });
      if (claimed.count === 0) throw new ConflictException("Order changed, retry");
      await tx.$executeRaw`UPDATE orders SET delivery_code_rotated_at = now() WHERE id = ${orderId}::uuid`;
    });
    return { deliveryCode };
  }

  private async scheduleAutoClose(orderId: string): Promise<void> {
    if (!this.queue) return;
    await this.queue.add(
      "autoclose",
      { orderId },
      {
        delay: RATING_WINDOW_MS,
        jobId: orderId,
        removeOnComplete: true,
        removeOnFail: 100,
        // DS-06: give a transient DB/Redis blip a few retries before falling back to the reconciler,
        // matching OfferExpiryService.schedule. completeOrder is idempotent (CAS on `status:delivered`)
        // so a retry can never double-close.
        attempts: 3,
        backoff: { type: "exponential", delay: 5_000 },
      },
    );
  }
}

/** A delivery code is meaningful only while the trip is in flight and the code is still unconsumed
 *  (assigned through en_route_dropoff). Once `delivered`, the handover is done — no rotation. */
const ACTIVE_FOR_CODE: readonly OrderStatus[] = [
  "assigned",
  "confirmed",
  "en_route_pickup",
  "picked_up",
  "en_route_dropoff",
];
