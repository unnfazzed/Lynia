import {
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  type OnModuleDestroy,
  type OnModuleInit,
  UnauthorizedException,
} from "@nestjs/common";
import { CUSTOMER_CANCELLABLE_STATUSES, RELIABILITY, RIDER_CANCELLABLE_STATUSES } from "@lynia/shared";
import { Prisma } from "@prisma/client";
import { applyReliabilityDelta, undeliveredPenalty } from "../riders/reliability";
import { Queue, Worker } from "bullmq";
import { TokenService } from "../auth/token.service";
import { ENV } from "../config/config.module";
import type { Env } from "../config/env";
import { NotificationsService } from "../notifications/notifications.service";
import { OrdersService } from "./orders.service";
import { PrismaService } from "../prisma/prisma.service";
import { TrackingGateway } from "../tracking/tracking.gateway";

/** Forward, rider-driven transitions. `delivered` (OTP-gated) and `completed` (rating/auto-close)
 *  are handled by their own methods, not this map. Each edge stamps one milestone timestamp. */
const FORWARD = {
  confirmed: { from: "assigned", stamp: "confirmedAt" },
  en_route_pickup: { from: "confirmed", stamp: "pickupStartedAt" },
  picked_up: { from: "en_route_pickup", stamp: "collectedAt" },
  en_route_dropoff: { from: "picked_up", stamp: undefined },
} as const;

const DELIVERY_OTP_MAX_ATTEMPTS = 5;
/** Cancellation matrix (INTERFACE-AUDIT C3), server-enforced. Customer: any live status (pre- OR
 *  post-pickup). Rider: ONLY up to arrival at pickup — blocked from `picked_up` onward (the parcel is
 *  on the bike; a post-pickup failure is an `undelivered(breakdown)`, not a cancel). Both sets are the
 *  shared source of truth the clients import for the cancel affordance. */
