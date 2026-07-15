import { ConflictException, Injectable, NotFoundException } from "@nestjs/common";
import {
  ACTIVE_RIDE_STATUSES,
  DELIVERY_OTP_MAX_ATTEMPTS,
  type OrderStatus,
  perRideCommission,
  TERMINAL_STATUSES,
} from "@lynia/shared";
import { maskPhone } from "../common/phone-mask";
import { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";
import { TrackingGateway } from "../tracking/tracking.gateway";
import { WalletService } from "../wallet/wallet.service";
import { auditData, deriveItems, ORDER_TIMELINE, routeOf, STATUS_STEP, STUCK_AFTER_MS } from "./admin.shared";

/** 2dp round — matches the rounding convention used across wallet.service / settlements.service. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Where an order's `agreedFare` came from — derived, no `agreedFareSource` column (the logged
 * alternative to a migration). During a cash dispute ops must be able to tell whether an odd
 * agreedFare is a legitimate market outcome or an operator's correction; the two signals that
 * already exist are authoritative: the `order.fare_adjust` audit rows (admin correction) and the
 * selected Offer row (market outcome — selectOffer sets agreedFare = offer.offeredFare).
 * `null` = legacy/unknown: no audit row, no selected offer, and the fare doesn't match the ask.
 */
export type FareProvenance =
  | {
      kind: "admin_adjusted";
      /** The operator who made the (latest) adjustment — the audit row's actor (X-Operator). */
      operator: string;
      /** When the latest adjustment was made (ISO). */
      at: string;
      /** The pre-adjustment market fare (the selected offer's offeredFare) — null when no offer
       *  row exists to recover it from. With >1 adjustments the intermediate values were never
       *  recorded, so this stays the ORIGINAL market fare, not the immediately-previous one. */
      previousFare: string | null;
      /** Present only when the fare was adjusted more than once (latest wins above). */
      count?: number;
    }
  | { kind: "rider_counter"; offeredFare: string; ask: string }
  | { kind: "customer_ask" };

@Injectable()
export class AdminOrdersService {
  // The gateway is optional so unit tests can construct the service with just Prisma; in the app it's
  // provided via TrackingModule (AdminModule imports it) and used for best-effort post-commit WS pushes.
  // NotificationsService (DS13-03) is likewise optional for the same test-construction reason — its
  // module is @Global, so the app always injects it — and is used for the best-effort post-commit FCM push.
  // WalletService (WD-001) is likewise optional for the same test-construction reason — reconciling the
  // commission ledger on a fare-adjust is a best-effort-but-still-transactional addition, never a hard
  // dependency for a test that only cares about the order/audit mutation.
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway?: TrackingGateway,
    private readonly notifications?: NotificationsService,
    private readonly wallet?: WalletService,
  ) {}

  /** Order monitor for ops — filter by status to watch live orders, cancellations, etc. */
  async listOrders(status?: OrderStatus) {
    const orders = await this.prisma.order.findMany({
      where: status ? { status } : {},
      orderBy: { createdAt: "desc" },
      take: 100,
      select: {
        id: true,
        status: true,
        proposedFare: true,
        agreedFare: true,
        distanceKm: true,
        customerId: true,
        riderId: true,
        cancelledBy: true,
        cancelReason: true,
        createdAt: true,
      },
    });
    return orders.map((o) => ({
      id: o.id,
      status: o.status,
      proposedFare: o.proposedFare.toString(),
      agreedFare: o.agreedFare?.toString() ?? null,
      distanceKm: o.distanceKm,
      riderId: o.riderId,
      // Authoritative role of who cancelled — don't make the UI re-derive it from raw ids.
      cancelledByRole: o.cancelledBy === o.riderId ? "rider" : o.cancelledBy === o.customerId ? "customer" : null,
      cancelReason: o.cancelReason,
      createdAt: o.createdAt.toISOString(),
    }));
  }

  /**
   * Admin order cancel → terminal `cancelled`. Records `cancelledBy` = the acting admin's id and the
   * reason, appends an OrderEvent for the timeline, and writes the audit row — all in one transaction.
   * Rejects an order already in a terminal state (nothing to cancel). Reason required.
   */
  async cancelOrder(actor: string, orderId: string, input: { reason: string; note?: string | null }) {
    const result = await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: orderId },
        select: { status: true, riderId: true, collectedAt: true, pickup: true },
      });
      if (!order) throw new NotFoundException("Order not found");
      if (TERMINAL_STATUSES.includes(order.status)) {
        throw new ConflictException("Order is already in a terminal state");
      }
      // DS-03: CAS on the status we just read instead of a blind update-by-id. The findUnique above
      // takes no row lock, so a concurrent lifecycle transition (e.g. the rider's confirmDelivery
      // flipping the order to `delivered` — deliberately non-terminal, so a live target) could commit
      // between the read and this write, and an unguarded update would clobber it back to `cancelled`.
      // Guarding on `status: order.status` makes the two serialize: if the row moved under us, count is
      // 0 and we reject as a conflict (ops refreshes and re-decides) rather than silently overwriting.
      const cancelled = await tx.order.updateMany({
        where: { id: orderId, status: order.status },
        data: {
          status: "cancelled",
          cancelledBy: actor,
          cancelReason: input.reason,
          cancelledAt: new Date(),
        },
      });
      if (cancelled.count === 0) {
        throw new ConflictException("Order changed while cancelling — refresh and try again");
      }
      // P2-3: decline any still-pending offers so they don't linger against a terminal order (riders
      // otherwise keep seeing a live "offer sent" on an order that's dead). Same transaction as the cancel.
      await tx.offer.updateMany({ where: { orderId, status: "pending" }, data: { status: "declined" } });
      await tx.orderEvent.create({ data: { orderId, status: "cancelled" } });
      const audit = await tx.auditLog.create({
        data: auditData(actor, "order.cancel", orderId, input.reason, input.note),
        select: { id: true },
      });
      return {
        id: orderId,
        status: "cancelled" as const,
        auditId: audit.id,
        // Carried out of the tx for the post-commit WS pushes below.
        riderId: order.riderId,
        collected: order.collectedAt != null,
        // DS13-07: was the order still an open auction? If so, close its board card post-commit.
        wasOpenForOffers: order.status === "open_for_offers",
        pickupPoint: (order.pickup as { point?: { lat: number; lng: number } } | null)?.point,
      };
    });

    // P2-3 post-commit, best-effort: push the cancellation to everyone watching the order, and — if a
    // rider was assigned — `job:cancelled` so they leave the (now dead) job screen instead of being
    // stranded on it. `collected` drives their UI (post-pickup hand-back vs. straight back to the board).
    // A WS failure must never fail the already-committed cancel, so both are guarded no-ops without a gateway.
    this.gateway?.emitOrderStatus(orderId, "cancelled");
    if (result.riderId) this.gateway?.emitJobCancelled(orderId, result.collected, "admin");
    // DS13-07: an ops cancel of a still-open auction closes the board card for browsing riders/bidders —
    // reuse the expiry path's bid:expired board event so they see the terminal state immediately instead
    // of running the countdown to a 409. Best-effort; guarded no-op without a gateway (tests).
    if (result.wasOpenForOffers) this.gateway?.emitBidExpired(orderId, result.pickupPoint?.lat, result.pickupPoint?.lng);
    // DS13-03: push FCM parity with the party-initiated cancel (order-lifecycle.service `notifyOrderStatus`)
    // so a rider/customer whose app is backgrounded or momentarily socket-dropped still learns the order was
    // cancelled — the WS emits above reach nobody in that state. The canceller here is the ops actor (not a
    // party), so notify ALL parties: no excludeProfileId. Best-effort — notifyOrderStatus never throws, so a
    // push miss can't affect the already-committed cancel; guarded no-op when no NotificationsService (tests).
    void this.notifications?.notifyOrderStatus(orderId, "cancelled", {});
    return { id: result.id, status: result.status, auditId: result.auditId };
  }

  /**
   * Admin fare adjustment → overwrites `agreedFare` (a manual correction / dispute resolution). The new
   * fare, the reason and the audit row commit in one transaction. Reason required. 404s when not found.
   *
   * WD-001: if the order already completed, a `ride_commission` ledger row was already charged at the
   * OLD fare. This correction must not leave that row stale — it appends a compensating `adjustment`
   * row (schema design: "fare-adjust deltas at the ride's original rate"), computed at the rate the ride
   * was ACTUALLY charged at (not the current live rate, which may have moved since), in the SAME
   * transaction as the fare change. A ride charged at rate=0 (or with no ledger row at all — a null-fare
   * completion anomaly) had nothing to correct, so nothing is written for it.
   */
  async adjustFare(actor: string, orderId: string, input: { agreedFare: number; reason: string; note?: string | null }) {
    return this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: orderId },
        select: { id: true, agreedFare: true, riderId: true, status: true },
      });
      if (!order) throw new NotFoundException("Order not found");
      // Only correct a fare that was actually agreed. Writing agreedFare onto an order that never had
      // one (open_for_offers / requested / expired, or a pre-assignment cancel) would mint a
      // non-null agreed fare on an order that was never agreed — integrity drift in the monitor.
      // (Under the prepaid per-ride model there is no settled billing period to lock against — the old
      // "settlement already paid" guard was removed with the weekly cash-settlement engine.)
      if (order.agreedFare == null) {
        throw new ConflictException("Order has no agreed fare to adjust");
      }
      const oldFare = Number(order.agreedFare);
      // DS-03: CAS on the exact fare we read so two operators adjusting concurrently can't both commit
      // (last-writer-wins + a duplicate audit row for one logical correction). The loser sees a 0-count
      // and is told to refresh — the same optimistic-concurrency guard the lifecycle transitions use.
      const adjusted = await tx.order.updateMany({
        where: { id: orderId, agreedFare: order.agreedFare },
        data: { agreedFare: input.agreedFare },
      });
      if (adjusted.count === 0) {
        throw new ConflictException("Order fare changed while adjusting — refresh and try again");
      }

      if (order.riderId && order.status === "completed" && this.wallet) {
        const charged = await tx.commissionLedger.findFirst({
          where: { riderId: order.riderId, orderId, type: "ride_commission" },
          select: { ratePct: true },
        });
        if (charged?.ratePct != null) {
          const rate = Number(charged.ratePct);
          const deltaFare = round2(input.agreedFare - oldFare);
          const deltaCommission = perRideCommission(deltaFare, rate);
          // Fare went up → bigger debit (negative amount); fare went down → credit the difference back.
          await this.wallet.adjustCommissionInTx(tx, {
            riderId: order.riderId,
            amount: -deltaCommission,
            ratePct: rate,
            fare: deltaFare,
            note: `Fare correction for order ${orderId}: $${oldFare.toFixed(2)} → $${input.agreedFare.toFixed(2)}`,
            actor,
          });
        }
      }

      const audit = await tx.auditLog.create({
        data: auditData(actor, "order.fare_adjust", orderId, input.reason, input.note),
        select: { id: true },
      });
      return { id: orderId, agreedFare: input.agreedFare.toFixed(2), auditId: audit.id };
    });
  }

  /**
   * Order detail (admin monitor drill-in). Builds the 8-step delivery timeline from OrderEvent
   * (done/now/stall), the parcel line-items, proposed/agreed fares as strings, and the masked people.
   *
   * A-03: the customer's and rider's full phone is revealed to the console ONLY while this order is a
   * LIVE ride (ACTIVE_RIDE_STATUSES) — NOT PHONE_REVEAL_STATUSES, which also includes the terminal
   * delivered/completed/undelivered states and would leave every finished order unmasked forever (the
   * same distinction the rider services make in admin-riders.service.ts). The counterparty app path
   * (orders.service.getSnapshot) still uses PHONE_REVEAL_STATUSES because it's scoped to the two
   * parties of one order; the admin console is a third party and must not see closed-order PII.
   * Otherwise both are masked. Returns null when not found.
   */
  async getOrderDetail(id: string) {
    const order = await this.prisma.order.findUnique({
      where: { id },
      select: {
        id: true,
        status: true,
        proposedFare: true,
        agreedFare: true,
        distanceKm: true,
        pickup: true,
        dropoff: true,
        itemDesc: true,
        items: true,
        cancelledBy: true,
        cancelReason: true,
        customerId: true,
        riderId: true,
        createdAt: true,
        updatedAt: true,
        deliveryOtpAttempts: true,
        customer: { select: { firstName: true, lastName: true, phone: true } },
        rider: { select: { bikeReg: true, profile: { select: { firstName: true, lastName: true, phone: true } } } },
        events: { select: { status: true, createdAt: true }, orderBy: { createdAt: "asc" } },
      },
    });
    if (!order) return null;

    // The stuck-order banner used to unconditionally claim "the customer has not reported a problem
    // yet" — a flatly false statement whenever a GetHelpControl report already exists for this order.
    // The two fare-provenance lookups (see FareProvenance) ride the same round-trip: the audit rows
    // for any admin fare adjustment on this order, and the offer the customer selected (the market
    // outcome the agreedFare was set from). Both are narrow, indexed reads.
    const [openIssue, fareAdjusts, selectedOffer] = await Promise.all([
      this.prisma.issue.findFirst({
        where: { orderId: id, status: { in: ["open", "investigating"] } },
        orderBy: { createdAt: "desc" },
        select: { id: true, type: true },
      }),
      this.prisma.auditLog.findMany({
        where: { action: "order.fare_adjust", target: id },
        orderBy: { createdAt: "desc" },
        select: { actor: true, createdAt: true },
      }),
      this.prisma.offer.findFirst({
        where: { orderId: id, status: "selected" },
        select: { type: true, offeredFare: true },
      }),
    ]);

    // Derive the fare's provenance (only meaningful once a fare was actually agreed). An admin
    // correction ALWAYS wins over the market signal — the audit row proves the stored agreedFare is
    // no longer the number the customer and rider shook on. Otherwise the selected offer's type is
    // the truth (`counter` = rider named a different price the customer accepted; `accept` = the
    // customer's ask taken as-is — makeOffer pins an accept's offeredFare to proposedFare). The
    // equality fallback covers legacy orders whose offer rows are gone but whose fare matches the ask.
    let fareProvenance: FareProvenance | null = null;
    if (order.agreedFare != null) {
      if (fareAdjusts.length > 0) {
        const latest = fareAdjusts[0]!;
        fareProvenance = {
          kind: "admin_adjusted",
          operator: latest.actor,
          at: latest.createdAt.toISOString(),
          previousFare: selectedOffer?.offeredFare.toString() ?? null,
          ...(fareAdjusts.length > 1 ? { count: fareAdjusts.length } : {}),
        };
      } else if (selectedOffer?.type === "counter") {
        fareProvenance = {
          kind: "rider_counter",
          offeredFare: selectedOffer.offeredFare.toString(),
          ask: order.proposedFare.toString(),
        };
      } else if (selectedOffer?.type === "accept" || Number(order.agreedFare) === Number(order.proposedFare)) {
        fareProvenance = { kind: "customer_ask" };
      }
      // else: no audit row, no offer row, fare ≠ ask — a legacy order; provenance stays null (unknown).
    }

    const revealed = ACTIVE_RIDE_STATUSES.includes(order.status);
    const now = Date.now();

    // First event timestamp per step, so a "done" step carries the real time it was reached.
    const tsForStep = (idx: number): string | undefined => {
      const statuses = ORDER_TIMELINE[idx]!.statuses;
      const ev = order.events.find((e) => statuses.includes(e.status));
      return ev ? ev.createdAt.toISOString() : undefined;
    };

    const current = STATUS_STEP[order.status] ?? -1;
    const lastEventAt = order.events.length ? order.events[order.events.length - 1]!.createdAt : order.createdAt;
    const active = ACTIVE_RIDE_STATUSES.includes(order.status);
    const stuck = active && now - lastEventAt.getTime() > STUCK_AFTER_MS;
    const stuckMins = Math.round((now - lastEventAt.getTime()) / 60000);

    const timeline = ORDER_TIMELINE.map((step, i) => {
      let state: "done" | "now" | "stall" | undefined;
      if (current === -1) state = i === 0 ? "done" : undefined; // off-path terminal: only the broadcast happened
      else if (i < current) state = "done";
      else if (i === current) state = stuck ? "stall" : "now";
      return {
        label: step.label,
        state,
        ts: state === "done" ? tsForStep(i) : state === "now" ? "now" : undefined,
        note: state === "stall" ? `No status update for ${stuckMins} min.` : undefined,
      };
    });

    const items = deriveItems(order.items, order.itemDesc);
    const riderName = order.rider
      ? `${order.rider.profile.firstName} ${order.rider.profile.lastName}`.trim()
      : null;

    // A rider stuck failing the delivery code and a rider who's simply gone silent look identical as a
    // bare "no update in N minutes" — this distinguishes them so support knows which intervention
    // applies (nudge the rider vs. have the customer re-issue the code).
    const otpMismatchNote =
      order.status === "en_route_dropoff" && order.deliveryOtpAttempts > 0
        ? `Rider has entered the wrong delivery code ${order.deliveryOtpAttempts} of ${DELIVERY_OTP_MAX_ATTEMPTS} times.`
        : undefined;

    return {
      id: order.id,
      route: routeOf(order.pickup, order.dropoff),
      status: order.status,
      stuck,
      stuckNote: stuck
        ? [otpMismatchNote, `No GPS/status update from the rider for ${stuckMins} minutes.`].filter(Boolean).join(" ")
        : otpMismatchNote,
      deliveryOtpAttempts: order.deliveryOtpAttempts,
      hasOpenIssue: openIssue != null,
      rider: riderName,
      // Both phones masked unless this order is live in its reveal window — never leak PII on a
      // terminal/closed order. Provide the (masked) string either way so the UI shows the redaction.
      riderPhone: order.rider ? (revealed ? order.rider.profile.phone : maskPhone(order.rider.profile.phone)) : undefined,
      bike: order.rider?.bikeReg,
      customer: `${order.customer.firstName} ${order.customer.lastName}`.trim(),
      customerPhone: revealed ? order.customer.phone : maskPhone(order.customer.phone),
      proposed: order.proposedFare.toString(),
      agreed: order.agreedFare?.toString() ?? null,
      fareProvenance,
      km: order.distanceKm ?? 0,
      items,
      timeline,
    };
  }
}
