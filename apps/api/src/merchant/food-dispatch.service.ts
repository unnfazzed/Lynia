import { ConflictException, ForbiddenException, Inject, Injectable, Logger, NotFoundException, type OnModuleDestroy, type OnModuleInit } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  dispatchRoundSize,
  FoodOfferEvent,
  type HeldReason,
  RELIABILITY,
  RESTAURANTS_AUTO_ACCEPT,
  RESTAURANTS_DISPATCH,
  RIDER_STRIKE_COOLDOWN_MS,
  type Waypoint,
} from "@lynia/shared";
import { TokenService } from "../auth/token.service";
import { CANCEL_STRIKE_LIMIT } from "../orders/order-lifecycle.constants";
import { pushCopy, PUSH_C, pushMoney, riderJobTemplate } from "../notifications/merchant-order-push";
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
 * Exception (MJ-RM1 / U32, 2026-10-07): an auto-accepted order's search starts `dispatchLeadMs` before
 * its ready time while it is still `preparing` (see `earlyDispatchDue`), and the kitchen phase is left
 * alone throughout — searching, offered and secured. "Food is ready" (or the ready time passing) then
 * moves it on as usual: to `ready_for_pickup` while searching, to null once a rider holds it.
 *
 * DB-only reconciler (no BullMQ), same reasoning as FoodOrderService: `RESTAURANTS_DISPATCH.
 * sweepIntervalMs` (20s) is tight enough to read as "auto" against the 60s offer window without a
 * queue/worker per order.
 */
/** The fields {@link earlyDispatchDue} reads. */
export interface EarlyDispatchInput {
  merchantPhase: string | null;
  autoAccepted?: boolean | null;
  kitchenConfirmedAt?: Date | null;
  prepStartedAt?: Date | null;
  prepMinutes?: number | null;
  /** Open substitution rounds (Order flow v2 BRIEF §8: never to a rider while the customer answers). */
  substitutionRounds?: ReadonlyArray<unknown>;
}

/**
 * MJ-RM1 / U32 (2026-10-07): an auto-accepted order the kitchen confirmed starts its rider search
 * `RESTAURANTS_AUTO_ACCEPT.dispatchLeadMs` before its ready time (prep start + prep minutes), so the rider
 * arrives as the food is ready — while the order is STILL `preparing`. The search never touches the
 * kitchen's own state: `merchantPhase` stays `preparing` and `readyAt` stays unset until the kitchen taps
 * "Food is ready" or the ready time passes (FoodOrderService.sweepAutoAccepted). Before this, the sweep
 * flipped the order to `ready_for_pickup` 8 minutes early, so the kitchen lost its cooking ticket (+5 min,
 * "Problem with this order") and the customer read "Food is ready" while it was still cooking.
 */
export function earlyDispatchDue(o: EarlyDispatchInput, nowMs: number): boolean {
  if (o.merchantPhase !== "preparing" || o.autoAccepted !== true || !o.kitchenConfirmedAt) return false;
  if ((o.substitutionRounds?.length ?? 0) > 0) return false;
  return prepReadyMs(o, nowMs) - RESTAURANTS_AUTO_ACCEPT.dispatchLeadMs <= nowMs;
}

