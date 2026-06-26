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
import { Queue, Worker } from "bullmq";
import { TokenService } from "../auth/token.service";
import { ENV } from "../config/config.module";
import type { Env } from "../config/env";
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
/** A customer may bail before the parcel is collected; a rider may bail any time before delivery. */
const CUSTOMER_CANCELLABLE = new Set(["open_for_offers", "assigned", "confirmed", "en_route_pickup"]);
const RIDER_CANCELLABLE = new Set(["assigned", "confirmed", "en_route_pickup", "picked_up", "en_route_dropoff"]);
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

  /** Best-effort live status push (ET4). Never fails a committed transition — emits are notifications. */
  private safeEmit(orderId: string, status: string): void {
    try {
      this.gateway.emitOrderStatus(orderId, status);
    } catch (err) {
      this.logger.warn(`status emit failed for order ${orderId}: ${(err as Error).message}`);
    }
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
          select: { ratingAvg: true, ratingCount: true, tripsCount: true },
        });
        if (rider) {
          const ratingCount = rider.ratingCount + 1;
          const ratingAvg = (rider.ratingAvg * rider.ratingCount + score) / ratingCount;
          await tx.rider.update({
            where: { profileId: order.riderId },
            data: { ratingAvg, ratingCount, tripsCount: rider.tripsCount + 1 },
          });
        }
      }
    });

    this.safeEmit(orderId, "completed");
    return { orderId, status: "completed" };
  }

  /**
   * Either party cancels an in-flight order (T4). The customer may cancel before the parcel is
   * collected; the rider may cancel any time before delivery. A rider-initiated cancel is a no-show
   * strike — every CANCEL_STRIKE_LIMIT strikes forces the rider offline on a cooldown.
   */
  async cancel(orderId: string, callerId: string, reason?: string): Promise<CancelResult> {
    const result = await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: orderId },
        select: { status: true, customerId: true, riderId: true },
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

      let cooldownUntil: Date | null = null;
      if (isRider && order.riderId) {
        const rider = await tx.rider.findUnique({
          where: { profileId: order.riderId },
          select: { cancelStrikes: true },
        });
        const strikes = (rider?.cancelStrikes ?? 0) + 1;
        if (strikes >= CANCEL_STRIKE_LIMIT) {
          // Hit the limit: reset the counter, force offline, start the cooldown.
          cooldownUntil = new Date(Date.now() + COOLDOWN_MS);
          await tx.rider.update({
            where: { profileId: order.riderId },
            data: { cancelStrikes: 0, cooldownUntil, isOnline: false },
          });
        } else {
          await tx.rider.update({ where: { profileId: order.riderId }, data: { cancelStrikes: strikes } });
        }
      }
      return {
        orderId,
        status: "cancelled" as const,
        cancelledBy: (isRider ? "rider" : "customer") as "customer" | "rider",
        cooldownUntil,
      };
    });

    this.safeEmit(orderId, "cancelled");
    return result;
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
        await tx.rider.update({
          where: { profileId: order.riderId },
          data: { tripsCount: { increment: 1 } },
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
