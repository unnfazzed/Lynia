import { ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, type OnModuleDestroy, type OnModuleInit, Optional } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { ACTIVE_RIDE_STATUSES, codAmount, FLEET_DISPATCH, FleetJobOffer, OFFER_WINDOW_MS, type OrderItem, type Waypoint } from "@lynia/shared";
import { domainEvents } from "../common/domain-events";
import { FLEET_SCOPE_REFUSAL, isFleetScopeViolation, orderFleetOwner, rethrowFleetScope } from "../common/fleet-scope";
import { hasOpenMerchantObligation } from "../common/merchant-debt-lock";
import { appFleetOffer, ownBikersFor } from "./fleet-candidates";
import { FoodDispatchService } from "./food-dispatch.service";
import { NotificationsService } from "../notifications/notifications.service";
import { OrdersService } from "../orders/orders.service";
import { publicWaypoint } from "../orders/waypoints";
import { PrismaService } from "../prisma/prisma.service";
import { onlineRefusalReason, REFUSAL_MESSAGE } from "../riders/online-gate";
import { TrackingGateway } from "../tracking/tracking.gateway";
import { notifyFoodQueueChanged } from "./merchant-lookup.util";

/** Audit action for "Send to any biker". */
export const FLEET_CONVERT_ACTION = "merchant.fleet.any_biker";

/** The order fields a round and an offer read. */
const ROUND_SELECT = {
  id: true,
  status: true,
  riderId: true,
  customerId: true,
  fleetMerchantId: true,
  noRiderHoldAt: true,
  dispatchAttempt: true,
  dispatchStartedAt: true,
  dispatchOfferExpiresAt: true,
  dispatchExcludedRiderIds: true,
  pickup: true,
  dropoff: true,
  itemDesc: true,
  items: true,
  distanceKm: true,
} satisfies Prisma.OrderSelect;
type RoundOrder = Prisma.OrderGetPayload<{ select: typeof ROUND_SELECT }>;

/** The search's end, for the business's countdown (OB-M9 "1:24 left"): every round from when this search started. */
export function fleetSearchEndsAt(dispatchStartedAt: Date | null): Date | null {
  return dispatchStartedAt ? new Date(dispatchStartedAt.getTime() + FLEET_DISPATCH.rounds * FLEET_DISPATCH.roundMs) : null;
}

/**
 * Own bikers (docs/designs/own-bikers.md "Fleet booking", ledger D-117), T3b: how a "My bikers" booking finds one
 * of the business's own bikers.
 *
 * A booking sits at `fleet_searching` from the moment it is made until a biker accepts (or the business cancels it
 * or sends it to any biker). Rounds reuse the food dispatch's per-rider rows (`FoodDispatchAttempt`, one per order
 * and biker) and the order's dispatch columns, but never its sweeps: those read `orderType = merchant` only.
 *  - A round rings every online, free, in-standing biker of the OWNER at once (a fleet is a handful of people),
 *    home branch first, then nearest, with no radius: they work for this business, wherever they are.
 *  - `FLEET_DISPATCH.rounds` rounds of `roundMs` ("We rang them 3 times over 2 minutes"), then the booking holds
 *    (`noRiderHoldAt`) for the business: "Try my bikers again" or "Send to any biker".
 *  - No biker online when a search starts: it holds at once (OB-M11), so nobody waits two minutes for nothing.
 *    `dispatchAttempt = 0` on a hold marks that case; a hold after the rounds ran out leaves it at `rounds`.
 *  - A biker who passes is not rung again this search; one who dropped the job is never rung for it again
 *    (`dispatchExcludedRiderIds`). Neither costs them anything (handoff `b.passHint`).
 *  - A hold nobody acts on ends as `expired` after `holdExpireMs` (E8), with a push to the booker.
 *
 * Sweep, not queue: one pass every `sweepIntervalMs` picks up bookings whose round ended or whose biker dropped,
 * the same DB-only reconciler shape as FoodDispatchService. A booking also gets its first round at once (`kick`).
 */