/** When the kitchen's food is due: prep start + prep minutes (an unstarted prep counts from now). */
function prepReadyMs(o: Pick<EarlyDispatchInput, "prepStartedAt" | "prepMinutes">, nowMs: number): number {
  return (o.prepStartedAt?.getTime() ?? nowMs) + (o.prepMinutes ?? 0) * 60_000;
}

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
    const now = new Date();
    const ready = await this.prisma.order.findMany({
      where: {
        orderType: "merchant",
        status: "requested",
        merchantPhase: "ready_for_pickup",
        noRiderHoldAt: null,
        OR: [{ dispatchAttempt: 0 }, { dispatchNextCheckAt: { lte: now } }],
      },
      select: { id: true },
      take: 200,
    });
    // MJ-RM1 / U32: auto-accepted orders still cooking, inside the lead before their ready time. A
    // separate read so cooking orders can never crowd ready ones out of the batch; oldest prep first.
    const cooking = await this.prisma.order.findMany({
      where: {
        orderType: "merchant",
        status: "requested",
        merchantPhase: "preparing",
        autoAccepted: true,
        kitchenConfirmedAt: { not: null },
        noRiderHoldAt: null,
        substitutionRounds: { none: { status: "open" } },
        OR: [{ dispatchAttempt: 0 }, { dispatchNextCheckAt: { lte: now } }],
      },
      select: { id: true, merchantPhase: true, autoAccepted: true, kitchenConfirmedAt: true, prepStartedAt: true, prepMinutes: true },
      orderBy: { prepStartedAt: "asc" },
      take: 200,
    });
    const seen = new Set<string>();
    const due = [...ready, ...cooking.filter((o) => earlyDispatchDue(o, now.getTime()))].filter((o) => !seen.has(o.id) && !!seen.add(o.id));
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
        merchantDeliveryShare: true,
        distanceKm: true,
        merchantPaymentMethod: true,
        merchantCashRule: true,
        // MJ-RM1 / U32: the early search of an auto-accepted order still cooking.
        autoAccepted: true,
        kitchenConfirmedAt: true,
        prepStartedAt: true,
        prepMinutes: true,
        substitutionRounds: { where: { status: "open" }, select: { id: true } },
      },
    });
    const nowMs = Date.now();
    const cooking = order?.merchantPhase === "preparing";
    if (
      !order ||
      order.status !== "requested" ||
      order.noRiderHoldAt ||
      !(order.merchantPhase === "ready_for_pickup" || (cooking && earlyDispatchDue(order, nowMs)))
    ) {
      return "skipped"; // raced with a concurrent accept/drop/cancel — the next relevant sweep re-evaluates.
    }

    const attempt = order.dispatchAttempt + 1;
    if (attempt > RESTAURANTS_DISPATCH.maxAttempts && cooking) {
      // MJ-RM1: nobody took it while the kitchen is still cooking. The D-34 hold is a decision about food
      // that is READY (the merchant's hold card lives on the hand-over screen), so park until the ready
      // time; by then the kitchen (or sweepAutoAccepted) has marked it ready and the cap applies as usual.
      const claimed = await this.prisma.order.updateMany({
        where: { id: orderId, status: "requested", merchantPhase: "preparing", dispatchAttempt: order.dispatchAttempt, noRiderHoldAt: null },
        data: { dispatchNextCheckAt: new Date(Math.max(prepReadyMs(order, nowMs), nowMs + RESTAURANTS_DISPATCH.offerWindowMs)) },
      });
      return claimed.count > 0 ? "searching" : "skipped";
    }
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
      ? await this.prisma.merchant.findUnique({ where: { id: order.merchantId }, select: { location: true, name: true, businessType: true } })
      : null;
    const point = (merchant?.location as Waypoint | null)?.point;
    if (!point) {
      // No location to search from — shouldn't happen (placeOrder requires one), but never silently
      // spin forever on a data problem: park at the same attempt count, retry next sweep pass.
      return "skipped";
    }

    const radiusM = RESTAURANTS_DISPATCH.radiusM;
    // MJ-RM18: never offer a business's order to someone on its own team (they could reveal the pickup
    // code themselves and, on collect-and-return, settle their own cash debt). Not persisted in
    // dispatchExcludedRiderIds: membership is re-read every round, so a later leave/join applies.
    const teamIds = await this.teamProfileIds(order.merchantId);
    const candidates = await this.strategy.pickCandidates({
      lat: point.lat,
      lng: point.lng,
      radiusM,
      excludeRiderIds: teamIds.length > 0 ? [...new Set([...order.dispatchExcludedRiderIds, ...teamIds])] : order.dispatchExcludedRiderIds,
      preferredRiderIds: await this.preferredFor(order.merchantId),
      limit: dispatchRoundSize(attempt),
    });
    for (const c of candidates) {
      if (c.preferred) this.logger.log(`merchant.dispatch.preferred order=${orderId} rider=${c.riderId} distanceM=${Math.round(c.distanceM)}`);
    }
    const now = new Date();
    const startedAt = order.dispatchStartedAt ?? now;

    // Both claims also guard on the phase read above, so a cooking order the kitchen marked ready (or
    // cancelled) in between is re-read on the next pass rather than offered on a stale view.
    const phase = order.merchantPhase;
    if (candidates.length === 0) {
      const claimed = await this.prisma.order.updateMany({
        where: { id: orderId, status: "requested", merchantPhase: phase, dispatchAttempt: order.dispatchAttempt, noRiderHoldAt: null },
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
      where: { id: orderId, status: "requested", merchantPhase: phase, dispatchAttempt: order.dispatchAttempt, noRiderHoldAt: null },
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
    // Order flow v2 G3c (O.g.push.r): "New food job · $1.50" / "Gava’s Kitchen → 12 Lanark Rd. 60 s to
    // accept." — a shop job asks for the sealed-bag photo instead. The fare is the delivery fee the rider
    // keeps; the place is the drop-off landmark the offer card already shows.
    const dropLandmark = (order.dropoff as Waypoint | null)?.landmark?.trim() || null;
    void this.notifications.notifyProfiles(riderIds, {
      ...pushCopy(
        riderJobTemplate(merchant?.businessType),
        { f: order.deliveryFee == null ? null : pushMoney(order.deliveryFee), v: merchant?.name ?? null, a: dropLandmark },
      ),
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

  /** MJ-RM18: everyone on the business's own team (owner, manager, staff), whatever their role. Unlike
   *  `preferredFor` this is NOT best effort: a failed read throws, the tick fails, and the next sweep
   *  retries — an offer must never go out without the team excluded. */
  private async teamProfileIds(merchantId: string | null): Promise<string[]> {
    if (!merchantId) return [];
    const rows = await this.prisma.merchantMember.findMany({ where: { merchantId }, select: { profileId: true } });
    return rows.map((r) => r.profileId).filter((id): id is string => typeof id === "string" && id.length > 0);
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
      merchantDeliveryShare?: Prisma.Decimal | null;
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
      // D-71: only on a free-delivery order (the rider's fee is unchanged; the venue's cash is goods − share).
      ...(order.merchantDeliveryShare != null ? { merchantDeliveryShare: Number(order.merchantDeliveryShare) } : {}),
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
  private async liveOffer(
    orderId: string,
    riderId: string,
  ): Promise<{ merchantId: string | null; merchantPhase: string | null; roundExpiresAt: Date | null; excluded: string[] }> {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, orderType: "merchant" },
      select: { status: true, merchantId: true, merchantPhase: true, dispatchOfferExpiresAt: true, dispatchExcludedRiderIds: true },
    });
    if (!order) throw new NotFoundException("Order not found");
    const offer = await this.prisma.foodDispatchAttempt.findUnique({
      where: { orderId_riderId: { orderId, riderId } },
      select: { outcome: true, expiresAt: true },
    });
    if (!offer) throw new ForbiddenException("This offer isn't yours");
    if (order.status !== "open_for_offers" || offer.outcome !== "pending") throw new ConflictException("This offer is no longer live");
    if (offer.expiresAt.getTime() < Date.now()) throw new ConflictException("This offer just expired, pick your next job");
    return {
      merchantId: order.merchantId,
      merchantPhase: order.merchantPhase ?? null,
      roundExpiresAt: order.dispatchOfferExpiresAt,
      excluded: order.dispatchExcludedRiderIds,
    };
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
            merchantDeliveryShare: true,
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
    // MJ-RM18 backstop (the round already leaves the team out): someone on the business's own team never
    // takes its order — same guard as MerchantBookingService.pick.
    if (order.merchantId && (await this.prisma.merchantMember.findFirst({ where: { merchantId: order.merchantId, profileId: riderId }, select: { id: true } }))) {
      throw new ConflictException({ reason: "own_member", message: "Someone on your team can't take your own delivery." });
    }

    const deliveryCode = this.tokens.randomOtp();
    const secured = (keepCooking: boolean) => ({
      status: "assigned" as const,
      riderId,
      // Clears the kitchen phase; the counter's pickup code stays revealable while the rider holds the
      // order (FoodOrderService.revealPickupCode's second window, E2E 2026-10-05 LB-1). MJ-RM1: an order
      // found early, while still cooking, keeps `preparing` — the kitchen's ticket is the kitchen's
      // until it taps "Food is ready" (or the ready time passes), which then clears it.
      merchantPhase: keepCooking ? ("preparing" as const) : null,
      otpHash: this.tokens.hash(deliveryCode),
      deliveryOtpAttempts: 0,
      deliveryCodeRotatedAt: new Date(),
      dispatchOfferedRiderId: null,
      dispatchOfferExpiresAt: null,
      dispatchNextCheckAt: null,
    });
    try {
      // First writer wins. The CAS is on the round itself, so a rider whose round closed (and maybe
      // reopened without them) between the read above and here loses cleanly.
      const round = { id: orderId, status: "open_for_offers" as const, dispatchOfferExpiresAt: order.roundExpiresAt };
      const cooking = order.merchantPhase === "preparing";
      let claimed = await this.prisma.order.updateMany({
        where: cooking ? { ...round, merchantPhase: "preparing" } : round,
        data: secured(cooking),
      });
      if (claimed.count === 0 && cooking) {
        // The kitchen marked it ready between the read and the claim: secure it as a ready order.
        claimed = await this.prisma.order.updateMany({ where: { ...round, merchantPhase: "ready_for_pickup" }, data: secured(false) });
      }
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
    const fresh = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { customerId: true, merchant: { select: { name: true } }, rider: { select: { profile: { select: { firstName: true } } } } },
    });
    if (fresh) {
      // Order flow v2 G3a (O.g.push.c[3]): "Tendai is heading to Gava’s Kitchen" / "He’ll collect your order soon."
      void this.notifications.notifyProfiles([fresh.customerId], {
        ...pushCopy(
          PUSH_C.riderToVenue,
          { n: fresh.rider?.profile?.firstName?.trim() || null, v: fresh.merchant?.name?.trim() || null },
          { n: "Your rider", v: "the venue" },
        ),
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
      select: { status: true, merchantPhase: true, dispatchExcludedRiderIds: true, merchantId: true },
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
        // Guarded on the phase read above too: a kitchen marking a still-cooking order ready in between
        // must not be overwritten back to `preparing`.
        where: { id: orderId, status: order.status, riderId, merchantPhase: order.merchantPhase },
        data: {
          status: "requested",
          // MJ-RM1: a rider found early drops while the kitchen is still cooking — it keeps cooking, and
          // the early search picks it up again. Otherwise the food is ready and waiting.
          merchantPhase: order.merchantPhase === "preparing" ? "preparing" : "ready_for_pickup",
          riderId: null,
          otpHash: null,
          deliveryOtpAttempts: 0,
          dispatchExcludedRiderIds: excluded,
          dispatchAttempt: 0,
          dispatchStartedAt: null,
          dispatchNextCheckAt: null,
          noRiderHoldAt: null,
          // MJ-RM2: the dropped rider's counter state goes with them — otherwise the next rider is shown
          // "at your counter" from the start, never gets an ETA, and inherits the old sealed-bag photo
          // (a shop/pharmacy S3 checklist ticked with someone else's proof).
          riderArrivedAt: null,
          riderEtaAt: null,
          pickupPhotoKey: null,
          pickupPhotoAt: null,
          pickupBagSealed: null,
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
      // Order flow v2 G3a (O.g.push.c[9]).
      void this.notifications.notifyProfiles([order.customerId], {
        ...pushCopy(PUSH_C.noRider, {}),
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
