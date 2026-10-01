import { ConflictException, ForbiddenException, Inject, Injectable, Logger, NotFoundException, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  dispatchRoundSize,
  FoodOfferEvent,
  type HeldReason,
  RELIABILITY,
  RESTAURANTS_DISPATCH,
  RIDER_STRIKE_COOLDOWN_MS,
  type Waypoint,
} from "@lynia/shared";
import { TokenService } from "../auth/token.service";
import { CANCEL_STRIKE_LIMIT } from "../orders/order-lifecycle.constants";
import { NotificationsService } from "../notifications/notifications.service";
import { publicWaypoint } from "../orders/waypoints";
import { PrismaService } from "../prisma/prisma.service";
import { applyReliabilityDelta } from "../riders/reliability";
import { TrackingGateway } from "../tracking/tracking.gateway";
import { DISPATCH_STRATEGY, type DispatchStrategy } from "./dispatch-strategy";
import { notifyFoodQueueChanged, resolveOwnMerchantId } from "./merchant-lookup.util";
import { preferredRiderIds } from "./preferred-riders";

/**
 * C3 — food dispatch. Owns the hand-off `ready_for_pickup` → assigned a merchant order's kitchen
 * phase (C2) leaves open ("Hand-off point to C3: broadcasting this order... is dispatch's job, not
 * this method's" — food-order.service.ts:markReady).
 *
 * Unlike Express's broadcast-to-everyone-let-the-customer-pick auction, a food order is prepared and
 * ready to travel by the time dispatch starts (R-11/R-17: prep begins at payment confirm, well
 * before `markReady`), so there is no "don't start cooking" gate left to enforce here — D-04's
 * original "cooking before rider secured is the expensive mistake" framing predates the locked R-11
 * prep-starts-at-payment-confirm ordering; what survives is D-04's OTHER half, which this service
 * implements verbatim: "rider secured" as a first-class, pushed event for all three actors, and D-33/
 * D-34's re-dispatch mechanics once a rider IS secured and then drops out. (Per the plan's own
 * "where this doc and the code disagree, the code wins — reconcile and flag it" instruction; called
 * out again in the PR body.)
 *
 * Rounds (owner decision 2026-10-01, ledger D-54): each 60s round offers the job to several riders at
 * once — the best `RESTAURANTS_DISPATCH.firstRoundSize` on the first round (the restaurant's own riders
 * first, then the nearest), everyone eligible on every round after — and the first to accept gets it.
 * A rider's live offer is their own `FoodDispatchAttempt` row (`pending`, unexpired) on an order at
 * `open_for_offers`; the order's `dispatchOfferExpiresAt` is the round's end. A rider who passes (or
 * drops the job) is never offered it again this cycle; one who simply let a round run out is.
 *
 * State model (reuses OrderStatus, no new values — plan §0b.1): a merchant order sits at `requested`
 * while dispatch is either searching (no live round) or holding (NO_RIDER cap exhausted, D-34), and
 * at `open_for_offers` for the ~60s a round is live (N-08) — the SAME status value
 * Express uses for its own auction, safe because C1/C2 already added `orderType` filters to every
 * Express read/write keyed on it (status-keyed-query-audit A-1..A-4). `merchantPhase` stays
 * `ready_for_pickup` for the entire dispatch lifetime (search, offered, hold) and is cleared to null
 * only on a genuine hand-off out — acceptance (assigned) or cancellation — mirroring how every other
 * MerchantPhase exit already clears it without its own MERCHANT_PHASE_TRANSITIONS row.
 *
 * DB-only reconciler (no BullMQ), same reasoning as FoodOrderService: `RESTAURANTS_DISPATCH.
 * sweepIntervalMs` (20s) is tight enough to read as "auto" against the 60s offer window without a
 * queue/worker per order.
 */
