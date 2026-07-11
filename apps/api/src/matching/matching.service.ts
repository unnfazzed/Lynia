import { ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { TokenService } from "../auth/token.service";
import { NotificationsService } from "../notifications/notifications.service";
import { MetricsService, type MatchSelectOutcome } from "../observability/metrics.service";
import { PrismaService } from "../prisma/prisma.service";
import { blockedPairWhere } from "../reports/blocks";
import { onlineRefusalReason } from "../riders/rider.service";
import { TrackingGateway } from "../tracking/tracking.gateway";

/** Rider must have a heartbeat newer than this to be selectable (ET3 liveness). */
const HEARTBEAT_TTL_MS = 30_000;

export interface SelectResult {
  orderId: string;
  riderId: string;
  agreedFare: string;
  status: "assigned";
  /** One-time delivery code the customer relays to the recipient; the rider enters it at handover. */
  deliveryCode: string;
}

@Injectable()
export class MatchingService {
  private readonly logger = new Logger(MatchingService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    private readonly notifications: NotificationsService,
    private readonly metrics: MetricsService,
    private readonly gateway: TrackingGateway,
  ) {}

  /**
   * Customer selects an offer. The assignment is a guarded compare-and-swap (ET1): the order
   * flips open_for_offers → assigned only if it is still open, so a concurrent select or the
   * expiry job can never double-assign. The one_active_ride partial-unique index (ET2) makes
   * the DB reject a rider who is selected on two orders at once. Liveness is checked in-tx (ET3).
   */
  async selectOffer(orderId: string, offerId: string, customerId: string): Promise<SelectResult> {
    const done = this.metrics.startTimer();
    // Captured in-tx for the post-commit `order:taken` board emit (same pickup-cell distribution as
    // `bid:expired`) — saves a re-read of a row the tx already has.
    let pickupPt: { lat: number; lng: number } | undefined;
    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const offer = await tx.offer.findFirst({
          where: { id: offerId, orderId },
          select: {
            status: true,
            riderId: true,
            offeredFare: true,
            // `pickup` (HEAD) feeds the post-commit order:taken board emit; the expanded rider
            // account-standing fields (origin/main) gate a banned/suspended/held rider at select time.
            order: { select: { status: true, customerId: true, pickup: true } },
            rider: {
              select: {
                isOnline: true,
                lastHeartbeatAt: true,
                kycStatus: true,
                accountStatus: true,
                onHold: true,
                cooldownUntil: true,
              },
            },
          },
        });

        if (!offer) throw new NotFoundException("Offer not found for this order");
        if (offer.order.customerId !== customerId) throw new ForbiddenException("Not your order");
        // Belt-and-braces against self-bidding (offers.makeOffer already blocks it at creation): never
        // let a customer select an offer their own profile placed as a rider.
        if (offer.riderId === customerId) throw new ForbiddenException("You can't select your own offer");

        // Block enforcement (server-side, in-tx): a blocked pair never re-matches. If the customer has
        // blocked this rider — or the rider has blocked the customer — the offer can't be selected. Read
        // on `tx` so the check is part of the same atomic assignment decision as the CAS below.
        const blocked = await tx.block.findFirst({
          where: blockedPairWhere(offer.order.customerId, offer.riderId),
          select: { id: true },
        });
        if (blocked) throw new ForbiddenException("You've blocked this rider — pick another offer");

        if (offer.order.status !== "open_for_offers") {
          throw new ConflictException("This order is no longer open for offers");
        }
        pickupPt = (offer.order.pickup as { point?: { lat: number; lng: number } } | null)?.point;
        if (offer.status !== "pending") throw new ConflictException("That offer is no longer available");

        const hb = offer.rider.lastHeartbeatAt?.getTime() ?? 0;
        const fresh = Date.now() - hb < HEARTBEAT_TTL_MS;
        if (!offer.rider.isOnline || !fresh) {
          throw new ConflictException("Rider just became unavailable, pick another");
        }
        // P2-1 account-standing gate (ET3): a rider banned/suspended/put on-hold/cooled-down AFTER
        // bidding (e.g. an admin ban while they were still flagged online) must not be selectable.
        // Same shared online-gate as makeOffer/setOnline; surfaced as the same "pick another" conflict
        // as a liveness miss, since the customer isn't at fault.
        if (onlineRefusalReason(offer.rider)) {
          throw new ConflictException("Rider just became unavailable, pick another");
        }

        // Mint the delivery handover code now; store only its hash (ET7). The plaintext is
        // returned to the selecting customer once and never persisted or re-exposed.
        const deliveryCode = this.tokens.randomOtp();

        // Guarded CAS — first writer wins (ET1).
        const claimed = await tx.order.updateMany({
          where: { id: orderId, status: "open_for_offers" },
          data: {
            status: "assigned",
            riderId: offer.riderId,
            agreedFare: offer.offeredFare,
            otpHash: this.tokens.hash(deliveryCode),
            deliveryOtpAttempts: 0,
          },
        });
        if (claimed.count === 0) throw new ConflictException("Order was just taken, pick another");

        await tx.offer.update({ where: { id: offerId }, data: { status: "selected" } });
        await tx.offer.updateMany({
          where: { orderId, status: "pending", NOT: { id: offerId } },
          data: { status: "declined" },
        });
        await tx.orderEvent.create({ data: { orderId, status: "assigned" } });

        return {
          orderId,
          riderId: offer.riderId,
          agreedFare: offer.offeredFare.toString(),
          status: "assigned" as const,
          deliveryCode,
        };
      });

      // Post-commit, best-effort: tell the selected rider they're hired (§5c). Never blocks the assign.
      void this.notifications.notifyOrderStatus(orderId, "assigned");
      // Close the card on every OTHER rider's board (rider-journey 2·b1 / 3·b1): browsers drop it,
      // bidders who weren't picked show "not chosen". Same distribution as bid:expired; best-effort.
      try {
        this.gateway.emitOrderTaken(orderId, pickupPt?.lat, pickupPt?.lng);
      } catch (err) {
        this.logger.warn(`order:taken emit failed for order ${orderId}: ${(err as Error).message}`);
      }
      this.metrics.recordMatchSelect(done(), "assigned");
      return result;
    } catch (err) {
      // ET2: the rider is already on another active ride → one_active_ride unique violation.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        // Record the metric, then RE-THROW the domain error — the "rider just taken" rollback UX
        // depends on this ConflictException still propagating; the metric wrapper must NOT swallow it.
        this.metrics.recordMatchSelect(done(), "unavailable");
        throw new ConflictException("Rider just became unavailable, pick another");
      }
      // Map the thrown domain exception to an outcome label, then RE-THROW so the caller still sees it.
      this.metrics.recordMatchSelect(done(), this.selectOutcome(err));
      throw err;
    }
  }

  /** Map a selectOffer failure to a bounded outcome label. Never changes control flow — the caller
   *  always re-throws the original exception; this only classifies it for the metric. */
  private selectOutcome(err: unknown): MatchSelectOutcome {
    if (err instanceof ForbiddenException) return "forbidden";
    if (err instanceof ConflictException) {
      const msg = err.message;
      if (msg.includes("no longer open")) return "not_open";
      if (msg.includes("just taken")) return "taken";
      if (msg.includes("no longer available") || msg.includes("just became unavailable")) return "unavailable";
    }
    return "error";
  }

  /**
   * Offer-window expiry. Runs the SAME guarded CAS as selection (ET1): if a customer already
   * selected, the order is no longer open_for_offers, count is 0, and this no-ops. Idempotent.
   */
  async expireOrder(orderId: string): Promise<{ expired: boolean }> {
    const result = await this.prisma.$transaction(async (tx) => {
      const res = await tx.order.updateMany({
        where: { id: orderId, status: "open_for_offers" },
        data: { status: "expired" },
      });
      if (res.count === 0) return { expired: false };

      await tx.offer.updateMany({ where: { orderId, status: "pending" }, data: { status: "expired" } });
      await tx.orderEvent.create({ data: { orderId, status: "expired" } });
      return { expired: true };
    });

    // Post-commit, best-effort. The auction closed with no pick, so (C2) signal `bid:expired` to the
    // bidders — the board rooms the order was broadcast to (gateway resolves the pickup cell) — the
    // single server timer authority firing, distinct from the `not_chosen`/`offers:changed` a select
    // produces — and prompt the customer to nudge the price (§5c).
    if (result.expired) {
      try {
        const ord = await this.prisma.order.findUnique({ where: { id: orderId }, select: { pickup: true } });
        const pt = (ord?.pickup as { point?: { lat: number; lng: number } } | null)?.point;
        this.gateway.emitBidExpired(orderId, pt?.lat, pt?.lng);
        // Push the status change to the order's own room too — without this the customer's countdown
        // just freezes at 0:00 until the 15s poll catches up, at the single most anxious moment of the
        // journey ("did anyone take my price?").
        this.gateway.emitOrderStatus(orderId, "expired");
      } catch (err) {
        this.logger.warn(`bid:expired emit failed for order ${orderId}: ${(err as Error).message}`);
      }
      void this.notifications.notifyOrderStatus(orderId, "expired");
    }
    return result;
  }
}
