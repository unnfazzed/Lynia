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
/** How long after delivery a customer has to rate before the order auto-closes (so completion
 *  metrics never stall on an un-rated order — D6a / T3). Pilot value; tune on real behaviour. */
export const RATING_WINDOW_MS = 6 * 60 * 60 * 1000;
const QUEUE_NAME = "rating-autoclose";

type ForwardStatus = keyof typeof FORWARD;
export interface LifecycleResult {
  orderId: string;
  status: string;
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

  onModuleInit(): void {
    const url = this.env.REDIS_URL;
    if (!url) {
      this.logger.warn("REDIS_URL not set — rating auto-close disabled (delivered orders won't auto-complete)");
      return;
    }
    const connection = connectionFromUrl(url);
    this.queue = new Queue(QUEUE_NAME, { connection });
    this.worker = new Worker(QUEUE_NAME, async (job) => this.completeOrder(job.data.orderId as string), {
      connection,
    });
    this.worker.on("failed", (job, err) =>
      this.logger.error(`auto-close job ${job?.id ?? "?"} failed: ${err.message}`),
    );
    this.logger.log("Rating auto-close worker started");
  }

  async onModuleDestroy(): Promise<void> {
    await this.worker?.close();
    await this.queue?.close();
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

    this.gateway.emitOrderStatus(orderId, to);
    return { orderId, status: to };
  }

  /** Rider confirms the handover with the recipient's delivery code → `delivered`. */
  async confirmDelivery(orderId: string, riderId: string, code: string): Promise<LifecycleResult> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { status: true, riderId: true, otpHash: true, deliveryOtpAttempts: true },
    });
    if (!order) throw new NotFoundException("Order not found");
    if (order.riderId !== riderId) throw new ForbiddenException("Not the assigned rider");
    if (order.status !== "en_route_dropoff") throw new ConflictException("Order is not ready for delivery");
    if (order.deliveryOtpAttempts >= DELIVERY_OTP_MAX_ATTEMPTS) {
      throw new ForbiddenException("Too many attempts — ask the customer to re-issue the code");
    }

    const ok = !!order.otpHash && this.tokens.safeEqualHex(this.tokens.hash(code), order.otpHash);
    if (!ok) {
      // Increment OUTSIDE any rolled-back tx so the counter actually persists.
      await this.prisma.order.update({
        where: { id: orderId },
        data: { deliveryOtpAttempts: { increment: 1 } },
      });
      throw new UnauthorizedException("Incorrect delivery code");
    }

    const claimed = await this.prisma.order.updateMany({
      where: { id: orderId, status: "en_route_dropoff", riderId },
      data: { status: "delivered", deliveredAt: new Date() },
    });
    if (claimed.count === 0) throw new ConflictException("Order changed, retry");
    await this.prisma.orderEvent.create({ data: { orderId, status: "delivered" } });

    this.gateway.emitOrderStatus(orderId, "delivered");
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
        where: { id: orderId, status: "delivered" },
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

    this.gateway.emitOrderStatus(orderId, "completed");
    return { orderId, status: "completed" };
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
    if (done) this.gateway.emitOrderStatus(orderId, "completed");
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

/** A delivery code is meaningful while the trip is in flight (assigned through delivered). */
const ACTIVE_FOR_CODE = new Set([
  "assigned",
  "confirmed",
  "en_route_pickup",
  "picked_up",
  "en_route_dropoff",
  "delivered",
]);
