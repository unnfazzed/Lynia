import { ConflictException, ForbiddenException, Inject, Injectable, Logger, NotFoundException, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  dispatchRadiusForAttempt,
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
 * State model (reuses OrderStatus, no new values — plan §0b.1): a merchant order sits at `requested`
 * while dispatch is either searching (no live offer) or holding (NO_RIDER cap exhausted, D-34), and
 * at `open_for_offers` for the ~60s a single candidate is deciding (N-08) — the SAME status value
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

  /** N-08: a live single-rider offer whose 60s window elapsed with no response. Always lands back at
   *  `requested` (re-enter the search — sweepSearch's next pass picks the next candidate); the cap
   *  check lives there, not here, so this method's job is purely "close out a stale offer". */
  async sweepExpiredOffers(): Promise<{ expired: number }> {
    let expired = 0;
    const stale = await this.prisma.order.findMany({
      where: { orderType: "merchant", status: "open_for_offers", dispatchOfferExpiresAt: { lt: new Date() } },
      select: { id: true, dispatchOfferedRiderId: true },
      take: 200,
    });
    for (const o of stale) {
      if (!o.dispatchOfferedRiderId) continue;
      try {
        if (await this.releaseCurrentOffer(o.id, o.dispatchOfferedRiderId, "expired")) expired++;
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

  /** One dispatch attempt: widen the radius, ask the strategy for a candidate, either offer it
   *  (`dispatch_offer`, N-08) or park for the next poll (`dispatch_search` self-loop) — unless the
   *  NO_RIDER cap (N-07) is exhausted, which enters the D-34 merchant hold instead. */
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

    const radiusM = dispatchRadiusForAttempt(attempt);
    const candidate = await this.strategy.pickCandidate({
      lat: point.lat,
      lng: point.lng,
      radiusM,
      excludeRiderIds: order.dispatchExcludedRiderIds,
    });
    const now = new Date();
    const startedAt = order.dispatchStartedAt ?? now;

    if (!candidate) {
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
        dispatchOfferedRiderId: candidate.riderId,
        dispatchOfferExpiresAt: expiresAt,
        dispatchAttempt: attempt,
        dispatchStartedAt: startedAt,
        dispatchNextCheckAt: expiresAt,
      },
    });
    if (claimed.count === 0) return "skipped";
    if (attempt === 1) await this.prisma.orderEvent.create({ data: { orderId, status: "open_for_offers" } });
    try {
      await this.prisma.foodDispatchAttempt.create({
        data: { orderId, riderId: candidate.riderId, attemptNumber: attempt, radiusM, offeredAt: now, expiresAt },
      });
    } catch (err) {
      // The (orderId, riderId) unique index backstops dispatchExcludedRiderIds — a duplicate offer to
      // the same rider (a data race, not the expected path) fails here rather than corrupting the log.
      this.logger.error(`FoodDispatchAttempt insert failed for order ${orderId}/rider ${candidate.riderId}: ${(err as Error).message}`);
    }
    void this.notifications.notifyProfiles([candidate.riderId], {
      title: "New food pickup",
      body: "A kitchen order is ready nearby — tap to accept before it's offered to someone else.",
      data: { orderId, kind: "food_offer" },
    });
    // C5 rider offer alarm channel: the live-app signal alongside the push above — GET
    // /merchant/orders/dispatch/offer is the reconnect/poll fallback for the SAME offer this builds.
    // Best-effort: emitFoodOffer never throws, and a build failure here must never undo the offer
    // that just committed above.
    try {
      const event = this.buildFoodOfferEvent(orderId, order.merchantId!, order, expiresAt);
      void this.gateway.emitFoodOffer(candidate.riderId, event);
    } catch (err) {
      this.logger.warn(`food:offer build failed for order ${orderId}: ${(err as Error).message}`);
    }
    return "offered";
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

  /** Shared close-out for a live offer that ends WITHOUT acceptance (sweep expiry or rider decline):
   *  mark its FoodDispatchAttempt row, exclude the rider from this order's remaining attempts, and
   *  park for the next sweepSearch pass. Returns false if it lost a race (already resolved) — the
   *  updateMany's own CAS (status + dispatchOfferedRiderId) is what actually decides that; a stale
   *  read of `dispatchExcludedRiderIds` below can never smuggle in a double-append because any writer
   *  that wins the CAS has already moved dispatchOfferedRiderId off `riderId`, so a loser's updateMany
   *  always affects zero rows. */
  private async releaseCurrentOffer(orderId: string, riderId: string, outcome: "expired" | "declined"): Promise<boolean> {
    const current = await this.prisma.order.findUnique({ where: { id: orderId }, select: { dispatchExcludedRiderIds: true } });
    if (!current) return false;
    const excluded = current.dispatchExcludedRiderIds.includes(riderId)
      ? current.dispatchExcludedRiderIds
      : [...current.dispatchExcludedRiderIds, riderId];
    const claimed = await this.prisma.order.updateMany({
      where: { id: orderId, status: "open_for_offers", dispatchOfferedRiderId: riderId },
      data: {
        status: "requested",
        dispatchOfferedRiderId: null,
        dispatchOfferExpiresAt: null,
        dispatchExcludedRiderIds: excluded,
        dispatchNextCheckAt: new Date(),
      },
    });
    if (claimed.count === 0) return false;
    await this.prisma.foodDispatchAttempt.updateMany({
      where: { orderId, riderId, outcome: "pending" },
      data: { outcome, respondedAt: new Date() },
    });
    // C5: close the rider offer alarm channel — a no-op UI-wise for the "declined" caller (they
    // already know), but the only signal the OTHER path (sweep-driven "expired") has.
    void this.gateway.emitFoodOfferClosed(riderId, orderId);
    return true;
  }

  // ── Rider actions ────────────────────────────────────────────────────────────────────────────────

  /** C5 rider offer alarm channel — the poll/reconnect fallback GET (plan §10 blocker) for the SAME
   *  offer `food:offer` announces: a rider whose socket was down when the offer landed, or who just
   *  opened the app cold, can ask "do I have a live offer right now?" without knowing an orderId up
   *  front (unlike every other dispatch action here, which is `:orderId`-scoped). Null when this
   *  rider holds no live offer — not an error, since "nothing right now" is the normal state. */
  async getOfferForRider(riderId: string): Promise<FoodOfferEvent | null> {
    const order = await this.prisma.order.findFirst({
      where: { orderType: "merchant", status: "open_for_offers", dispatchOfferedRiderId: riderId, dispatchOfferExpiresAt: { gt: new Date() } },
      select: {
        id: true,
        merchantId: true,
        pickup: true,
        dropoff: true,
        itemDesc: true,
        merchantGoodsTotal: true,
        deliveryFee: true,
        distanceKm: true,
        dispatchOfferExpiresAt: true,
        merchantPaymentMethod: true,
        merchantCashRule: true,
      },
    });
    if (!order || !order.merchantId || !order.dispatchOfferExpiresAt) return null;
    return this.buildFoodOfferEvent(order.id, order.merchantId, order, order.dispatchOfferExpiresAt);
  }

  /** D-04 "rider secured" — the candidate holding the live offer accepts. Mirrors matching.service.ts:
   *  selectOffer's shape (mint a fresh delivery code, one_active_ride race handled the same way) one
   *  level up: the "who" decision was already made by dispatch, this just commits it. */
  async acceptDispatch(orderId: string, riderId: string): Promise<{ orderId: string; status: "assigned" }> {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, orderType: "merchant" },
      select: { status: true, dispatchOfferedRiderId: true, dispatchOfferExpiresAt: true, merchantId: true },
    });
    if (!order) throw new NotFoundException("Order not found");
    if (order.dispatchOfferedRiderId !== riderId) throw new ForbiddenException("This offer isn't yours");
    if (order.status !== "open_for_offers") throw new ConflictException("This offer is no longer live");
    if (!order.dispatchOfferExpiresAt || order.dispatchOfferExpiresAt.getTime() < Date.now()) {
      throw new ConflictException("This offer just expired, pick your next job");
    }

    const deliveryCode = this.tokens.randomOtp();
    try {
      const claimed = await this.prisma.order.updateMany({
        where: { id: orderId, status: "open_for_offers", dispatchOfferedRiderId: riderId },
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
        data: { orderId, status: "assigned" },
      });
    }
    return { orderId, status: "assigned" };
  }

  /** The rider's "can't take it" — frees the offer immediately rather than making the kitchen wait
   *  out the full 60s. */
  async declineDispatch(orderId: string, riderId: string): Promise<{ orderId: string; declined: true }> {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, orderType: "merchant" },
      select: { status: true, dispatchOfferedRiderId: true },
    });
    if (!order) throw new NotFoundException("Order not found");
    if (order.dispatchOfferedRiderId !== riderId) throw new ForbiddenException("This offer isn't yours");
    if (order.status !== "open_for_offers") throw new ConflictException("This offer is no longer live");
    const ok = await this.releaseCurrentOffer(orderId, riderId, "declined");
    if (!ok) throw new ConflictException("This offer is no longer live");
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
        data: { orderId, status: "requested" },
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
        data: { orderId, status: "cancelled" },
      });
    }
    return { orderId, status: "cancelled" };
  }

  private async ownMerchantId(profileId: string): Promise<string> {
    return resolveOwnMerchantId(this.prisma, profileId);
  }
}
