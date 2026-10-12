import { ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { ACTIVE_RIDE_STATUSES, estimatePickupEtaMinutes, type MakeOfferRequest, offerWindowEndsAt } from "@lynia/shared";
import { assertRiderCoversCommission, jobCommission, ridersWhoCoverCommission } from "../common/commission-cover";
import { hasOpenMerchantObligation, openMerchantObligationOr } from "../common/merchant-debt-lock";
import { riderSelectableNow, SELECTABLE_RIDER_SELECT } from "../common/rider-selectable";
import { NotificationsService } from "../notifications/notifications.service";
import { MetricsService } from "../observability/metrics.service";
import { PrismaService } from "../prisma/prisma.service";
import { blockedPairWhere } from "../reports/blocks";
import { onlineRefusalReason } from "../riders/rider.service";
import { REFUSAL_MESSAGE } from "../riders/online-gate";
import { TrackingGateway } from "../tracking/tracking.gateway";

const WINDOW_CLOSED = "The offer window has closed. This order isn't taking new offers.";
const ONE_ROUND = "You already responded to this order (one round only)";
const ON_A_JOB = "Finish your current job before making another offer";

/** True once the order's offer window (offerWindowEndsAt, else createdAt + OFFER_WINDOW_MS) has run out. */
function windowClosed(order: { createdAt: Date; offerWindowEndsAt: Date | null }): boolean {
  return Date.now() >= offerWindowEndsAt(order).getTime();
}

@Injectable()
export class OffersService {
  private readonly logger = new Logger(OffersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly gateway: TrackingGateway,
    private readonly metrics: MetricsService,
  ) {}

  /**
   * Rider responds once — accept the proposed fare or counter. One round per rider (ET7), with one
   * exception (owner 2026-10-12, cold start): once the customer RAISES the price (`fareRaisedAt`), a rider
   * whose offer predates the raise — still pending, or withdrawn — may answer the new price. Their row is
   * replaced in place, so the unique (order, rider) index still means one live offer per rider.
   */
  async makeOffer(input: MakeOfferRequest, riderId: string) {
    const done = this.metrics.startTimer();
    const order = await this.prisma.order.findUnique({
      where: { id: input.orderId },
      select: { status: true, customerId: true, proposedFare: true, suggestedFare: true, orderType: true, createdAt: true, offerWindowEndsAt: true },
    });
    if (!order) throw new NotFoundException("Order not found");
    if (order.status !== "open_for_offers") {
      throw new ConflictException("This order is not open for offers");
    }
    // After-send v2 choose grace: once the window ends (offerWindowEndsAt, the snapshot's expiresAt) the
    // customer may still pick from the offers already on screen for OFFER_CHOOSE_GRACE_MS,
    // and the order stays `open_for_offers` meanwhile — so a status check alone would let a bid slip in
    // during the grace. New bids close at the window end. Re-checked under the row lock below.
    if (windowClosed(order)) {
      this.metrics.incOffersMade("conflict");
      throw new ConflictException(WINDOW_CLOSED);
    }
    // A-2 (status-keyed-query-audit): an Express bid is a parcel-only mechanism — a merchant order's
    // rider is C3's dispatch decision, never an offer a rider posts themselves.
    if (order.orderType !== "parcel") {
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

    // Block enforcement at CREATION, not just at selection (selectOffer). A blocked pair must never
    // re-match, and a block is a safety feature — so a rider the customer blocked (or who blocked the
    // customer) must not even be able to bid: otherwise they still trigger a "new offer" push to the
    // blocker and surface with their name/photo/ratings in the blocker's offer list before the 403 at
    // selection. Symmetric via blockedPairWhere, the same predicate selectOffer uses.
    const blocked = await this.prisma.block.findFirst({
      where: blockedPairWhere(order.customerId, riderId),
      select: { id: true },
    });
    if (blocked) {
      this.metrics.incOffersMade("forbidden");
      throw new ForbiddenException("You can't bid on this order");
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
      if (!rider) throw new ForbiddenException("Not a biker");
      // Throw the SHARED online-gate copy (REFUSAL_MESSAGE) rather than hand-rolled strings, so the offer
      // gate and the go-online gate can't drift. The prior on_hold copy here ("complete deliveries to
      // raise your reliability score") was impossible advice — an on-hold rider can't go online to deliver
      // anything; the shared map says "contact support to get back on the road". The kyc/banned/suspended/
      // cooldown copy is byte-identical to what these branches threw before, so nothing else changes
      // behaviourally; kyc_expired (previously unhandled → "Go online to make offers") now gets its
      // correct "re-verify your ID" copy too. The structured reason stays the contract.
      if (refusal) throw new ForbiddenException(REFUSAL_MESSAGE[refusal]);
      // Enforce the online invariant the gating comment claims (was selected but never checked) — an
      // offline rider's offer is un-selectable anyway and just pollutes the customer's list.
      throw new ForbiddenException("Go online to make offers");
    }

    // C4 soft-lock: a rider owing a merchant collect-and-return cash debt, or mid-doorstep handshake,
    // takes no new jobs until it's settled (N-20/R-05).
    if (await hasOpenMerchantObligation(this.prisma, riderId)) {
      this.metrics.incOffersMade("forbidden");
      throw new ForbiddenException("You have a food order still settling with a restaurant — finish that first");
    }

    // Owner 2026-10-12: a rider already on a job (the `one_active_ride` statuses) takes no new bids. Such an
    // offer could never be picked (listForOrder hides it, selectOffer 409s `rider_taken`), yet it used up
    // the rider's one round on the order, which the up-to-4-minute quiet-market window often outlives.
    const onJob = await this.prisma.order.findFirst({
      where: { riderId, status: { in: ACTIVE_RIDE_STATUSES } },
      select: { id: true },
    });
    if (onJob) {
      this.metrics.incOffersMade("forbidden");
      throw new ForbiddenException(ON_A_JOB);
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

    // Owner 2026-10-12: a rider can't take a job whose commission (10% of this fare, once their free jobs
    // are used) is more than their wallet balance. selectOffer re-checks at the pick.
    try {
      await assertRiderCoversCommission(this.prisma, riderId, jobCommission({ orderType: "parcel", agreedFare: input.offeredFare, suggestedFare: order.suggestedFare }));
    } catch (err) {
      this.metrics.incOffersMade("forbidden");
      throw err;
    }

    // The ETA the customer reads and ranks on (owner 2026-10-12): never shorter than the rider's straight-line
    // distance to the pickup allows. Since D-99 a rider anywhere in the country can bid, and the app's ETA
    // is a tapped chip nothing checks. Best-effort: with no known position the rider's own claim stands.
    const etaMinutes = Math.max(input.etaMinutes, (await this.estimatedEtaMinutes(input.orderId, riderId)) ?? 0);

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
        const locked = await tx.$queryRaw<
          Array<{ status: string; order_type: string; created_at: Date; offer_window_ends_at: Date | null; fare_raised_at: Date | null }>
        >(
          Prisma.sql`SELECT status, order_type, created_at, offer_window_ends_at, fare_raised_at FROM orders WHERE id = ${input.orderId}::uuid FOR UPDATE`,
        );
        // A-2: re-check orderType under the lock too — the pre-lock read above can't observe a
        // concurrent write, but orderType is immutable post-create, so this is belt-and-braces
        // consistency with the guard above, not a new race window.
        if (locked.length === 0 || locked[0].status !== "open_for_offers" || locked[0].order_type !== "parcel") {
          throw new ConflictException("This order is not open for offers");
        }
        // The window can end between the pre-check and the lock; the expiry job counts on no new bid
        // landing after it (an order with no pending offer at the window end expires right away).
        if (windowClosed({ createdAt: locked[0].created_at, offerWindowEndsAt: locked[0].offer_window_ends_at })) {
          throw new ConflictException(WINDOW_CLOSED);
        }
        const select = { id: true, type: true, offeredFare: true, etaMinutes: true, status: true } as const;
        const bid = { type: input.type, offeredFare: input.offeredFare, etaMinutes };
        const prior = await tx.offer.findUnique({
          where: { orderId_riderId: { orderId: input.orderId, riderId } },
          select: { id: true, status: true, createdAt: true },
        });
        if (!prior) return tx.offer.create({ data: { orderId: input.orderId, riderId, ...bid }, select });
        // Answering a raise: only an offer from BEFORE the latest raise, and only one still open to change
        // (pending, or withdrawn → `declined` while the order is open). Anything else is the one-round rule.
        const raisedAt = locked[0].fare_raised_at;
        const answersRaise = raisedAt !== null && prior.createdAt < raisedAt && (prior.status === "pending" || prior.status === "declined");
        if (!answersRaise) throw new ConflictException(ONE_ROUND);
        return tx.offer.update({ where: { id: prior.id }, data: { ...bid, status: "pending", createdAt: new Date() }, select });
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
        throw new ConflictException(ONE_ROUND);
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

  /** Minutes for the rider to reach this order's pickup from their last known position (PICKUP_ETA), or
   *  null when either point is unknown or the read fails — never a reason to refuse the bid. */
  private async estimatedEtaMinutes(orderId: string, riderId: string): Promise<number | null> {
    try {
      const rows = await this.prisma.$queryRaw<Array<{ distance_m: number | null }>>(
        Prisma.sql`SELECT ST_Distance(r.geog, o.pickup_geog) AS distance_m
                   FROM riders r, orders o
                   WHERE r.profile_id = ${riderId}::uuid AND o.id = ${orderId}::uuid`,
      );
      const d = rows[0]?.distance_m;
      return d == null ? null : estimatePickupEtaMinutes(Number(d));
    } catch (err) {
      this.logger.warn(`pickup ETA estimate failed for order ${orderId}: ${(err as Error).message}`);
      return null;
    }
  }

  /**
   * Rider v2 J10: the rider withdraws their own pending offer while the customer is still choosing. The
   * offer is marked `declined` (it leaves the customer's list, which shows pending offers only) rather
   * than deleted, so the one-round rule — the unique (order, rider) index — still stops a second bid
   * (until the customer raises the price: makeOffer then lets the rider answer the new one).
   * Allowed only while the order is open and the offer still pending; serialised against selectOffer
   * by the same order-row lock makeOffer takes, so a withdraw can never race a pick.
   */
  async withdrawOffer(orderId: string, riderId: string) {
    return this.prisma.$transaction(async (tx) => {
      const locked = await tx.$queryRaw<Array<{ status: string }>>(
        Prisma.sql`SELECT status FROM orders WHERE id = ${orderId}::uuid FOR UPDATE`,
      );
      if (locked.length === 0) throw new NotFoundException("Order not found");
      if (locked[0].status !== "open_for_offers") throw new ConflictException("The customer has already chosen");
      const offer = await tx.offer.findUnique({
        where: { orderId_riderId: { orderId, riderId } },
        select: { id: true, status: true },
      });
      if (!offer) throw new NotFoundException("No offer to withdraw");
      if (offer.status !== "pending") throw new ConflictException("This offer is already closed");
      await tx.offer.update({ where: { id: offer.id }, data: { status: "declined" } });
      return { orderId, withdrawn: true as const };
    }).then((res) => {
      this.safeEmitOffersChanged(orderId);
      return res;
    });
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
      select: { customerId: true, suggestedFare: true },
    });
    if (!order) throw new NotFoundException("Order not found");
    if (order.customerId !== callerId) throw new ForbiddenException("Not your order");

    // Same block-pair enforcement as makeOffer/selectOffer: a rider blocked (either direction) after
    // bidding must not keep surfacing their name/photo/ratings here — makeOffer only stops NEW offers
    // from a blocked pair, so an existing pending offer placed before the block needs filtering here.
    const blocks = await this.prisma.block.findMany({
      where: { OR: [{ blockerProfileId: order.customerId }, { blockedProfileId: order.customerId }] },
      select: { blockerProfileId: true, blockedProfileId: true },
    });
    const blockedRiderIds = blocks.map((b) => (b.blockerProfileId === order.customerId ? b.blockedProfileId : b.blockerProfileId));

    const offers = await this.prisma.offer.findMany({
      where: { orderId, status: "pending", ...(blockedRiderIds.length > 0 ? { riderId: { notIn: blockedRiderIds } } : {}) },
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
            ...SELECTABLE_RIDER_SELECT,
          },
        },
      },
    });
    // MJ-RL2 / U62 (C10): an offer selectOffer would refuse — its rider went offline, lost standing, or owes
    // a venue cash (the same three gates, common/rider-selectable.ts + the merchant-debt soft-lock) — stays
    // pending, but it isn't choosable, so it leaves the list instead of drawing a Choose that only 409s.
    // The gate fields are read for the check only; the wire shape is unchanged.
    // Review (MJ-RL2 / U62): a rider already on an active ride elsewhere (the `one_active_ride` index's
    // statuses, ACTIVE_RIDE_STATUSES) can't be assigned either — selectOffer 409s `rider_taken` on every
    // Choose — so they leave too. One batched read for every rider on the list covers both that and the
    // merchant-debt soft-lock (the same OR arms hasOpenMerchantObligation uses), not one query per offer.
    const now = Date.now();
    const live = offers.filter((o) => riderSelectableNow(o.rider, now));
    const riderIds = [...new Set(live.map((o) => o.rider.profileId))];
    const held =
      riderIds.length === 0
        ? []
        : await this.prisma.order.findMany({
            where: { riderId: { in: riderIds }, OR: [{ status: { in: ACTIVE_RIDE_STATUSES } }, ...openMerchantObligationOr()] },
            select: { riderId: true },
          });
    const busy = new Set(held.map((h) => h.riderId));
    // Owner 2026-10-12: a rider whose wallet no longer covers the commission on their own offered fare
    // can't be picked (selectOffer refuses), so their offer leaves the list too.
    const fareBy = new Map(live.map((o) => [o.rider.profileId, Number(o.offeredFare)]));
    const covering = await ridersWhoCoverCommission(this.prisma, riderIds, (id) =>
      jobCommission({ orderType: "parcel", agreedFare: fareBy.get(id), suggestedFare: order.suggestedFare }),
    );
    return live
      .filter((o) => !busy.has(o.rider.profileId) && covering.has(o.rider.profileId))
      .map(({ rider, ...o }) => ({
        ...o,
        offeredFare: o.offeredFare.toString(),
        rider: { profileId: rider.profileId, ratingAvg: rider.ratingAvg, ratingCount: rider.ratingCount, tripsCount: rider.tripsCount, profile: rider.profile },
      }));
  }
}
