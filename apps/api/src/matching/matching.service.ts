import { ConflictException, ForbiddenException, Injectable, Logger, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { BROADCAST, broadcastRadiusAtMs, OFFER_WINDOW_MS } from "@lynia/shared";
import { TokenService } from "../auth/token.service";
import { baseBroadcastRadiusM, effectiveBroadcastRadiusM, heartbeatMaxAgeMsForPush } from "../common/broadcast-policy";
import { hasLiveFoodDispatchOffer } from "../common/food-dispatch-lock";
import { hasOpenMerchantObligation } from "../common/merchant-debt-lock";
import { NotificationsService } from "../notifications/notifications.service";
import { MetricsService, type MatchSelectOutcome } from "../observability/metrics.service";
import { buildBoardNewOrderEvent, pickupPoint } from "../orders/waypoints";
import { PrismaService } from "../prisma/prisma.service";
import { blockedPairWhere } from "../reports/blocks";
import { onlineRefusalReason } from "../riders/rider.service";
import { TrackingGateway } from "../tracking/tracking.gateway";
import { TrackingService } from "../tracking/tracking.service";

/**
 * Rider must have a heartbeat newer than this to be selectable at the moment a customer taps "select"
 * (ET3 liveness). Widened 30s → 60s (KB-HEARTBEAT-MARGIN): the mobile client's heartbeat cadence is 20s
 * with a 15s request timeout, so the old 30s TTL left only a ~10s margin — a single delayed/dropped
 * heartbeat on a flaky connection could make a live, foregrounded rider look stale right at selection
 * time, throwing a spurious "rider just became unavailable" that steers the customer to a worse offer.
 * 60s clears a fully-missed heartbeat cycle (20s + the next 20s + the 15s timeout ≈ 55s) with margin,
 * while still catching a genuinely-gone rider within a minute. Distinct from BR-01's separate 120s
 * ghost-supply-count cutoff (tracking.service) — that counts live supply for the broadcast; this gates
 * one selection moment.
 */
const HEARTBEAT_TTL_MS = 60_000;

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
    private readonly tracking: TrackingService,
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

        // C3 soft-lock: a rider holding a live food auto-offer countdown (N-08) can't be selected for
        // a parcel either — mirrors the same guard at offer-creation (offers.service.ts:makeOffer);
        // this covers a bid placed BEFORE the food offer arrived, still sitting pending on the board.
        if (await hasLiveFoodDispatchOffer(tx, offer.riderId)) {
          throw new ConflictException("Rider just became unavailable, pick another");
        }
        // C4 soft-lock: a rider owing a merchant collect-and-return cash debt, or mid-doorstep
        // handshake, takes no new jobs until it's settled (N-20/R-05) — same "pick another" shape.
        if (await hasOpenMerchantObligation(tx, offer.riderId)) {
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
            // KB-DELIVERY-CODE-ROTATION-SIGNAL: stamp the code-issued time at assignment (the code's
            // FIRST issue) so `codeRotatedAt` is never confusingly null once an order has a code, and the
            // rider app has a rotation baseline. new Date() (not DB now()) here deliberately: this is the
            // sensitive bid-acceptance CAS, kept as the typed Prisma updateMany rather than rewritten to
            // raw SQL — and rotation always happens minutes after assignment, so the app-vs-DB clock skew
            // between this stamp and rotateDeliveryCode's now() can't reorder them.
            deliveryCodeRotatedAt: new Date(),
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
      if (res.count === 0) return { expired: false as const, hadOffers: false };

      // Did the auction attract ANY bid (any status — a withdrawn/declined offer still means a rider
      // engaged)? Distinguishes "riders were here but nobody committed / you weren't picked in time"
      // (→ raise your price) from "nobody was even around" (→ no-supply copy, computed post-commit).
      const offerCount = await tx.offer.count({ where: { orderId } });
      await tx.offer.updateMany({ where: { orderId, status: "pending" }, data: { status: "expired" } });
      await tx.orderEvent.create({ data: { orderId, status: "expired" } });
      return { expired: true as const, hadOffers: offerCount > 0 };
    });

    // Post-commit, best-effort. The auction closed with no pick, so (C2) signal `bid:expired` to the
    // bidders — the board rooms the order was broadcast to (gateway resolves the pickup cell) — the
    // single server timer authority firing, distinct from the `not_chosen`/`offers:changed` a select
    // produces — and prompt the customer to nudge the price (§5c).
    if (result.expired) {
      // Whether this was a genuine no-supply expiry (zero bids AND zero riders online nearby), which
      // picks the honest "nobody was online" copy over the default "raise your price" nudge. Starts
      // false so any failure below leaves the safe default copy — never a false "nobody's here".
      let noSupply = false;
      try {
        const ord = await this.prisma.order.findUnique({ where: { id: orderId }, select: { pickup: true, createdAt: true } });
        const pt = (ord?.pickup as { point?: { lat: number; lng: number } } | null)?.point;
        this.gateway.emitBidExpired(orderId, pt?.lat, pt?.lng);
        // Push the status change to the order's own room too — without this the customer's countdown
        // just freezes at 0:00 until the 15s poll catches up, at the single most anxious moment of the
        // journey ("did anyone take my price?").
        this.gateway.emitOrderStatus(orderId, "expired");
        // Only bother checking supply when there were NO bids — a no-bid window that also had no riders
        // online nearby was never a price problem, so "raise it" would be a lie. Judged at the radius
        // the broadcast had WIDENED to (policy BROADCAST.expansion) so "nobody was online" stays honest
        // after expansion. Best-effort: a geo blip throws into the catch → noSupply stays false → the
        // customer gets the safe default copy.
        if (!result.hadOffers && pt && ord) {
          const nearby = await this.tracking.nearbyRiders(pt.lat, pt.lng, effectiveBroadcastRadiusM(ord.createdAt));
          noSupply = nearby.length === 0;
          // Persist the no-supply verdict so the in-app feed / expired snapshot can pick the honest
          // "nobody was online" copy on later reads (the push already got it transiently above). Inside
          // this try/catch by design: a DB blip here degrades to the default "raise your price" copy —
          // same fail-safe philosophy as the push, never a false "nobody's here".
          if (noSupply) {
            await this.prisma.order.update({ where: { id: orderId }, data: { expiryNoSupply: true } });
          }
        }
      } catch (err) {
        this.logger.warn(`bid:expired emit failed for order ${orderId}: ${(err as Error).message}`);
      }
      void this.notifications.notifyOrderExpired(orderId, noSupply, result.hadOffers);
    }
    return { expired: result.expired };
  }

  /**
   * One widening tick of the broadcast (policy BROADCAST.expansion, step `stepIndex`), fired as a
   * delayed job by OfferExpiryService.schedule. Re-runs the broadcast at the step's wider radius and
   * pushes only the riders no earlier disc reached: the per-order sent set (claimBroadcastRecipients)
   * is the dedupe authority — which also picks up a rider who came online INSIDE an already-covered
   * ring — with pure ring geometry (distance > previous radius) as the no-Redis fallback. Lives here
   * (not OrdersService) to avoid an OrdersService ↔ OfferExpiryService constructor cycle.
   *
   * Wholly best-effort, mirroring broadcastToNearbyRiders: it never throws, and a missed tick is soft
   * — the next tick's set-difference covers the ring this one missed. No-ops once the order has left
   * open_for_offers (accepted/cancelled/expired mid-window).
   */
  async expandBroadcast(orderId: string, stepIndex: number): Promise<void> {
    try {
      const step = BROADCAST.expansion[stepIndex];
      if (!step) return;
      const base = baseBroadcastRadiusM();
      const newRadiusM = broadcastRadiusAtMs(step.atMs, base);
      const prevRadiusM = stepIndex === 0 ? base : broadcastRadiusAtMs(BROADCAST.expansion[stepIndex - 1].atMs, base);
      // Corridor cap or an env-raised base can make a step add nothing — skip rather than re-ping.
      if (newRadiusM <= prevRadiusM) return;

      const order = await this.prisma.order.findUnique({
        where: { id: orderId },
        select: {
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
      const pt = pickupPoint(order.pickup);
      if (!pt) return;

      // Re-emit the (redacted) card to the board rooms of the widened disc, so a rider 8–12 km out
      // watching the board sees it appear the moment their ring is reached. Clients dedupe by id, so
      // rooms already covered by the create-time emit harmlessly receive it again. Guarded on its own
      // so a schema/emit failure can't suppress the FCM ring push below.
      try {
        const boardEvent = buildBoardNewOrderEvent(orderId, order.pickup, order.dropoff, {
          itemDesc: order.itemDesc,
          suggestedFare: order.suggestedFare.toString(),
          proposedFare: order.proposedFare.toString(),
          distanceKm: order.distanceKm,
          createdAt: order.createdAt.toISOString(),
        });
        this.gateway.emitBoardNewOrderToCells(boardEvent, pt.lat, pt.lng, newRadiusM);
      } catch (err) {
        this.logger.warn(`expansion board emit failed for order ${orderId}: ${(err as Error).message}`);
      }

      // Widening FCM rebroadcast — same channel as the create-time broadcast, so it uses the PERMISSIVE
      // heartbeat cutoff too (heartbeatMaxAgeMsForPush): a backgrounded-but-online rider a wider ring now
      // reaches must still be pushable even though their foreground heartbeat stopped ~120 s ago (Fix 4).
      const nearby = await this.tracking.nearbyRiders(pt.lat, pt.lng, newRadiusM, heartbeatMaxAgeMsForPush());
      if (nearby.length === 0) return;
      const ids = nearby.map((r) => r.profileId);
      const claimed =
        (await this.tracking.claimBroadcastRecipients(orderId, ids)) ??
        // Redis unavailable → ring geometry: only riders beyond the previous disc. Worst case a rider
        // who rode outward across the boundary gets one duplicate push — the safe direction.
        nearby.filter((r) => r.distanceM > prevRadiusM).map((r) => r.profileId);
      if (claimed.length === 0) return;
      // DS17-01: this widening tick fires MID-window (t≈30s/60s), so the create-time flat OFFER_WINDOW TTL
      // would outlive the order's own 90s auction — a push sent at t=60s with a 90s TTL stays valid until
      // t=150s, long after the window closed at t=90s, so a reconnecting dead-zone rider could tap a dead
      // auction. Size the TTL to the order's ACTUAL remaining life instead. If it's already elapsed, don't
      // push at all — the expiry/reconciler owns closing the order out; a stale broadcast is pure noise.
      const remainingMs = order.createdAt.getTime() + OFFER_WINDOW_MS - Date.now();
      if (remainingMs <= 0) return;
      // LM-01: the ONLY status check above (`order.status !== "open_for_offers"`) ran before the two
      // async round-trips just above (nearbyRiders geo lookup + claimBroadcastRecipients) — a customer
      // select or a cancel landing in that window is invisible to it. DS17-01 bounds a push outliving the
      // order's OWN window; it does nothing for one that closed EARLY mid-tick. Re-read the status right
      // before the actual disruptive side effect (the FCM send) so a dead auction never invites a rider
      // to bid on it.
      const stillOpen = await this.prisma.order.findUnique({ where: { id: orderId }, select: { status: true } });
      if (stillOpen?.status !== "open_for_offers") return;
      // best-effort, never throws, un-awaited — same contract as the create-time fan-out.
      void this.notifications.notifyNewBroadcast(
        orderId,
        claimed,
        {
          pickup: pt.landmark,
          fare: order.proposedFare.toString(),
        },
        Math.max(1, Math.ceil(remainingMs / 1000)),
      );
    } catch (err) {
      this.logger.warn(`broadcast expansion step ${stepIndex} failed for order ${orderId}: ${(err as Error).message}`);
    }
  }
}
