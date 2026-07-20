import { ConflictException, Inject, Injectable, NotFoundException, Optional } from "@nestjs/common";
import { STORAGE, type StorageAdapter } from "../adapters/storage/storage.interface";
import {
  ACTIVE_RIDE_STATUSES,
  commissionBasis,
  DELIVERY_OTP_MAX_ATTEMPTS,
  HeldReason,
  type OrderStatus,
  perRideCommission,
  RELIABILITY,
  TERMINAL_STATUSES,
} from "@lynia/shared";
import { applyReliabilityDelta } from "../riders/reliability";
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

// KB-POD-DISPUTE Phase A: TTL for the proof-of-drop photo read URL — long enough for an ops review pass,
// short enough that a cached admin response can't fetch the object indefinitely (mirrors admin-riders).
const PROOF_READ_URL_TTL_SECONDS = 15 * 60;

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
    // KB-POD-DISPUTE Phase A: mints a short-lived read URL for the proof-of-drop photo in getOrderDetail.
    // @Optional so unit tests can construct the service with just Prisma (the app injects STORAGE via
    // AdminModule, same as admin-riders.service).
    @Optional() @Inject(STORAGE) private readonly storage?: StorageAdapter,
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
        pickup: true,
        dropoff: true,
        rider: { select: { profile: { select: { firstName: true, lastName: true } } } },
      },
    });
    return orders.map((o) => ({
      id: o.id,
      status: o.status,
      // Pickup → dropoff route + rider name so the monitor table matches the kit (no PII in the label).
      route: routeOf(o.pickup, o.dropoff),
      rider: o.rider ? `${o.rider.profile.firstName} ${o.rider.profile.lastName}`.trim() : null,
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
   * Admin order cancel → terminal `cancelled`. Records the reason, appends an OrderEvent for the timeline,
   * and writes the audit row (which carries the operator identity) — all in one transaction. Leaves
   * `cancelledBy` null: it's a Profile FK, and an ops actor is not a party (see the data block below).
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
          // `cancelledBy` is the canceller's Profile id (schema `@db.Uuid`, FK → Profile.id) and is read
          // ONLY to derive a customer/rider/(neither ⇒ "admin") role. For an ops cancel the `actor` is the
          // operator's identity — an `X-Operator` email behind IAP, or the shared admin token's synthetic
          // subject — and NEITHER is a Profile uuid, so writing it here throws (`22P02` invalid-uuid cast, or
          // an FK violation) and aborts the whole cancel. Store null: the readers already treat a non-party
          // value as "admin", and the operator is durably recorded on `AuditLog.actor` below.
          cancelledBy: null,
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
   * KB-POD-DISPUTE Phase B — ops adjudicates a disputed hand-off as DELIVERED despite a withheld delivery
   * code. This is the ONLY path that records a trip delivered without the recipient's OTP, so it is
   * deliberately **ops-only** (AdminGuard on the route), bounded to a rider-raised **`undelivered`** order
   * with an assigned rider, requires a mandatory reason, and writes a full audit row. Ops adjudicates on
   * the Phase-A proof-of-drop evidence (photo + GPS + time) rendered on the order detail.
   *
   * On adjudication the order is force-completed and the rider is credited exactly like a normal
   * completion — a successful trip (tripsCount + reliability recovery, mirroring completeOrder) and the
   * prepaid commission debit (no-op at rate 0; the delivery IS commissionable — the rider did the work).
   * The customer is notified and can contest via the existing "report a problem" (raise an issue) path,
   * which lands in the disputes queue where ops can refund/re-adjudicate — `IssuesService.raise` has no
   * time-based gating, so this stays open indefinitely; the push/feed copy must not claim a deadline the
   * code doesn't enforce. Reason required. All mutations + the audit row commit in ONE transaction (never
   * one without the other).
   */
  async adjudicateDelivered(actor: string, orderId: string, input: { reason: string; note?: string | null }) {
    const result = await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: orderId },
        select: { status: true, riderId: true, customerId: true, agreedFare: true, suggestedFare: true },
      });
      if (!order) throw new NotFoundException("Order not found");
      // Only a rider-raised failed hand-off is adjudicable — this is not a way to complete an arbitrary
      // order, only to overturn an `undelivered` outcome the rider disputes.
      if (order.status !== "undelivered") {
        throw new ConflictException("Only an undelivered order can be adjudicated as delivered");
      }
      if (!order.riderId) throw new ConflictException("Order has no assigned rider to credit");
      // CAS on the observed `undelivered` status (mirrors cancelOrder/adjustFare) so a concurrent
      // transition can't be clobbered: 0 rows ⇒ the order moved ⇒ conflict.
      const claimed = await tx.order.updateMany({
        where: { id: orderId, status: "undelivered" },
        data: { status: "completed", completedAt: new Date() },
      });
      if (claimed.count === 0) throw new ConflictException("Order changed — refresh and try again");
      await tx.orderEvent.create({ data: { orderId, status: "completed" } });

      // Credit the rider a clean completion (trip + reliability recovery), mirroring completeOrder — the
      // rider was judged genuine, so an adjudicated delivery counts like any other completion. Row-locked
      // first (matches order-lifecycle.lockRiderRow) so the score recompute is point-in-time consistent.
      await tx.$executeRaw`SELECT 1 FROM riders WHERE profile_id = ${order.riderId}::uuid FOR UPDATE`;
      const rider = await tx.rider.findUnique({
        where: { profileId: order.riderId },
        select: { reliabilityScore: true, onHold: true, heldReason: true },
      });
      const reliability = rider
        ? applyReliabilityDelta({ ...rider, heldReason: rider.heldReason as HeldReason }, RELIABILITY.RECOVER_PER_COMPLETION)
        : {};
      await tx.rider.update({ where: { profileId: order.riderId }, data: { tripsCount: { increment: 1 }, ...reliability } });

      // WD-021: `order.agreedFare`/`suggestedFare` above is a PRE-CAS snapshot — the status CAS above
      // guards only on `status`, not on the fare, so a concurrent `adjustFare` landing in the gap between
      // the initial read and the CAS could correct the fare and commit before this point, and this debit
      // would then price `ride_commission` off the STALE pre-adjust fare — a divergence `adjustFare`'s own
      // reconciliation can never detect or repair, since it computes `oldFare` from the order's CURRENT
      // (already-corrected) `agreedFare`. Mirrors WD-005 (`rate()` re-reads `agreedFare` post-CAS) and
      // WD-013 (`adjustFare` re-reads `status`/`riderId` post-CAS) — re-read fresh here too before charging.
      const freshFare = await tx.order.findUnique({ where: { id: orderId }, select: { agreedFare: true, suggestedFare: true } });

      // Prepaid commission debit — commissionable per the Phase-B decision; no-op at rate 0, idempotent
      // (unique (riderId, orderId, ride_commission)). Guarded on wallet presence for test construction.
      if (this.wallet) {
        await this.wallet.chargeCommission(tx, {
          orderId,
          riderId: order.riderId,
          agreedFare: freshFare?.agreedFare ?? order.agreedFare,
          suggestedFare: freshFare?.suggestedFare ?? order.suggestedFare,
        });
      }

      const audit = await tx.auditLog.create({
        data: auditData(actor, "order.adjudicate_delivered", orderId, input.reason, input.note),
        select: { id: true },
      });
      return { id: orderId, status: "completed" as const, auditId: audit.id, riderId: order.riderId, customerId: order.customerId };
    });

    // Post-commit, best-effort (never affects the committed adjudication). Live WS status for any open
    // screen, then the branched pushes with the honest copy + the customer's contest window.
    this.gateway?.emitOrderStatus(orderId, "completed");
    void this.notifications?.notifyProfiles([result.customerId], {
      title: "Delivery marked complete after review",
      body: "Our team reviewed the delivery and marked it complete. If that's not right, open the app to report a problem.",
      data: { orderId, kind: "order" },
    });
    void this.notifications?.notifyProfiles([result.riderId], {
      title: "Delivery confirmed",
      body: "Our team reviewed the delivery and confirmed it as complete.",
      data: { orderId, kind: "order" },
    });
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
    const result = await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.findUnique({
        where: { id: orderId },
        select: { id: true, agreedFare: true, riderId: true, customerId: true, status: true, suggestedFare: true },
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

      // WD-013: `order.status`/`riderId` above are a PRE-CAS snapshot — a completion (rate()/completeOrder())
      // racing this fare CAS can flip delivered→completed and charge `ride_commission` at the OLD fare in
      // the gap between that snapshot and the CAS above (both UPDATEs serialize on the order row lock, so
      // whichever wins re-evaluates against the other's committed write, but OUR snapshot never refreshes).
      // Using the stale snapshot here would then skip this whole reconciliation block for an order that IS
      // actually completed-with-a-stale-ledger-row by the time our fare change lands — silently re-opening
      // the exact WD-001 gap this block exists to close. Re-read fresh, post-CAS, mirroring WD-005's
      // re-read-after-CAS pattern on the completion side of this same race.
      const fresh = await tx.order.findUnique({ where: { id: orderId }, select: { status: true, riderId: true } });
      const riderId = fresh?.riderId ?? order.riderId;
      if (riderId && fresh?.status === "completed" && this.wallet) {
        const charged = await tx.commissionLedger.findFirst({
          where: { riderId, orderId, type: "ride_commission" },
          select: { ratePct: true },
        });
        if (charged?.ratePct != null) {
          const rate = Number(charged.ratePct);
          const deltaFare = round2(input.agreedFare - oldFare);
          // WD-012 (DOC-16-04 / FRAUD-REVIEW P0-2): the correction path had the same no-floor gap as the
          // initial charge — an admin (or an admin colluding with a rider) could downward-adjust a fare
          // with no bound, crediting back commission never legitimately owed. Floor each side (independently
          // max'd against basisFloorPct × suggestedFare) so a correction can't walk the commission basis
          // below the floor either.
          //
          // WD-014: delta the ROUNDED PER-SIDE COMMISSION (perRideCommission(newBasis) − perRideCommission
          // (oldBasis)), not perRideCommission(newBasis − oldBasis) — rounding a pre-summed delta can drift
          // a cent off "rate% of the final fare" per correction (e.g. 5% of $10.30 rounds to $0.52, 5% of
          // $10.40 rounds to $0.52, but round(5% of the $0.10 delta) rounds to $0.01 — a spurious extra
          // cent). Differencing two independently-rounded totals keeps every correction reconciling exactly
          // against "what a fresh charge at the final fare would have been", which is what the ledger and
          // commissionOverview both assume.
          const suggestedFare = order.suggestedFare != null ? Number(order.suggestedFare) : null;
          const oldBasis = commissionBasis(oldFare, suggestedFare);
          const newBasis = commissionBasis(input.agreedFare, suggestedFare);
          const deltaCommission = round2(perRideCommission(newBasis, rate) - perRideCommission(oldBasis, rate));
          // Fare went up → bigger debit (negative amount); fare went down → credit the difference back.
          await this.wallet.adjustCommissionInTx(tx, {
            riderId,
            orderId,
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
      return {
        id: orderId,
        agreedFare: input.agreedFare.toFixed(2),
        auditId: audit.id,
        customerId: order.customerId,
        riderId,
      };
    });

    // Best-effort, post-commit: tell both parties the fare was corrected — previously a silent
    // ledger/balance change with zero proactive signal to either side (found alongside UX18-04's
    // customer.hold/wallet.credit notification gaps). Never affects the already-committed correction.
    void this.notifications?.notifyProfiles([result.customerId], {
      title: "Your delivery's fare was updated",
      body: `Your fare was corrected to $${result.agreedFare} by our team.`,
      data: { orderId, kind: "order" },
    });
    if (result.riderId) {
      void this.notifications?.notifyProfiles([result.riderId], {
        title: "A delivery's fare was updated",
        body: `The fare for order ${orderId} was corrected to $${result.agreedFare}.`,
        data: { orderId, kind: "order" },
      });
    }
    return { id: result.id, agreedFare: result.agreedFare, auditId: result.auditId };
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
        // KB-POD-DISPUTE Phase A: proof-of-drop evidence for adjudication (photo key → read URL below).
        deliveryProofKey: true,
        deliveryProofLat: true,
        deliveryProofLng: true,
        deliveryProofAt: true,
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
    // DS20-01: shared threshold (admin.shared.STUCK_AFTER_MS), the same value the ops-dashboard
    // aggregate uses — the two can't drift now. This detail page keys off the last OrderEvent.createdAt
    // (more precise, and the events are already loaded here) rather than the dashboard's cheaper
    // order.updatedAt aggregate — an intentional data-source difference, not a bug to reconcile.
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

    // KB-POD-DISPUTE Phase A: the proof-of-drop evidence ops adjudicates on. Mint a short-lived read URL
    // from the object key (best-effort — a signing failure just yields a null photo, the GPS/time still
    // render). The rider captured this when the recipient took the goods but withheld the delivery code.
    const deliveryProof =
      order.deliveryProofKey != null
        ? {
            photoUrl: this.storage
              ? await this.storage.createReadUrl(order.deliveryProofKey, PROOF_READ_URL_TTL_SECONDS).catch(() => null)
              : null,
            lat: order.deliveryProofLat,
            lng: order.deliveryProofLng,
            at: order.deliveryProofAt?.toISOString() ?? null,
          }
        : null;

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
      // KB-POD-DISPUTE Phase A: null unless the rider attached proof; drives the ops adjudication panel.
      deliveryProof,
    };
  }
}
