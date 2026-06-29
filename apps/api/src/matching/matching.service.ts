import { ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { TokenService } from "../auth/token.service";
import { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";

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
  ) {}

  /**
   * Customer selects an offer. The assignment is a guarded compare-and-swap (ET1): the order
   * flips open_for_offers → assigned only if it is still open, so a concurrent select or the
   * expiry job can never double-assign. The one_active_ride partial-unique index (ET2) makes
   * the DB reject a rider who is selected on two orders at once. Liveness is checked in-tx (ET3).
   */
  async selectOffer(orderId: string, offerId: string, customerId: string): Promise<SelectResult> {
    try {
      const result = await this.prisma.$transaction(async (tx) => {
        const offer = await tx.offer.findFirst({
          where: { id: offerId, orderId },
          select: {
            status: true,
            riderId: true,
            offeredFare: true,
            order: { select: { status: true, customerId: true } },
            rider: { select: { isOnline: true, lastHeartbeatAt: true } },
          },
        });

        if (!offer) throw new NotFoundException("Offer not found for this order");
        if (offer.order.customerId !== customerId) throw new ForbiddenException("Not your order");
        if (offer.order.status !== "open_for_offers") {
          throw new ConflictException("This order is no longer open for offers");
        }
        if (offer.status !== "pending") throw new ConflictException("That offer is no longer available");

        const hb = offer.rider.lastHeartbeatAt?.getTime() ?? 0;
        const fresh = Date.now() - hb < HEARTBEAT_TTL_MS;
        if (!offer.rider.isOnline || !fresh) {
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
      return result;
    } catch (err) {
      // ET2: the rider is already on another active ride → one_active_ride unique violation.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw new ConflictException("Rider just became unavailable, pick another");
      }
      throw err;
    }
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

    // Post-commit, best-effort: prompt the customer to nudge the price and re-broadcast (§5c).
    if (result.expired) void this.notifications.notifyOrderStatus(orderId, "expired");
    return result;
  }
}