@Injectable()
export class FleetDispatchService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FleetDispatchService.name);
  private sweep?: ReturnType<typeof setInterval>;
  private sweeping = false;

  constructor(
    private readonly prisma: PrismaService,
    private readonly notifications: NotificationsService,
    private readonly gateway: TrackingGateway,
    // "Send to any biker" announces the converted booking to the public board. Always provided; optional only for
    // the positional unit harnesses.
    @Optional() private readonly orders?: OrdersService,
    // T9: an Own biker's offer for their business's app order is a food round's; accept and decline go there.
    // Always provided; optional only for the positional unit harnesses.
    @Optional() private readonly food?: FoodDispatchService,
  ) {}

  onModuleInit(): void {
    this.sweep = setInterval(() => void this.runSweep(), FLEET_DISPATCH.sweepIntervalMs);
    this.sweep.unref?.();
  }

  onModuleDestroy(): void {
    if (this.sweep) clearInterval(this.sweep);
  }

  private async runSweep(): Promise<void> {
    if (this.sweeping) return;
    this.sweeping = true;
    try {
      await this.sweepRounds();
    } catch (err) {
      this.logger.error(`fleet sweep failed: ${(err as Error).message}`);
    }
    try {
      await this.sweepStaleHolds();
    } catch (err) {
      this.logger.error(`fleet hold expiry failed: ${(err as Error).message}`);
    }
    try {
      await this.dissolveDisabledFleets();
    } catch (err) {
      this.logger.error(`fleet dissolve failed: ${(err as Error).message}`);
    }
    try {
      await this.sweepOrphanedOffers();
    } catch (err) {
      this.logger.error(`fleet orphan sweep failed: ${(err as Error).message}`);
    } finally {
      this.sweeping = false;
    }
  }

  /**
   * E8 (stuck bookings): a booking waiting on the business for `holdExpireMs` with nobody acting ends as `expired`,
   * the same end as an Any biker booking nobody picked, so the business's "Try again" works from it. The booker is
   * told. The CAS keeps a retry, a conversion or a cancel that lands first.
   */
  async sweepStaleHolds(now: Date = new Date()): Promise<{ expired: number }> {
    const cutoff = new Date(now.getTime() - FLEET_DISPATCH.holdExpireMs);
    const stale = await this.prisma.order.findMany({
      where: { status: "fleet_searching", riderId: null, noRiderHoldAt: { lte: cutoff } },
      select: { id: true, fleetMerchantId: true, merchantBooking: { select: { bookedByProfileId: true } } },
      take: 200,
    });
    let expired = 0;
    for (const o of stale) {
      const ended = await this.prisma.$transaction(async (tx) => {
        const claimed = await tx.order.updateMany({
          where: { id: o.id, status: "fleet_searching", riderId: null, noRiderHoldAt: { lte: cutoff } },
          data: { status: "expired", dispatchNextCheckAt: null },
        });
        if (claimed.count === 0) return false;
        await tx.orderEvent.create({ data: { orderId: o.id, status: "expired" } });
        return true;
      });
      if (!ended) continue;
      expired++;
      notifyFoodQueueChanged(this.gateway, o.fleetMerchantId, o.id);
      if (o.merchantBooking) {
        void this.notifications.notifyProfiles([o.merchantBooking.bookedByProfileId], {
          title: "None of your bikers took it",
          body: "We ended this booking. Book it again when you're ready.",
          data: { orderId: o.id, kind: "fleet_expired" },
          collapseKey: `fleet_hold:${o.id}`,
        });
      }
    }
    return { expired };
  }

  /**
   * Disable (docs/designs/own-bikers.md "Disable"): every biker of a disabled fleet becomes a public biker as soon as
   * they have no ride under way, now for the idle ones and on a later sweep for one finishing a fleet ride. Each is
   * told (handoff `b.pubT`/`b.pubB`). The riders link guard (migration 0108) refuses an unlink mid-ride, so a race
   * with a fresh accept just waits for the next sweep.
   */
  async dissolveDisabledFleets(): Promise<{ dissolved: number }> {
    const riders = await this.prisma.rider.findMany({
      where: { fleetOwner: { enabled: false } },
      select: { profileId: true, fleetOwnerProfileId: true, fleetHomeMerchant: { select: { name: true } } },
      take: 500,
    });
    if (riders.length === 0) return { dissolved: 0 };
    const busy = new Set(
      (
        await this.prisma.order.findMany({ where: { riderId: { in: riders.map((r) => r.profileId) }, status: { in: ACTIVE_RIDE_STATUSES } }, select: { riderId: true } })
      ).map((o) => o.riderId),
    );
    let dissolved = 0;
    for (const r of riders) {
      if (busy.has(r.profileId) || !r.fleetOwnerProfileId) continue;
      try {
        const done = await this.prisma.$transaction(async (tx) => {
          await tx.$executeRaw`SELECT 1 FROM riders WHERE profile_id = ${r.profileId}::uuid FOR UPDATE`;
          const cleared = await tx.rider.updateMany({
            where: { profileId: r.profileId, fleetOwnerProfileId: r.fleetOwnerProfileId },
            data: { fleetOwnerProfileId: null, fleetHomeMerchantId: null, fleetJoinedAt: null },
          });
          if (cleared.count === 0) return false;
          await tx.auditLog.create({ data: { actor: "system", action: "merchant.fleet.dissolve", target: r.fleetOwnerProfileId!, note: r.profileId } });
          return true;
        });
        if (!done) continue;
        dissolved++;
        const shop = r.fleetHomeMerchant?.name?.trim() || "Your business";
        void this.notifications.notifyProfiles([r.profileId], {
          title: "You're a public biker now",
          body: `${shop} has stopped using Own bikers. You can take jobs from anyone near you.`,
          data: { kind: "fleet_dissolved" },
        });
      } catch (err) {
        // A ride started between the read and the unlink: the guard refused it; the next sweep tries again.
        if (!isFleetScopeViolation(err)) throw err;
      }
    }
    return { dissolved };
  }

  /**
   * Backstop: a pending offer whose booking left the search by a path that didn't close it (an admin cancel, say)
   * would keep its biker's offer open. Only offers past their own expiry, and never the winner's row.
   */
  async sweepOrphanedOffers(now: Date = new Date()): Promise<{ expired: number }> {
    const rows = await this.prisma.foodDispatchAttempt.findMany({
      where: { outcome: "pending", expiresAt: { lt: now }, order: { orderType: "parcel", status: { not: "fleet_searching" } } },
      select: { id: true, orderId: true, riderId: true, order: { select: { riderId: true } } },
      take: 200,
    });
    const orphaned = rows.filter((r) => r.riderId !== r.order.riderId);
    if (orphaned.length === 0) return { expired: 0 };
    const res = await this.prisma.foodDispatchAttempt.updateMany({
      where: { id: { in: orphaned.map((r) => r.id) }, outcome: "pending" },
      data: { outcome: "expired", respondedAt: now },
    });
    for (const r of orphaned) void this.gateway.emitFleetOfferClosed(r.riderId, r.orderId);
    return { expired: res.count };
  }

  /** Bookings due a round: never rung, a round that ended, or a biker who dropped it. */
  async sweepRounds(now: Date = new Date()): Promise<{ rung: number; held: number }> {
    const due = await this.prisma.order.findMany({
      where: {
        status: "fleet_searching",
        riderId: null,
        noRiderHoldAt: null,
        OR: [{ dispatchNextCheckAt: null }, { dispatchNextCheckAt: { lte: now } }],
      },
      select: { id: true },
      orderBy: { createdAt: "asc" },
      take: 200,
    });
    let rung = 0;
    let held = 0;
    for (const o of due) {
      try {
        const outcome = await this.tick(o.id, now);
        if (outcome === "rung") rung++;
        if (outcome === "held") held++;
      } catch (err) {
        this.logger.error(`fleet round failed for order ${o.id}: ${(err as Error).message}`);
      }
    }
    return { rung, held };
  }

  /** The booking's first round, right after it is made or retried. Best effort: the sweep is the backstop. */
  async kick(orderId: string): Promise<void> {
    try {
      await this.tick(orderId, new Date());
    } catch (err) {
      this.logger.warn(`fleet first round failed for order ${orderId}: ${(err as Error).message}`);
    }
  }

  /**
   * One step of a booking's search: close the round that ended, then ring the next one, or hold when the rounds
   * ran out (or nobody is online as a search starts). Every write is a CAS on what was read, so a concurrent
   * accept, drop, cancel or conversion makes this a no-op.
   */
  async tick(orderId: string, now: Date = new Date()): Promise<"rung" | "waiting" | "held" | "skipped"> {
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, select: ROUND_SELECT });
    if (!order || order.status !== "fleet_searching" || order.riderId || order.noRiderHoldAt || !order.fleetMerchantId) return "skipped";
    if (order.dispatchOfferExpiresAt && order.dispatchOfferExpiresAt > now) return "skipped"; // a round is live
    // No round is live from here on, so any offer still pending is stale (the round ran out, or a pass ended it early).
    if (order.dispatchOfferExpiresAt) await this.closeOffers(orderId);

    const guard: Prisma.OrderWhereInput = {
      id: orderId,
      status: "fleet_searching",
      riderId: null,
      noRiderHoldAt: null,
      fleetMerchantId: order.fleetMerchantId,
      dispatchAttempt: order.dispatchAttempt,
    };
    const attempt = order.dispatchAttempt + 1;
    if (attempt > FLEET_DISPATCH.rounds) return (await this.hold(order, guard, "none_took")) ? "held" : "skipped";

    const merchant = await this.prisma.merchant.findUnique({
      where: { id: order.fleetMerchantId },
      select: { name: true, location: true, ownerProfileId: true },
    });
    const owner = merchant?.ownerProfileId ?? null;
    const fleet = owner ? await this.prisma.ownerFleet.findUnique({ where: { ownerProfileId: owner }, select: { enabled: true, pausedAt: true } }) : null;
    // Paused or switched off mid-search: no fleet round rings. T7's pause cancels these bookings; until it does,
    // the business sees "None of your bikers took it" and can send it to any biker.
    const point = (merchant?.location as Waypoint | null)?.point ?? null;
    const candidates = owner && (fleet?.enabled ?? true) && !fleet?.pausedAt && point ? await this.candidates(order, owner, order.fleetMerchantId, point) : [];

    const startedAt = attempt === 1 ? now : (order.dispatchStartedAt ?? now);
    if (candidates.length === 0) {
      // Nobody online as the search starts: say so now (OB-M11) instead of ringing an empty room for two minutes.
      if (attempt === 1) return (await this.hold(order, guard, "none_online")) ? "held" : "skipped";
      const claimed = await this.prisma.order.updateMany({
        where: guard,
        data: { dispatchAttempt: attempt, dispatchStartedAt: startedAt, dispatchOfferExpiresAt: null, dispatchNextCheckAt: new Date(now.getTime() + FLEET_DISPATCH.roundMs) },
      });
      return claimed.count > 0 ? "waiting" : "skipped";
    }

    const expiresAt = new Date(now.getTime() + FLEET_DISPATCH.roundMs);
    const riderIds = candidates.map((c) => c.riderId);
    const rang = await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.order.updateMany({
        where: guard,
        data: { dispatchAttempt: attempt, dispatchStartedAt: startedAt, dispatchOfferExpiresAt: expiresAt, dispatchNextCheckAt: expiresAt },
      });
      if (claimed.count === 0) return false;
      // One row per (order, biker): a biker who let an earlier round run out is rung again on the same row.
      for (const riderId of riderIds) {
        await tx.foodDispatchAttempt.upsert({
          where: { orderId_riderId: { orderId, riderId } },
          create: { orderId, riderId, attemptNumber: attempt, radiusM: 0, offeredAt: now, expiresAt },
          update: { attemptNumber: attempt, radiusM: 0, offeredAt: now, expiresAt, outcome: "pending", respondedAt: null },
        });
      }
      return true;
    });
    if (!rang) return "skipped";

    const shop = merchant?.name?.trim() || "Your shop";
    const dropLandmark = (order.dropoff as Waypoint | null)?.landmark?.trim() || null;
    void this.notifications.notifyProfiles(riderIds, {
      // Handoff own-bikers-v1 `b.offerT` ("New Chicken Inn job").
      title: `New ${shop} job`,
      body: dropLandmark ? `To ${dropLandmark}. Accept it in LyniaGo.` : "Accept it in LyniaGo.",
      data: { orderId, kind: "fleet_offer" },
      collapseKey: `fleet_offer:${orderId}`,
    });
    try {
      const event = this.offerEvent(order, shop, expiresAt);
      for (const riderId of riderIds) void this.gateway.emitFleetOffer(riderId, event);
    } catch (err) {
      this.logger.warn(`fleet:offer build failed for order ${orderId}: ${(err as Error).message}`);
    }
    notifyFoodQueueChanged(this.gateway, order.fleetMerchantId, orderId);
    return "rung";
  }

  /**
   * Who this round rings: the owner's bikers who are online (fresh heartbeat at the push cutoff, like every
   * dispatch), in good standing, not on another job, not owing ANOTHER business cash (OV-F3: cash for their own
   * goes back at shift end), and not out of this search. Home branch first, then nearest; no fix yet goes last.
   */
  private async candidates(order: RoundOrder, owner: string, branchId: string, point: { lat: number; lng: number }): Promise<Array<{ riderId: string }>> {
    const passed = await this.prisma.foodDispatchAttempt.findMany({ where: { orderId: order.id, outcome: "declined" }, select: { riderId: true } });
    const excluded = [...order.dispatchExcludedRiderIds, ...passed.map((p) => p.riderId), order.customerId];
    return ownBikersFor(this.prisma, { owner, homeMerchantId: branchId, point, radiusM: null, excluded });
  }

  /** Hold for the business's decision (OB-M10 / OB-M11) and tell the booker. */
  private async hold(order: RoundOrder, guard: Prisma.OrderWhereInput, why: "none_took" | "none_online"): Promise<boolean> {
    const claimed = await this.prisma.order.updateMany({
      where: guard,
      data: {
        noRiderHoldAt: new Date(),
        dispatchOfferExpiresAt: null,
        dispatchNextCheckAt: null,
        // 0 = nobody was online as the search started (see the class comment).
        dispatchAttempt: why === "none_online" ? 0 : FLEET_DISPATCH.rounds,
      },
    });
    if (claimed.count === 0) return false;
    notifyFoodQueueChanged(this.gateway, order.fleetMerchantId, order.id);
    const booking = await this.prisma.merchantBooking.findUnique({ where: { orderId: order.id }, select: { bookedByProfileId: true } });
    if (booking) {
      void this.notifications.notifyProfiles([booking.bookedByProfileId], {
        // Handoff own-bikers-v1 `m.noneTook`/`m.noneTookB` and `m.noneOnline`/`m.noneOnlineB`, verbatim.
        ...(why === "none_took"
          ? { title: "None of your bikers took it", body: "We rang them 3 times over 2 minutes." }
          : { title: "None of your bikers are online", body: "Send it to any biker nearby instead." }),
        data: { orderId: order.id, kind: "fleet_none_took" },
        collapseKey: `fleet_hold:${order.id}`,
      });
    }
    return true;
  }

  /**
   * Close every still-pending offer on the booking (or all but the winner's) and close those bikers' offer
   * screens. Used when a round ends, a biker wins, and the booking is cancelled or converted.
   */
  async closeOffers(orderId: string, opts: { exceptRiderId?: string } = {}): Promise<void> {
    const where: Prisma.FoodDispatchAttemptWhereInput = {
      orderId,
      outcome: "pending",
      ...(opts.exceptRiderId ? { riderId: { not: opts.exceptRiderId } } : {}),
    };
    const open = await this.prisma.foodDispatchAttempt.findMany({ where, select: { riderId: true } });
    if (open.length === 0) return;
    await this.prisma.foodDispatchAttempt.updateMany({ where, data: { outcome: "expired", respondedAt: new Date() } });
    for (const { riderId } of open) void this.gateway.emitFleetOfferClosed(riderId, orderId);
  }

  private offerEvent(order: Pick<RoundOrder, "id" | "pickup" | "dropoff" | "itemDesc" | "items" | "distanceKm">, shop: string, expiresAt: Date): FleetJobOffer {
    const collect = codAmount(order.items as OrderItem[] | null);
    return FleetJobOffer.parse({
      orderId: order.id,
      shop,
      pickup: publicWaypoint(order.pickup),
      dropoff: publicWaypoint(order.dropoff),
      itemsSummary: order.itemDesc,
      collect: collect === null ? null : collect.toFixed(2),
      distanceKm: order.distanceKm != null ? Number(order.distanceKm) : null,
      expiresAt: expiresAt.toISOString(),
    });
  }

  // ── The biker's side ─────────────────────────────────────────────────────────────────────────────────────

  /** `GET /fleet/jobs/offers` (OB-R4/R5): the biker's live offers, the one running out first first. */
  async offersFor(riderId: string): Promise<FleetJobOffer[]> {
    const rows = await this.prisma.foodDispatchAttempt.findMany({
      where: {
        riderId,
        outcome: "pending",
        expiresAt: { gt: new Date() },
        // A booking still ringing, or (T9) one of the business's own app orders on a live round.
        order: { OR: [{ status: "fleet_searching", riderId: null }, { orderType: "merchant", status: "open_for_offers" }] },
      },
      orderBy: { expiresAt: "asc" },
      take: FLEET_DISPATCH.maxRung,
      select: {
        expiresAt: true,
        order: {
          select: {
            id: true,
            orderType: true,
            pickup: true,
            dropoff: true,
            itemDesc: true,
            items: true,
            distanceKm: true,
            merchantGoodsTotal: true,
            deliveryFee: true,
            merchantDeliveryShare: true,
            merchantPaymentMethod: true,
            fleetMerchant: { select: { name: true } },
            merchant: { select: { name: true } },
          },
        },
      },
    });
    return rows.map((r) =>
      r.order.orderType === "merchant"
        ? appFleetOffer(r.order, r.order.merchant?.name?.trim() || "Your shop", r.expiresAt)
        : this.offerEvent(r.order, r.order.fleetMerchant?.name?.trim() || "Your shop", r.expiresAt),
    );
  }

  /** T9: whether `orderId` is an app order (its offer is a food round's), so accept and decline go there. */
  private async foodRound(orderId: string): Promise<FoodDispatchService | null> {
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, select: { orderType: true } });
    if (order?.orderType !== "merchant") return null;
    if (!this.food) throw new ConflictException({ reason: "offer_gone", message: "That one went to another biker" });
    return this.food;
  }

  /** The booking behind the biker's live offer, or why they have none: not theirs (403) or no longer live (409). */
  private async liveOffer(orderId: string, riderId: string): Promise<{ fleetMerchantId: string; roundExpiresAt: Date }> {
    const order = await this.prisma.order.findUnique({
      where: { id: orderId },
      select: { status: true, riderId: true, fleetMerchantId: true, dispatchOfferExpiresAt: true },
    });
    if (!order) throw new NotFoundException("Order not found");
    const offer = await this.prisma.foodDispatchAttempt.findUnique({ where: { orderId_riderId: { orderId, riderId } }, select: { outcome: true, expiresAt: true } });
    if (!offer) throw new ForbiddenException("This offer isn't yours");
    // Handoff `b.expT`: "That one went to another biker".
    const gone = { reason: "offer_gone", message: "That one went to another biker" };
    if (order.status !== "fleet_searching" || order.riderId || !order.fleetMerchantId || !order.dispatchOfferExpiresAt || offer.outcome !== "pending") {
      throw new ConflictException(gone);
    }
    if (offer.expiresAt.getTime() < Date.now()) throw new ConflictException(gone);
    return { fleetMerchantId: order.fleetMerchantId, roundExpiresAt: order.dispatchOfferExpiresAt };
  }

  /**
   * `POST /fleet/jobs/:orderId/accept` (OB-R5 "Accept this job"): the first of the round to accept takes it. The
   * claim is one CAS on the booking still searching, still unassigned, still this branch's and still this round
   * (so a conversion to Any biker and an accept can't both win), and the 0108 trigger re-checks the fleet at
   * commit. The delivery code was minted at booking, so the business already holds it.
   */
  async accept(orderId: string, riderId: string): Promise<{ orderId: string; status: "assigned" }> {
    const food = await this.foodRound(orderId);
    if (food) return food.acceptDispatch(orderId, riderId);
    const live = await this.liveOffer(orderId, riderId);
    const standing = await this.prisma.rider.findUnique({
      where: { profileId: riderId },
      select: { kycStatus: true, accountStatus: true, onHold: true, cooldownUntil: true, fleetOwnerProfileId: true },
    });
    if (!standing) throw new ForbiddenException("Not a biker");
    const refusal = onlineRefusalReason(standing);
    if (refusal) throw new ForbiddenException({ reason: refusal, message: REFUSAL_MESSAGE[refusal] });
    // Left (or was removed from) the fleet since the ring.
    if (standing.fleetOwnerProfileId == null || standing.fleetOwnerProfileId !== (await orderFleetOwner(this.prisma, live.fleetMerchantId))) {
      throw new ForbiddenException(FLEET_SCOPE_REFUSAL);
    }
    // OV-F3: cash owed to their own business doesn't block; cash owed to anyone else does.
    if (await hasOpenMerchantObligation(this.prisma, riderId, { exemptOwner: standing.fleetOwnerProfileId })) {
      throw new ForbiddenException("You have a food order still settling with a restaurant — finish that first");
    }
    try {
      await this.prisma.$transaction(async (tx) => {
        const claimed = await tx.order.updateMany({
          where: { id: orderId, status: "fleet_searching", riderId: null, fleetMerchantId: live.fleetMerchantId, dispatchOfferExpiresAt: live.roundExpiresAt },
          data: { status: "assigned", riderId, assignedAt: new Date(), dispatchOfferExpiresAt: null, dispatchNextCheckAt: null },
        });
        if (claimed.count === 0) throw new ConflictException({ reason: "offer_gone", message: "That one went to another biker" });
        await tx.foodDispatchAttempt.updateMany({ where: { orderId, riderId, outcome: "pending" }, data: { outcome: "accepted", respondedAt: new Date() } });
        await tx.orderEvent.create({ data: { orderId, status: "assigned" } });
        await domainEvents.record(tx, {
          type: "order.assigned",
          actorId: riderId,
          actorRole: "rider",
          subjectType: "order",
          subjectId: orderId,
          orderId,
          data: { riderId, orderType: "parcel", fleetMerchantId: live.fleetMerchantId },
        });
      });
    } catch (err) {
      if (err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        throw new ConflictException({ reason: "one_active_ride", message: "You're already on another active job" });
      }
      rethrowFleetScope(err, { path: "fleet.accept", orderId, riderId });
    }
    await this.closeOffers(orderId, { exceptRiderId: riderId });
    try {
      this.gateway.emitOrderStatus(orderId, "assigned");
    } catch (err) {
      this.logger.warn(`fleet accept emit failed for order ${orderId}: ${(err as Error).message}`);
    }
    notifyFoodQueueChanged(this.gateway, live.fleetMerchantId, orderId);
    return { orderId, status: "assigned" };
  }

  /**
   * `POST /fleet/jobs/:orderId/decline` (OB-R5 "Not this one"): no cost to the biker, and they aren't rung again
   * this search. When they were the last of the round still deciding, the next round starts now.
   */
  async decline(orderId: string, riderId: string): Promise<{ orderId: string; declined: true }> {
    const food = await this.foodRound(orderId);
    if (food) return food.declineDispatch(orderId, riderId);
    const live = await this.liveOffer(orderId, riderId);
    const marked = await this.prisma.foodDispatchAttempt.updateMany({
      where: { orderId, riderId, outcome: "pending" },
      data: { outcome: "declined", respondedAt: new Date() },
    });
    if (marked.count === 0) throw new ConflictException({ reason: "offer_gone", message: "That one went to another biker" });
    void this.gateway.emitFleetOfferClosed(riderId, orderId);
    const deciding = await this.prisma.foodDispatchAttempt.count({ where: { orderId, outcome: "pending", expiresAt: { gt: new Date() } } });
    if (deciding === 0) {
      // End the round now: the next sweep (or this kick) rings the next one.
      const ended = await this.prisma.order.updateMany({
        where: { id: orderId, status: "fleet_searching", riderId: null, dispatchOfferExpiresAt: live.roundExpiresAt },
        data: { dispatchOfferExpiresAt: new Date(), dispatchNextCheckAt: new Date() },
      });
      if (ended.count > 0) await this.kick(orderId);
    }
    return { orderId, declined: true };
  }

  // ── The business's side (called by MerchantBookingService once it has checked the booking is theirs) ────

  /** OB-M10 "Try my bikers again": a fresh search. Bikers who passed are asked again; who dropped it stay out. */
  async retry(orderId: string, fleetMerchantId: string): Promise<void> {
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.order.updateMany({
        where: { id: orderId, status: "fleet_searching", riderId: null, fleetMerchantId, noRiderHoldAt: { not: null } },
        data: { noRiderHoldAt: null, dispatchAttempt: 0, dispatchStartedAt: null, dispatchOfferExpiresAt: null, dispatchNextCheckAt: null },
      });
      if (claimed.count === 0) {
        throw new ConflictException({ reason: "not_waiting", message: "This booking isn't waiting on you any more." });
      }
      await tx.foodDispatchAttempt.updateMany({ where: { orderId, outcome: "declined" }, data: { outcome: "expired" } });
    });
    await this.kick(orderId);
  }

  /**
   * OB-M10/M11 "Send to any biker": the SAME order (same id, same delivery code) joins the public auction at the
   * fare the business offers. One CAS against the accept: whichever commits first wins, and the other is told.
   * From here it is an ordinary booking: commission on the biker, no fleet ledger row.
   */
  async convert(orderId: string, fleetMerchantId: string, proposedFare: number, actorProfileId: string): Promise<void> {
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, select: { pickup: true } });
    if (!order) throw new NotFoundException("Booking not found");
    const windowMs = this.orders ? await this.orders.offerWindowMsForPickup(order.pickup) : null;
    const now = new Date();
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.order.updateMany({
        where: { id: orderId, status: "fleet_searching", riderId: null, fleetMerchantId },
        data: {
          status: "open_for_offers",
          fleetMerchantId: null,
          fleetFee: null,
          proposedFare,
          // A fresh auction from now, sized from supply like any new booking. `createdAt` stays the booking's own
          // (history and the list order), so the window end is always written: the createdAt fallback would
          // read as already over.
          offerWindowEndsAt: new Date(now.getTime() + (windowMs ?? OFFER_WINDOW_MS)),
          noRiderHoldAt: null,
          dispatchAttempt: 0,
          dispatchStartedAt: null,
          dispatchOfferExpiresAt: null,
          dispatchNextCheckAt: null,
        },
      });
      if (claimed.count === 0) {
        throw new ConflictException({ reason: "already_taken", message: "One of your bikers took it, or it's no longer searching." });
      }
      await tx.orderEvent.create({ data: { orderId, status: "open_for_offers" } });
      await tx.auditLog.create({ data: { actor: actorProfileId, action: FLEET_CONVERT_ACTION, target: orderId, note: fleetMerchantId } });
    });
    await this.closeOffers(orderId);
    notifyFoodQueueChanged(this.gateway, fleetMerchantId, orderId);
    if (this.orders) {
      void this.orders.announceOpenOrder(orderId).catch((err) => {
        this.logger.error(`announce after Send to any biker failed for order ${orderId}: ${(err as Error).message}`);
      });
    }
  }
}