const CUSTOMER_CANCELLABLE = new Set<string>(CUSTOMER_CANCELLABLE_STATUSES);
const RIDER_CANCELLABLE = new Set<string>(RIDER_CANCELLABLE_STATUSES);
/** A hand-off can only FAIL after the parcel is collected (C6/F-02): picked_up or en_route_dropoff. */
const POST_PICKUP_FOR_UNDELIVERED = new Set<string>(["picked_up", "en_route_dropoff"]);
/** Repeated rider cancels earn a cooldown that blocks going online (T4 no-show penalty). */
const CANCEL_STRIKE_LIMIT = 3;
const COOLDOWN_MS = 2 * 60 * 60 * 1000;
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
  ) {}

  private sweep?: ReturnType<typeof setInterval>;

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
    const cutoff = new Date(Date.now() - RATING_WINDOW_MS);
    const stale = await this.prisma.order.findMany({
      where: { status: "delivered", deliveredAt: { lt: cutoff } },
      select: { id: true },
      take: 500,
    });
    let closed = 0;
    for (const o of stale) {
      try {
        if ((await this.completeOrder(o.id)).completed) closed++;
      } catch (err) {
        this.logger.error(`reconcile failed for order ${o.id}: ${(err as Error).message}`);
      }
    }
    if (closed > 0) this.logger.log(`Reconciler auto-closed ${closed} stale delivered order(s)`);
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
    await this.prisma.order.update({
      where: { id: orderId },
      data: { itemsCollected: indexes as unknown as Prisma.InputJsonValue },
    });
    return { orderId, confirmedIndexes: indexes };
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
        return { ok: false as const };
      }
      // Row is locked and validated en_route_dropoff — safe to flip directly.
      await tx.order.update({ where: { id: orderId }, data: { status: "delivered", deliveredAt: new Date() } });
      await tx.orderEvent.create({ data: { orderId, status: "delivered" } });
      return { ok: true as const };
    });

    if (!outcome.ok) throw new UnauthorizedException("Incorrect delivery code");
    this.safeEmit(orderId, "delivered");
    await this.scheduleAutoClose(orderId);
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
      if (penalty > 0 && order.riderId) {
        const rider = await tx.rider.findUnique({
          where: { profileId: order.riderId },
          select: { reliabilityScore: true, onHold: true },
        });
        if (rider) {
          await tx.rider.update({
            where: { profileId: order.riderId },
            data: applyReliabilityDelta(rider, -penalty),
          });
        }
      }
    });

    this.safeEmit(orderId, "undelivered");
    return { orderId, status: "undelivered" };
  }

  /** Customer rates the rider after delivery; this closes the order and updates the rider's score. */
  async rate(orderId: string, customerId: string, score: number, comment?: string): Promise<LifecycleResult> {
    await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: orderId },
        select: { status: true, customerId: true, riderId: true },
      });
      if (!order) throw new NotFoundException("Order not found");
      if (order.customerId !== customerId) throw new ForbiddenException("Not your order");
      if (order.status !== "delivered") throw new ConflictException("Order is not awaiting a rating");

      const claimed = await tx.order.updateMany({
        where: { id: orderId, status: "delivered", customerId },
        data: { status: "completed", completedAt: new Date() },
      });
      if (claimed.count === 0) throw new ConflictException("Order already completed");

      await tx.rating.create({ data: { orderId, byProfileId: customerId, score, comment: comment ?? null } });
      await tx.orderEvent.create({ data: { orderId, status: "completed" } });

      if (order.riderId) {
        const rider = await tx.rider.findUnique({
          where: { profileId: order.riderId },
          select: { ratingAvg: true, ratingCount: true, tripsCount: true, reliabilityScore: true, onHold: true },
        });
        if (rider) {
          const ratingCount = rider.ratingCount + 1;
          const ratingAvg = (rider.ratingAvg * rider.ratingCount + score) / ratingCount;
          // Reliability (Q2): a delivered trip rated <= LOW_RATING_AT is a penalty; any better-rated
          // completion is a clean delivery that slowly recovers the score. NOTE(Q2): weights +
          // thresholds in packages/shared/src/policy.ts RELIABILITY. Same transaction as the rating.
          const delta =
            score <= RELIABILITY.LOW_RATING_AT ? -RELIABILITY.PENALTY.lowRating : RELIABILITY.RECOVER_PER_COMPLETION;
          const reliability = applyReliabilityDelta(rider, delta);
          await tx.rider.update({
            where: { profileId: order.riderId },
            data: { ratingAvg, ratingCount, tripsCount: rider.tripsCount + 1, ...reliability },
          });
        }
      }
    });

    this.safeEmit(orderId, "completed");
    return { orderId, status: "completed" };
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

    const result = await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: orderId },
        select: { status: true, customerId: true, riderId: true, collectedAt: true },
      });
      if (!order) throw new NotFoundException("Order not found");

      const isCustomer = order.customerId === callerId;
      const isRider = order.riderId === callerId;
      if (!isCustomer && !isRider) throw new ForbiddenException("Not your order");
      const allowed = isCustomer ? CUSTOMER_CANCELLABLE : RIDER_CANCELLABLE;
      if (!allowed.has(order.status)) throw new ConflictException(`Cannot cancel a ${order.status} order`);

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
        const rider = await tx.rider.findUnique({
          where: { profileId: order.riderId },
          select: { cancelStrikes: true, reliabilityScore: true, onHold: true },
        });
        const strikes = (rider?.cancelStrikes ?? 0) + 1;
        // Reliability (Q2): a rider cancel is server-blocked post-pickup, so it's ALWAYS a pre-pickup
        // cancel → prePickupCancel penalty, clamped + on_hold-hysteresis'd in the same transaction as
        // the strike bump. NOTE(Q2): weights/threshold in packages/shared/src/policy.ts RELIABILITY.
        // The cancelStrike/cooldown gate is a separate, coarser axis kept alongside the score.
        const reliability = applyReliabilityDelta(
          { reliabilityScore: rider?.reliabilityScore ?? RELIABILITY.START, onHold: rider?.onHold ?? false },
          -RELIABILITY.PENALTY.prePickupCancel,
        );
        if (strikes >= CANCEL_STRIKE_LIMIT) {
          // Hit the limit: reset the counter, force offline, start the cooldown.
          cooldownUntil = new Date(Date.now() + COOLDOWN_MS);
          await tx.rider.update({
            where: { profileId: order.riderId },
            data: { cancelStrikes: 0, cooldownUntil, isOnline: false, ...reliability },
          });
        } else {
          await tx.rider.update({
            where: { profileId: order.riderId },
            data: { cancelStrikes: strikes, ...reliability },
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

    this.safeEmit(orderId, "cancelled");
    // Best-effort post-commit pushes. emitJobCancelled is guarded (the gateway swallows a null server),
    // and the re-broadcast announce is fire-and-forget like the create() path.
    if (jobCancelledCollected !== null) this.gateway.emitJobCancelled(orderId, jobCancelledCollected);
    if (rebroadcastId) {
      // F-01: tell the customer watching the (now cancelled) order to re-attach to the fresh auction,
      // then announce the new open order to the board. Both are best-effort post-commit pushes.
      this.gateway.emitOrderRebroadcast(orderId, rebroadcastId);
      void this.orders.announceOpenOrder(rebroadcastId);
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
      const order = await tx.order.findUnique({ where: { id: orderId }, select: { riderId: true } });
      if (order?.riderId) {
        // A delivered order that auto-closes with no complaint is a clean completion → slow
        // reliability recovery (Q2). NOTE(Q2): RECOVER_PER_COMPLETION in policy.ts. This is the
        // unrated counterpart to rate()'s recovery — the two completion edges are mutually exclusive
        // (both CAS on status=delivered), so recovery is never double-counted.
        const rider = await tx.rider.findUnique({
          where: { profileId: order.riderId },
          select: { reliabilityScore: true, onHold: true },
        });
        const reliability = rider ? applyReliabilityDelta(rider, RELIABILITY.RECOVER_PER_COMPLETION) : {};
        await tx.rider.update({
          where: { profileId: order.riderId },
          data: { tripsCount: { increment: 1 }, ...reliability },
        });
      }
      return true;
    });
    if (done) this.safeEmit(orderId, "completed");
    return { completed: done };
  }

  /** Customer re-issues the delivery code (e.g. after a lockout or a lost code). */
  async rotateDeliveryCode(orderId: string, customerId: string): Promise<{ deliveryCode: string }> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { customerId: true, status: true },
    });
    if (!order) throw new NotFoundException("Order not found");
    if (order.customerId !== customerId) throw new ForbiddenException("Not your order");
    if (!ACTIVE_FOR_CODE.has(order.status)) throw new ConflictException("No active delivery for this order");

    const deliveryCode = this.tokens.randomOtp();
    await this.prisma.order.update({
      where: { id: orderId },
      data: { otpHash: this.tokens.hash(deliveryCode), deliveryOtpAttempts: 0 },
    });
    return { deliveryCode };
  }

  private async scheduleAutoClose(orderId: string): Promise<void> {
    if (!this.queue) return;
    await this.queue.add(
      "autoclose",
      { orderId },
      { delay: RATING_WINDOW_MS, jobId: orderId, removeOnComplete: true, removeOnFail: 100 },
    );
  }
}

/** A delivery code is meaningful only while the trip is in flight and the code is still unconsumed
 *  (assigned through en_route_dropoff). Once `delivered`, the handover is done — no rotation. */
const ACTIVE_FOR_CODE = new Set([
  "assigned",
  "confirmed",
  "en_route_pickup",
  "picked_up",
  "en_route_dropoff",
]);
