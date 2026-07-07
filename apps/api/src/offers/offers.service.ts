import { ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import type { MakeOfferRequest } from "@lynia/shared";
import { NotificationsService } from "../notifications/notifications.service";
import { MetricsService } from "../observability/metrics.service";
import { PrismaService } from "../prisma/prisma.service";
import { onlineRefusalReason } from "../riders/rider.service";
import { TrackingGateway } from "../tracking/tracking.gateway";

@Injectable()
export class OffersService {
  private readonly logger = new Logger(OffersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly gateway: TrackingGateway,
    private readonly metrics: MetricsService,
  ) {}

  /** Rider responds once — accept the proposed fare or counter. One round per rider (ET7). */
  async makeOffer(input: MakeOfferRequest, riderId: string) {
    const done = this.metrics.startTimer();
    const order = await this.prisma.order.findUnique({
      where: { id: input.orderId },
      select: { status: true, customerId: true, proposedFare: true },
    });
    if (!order) throw new NotFoundException("Order not found");
    if (order.status !== "open_for_offers") {
      throw new ConflictException("This order is not open for offers");
    }
    // No self-bidding: order-create carries no role gate, so a rider-role profile can post its own
    // order and then bid on it as the rider — self-selecting, self-delivering (it holds the OTP), and
    // self-rating to farm ratings/reliability, or yanking open orders off the board. The customer and
    // the bidding rider must be different profiles.
    if (order.customerId === riderId) {
      this.metrics.incOffersMade("forbidden");
      throw new ForbiddenException("You can't bid on your own order");
    }

    // Gating (CONCEPT §5d): only a KYC-verified, online rider IN GOOD STANDING can offer. Reuses the
    // shared online-gate (P2-1): kyc + account standing (banned/suspended) + reliability on_hold +
    // cooldown — so a rider banned/suspended while online can't keep bidding. A gating rejection is a
    // forbidden outcome for the offers-made counter (no latency histogram — it never reached create).
    const rider = await this.prisma.rider.findUnique({
      where: { profileId: riderId },
      select: { kycStatus: true, isOnline: true, accountStatus: true, onHold: true, cooldownUntil: true },
    });
    const refusal = rider ? onlineRefusalReason(rider) : null;
    if (!rider || refusal || !rider.isOnline) {
      this.metrics.incOffersMade("forbidden");
      if (!rider) throw new ForbiddenException("Not a rider");
      if (refusal === "kyc") throw new ForbiddenException("Rider is not verified yet");
      if (refusal === "banned") throw new ForbiddenException("Your rider account has been banned");
      if (refusal === "suspended") throw new ForbiddenException("Your rider account is suspended");
      if (refusal === "on_hold") throw new ForbiddenException("You're on hold — complete deliveries to raise your reliability score");
      if (refusal === "cooldown") throw new ForbiddenException("On cooldown after repeated cancellations — try again later");
      // Enforce the online invariant the gating comment claims (was selected but never checked) — an
      // offline rider's offer is un-selectable anyway and just pollutes the customer's list.
      throw new ForbiddenException("Go online to make offers");
    }

    // An `accept` means "I'll take the customer's proposed price" — bind the fare to `proposedFare`
    // rather than trusting the client's number, so a modified client can't send type:"accept" with an
    // inflated `offeredFare` and have selectOffer later set that as the agreedFare. `proposedFare` is a
    // NOT NULL column, so the null guard only relaxes minimal unit-test fixtures, never production.
    if (
      input.type === "accept" &&
      order.proposedFare != null &&
      Math.round(input.offeredFare * 100) !== Math.round(Number(order.proposedFare) * 100)
    ) {
      this.metrics.incOffersMade("forbidden");
      throw new ForbiddenException("An accept must match the customer's proposed fare");
    }

    try {
      const offer = await this.prisma.$transaction(async (tx) => {
        // Re-lock the order row and re-verify it's still open INSIDE the transaction. The status read
        // above and the insert are otherwise a check-then-act with a gap: a concurrent selectOffer can
        // assign (or offer-expiry can close) the order in between, leaving this `pending` offer stranded
        // on a no-longer-open order (never selectable — selectOffer's CAS guards that — but real DB
        // drift that surfaces in the customer's offer list). selectOffer assigns via a guarded CAS that
        // row-locks the order, so taking FOR UPDATE here serializes the two: either the assign commits
        // first (we then read a non-open status and reject) or it waits for us (and its decline-pending
        // sweep then includes our just-created offer).
        const locked = await tx.$queryRaw<Array<{ status: string }>>(
          Prisma.sql`SELECT status FROM orders WHERE id = ${input.orderId}::uuid FOR UPDATE`,
        );
        if (locked.length === 0 || locked[0].status !== "open_for_offers") {
          throw new ConflictException("This order is not open for offers");
        }
        return tx.offer.create({
          data: {
            orderId: input.orderId,
            riderId,
            type: input.type,
            offeredFare: input.offeredFare,
            etaMinutes: input.etaMinutes,
          },
          select: { id: true, type: true, offeredFare: true, etaMinutes: true, status: true },
        });
      });
      // Post-commit, best-effort: nudge the customer that an offer arrived (§5c).
      void this.notifications.notifyNewOffer(input.orderId, order.customerId);
      // Post-commit, best-effort: signal the order room so a watching customer refetches the offer
      // list (SIGNAL ONLY — no offer contents on the wire; rider PII stays on the REST path).
      this.safeEmitOffersChanged(input.orderId);
      // Success: record end-to-end offer-make latency + the created counter.
      this.metrics.recordOfferLatency(done());
      this.metrics.incOffersMade("created");
      return { ...offer, offeredFare: offer.offeredFare.toString() };
    } catch (err) {
      // The unique (order_id, rider_id) index enforces the one-round rule.
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        this.metrics.incOffersMade("conflict");
        throw new ConflictException("You already responded to this order (one round only)");
      }
      // Lost the race under the row lock — the order closed between the pre-check and the insert. That's
      // a conflict (the rider just missed the window), not a server error.
      if (err instanceof ConflictException) {
        this.metrics.incOffersMade("conflict");
        throw err;
      }
      this.metrics.incOffersMade("error");
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

  /** Pending offers for the customer's selection list (best-match sorting happens client-side, D-d).
   *  Ownership-gated: the offer list carries rider PII (name, photo, ratings, bids), so only the
   *  order's customer may read it — not any authenticated caller holding the order id (IDOR). */
  async listForOrder(orderId: string, callerId: string) {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { customerId: true },
    });
    if (!order) throw new NotFoundException("Order not found");
    if (order.customerId !== callerId) throw new ForbiddenException("Not your order");
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