@Injectable()
export class FoodDispatchService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FoodDispatchService.name);
  private sweep?: ReturnType<typeof setInterval>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    private readonly notifications: NotificationsService,
    private readonly gateway: TrackingGateway,
    @Inject(DISPATCH_STRATEGY) private readonly strategy: DispatchStrategy,
  ) {}

  onModuleInit(): void {
    void this.runSweeps();
    this.sweep = setInterval(() => void this.runSweeps(), RESTAURANTS_DISPATCH.sweepIntervalMs);
    this.sweep.unref?.();
  }

  onModuleDestroy(): void {
    if (this.sweep) clearInterval(this.sweep);
  }

  /** C5 kitchen socket queue: best-effort push for a dispatch-driven change the merchant's OWN client
   *  didn't just cause locally (rider secured, NO_RIDER hold, a rider dropping) — mirrors
   *  food-order.service.ts's identical helper. */
  private notifyQueue(merchantId: string | null | undefined, orderId: string): void {
    notifyFoodQueueChanged(this.gateway, merchantId, orderId);
  }

  private async runSweeps(): Promise<void> {
    try {
      await this.sweepExpiredOffers();
    } catch (err) {
      this.logger.error(`sweepExpiredOffers failed: ${(err as Error).message}`);
    }
    try {
      await this.sweepSearch();
    } catch (err) {
      this.logger.error(`sweepSearch failed: ${(err as Error).message}`);
    }
  }

  // ── Reconciler sweeps ────────────────────────────────────────────────────────────────────────────

  /** N-08: a live round whose 60s window elapsed with nobody accepting. Always lands back at
   *  `requested` (re-enter the search — sweepSearch's next pass opens the next round); the cap check
   *  lives there, not here, so this method's job is purely "close out a stale round". */
  async sweepExpiredOffers(): Promise<{ expired: number }> {
    let expired = 0;
    const stale = await this.prisma.order.findMany({
      where: { orderType: "merchant", status: "open_for_offers", dispatchOfferExpiresAt: { lt: new Date() } },
      select: { id: true, dispatchOfferExpiresAt: true },
      take: 200,
    });
    for (const o of stale) {
      if (!o.dispatchOfferExpiresAt) continue;
      try {
        if (await this.closeRound(o.id, o.dispatchOfferExpiresAt)) expired++;
      } catch (err) {
        this.logger.error(`sweepExpiredOffers failed for order ${o.id}: ${(err as Error).message}`);
      }
    }
    return { expired };
  }

  /** Orders due for their next dispatch tick: never started (dispatchAttempt=0) or past their
   *  dispatchNextCheckAt (a prior no-candidate poll, or immediately after a decline/expire). */
  async sweepSearch(): Promise<{ offered: number; held: number }> {
    let offered = 0;
    let held = 0;
    const due = await this.prisma.order.findMany({
      where: {
        orderType: "merchant",
        status: "requested",
        merchantPhase: "ready_for_pickup",
        noRiderHoldAt: null,
        OR: [{ dispatchAttempt: 0 }, { dispatchNextCheckAt: { lte: new Date() } }],
      },
      select: { id: true },
      take: 200,
    });
    for (const o of due) {
      try {
        const outcome = await this.tick(o.id);
        if (outcome === "offered") offered++;
        if (outcome === "held") held++;
      } catch (err) {
        this.logger.error(`sweepSearch tick failed for order ${o.id}: ${(err as Error).message}`);
      }
    }
    return { offered, held };
  }

  /** One dispatch round: ask the strategy for this round's riders (the best 10 first, everyone after),
   *  either offer it to all of them at once (`dispatch_offer`, N-08) or park for the next poll
   *  (`dispatch_search` self-loop) — unless the NO_RIDER cap (N-07) is exhausted, which enters the
   *  D-34 merchant hold instead. */
  private async tick(orderId: string): Promise<"offered" | "searching" | "held" | "skipped"> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        status: true,
        merchantPhase: true,
        merchantId: true,
        noRiderHoldAt: true,
        dispatchAttempt: true,
        dispatchExcludedRiderIds: true,
        dispatchStartedAt: true,
        pickup: true,
        dropoff: true,
        itemDesc: true,
        merchantGoodsTotal: true,
        deliveryFee: true,
        distanceKm: true,
        merchantPaymentMethod: true,
        merchantCashRule: true,
      },
    });
    if (!order || order.status !== "requested" || order.merchantPhase !== "ready_for_pickup" || order.noRiderHoldAt) {
      return "skipped"; // raced with a concurrent accept/drop/cancel — the next relevant sweep re-evaluates.
    }

    const attempt = order.dispatchAttempt + 1;
    if (attempt > RESTAURANTS_DISPATCH.maxAttempts) {
      const claimed = await this.prisma.order.updateMany({
        where: { id: orderId, status: "requested", dispatchAttempt: order.dispatchAttempt, noRiderHoldAt: null },
        data: { noRiderHoldAt: new Date(), dispatchNextCheckAt: null },
      });
      if (claimed.count === 0) return "skipped";
      this.logger.log(`order ${orderId}: NO_RIDER cap reached — merchant hold (D-34)`);
      this.notifyQueue(order.merchantId, orderId);
      return "held";
    }

    const merchant = order.merchantId
      ? await this.prisma.merchant.findUnique({ where: { id: order.merchantId }, select: { location: true } })
      : null;
    const point = (merchant?.location as Waypoint | null)?.point;
    if (!point) {
      // No location to search from — shouldn't happen (placeOrder requires one), but never silently
      // spin forever on a data problem: park at the same attempt count, retry next sweep pass.
      return "skipped";
    }

    const radiusM = RESTAURANTS_DISPATCH.radiusM;
    const candidates = await this.strategy.pickCandidates({
      lat: point.lat,
      lng: point.lng,
      radiusM,
      excludeRiderIds: order.dispatchExcludedRiderIds,
      preferredRiderIds: await this.preferredFor(order.merchantId),
      limit: dispatchRoundSize(attempt),
    });
    for (const c of candidates) {
      if (c.preferred) this.logger.log(`merchant.dispatch.preferred order=${orderId} rider=${c.riderId} distanceM=${Math.round(c.distanceM)}`);
    }
    const now = new Date();
    const startedAt = order.dispatchStartedAt ?? now;

    if (candidates.length === 0) {
      const claimed = await this.prisma.order.updateMany({
        where: { id: orderId, status: "requested", dispatchAttempt: order.dispatchAttempt, noRiderHoldAt: null },
        data: {
          dispatchAttempt: attempt,
          dispatchStartedAt: startedAt,
          dispatchNextCheckAt: new Date(now.getTime() + RESTAURANTS_DISPATCH.offerWindowMs),
        },
      });
      return claimed.count > 0 ? "searching" : "skipped";
    }

    const expiresAt = new Date(now.getTime() + RESTAURANTS_DISPATCH.offerWindowMs);
    const claimed = await this.prisma.order.updateMany({
      where: { id: orderId, status: "requested", dispatchAttempt: order.dispatchAttempt, noRiderHoldAt: null },
      data: {
        status: "open_for_offers",
        dispatchOfferedRiderId: null,
        dispatchOfferExpiresAt: expiresAt,
        dispatchAttempt: attempt,
        dispatchStartedAt: startedAt,
        dispatchNextCheckAt: expiresAt,
      },
    });
    if (claimed.count === 0) return "skipped";
    if (attempt === 1) await this.prisma.orderEvent.create({ data: { orderId, status: "open_for_offers" } });
    // One row per (order, rider): a rider who let an earlier round run out is offered again on the same
    // row, reset to pending with this round's expiry. Riders who passed never get here (excluded above).
    const riderIds = candidates.map((c) => c.riderId);
    try {
      await this.prisma.$transaction(async (tx) => {
        for (const riderId of riderIds) {
          await tx.foodDispatchAttempt.upsert({
            where: { orderId_riderId: { orderId, riderId } },
            create: { orderId, riderId, attemptNumber: attempt, radiusM, offeredAt: now, expiresAt },
            update: { attemptNumber: attempt, radiusM, offeredAt: now, expiresAt, outcome: "pending", respondedAt: null },
          });
        }
      });
    } catch (err) {
      // Without the rows nobody can accept: close the round now so the next sweep opens a fresh one.
      this.logger.error(`FoodDispatchAttempt write failed for order ${orderId}: ${(err as Error).message}`);
      await this.closeRound(orderId, expiresAt);
      return "skipped";
    }
    void this.notifications.notifyProfiles(riderIds, {
      title: "New food pickup",
      body: "A kitchen order is ready nearby — tap to accept before another rider takes it.",
      data: { orderId, kind: "food_offer" },
    });
    // C5 rider offer alarm channel: the live-app signal alongside the push above — GET
    // /merchant/orders/dispatch/offer is the reconnect/poll fallback for the SAME offer this builds.
    // Best-effort: emitFoodOffer never throws, and a build failure here must never undo the round
    // that just committed above.
    try {
      const event = this.buildFoodOfferEvent(orderId, order.merchantId!, order, expiresAt);
      for (const riderId of riderIds) void this.gateway.emitFoodOffer(riderId, event);
    } catch (err) {
      this.logger.warn(`food:offer build failed for order ${orderId}: ${(err as Error).message}`);
    }
    return "offered";
  }

  /** The restaurant's own riders (L3), read once per tick. Best effort: a failed read logs and dispatch
   *  carries on nearest-first, exactly as before L3 (plan §8 "preferred lookup error"). */
  private async preferredFor(merchantId: string | null): Promise<string[]> {
    if (!merchantId) return [];
    try {
      return await preferredRiderIds(this.prisma, merchantId);
    } catch (err) {
      this.logger.warn(`merchant.dispatch.preferred lookup failed for merchant ${merchantId}: ${(err as Error).message}`);
      return [];
    }
  }

  /** REDACTED (point + landmark, never contactPhone — mirrors `buildBoardNewOrderEvent`) offer
   *  payload shared by the WS push (`emitFoodOffer`) and the rider's poll-fallback GET
   *  (`getOfferForRider`), so the two channels can never drift. Throws on a schema mismatch — callers
   *  treat this as best-effort. */
  private buildFoodOfferEvent(
    orderId: string,
    merchantId: string,
    order: {
      pickup: Prisma.JsonValue;
      dropoff: Prisma.JsonValue;
      itemDesc: string;
      merchantGoodsTotal: Prisma.Decimal | null;
      deliveryFee: Prisma.Decimal | null;
      distanceKm: Prisma.Decimal | number | null;
      merchantPaymentMethod?: string | null;
      merchantCashRule?: string | null;
    },
    expiresAt: Date,
  ): FoodOfferEvent {
    return FoodOfferEvent.parse({
      orderId,
      merchantId,
      pickup: publicWaypoint(order.pickup),
      dropoff: publicWaypoint(order.dropoff),
      itemDesc: order.itemDesc,
      merchantGoodsTotal: order.merchantGoodsTotal != null ? Number(order.merchantGoodsTotal) : null,
      deliveryFee: order.deliveryFee != null ? Number(order.deliveryFee) : null,
      distanceKm: order.distanceKm != null ? Number(order.distanceKm) : null,
      expiresAt: expiresAt.toISOString(),
      // D5: the offer variant the rider decides accept/decline against (R-01/R-03/R-10/R-12).
      merchantPaymentMethod: order.merchantPaymentMethod ?? null,
      merchantCashRule: order.merchantCashRule ?? null,
    });
  }

  /** Close a live round that ended WITHOUT acceptance (it ran out, or every rider on it passed): back
   *  to `requested` for the next sweepSearch pass, every still-pending row on it marked expired and its
   *  alarm closed. The CAS on the round's own expiry decides a race — a concurrent accept, or a round
   *  already closed, leaves it affecting zero rows, and this returns false. */
  private async closeRound(orderId: string, roundExpiresAt: Date): Promise<boolean> {
    const claimed = await this.prisma.order.updateMany({
      where: { id: orderId, status: "open_for_offers", dispatchOfferExpiresAt: roundExpiresAt },
      data: { status: "requested", dispatchOfferedRiderId: null, dispatchOfferExpiresAt: null, dispatchNextCheckAt: new Date() },
    });
    if (claimed.count === 0) return false;
    await this.expirePending(orderId);
    return true;
  }

  /** Mark every still-pending row on the order expired (but `exceptRiderId`'s) and close those riders'
   *  offer alarms (C5) — the only signal a rider whose phone is still ringing gets. */
  private async expirePending(orderId: string, exceptRiderId?: string): Promise<void> {
    const where: Prisma.FoodDispatchAttemptWhereInput = { orderId, outcome: "pending", ...(exceptRiderId ? { riderId: { not: exceptRiderId } } : {}) };
    const open = await this.prisma.foodDispatchAttempt.findMany({ where, select: { riderId: true } });
    if (open.length === 0) return;
    await this.prisma.foodDispatchAttempt.updateMany({ where, data: { outcome: "expired", respondedAt: new Date() } });
    for (const { riderId } of open) void this.gateway.emitFoodOfferClosed(riderId, orderId);
  }

  /** The order behind the rider's live offer, or the reason they have none: not offered it at all
   *  (403), or the round closed, someone else took it, they already answered, or it ran out (409). */
  private async liveOffer(orderId: string, riderId: string): Promise<{ merchantId: string | null; roundExpiresAt: Date | null; excluded: string[] }> {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, orderType: "merchant" },
      select: { status: true, merchantId: true, dispatchOfferExpiresAt: true, dispatchExcludedRiderIds: true },
    });
    if (!order) throw new NotFoundException("Order not found");
    const offer = await this.prisma.foodDispatchAttempt.findUnique({
      where: { orderId_riderId: { orderId, riderId } },
      select: { outcome: true, expiresAt: true },
    });
    if (!offer) throw new ForbiddenException("This offer isn't yours");
    if (order.status !== "open_for_offers" || offer.outcome !== "pending") throw new ConflictException("This offer is no longer live");
    if (offer.expiresAt.getTime() < Date.now()) throw new ConflictException("This offer just expired, pick your next job");
    return { merchantId: order.merchantId, roundExpiresAt: order.dispatchOfferExpiresAt, excluded: order.dispatchExcludedRiderIds };
  }

  // ── Rider actions ────────────────────────────────────────────────────────────────────────────────

  /** C5 rider offer alarm channel — the poll/reconnect fallback GET (plan §10 blocker) for the SAME
   *  offer `food:offer` announces: a rider whose socket was down when the offer landed, or who just
   *  opened the app cold, can ask "do I have a live offer right now?" without knowing an orderId up
   *  front (unlike every other dispatch action here, which is `:orderId`-scoped). Null when this
   *  rider holds no live offer — not an error, since "nothing right now" is the normal state. */
  async getOfferForRider(riderId: string): Promise<FoodOfferEvent | null> {
    // Several orders can ring the same rider at once; the one running out first is shown first.
    const offer = await this.prisma.foodDispatchAttempt.findFirst({
      where: { riderId, outcome: "pending", expiresAt: { gt: new Date() }, order: { orderType: "merchant", status: "open_for_offers" } },
      orderBy: { expiresAt: "asc" },
      select: {
        expiresAt: true,
        order: {
          select: {
            id: true,
            merchantId: true,
            pickup: true,
            dropoff: true,
            itemDesc: true,
            merchantGoodsTotal: true,
            deliveryFee: true,
            distanceKm: true,
            merchantPaymentMethod: true,
            merchantCashRule: true,
          },
        },
      },
    });
    if (!offer || !offer.order.merchantId) return null;
    return this.buildFoodOfferEvent(offer.order.id, offer.order.merchantId, offer.order, offer.expiresAt);
  }

  /** D-04 "rider secured" — a rider on the live round accepts, and the first to do so gets it. Mirrors
   *  matching.service.ts:selectOffer's shape (mint a fresh delivery code, one_active_ride race handled
   *  the same way); every other rider on the round is told it's gone. */
  async acceptDispatch(orderId: string, riderId: string): Promise<{ orderId: string; status: "assigned" }> {
    const order = await this.liveOffer(orderId, riderId);

    const deliveryCode = this.tokens.randomOtp();
    try {
      // First writer wins. The CAS is on the round itself, so a rider whose round closed (and maybe
      // reopened without them) between the read above and here loses cleanly.
      const claimed = await this.prisma.order.updateMany({
        where: { id: orderId, status: "open_for_offers", dispatchOfferExpiresAt: order.roundExpiresAt },
        data: {
          status: "assigned",
          riderId,
          merchantPhase: null,
          otpHash: this.tokens.hash(deliveryCode),
          deliveryOtpAttempts: 0,
          deliveryCodeRotatedAt: new Date(),
          dispatchOfferedRiderId: null,
          dispatchOfferExpiresAt: null,
          dispatchNextCheckAt: null,
        },
      });
      if (claimed.count === 0) throw new ConflictException("This offer is no longer live");
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw new ConflictException("You're already on another active job");
      }
      throw err;
    }
    await this.prisma.foodDispatchAttempt.updateMany({
      where: { orderId, riderId, outcome: "pending" },
      data: { outcome: "accepted", respondedAt: new Date() },
    });
    await this.expirePending(orderId, riderId);
    await this.prisma.orderEvent.create({ data: { orderId, status: "assigned" } });

    // D-04: "rider secured" is a first-class, pushed event for all three actors. Customer + rider both
    // reach the order's WS room the same way a parcel `assigned` push does; the kitchen tablet now has
    // its own channel too (C5 "kitchen socket queue" — see notifyQueue below), closing the gap this
    // comment used to name.
    try {
      this.gateway.emitOrderStatus(orderId, "assigned");
    } catch (err) {
      this.logger.warn(`rider-secured emit failed for order ${orderId}: ${(err as Error).message}`);
    }
    this.notifyQueue(order.merchantId, orderId);
    void this.notifications.notifyProfiles([riderId], {
      title: "You got the job",
      body: "Head to the kitchen — you're the confirmed rider for this order.",
      data: { orderId, status: "assigned" },
    });
    const fresh = await this.prisma.order.findUnique({ where: { id: orderId }, select: { customerId: true } });
    if (fresh) {
      void this.notifications.notifyProfiles([fresh.customerId], {
        title: "Rider secured",
        body: "A rider is on the way to collect your order from the kitchen.",
        // to+orderType so the tap opens the food tracker: "assigned" alone routes to /rider/job (the
        // parcel rider's job screen) — a dead end for a food customer. Additive on the wire.
        data: { orderId, status: "assigned", to: "customer", orderType: "merchant" },
      });
    }
    return { orderId, status: "assigned" };
  }

  /** The rider's "Not this one": they're never offered this order again this cycle. When they were the
   *  last rider still deciding, the round closes now rather than making the kitchen wait out the 60s. */
  async declineDispatch(orderId: string, riderId: string): Promise<{ orderId: string; declined: true }> {
    const order = await this.liveOffer(orderId, riderId);
    const marked = await this.prisma.foodDispatchAttempt.updateMany({
      where: { orderId, riderId, outcome: "pending" },
      data: { outcome: "declined", respondedAt: new Date() },
    });
    if (marked.count === 0) throw new ConflictException("This offer is no longer live");
    if (!order.excluded.includes(riderId)) {
      await this.prisma.order.update({ where: { id: orderId }, data: { dispatchExcludedRiderIds: { push: riderId } } });
    }
    void this.gateway.emitFoodOfferClosed(riderId, orderId);
    const deciding = await this.prisma.foodDispatchAttempt.count({ where: { orderId, outcome: "pending", expiresAt: { gt: new Date() } } });
    if (deciding === 0 && order.roundExpiresAt) await this.closeRound(orderId, order.roundExpiresAt);
    return { orderId, declined: true };
  }

  /**
   * D-33: a secured rider may drop only before collecting the food (assigned/confirmed/
   * en_route_pickup — the same pre-pickup window RIDER_CANCELLABLE_STATUSES already draws for parcel
   * orders). Re-dispatch happens IN PLACE (same order, back to `requested`/ready_for_pickup, a fresh
   * NO_RIDER budget) rather than a Express-style cloneForRebroadcast new order — the kitchen's food is
   * already cooked and waiting, so there is no "prep clock" left to pause; the wording carries over
   * from D-33's design-doc framing but the mechanical effect here is simply "search again, excluding
   * this rider" (see this file's class docstring for the same reconciliation on D-04).
   *
   * Reuses order-lifecycle.service.ts:cancel's exact reliability-penalty shape (prePickupCancel +
   * CANCEL_STRIKE_LIMIT cooldown) rather than re-deriving it, so a drop counts the same as a parcel
   * pre-pickup cancel against the rider's standing — "three drops in a week pauses offers" (D-33) is
   * the SAME cancelStrikes axis, not a second counter.
   */
  async dropDispatch(orderId: string, riderId: string): Promise<{ orderId: string; status: "requested" }> {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, orderType: "merchant", riderId },
      select: { status: true, dispatchExcludedRiderIds: true, merchantId: true },
    });
    if (!order) throw new NotFoundException("Order not found");
    const droppable = new Set(["assigned", "confirmed", "en_route_pickup"]);
    if (!droppable.has(order.status)) {
      throw new ConflictException("This job can't be dropped anymore — the food is already with you");
    }
    const excluded = order.dispatchExcludedRiderIds.includes(riderId)
      ? order.dispatchExcludedRiderIds
      : [...order.dispatchExcludedRiderIds, riderId];

    let strikeLimitHit = false;
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.order.updateMany({
        where: { id: orderId, status: order.status, riderId },
        data: {
          status: "requested",
          merchantPhase: "ready_for_pickup",
          riderId: null,
          otpHash: null,
          deliveryOtpAttempts: 0,
          dispatchExcludedRiderIds: excluded,
          dispatchAttempt: 0,
          dispatchStartedAt: null,
          dispatchNextCheckAt: null,
          noRiderHoldAt: null,
        },
      });
      if (claimed.count === 0) throw new ConflictException("Order changed, retry");
      await tx.orderEvent.create({ data: { orderId, status: "requested" } });

      const rider = await tx.rider.findUnique({
        where: { profileId: riderId },
        select: { cancelStrikes: true, reliabilityScore: true, onHold: true, heldReason: true, cooldownUntil: true },
      });
      const strikes = (rider?.cancelStrikes ?? 0) + 1;
      const reliability = applyReliabilityDelta(
        {
          reliabilityScore: rider?.reliabilityScore ?? RELIABILITY.START,
          onHold: rider?.onHold ?? false,
          heldReason: (rider?.heldReason ?? null) as HeldReason,
        },
        -RELIABILITY.PENALTY.prePickupCancel,
      );
      if (strikes >= CANCEL_STRIKE_LIMIT) {
        const fresh = new Date(Date.now() + RIDER_STRIKE_COOLDOWN_MS);
        const cooldownUntil = rider?.cooldownUntil && rider.cooldownUntil > fresh ? rider.cooldownUntil : fresh;
        await tx.rider.update({
          where: { profileId: riderId },
          data: { cancelStrikes: 0, cooldownUntil, isOnline: false, ...reliability },
        });
        strikeLimitHit = true;
      } else {
        await tx.rider.update({ where: { profileId: riderId }, data: { cancelStrikes: strikes, ...reliability } });
      }
    });

    if (strikeLimitHit) {
      void this.gateway.evictRiderFromSupply(riderId).catch((err) => {
        this.logger.warn(`evictRiderFromSupply failed for rider ${riderId}: ${(err as Error).message}`);
      });
    }
    try {
      this.gateway.emitOrderStatus(orderId, "requested");
    } catch (err) {
      this.logger.warn(`drop emit failed for order ${orderId}: ${(err as Error).message}`);
    }
    this.notifyQueue(order.merchantId, orderId);
    const fresh = await this.prisma.order.findUnique({ where: { id: orderId }, select: { customerId: true } });
    if (fresh) {
      void this.notifications.notifyProfiles([fresh.customerId], {
        title: "Finding you a new rider",
        body: "Your rider had to drop off — we're re-dispatching your order now, nothing charged.",
        // to+orderType so the tap opens the food tracker, not the parcel /order/:id. Additive.
        data: { orderId, status: "requested", to: "customer", orderType: "merchant" },
      });
    }
    return { orderId, status: "requested" };
  }

  // ── Merchant actions (D-34 hold-screen decisions) ───────────────────────────────────────────────

  /** "Keep searching" — resets the NO_RIDER budget and lets sweepSearch resume on its next pass.
   *  Already-tried riders (dispatchExcludedRiderIds) stay excluded. */
  async resumeSearch(profileId: string, orderId: string): Promise<{ orderId: string; resumed: true }> {
    const merchantId = await this.ownMerchantId(profileId);
    const claimed = await this.prisma.order.updateMany({
      where: { id: orderId, merchantId, orderType: "merchant", status: "requested", merchantPhase: "ready_for_pickup", noRiderHoldAt: { not: null } },
      data: { noRiderHoldAt: null, dispatchAttempt: 0, dispatchStartedAt: null, dispatchNextCheckAt: null },
    });
    if (claimed.count === 0) throw new ConflictException("This order isn't waiting on a rider decision");
    return { orderId, resumed: true };
  }

  /** D-13 no-fault cancel from the D-34 hold screen — nothing charged, apology copy, doesn't touch
   *  the merchant's own standing (there's no acceptance-rate counter for this codebase to dent). */
  async cancelFromHold(profileId: string, orderId: string): Promise<{ orderId: string; status: "cancelled" }> {
    const merchantId = await this.ownMerchantId(profileId);
    const claimed = await this.prisma.order.updateMany({
      where: { id: orderId, merchantId, orderType: "merchant", status: "requested", merchantPhase: "ready_for_pickup", noRiderHoldAt: { not: null } },
      data: { status: "cancelled", cancelledAt: new Date(), rejectionReason: "no_rider", merchantPhase: null },
    });
    if (claimed.count === 0) throw new ConflictException("This order isn't waiting on a rider decision");
    await this.prisma.orderEvent.create({ data: { orderId, status: "cancelled" } });
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, select: { customerId: true } });
    if (order) {
      void this.notifications.notifyProfiles([order.customerId], {
        title: "Your order was cancelled",
        body: "We couldn't find a rider for your order in time — nothing was charged, sorry about that.",
        // to+orderType so the tap opens the food tracker, not the parcel /order/:id. Additive.
        data: { orderId, status: "cancelled", to: "customer", orderType: "merchant" },
      });
    }
    return { orderId, status: "cancelled" };
  }

  private async ownMerchantId(profileId: string): Promise<string> {
    return resolveOwnMerchantId(this.prisma, profileId);
  }
}
