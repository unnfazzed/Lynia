import { ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { MakeOfferRequest } from "@lynia/shared";
import { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";
import { TrackingGateway } from "../tracking/tracking.gateway";

@Injectable()
export class OffersService {
  private readonly logger = new Logger(OffersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly gateway: TrackingGateway,
  ) {}

  /** Rider responds once — accept the proposed fare or counter. One round per rider (ET7). */
  async makeOffer(input: MakeOfferRequest, riderId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: input.orderId },
      select: { status: true, customerId: true },
    });
    if (!order) throw new NotFoundException("Order not found");
    if (order.status !== "open_for_offers") {
      throw new ConflictException("This order is not open for offers");
    }

    // Gating (CONCEPT §5d): only a KYC-verified, online rider can offer.
    const rider = await this.prisma.rider.findUnique({
      where: { profileId: riderId },
      select: { kycStatus: true, isOnline: true },
    });
    if (!rider) throw new ForbiddenException("Not a rider");
    if (rider.kycStatus !== "verified") throw new ForbiddenException("Rider is not verified yet");
    // Enforce the online invariant the gating comment claims (was selected but never checked) — an
    // offline/cooled-down rider's offer is un-selectable anyway and just pollutes the customer's list.
    if (!rider.isOnline) throw new ForbiddenException("Go online to make offers");

    try {
      const offer = await this.prisma.offer.create({
        data: {
          orderId: input.orderId,
          riderId,
          type: input.type,
          offeredFare: input.offeredFare,
          etaMinutes: input.etaMinutes,
        },
        select: { id: true, type: true, offeredFare: true, etaMinutes: true, status: true },
      });
      // Post-commit, best-effort: nudge the customer that an offer arrived (§5c).
      void this.notifications.notifyNewOffer(input.orderId, order.customerId);
      // Post-commit, best-effort: signal the order room so a watching customer refetches the offer
      // list (SIGNAL ONLY — no offer contents on the wire; rider PII stays on the REST path).
      this.safeEmitOffersChanged(input.orderId);
      return { ...offer, offeredFare: offer.offeredFare.toString() };
    } catch (err) {
      // The unique (order_id, rider_id) index enforces the one-round rule.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw new ConflictException("You already responded to this order (one round only)");
      }
      throw err;
    }
  }

  /** Fire-and-forget offers-changed push (§5c). The gateway is best-effort, but wrap it so a WS
   *  failure can never surface into the just-committed offer create. */
  private safeEmitOffersChanged(orderId: string): void {
    try {
      this.gateway.emitOffersChanged(orderId);
    } catch (err) {
      this.logger.warn(`offers-changed emit failed for order ${orderId}: ${(err as Error).message}`);
    }
  }

  /** Pending offers for the customer's selection list (best-match sorting happens client-side, D-d). */
  async listForOrder(orderId: string) {
    const offers = await this.prisma.offer.findMany({
      where: { orderId, status: "pending" },
      select: {
        id: true,
        type: true,
        offeredFare: true,
        etaMinutes: true,
        rider: {
          select: {
            profileId: true,
            ratingAvg: true,
            ratingCount: true,
            tripsCount: true,
            profile: { select: { firstName: true, lastName: true, photoUrl: true } },
          },
        },
      },
    });
    return offers.map((o) => ({ ...o, offeredFare: o.offeredFare.toString() }));
  }
}
