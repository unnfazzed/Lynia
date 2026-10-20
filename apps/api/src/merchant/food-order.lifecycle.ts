/**
 * The kitchen and the biker: the queue, accept/reject, cooking, payment requests, ready, the pickup code and
 * hand-over, and the sweeps. A part of FoodOrderService (R-6): `this.svc` is the service itself.
 */
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException, ServiceUnavailableException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { addMoney, DELIVERY_OTP_MAX_ATTEMPTS, HANDOVER_CODE_MAX_REISSUES, foodOrderMoney, recomputeMerchantDeliveryShare, type EditMerchantOrderItemsRequest, type LatLng, RESTAURANTS_AUTO_ACCEPT, haversineKm, BUSY_MODE_EXTRA_MIN, type MerchantAcceptOrderRequest, type MerchantConfirmPaymentRequest, type MerchantOrderResponse, type MerchantRejectionReasonCode, RESTAURANTS_TIMING, smallOrderFeeForSubtotal, type Waypoint, type FoodOfferResponse, type HandoverFallbackResponse, type HandoverLinkInfoResponse } from "@lynia/shared";
import { openHandoverCode, sealHandoverCode } from "../common/handover-code";
import { pushCopy, PUSH_C_STILL_WAITING } from "../notifications/merchant-order-push";
import { confirmKitchen, editOrderItems } from "./food-order-ops";
import { cancelAttribution } from "../common/cancel-attribution";
import { domainEvents } from "../common/domain-events";
import { AFTER_PICKUP_STATUSES, HANDOVER_LINK_TTL_S, ORDER_WITH_ITEMS_INCLUDE, PREP_EXTEND_MIN, PREP_MAX_MIN, QUEUE_VISIBLE_STATUSES, RIDER_PRE_PICKUP_STATUSES, type StampedRejectionReason, isPastClosingTime, lineTotal, pickupRevealWhere, readyPhaseFor } from "./food-order.helpers";
import type { FoodOrderHost } from "./food-order.host";

export class FoodOrderLifecycle {
  constructor(private readonly svc: FoodOrderHost) {}
  async runSweeps(): Promise<void> {
    try {
      await this.svc.sweepExpiredAcceptWindows();
    } catch (err) {
      this.svc.logger.error(`sweepExpiredAcceptWindows failed: ${(err as Error).message}`);
    }
    try {
      await this.svc.sweepExpiredItemApprovals();
    } catch (err) {
      this.svc.logger.error(`sweepExpiredItemApprovals failed: ${(err as Error).message}`);
    }
    try {
      await this.svc.sweepEndOfDayClose();
    } catch (err) {
      this.svc.logger.error(`sweepEndOfDayClose failed: ${(err as Error).message}`);
    }
    try {
      await this.svc.sweepPaymentReminders();
    } catch (err) {
      this.svc.logger.error(`sweepPaymentReminders failed: ${(err as Error).message}`);
    }
    try {
      await this.svc.sweepAutoAccepted();
    } catch (err) {
      this.svc.logger.error(`sweepAutoAccepted failed: ${(err as Error).message}`);
    }
    try {
      await this.svc.sweepStillWaiting();
    } catch (err) {
      this.svc.logger.error(`sweepStillWaiting failed: ${(err as Error).message}`);
    }
  }

  // ── Merchant ─────────────────────────────────────────────────────────────────────────────────────

  async listQueue(profileId: string): Promise<MerchantOrderResponse[]> {
    const merchantId = await this.svc.ownMerchantId(profileId);
    const orders = await this.svc.prisma.order.findMany({
      // E2 (queue board): an order must stay visible through the WHOLE pre-handoff lifecycle, not
      // just while `status` is literally still "requested" — a flat "requested"-only filter drops an
      // order the instant a candidate rider starts deciding (`open_for_offers`) or one accepts
      // (`assigned`/`confirmed`/`en_route_pickup`), which is exactly the D-34 "keep cooking / hold /
      // cancel" window the Ready column has to render. `picked_up` and every terminal status are
      // deliberately excluded — that transition IS "handed over" for the board.
      //
      // E3 gap found and fixed: a collect-and-return debt (R-01) opens at `picked_up` — the exact
      // status this filter drops — and can stay open through `en_route_dropoff`/`delivered`/
      // `undelivered` until the merchant counts the returned cash (confirmReturnedCash) or writes it
      // off. Without the OR below, an order the rider is still carrying cash for simply vanished from
      // the tablet the moment it was handed over, with no way to ever confirm the return. `debtStatus:
      // "open"` is included regardless of `status` so this lane never depends on guessing which
      // terminal statuses a debt can outlive.
      where: {
        merchantId,
        orderType: "merchant",
        // D-48: an order the merchant closed its side of (no cash / mark completed) leaves the board.
        OR: [{ status: { in: [...QUEUE_VISIBLE_STATUSES] } }, { debtStatus: "open", merchantClosedAt: null }],
        // Order flow v2 (BRIEF §12): a scheduled order joins the live board when it rings, like a new
        // order. Until then it's on the Scheduled list (listScheduled).
        NOT: { schedule: { is: { rungAt: null } } },
      },
      orderBy: { createdAt: "asc" },
      // PW-LC2: deliberately no `take`. Every row is one the board must show (a live order or a debt still
      // to count), and oldest-first a cap would drop the NEWEST orders. The set is bounded by what's live;
      // the 5s poll's cost is the merchant_id index (0071), not the row count.
      include: ORDER_WITH_ITEMS_INCLUDE,
    });
    return orders.map((o) => this.svc.forMerchant(o));
  }

  async getQueueOrder(profileId: string, orderId: string): Promise<MerchantOrderResponse> {
    const order = await this.svc.findOwnAsMerchant(profileId, orderId);
    // D-48: the tracking stepper's step times (B6/B7) — single-order reads only, never the queue poll.
    const events = await this.svc.prisma.orderEvent.findMany({
      where: { orderId },
      orderBy: { createdAt: "asc" },
      select: { status: true, createdAt: true },
      take: 50,
    });
    const detail = await this.svc.withDetail(order, this.svc.forMerchant(order));
    return { ...detail, timeline: events.map((e) => ({ status: e.status, at: e.createdAt.toISOString() })) };
  }

  /** Auto-accept: "Got it, we're making it" — the restaurant confirms an auto-accepted order in the
   *  app, which lets the rider search start. Idempotent. */
  async confirmKitchenAsMerchant(profileId: string, orderId: string): Promise<MerchantOrderResponse> {
    const merchantId = await this.svc.ownMerchantId(profileId);
    const order = await this.svc.findOwnAsMerchant(profileId, orderId);
    if (!order.autoAccepted) throw new ConflictException({ reason: "not_auto_accepted", message: "This order doesn't need confirming." });
    await confirmKitchen(this.svc.prisma, this.svc.gateway, orderId, "merchant", merchantId);
    return this.svc.forMerchant(await this.svc.mustFindWithItems(orderId));
  }

  /** Change the items after agreeing it with the customer by phone (shared with ops, food-order-ops.ts). */
  async editItems(profileId: string, orderId: string, body: EditMerchantOrderItemsRequest): Promise<MerchantOrderResponse> {
    const merchantId = await this.svc.ownMerchantId(profileId);
    await editOrderItems(this.svc.prisma, this.svc.notifications, this.svc.gateway, orderId, body, merchantId);
    return this.svc.forMerchant(await this.svc.mustFindWithItems(orderId));
  }

  /**
   * D-48 (merchant mobile B6/B7): the merchant closes its side of a food order after pickup without
   * counting cash — "no_cash" (B7 "No cash on this one · mark completed") or "force" (B6 "Mark ride
   * completed"). Only once the rider has the food (owner decision 2026-09-30: never before pickup, which
   * would be a cancel). It never changes the delivery's status, the rider or the customer; it only
   * stops the order showing as cash owed and takes it off the board. Idempotent: a second close keeps
   * the first one's time and reason.
   */
  async closeOrder(profileId: string, orderId: string, reason: "no_cash" | "force"): Promise<MerchantOrderResponse> {
    const order = await this.svc.findOwnAsMerchant(profileId, orderId);
    if (order.merchantClosedAt) return this.svc.toResponse(order);
    if (!AFTER_PICKUP_STATUSES.has(order.status)) {
      throw new ConflictException({ reason: "not_picked_up", message: "You can close this once the biker has the food." });
    }
    if (order.debtStatus && order.debtStatus !== "open") return this.svc.toResponse(order);
    const updated = await this.svc.prisma.order.update({
      where: { id: order.id },
      data: { merchantClosedAt: new Date(), merchantCloseReason: reason },
      include: ORDER_WITH_ITEMS_INCLUDE,
    });
    this.svc.notifyQueue(updated.merchantId!, updated.id);
    return this.svc.toResponse(updated);
  }

  /** C4: the assigned rider's own read view — no MerchantGuard (party-checked below), mirrors
   *  getMyOrder/getQueueOrder. Needed so a rider can see the C4 handshake/debt/PAID fields the
   *  doorstep flow depends on (R-12 "the rider sees PAID at pickup and hand-off"). */
  async getAsRider(orderId: string, riderId: string): Promise<MerchantOrderResponse> {
    const order = await this.svc.prisma.order.findFirst({
      where: { id: orderId, riderId, orderType: "merchant" },
      include: ORDER_WITH_ITEMS_INCLUDE,
    });
    if (!order) throw new NotFoundException("Order not found");
    const { venueRating: _venueRating, ...forRider } = await this.svc.withDetail(order, this.svc.toResponse(order));
    // Own bikers (D-117, OB-R8/R9): carried by one of the business's own bikers — no fare, no commission, all the
    // cash goes back to this branch, which the job screens name.
    if (order.fleetMerchantId) {
      const branch = order.fleetMerchantId === order.merchantId ? order.merchant?.name : (await this.svc.prisma.merchant.findUnique({ where: { id: order.fleetMerchantId }, select: { name: true } }))?.name;
      if (branch) return { ...forRider, fleetShop: branch };
    }
    return forRider;
  }

  /** D-23: full accept when `unavailableDishIds` is empty, item-level accept otherwise. */
  async acceptOrder(profileId: string, orderId: string, body: MerchantAcceptOrderRequest): Promise<MerchantOrderResponse> {
    const merchantId = await this.svc.ownMerchantId(profileId);
    const merchant = await this.svc.prisma.merchant.findUnique({ where: { id: merchantId }, select: { busyMode: true } });
    // N-17: busy mode bumps the chip at accept time — folded in once, not re-applied on every read.
    const prepMinutes = body.prepMinutes + (merchant?.busyMode ? BUSY_MODE_EXTRA_MIN : 0);

    const order = await this.svc.findOwnAsMerchant(profileId, orderId);
    if (order.merchantPhase !== "awaiting_accept") throw new ConflictException("This order can no longer be accepted");
    if (order.schedule && !order.schedule.rungAt) {
      throw new ConflictException({ reason: "scheduled_not_started", message: "This scheduled order rings when it's time to start it." });
    }

    const unavailable = new Set(body.unavailableDishIds ?? []);
    if (unavailable.size > 0) {
      for (const dishId of unavailable) {
        if (!order.merchantItems.some((it) => it.dishId === dishId)) {
          throw new BadRequestException("One or more unavailableDishIds are not on this order");
        }
      }
      const remaining = order.merchantItems.filter((it) => !unavailable.has(it.dishId ?? ""));
      if (remaining.length === 0) {
        throw new ConflictException("At least one item must remain available — reject the order instead");
      }
      const rawSubtotal = addMoney(...remaining.map((it) => lineTotal(it.priceUsd, it.quantity)));
      const smallOrderFee = smallOrderFeeForSubtotal(rawSubtotal);
      const merchantGoodsTotal = addMoney(rawSubtotal, smallOrderFee);
      const deliveryFee = Number(order.deliveryFee ?? 0);
      // D-71: a funded order stays funded, capped by the smaller goods total.
      const merchantDeliveryShare = recomputeMerchantDeliveryShare(order.merchantDeliveryShare, merchantGoodsTotal, deliveryFee);
      const agreedFare = foodOrderMoney({ goodsTotal: merchantGoodsTotal, deliveryFee, merchantDeliveryShare }).customerTotal;

      await this.svc.prisma.$transaction(async (tx) => {
        const claimed = await tx.order.updateMany({
          where: { id: orderId, status: "requested", merchantPhase: "awaiting_accept" },
          data: {
            merchantPhase: "awaiting_item_approval",
            itemApprovalDeadlineAt: new Date(Date.now() + RESTAURANTS_TIMING.itemApprovalWindowMs),
            prepMinutes,
            merchantGoodsTotal,
            merchantDeliveryShare,
            agreedFare,
            // Admin console v2 §3: when the venue answered (accept time / missed orders).
            merchantAcceptedAt: new Date(),
          },
        });
        if (claimed.count === 0) throw new ConflictException("Order changed, retry");
        await domainEvents.merchantPhase(tx, {
          orderId,
          merchantId,
          phase: "accept_partial",
          actorId: profileId,
          data: { prepMinutes, unavailableItems: unavailable.size },
        });
        await tx.merchantOrderItem.updateMany({ where: { orderId, dishId: { in: [...unavailable] } }, data: { available: false } });
        await tx.merchantOrderItem.updateMany({ where: { orderId, dishId: { notIn: [...unavailable] } }, data: { available: true } });
      });
    } else {
      const cash = order.merchantPaymentMethod === "cash";
      const claimed = await this.svc.prisma.order.updateMany({
        where: { id: orderId, status: "requested", merchantPhase: "awaiting_accept" },
        data: cash
          ? { merchantPhase: "preparing", prepMinutes, prepStartedAt: new Date(), merchantAcceptedAt: new Date() }
          : { merchantPhase: "awaiting_payment", prepMinutes, merchantAcceptedAt: new Date() },
      });
      if (claimed.count === 0) throw new ConflictException("Order changed, retry");
      await this.svc.prisma.merchantOrderItem.updateMany({ where: { orderId }, data: { available: true } });
      // Best-effort (no transaction on this path): the accept above is committed.
      await domainEvents.merchantPhase(this.svc.prisma, { orderId, merchantId, phase: "accept", actorId: profileId, data: { prepMinutes, cash } });
    }
    this.svc.notifyQueue(merchantId, orderId);
    return this.svc.toResponse(await this.svc.mustFindWithItems(orderId));
  }

  /** D-11: the reason IS the customer's copy. */
  async rejectOrder(profileId: string, orderId: string, reason: MerchantRejectionReasonCode, note?: string): Promise<MerchantOrderResponse> {
    const merchantId = await this.svc.ownMerchantId(profileId);
    // Merchant v2 follow-ups (D-77, S2a): "Something else" may carry a one-line note the customer sees.
    const said = note?.trim() || null;
    const claimed = await this.svc.prisma.order.updateMany({
      where: { id: orderId, merchantId, orderType: "merchant", status: "requested", merchantPhase: "awaiting_accept" },
      data: {
        status: "cancelled",
        cancelledAt: new Date(),
        rejectionReason: reason,
        merchantPhase: null,
        cancelReason: said,
        ...cancelAttribution({ by: "merchant", status: "requested", merchantPhase: "awaiting_accept", reasonCode: reason }),
      },
    });
    if (claimed.count === 0) throw new ConflictException("This order can no longer be rejected");
    await this.svc.prisma.orderEvent.create({ data: { orderId, status: "cancelled" } });
    await domainEvents.merchantPhase(this.svc.prisma, { orderId, merchantId, phase: "reject", actorId: profileId, data: { reason } });
    await this.svc.notifyCancelledCustomer(orderId, reason, said);
    this.svc.notifyQueue(merchantId, orderId);
    return this.svc.toResponse(await this.svc.mustFindWithItems(orderId));
  }

  /**
   * D-48 (merchant mobile B3 "Can't finish this order"): cancel a CASH order the kitchen already
   * accepted and started, before it goes to dispatch. Nothing has been paid on a cash order, so there
   * is nothing to refund; the customer is told why. A confirmed WALLET order still goes through the
   * refund path (FoodDebtService.refundOrder), which needs the merchant's refund reference.
   */
  async cancelPreparing(
    profileId: string,
    orderId: string,
    reason: MerchantRejectionReasonCode = "other",
    note?: string,
  ): Promise<MerchantOrderResponse> {
    const merchantId = await this.svc.ownMerchantId(profileId);
    // Merchant v2 follow-ups (D-77, K3b): why it can't be finished, and "Something else"'s note.
    const said = note?.trim() || null;
    // MJ-RM1: an auto-accepted order's rider search runs during the last minutes of cooking, so the K3
    // "Problem with this order?" also covers a live round (no rider has it yet). Once a rider holds it,
    // as before, it can't be cancelled here.
    const claimed = await this.svc.prisma.order.updateMany({
      where: {
        id: orderId,
        merchantId,
        orderType: "merchant",
        status: { in: ["requested", "open_for_offers"] },
        riderId: null,
        merchantPhase: "preparing",
        merchantPaymentMethod: "cash",
      },
      data: {
        status: "cancelled",
        cancelledAt: new Date(),
        rejectionReason: reason,
        merchantPhase: null,
        cancelReason: said,
        dispatchOfferedRiderId: null,
        dispatchOfferExpiresAt: null,
        dispatchNextCheckAt: null,
        // Cooking (the CAS pins `preparing`), whether or not a rider round had started.
        ...cancelAttribution({ by: "merchant", status: "requested", merchantPhase: "preparing", reasonCode: reason }),
      },
    });
    if (claimed.count === 0) {
      throw new ConflictException({ reason: "not_cancellable", message: "This order can no longer be cancelled here." });
    }
    await domainEvents.merchantPhase(this.svc.prisma, { orderId, merchantId, phase: "cancel", actorId: profileId, data: { reason, stage: "preparing" } });
    await this.svc.closeOpenOffers(orderId);
    await this.svc.prisma.orderEvent.create({ data: { orderId, status: "cancelled" } });
    await this.svc.notifyCancelledCustomer(orderId, reason, said);
    this.svc.notifyQueue(merchantId, orderId);
    return this.svc.toResponse(await this.svc.mustFindWithItems(orderId));
  }

  /** A cancelled order's riders still deciding on a live round: their offers end now and their alarms
   *  stop (acceptDispatch already refuses a cancelled order; this only quiets the phones). Best effort. */
  async closeOpenOffers(orderId: string): Promise<void> {
    try {
      const where = { orderId, outcome: "pending" as const };
      const open = await this.svc.prisma.foodDispatchAttempt.findMany({ where, select: { riderId: true } });
      if (open.length === 0) return;
      await this.svc.prisma.foodDispatchAttempt.updateMany({ where, data: { outcome: "expired", respondedAt: new Date() } });
      for (const { riderId } of open) void this.svc.gateway.emitDispatchOfferClosed(riderId, orderId);
    } catch (err) {
      this.svc.logger.warn(`closing open offers failed for order ${orderId}: ${(err as Error).message}`);
    }
  }

  /** R-16: logged before the request-payment button unlocks. */
  async logCall(profileId: string, orderId: string): Promise<MerchantOrderResponse> {
    const order = await this.svc.findOwnAsMerchant(profileId, orderId);
    if (order.merchantPhase !== "awaiting_payment") throw new ConflictException("This order isn't awaiting payment");
    await this.svc.prisma.order.update({ where: { id: orderId }, data: { paymentCallLoggedAt: new Date() } });
    this.svc.notifyQueue(order.merchantId, orderId);
    return this.svc.toResponse(await this.svc.mustFindWithItems(orderId));
  }

  /** R-16: unlocked by a logged call, or the named override for regulars/in-person confirms. C5:
   *  "merchant accepted — pay now" (RESTAURANTS-DECISIONS.md §3) is the customer's first of three
   *  curated food pushes — high-signal, meant to persist on the lock screen until paid or expired;
   *  the sticky/action-button rendering is a mobile client concern (Lane D), this call site's job is
   *  just the data contract (`kind`, `orderId`) that lets that client work hook in. */
  async requestPayment(profileId: string, orderId: string, overrideCallLog: boolean): Promise<MerchantOrderResponse> {
    const order = await this.svc.findOwnAsMerchant(profileId, orderId);
    if (order.merchantPhase !== "awaiting_payment") throw new ConflictException("This order isn't awaiting payment");
    if (!order.paymentCallLoggedAt && !overrideCallLog) {
      throw new ConflictException("Log the call before requesting payment (or use the override)");
    }
    await this.svc.prisma.order.update({ where: { id: orderId }, data: { paymentRequestedAt: new Date() } });
    await this.svc.notifyPaymentRequested(orderId, order.customerId, "Confirm your payment", "The kitchen accepted your order — pay now so they can start cooking.");
    this.svc.notifyQueue(order.merchantId, orderId);
    return this.svc.toResponse(await this.svc.mustFindWithItems(orderId));
  }

  /** R-11: matches the customer's rail reference against the merchant's own statement — a mismatched
   *  amount blocks release and names the gap (D-06). THIS is what starts the prep clock. */
  async confirmPayment(profileId: string, orderId: string, body: MerchantConfirmPaymentRequest): Promise<MerchantOrderResponse> {
    const order = await this.svc.findOwnAsMerchant(profileId, orderId);
    if (order.merchantPhase !== "awaiting_payment") throw new ConflictException("This order isn't awaiting payment");
    const expected = Number(order.merchantGoodsTotal ?? 0);
    if (Math.round(body.amount * 100) !== Math.round(expected * 100)) {
      throw new ConflictException(`Amount doesn't match — expected $${expected.toFixed(2)}, got $${body.amount.toFixed(2)}`);
    }
    const claimed = await this.svc.prisma.order.updateMany({
      where: { id: orderId, status: "requested", merchantPhase: "awaiting_payment" },
      data: {
        merchantPhase: "preparing",
        prepStartedAt: new Date(),
        merchantPaymentConfirmedAt: new Date(),
        merchantPaymentReference: body.reference,
      },
    });
    if (claimed.count === 0) throw new ConflictException("Order changed, retry");
    await domainEvents.merchantPhase(this.svc.prisma, { orderId, merchantId: order.merchantId, phase: "payment_confirmed", actorId: profileId });
    this.svc.notifyQueue(order.merchantId, orderId);
    return this.svc.toResponse(await this.svc.mustFindWithItems(orderId));
  }

  /** R-17: no-penalty release — the zombie-order mitigation for a lane that never blocks the board. */
  async releaseUnpaid(profileId: string, orderId: string, reason: MerchantRejectionReasonCode): Promise<MerchantOrderResponse> {
    const merchantId = await this.svc.ownMerchantId(profileId);
    const claimed = await this.svc.prisma.order.updateMany({
      where: { id: orderId, merchantId, orderType: "merchant", status: "requested", merchantPhase: "awaiting_payment" },
      data: {
        status: "cancelled",
        cancelledAt: new Date(),
        rejectionReason: reason,
        merchantPhase: null,
        ...cancelAttribution({ by: "merchant", status: "requested", merchantPhase: "awaiting_payment", reasonCode: reason }),
      },
    });
    if (claimed.count === 0) throw new ConflictException("This order can't be released");
    await domainEvents.merchantPhase(this.svc.prisma, { orderId, merchantId, phase: "cancel", actorId: profileId, data: { reason, stage: "awaiting_payment" } });
    await this.svc.prisma.orderEvent.create({ data: { orderId, status: "cancelled" } });
    await this.svc.notifyCancelledCustomer(orderId, reason);
    this.svc.notifyQueue(merchantId, orderId);
    return this.svc.toResponse(await this.svc.mustFindWithItems(orderId));
  }

  /** N-16: mints the 6-digit pickup code (hashed, mirrors otpHash) so it exists by the time C3's
   *  dispatch assigns a rider and confirmPickup can verify it. */
  async markReady(profileId: string, orderId: string): Promise<MerchantOrderResponse> {
    const order = await this.svc.findOwnAsMerchant(profileId, orderId);
    if (order.merchantPhase !== "preparing") throw new ConflictException("This order isn't in prep");
    // BRIEF §13: the pharmacist checks the prescription before packing ends.
    if (order.prescription?.status === "pending") {
      throw new ConflictException({ reason: "prescription_pending", message: "Check the prescription before marking the order packed." });
    }
    // Order flow v2 (BRIEF §8): the order can't go to a rider while the customer is answering changes.
    await this.svc.substitutions?.assertNoOpenRound(orderId);
    // MJ-RM1: an auto-accepted order's rider search starts before the food is ready, so a cooking order
    // may already be in a live round or held by its rider. Searching -> ready_for_pickup as before; a rider
    // already holding it -> the phase clears (the same hand-off acceptDispatch makes for a ready order).
    const next = readyPhaseFor(order.status);
    if (next === undefined) throw new ConflictException("This order isn't in prep");
    const pickupCode = this.svc.tokens.randomPickupCode();
    const claimed = await this.svc.prisma.order.updateMany({
      where: { id: orderId, status: order.status, merchantPhase: "preparing" },
      data: {
        merchantPhase: next,
        readyAt: new Date(),
        // A search parked until the planned ready time (the early search hit its cap while cooking) must
        // resume now the food is ready, not at the old ready time (review of wave 1 C2).
        ...(next === "ready_for_pickup" ? { dispatchNextCheckAt: new Date() } : {}),
        pickupCodeHash: this.svc.tokens.hash(pickupCode),
        pickupCodeCipher: sealHandoverCode(this.svc.codeCrypto, "pickup", orderId, pickupCode),
        pickupCodeAttempts: 0,
        // A restaurant tapping "Food is ready" plainly knows about the order: that confirms the kitchen.
        ...(order.autoAccepted && !order.kitchenConfirmedAt ? { kitchenConfirmedAt: new Date(), kitchenConfirmedBy: "merchant" } : {}),
        // An auto-accepted order the kitchen never confirmed: "Food is ready" is also the venue's answer.
        ...(order.merchantAcceptedAt ? {} : { merchantAcceptedAt: new Date() }),
      },
    });
    if (claimed.count === 0) throw new ConflictException("Order changed, retry");
    await domainEvents.merchantPhase(this.svc.prisma, { orderId, merchantId: order.merchantId, phase: "ready", actorId: profileId });
    this.svc.notifyQueue(order.merchantId, orderId);
    return this.svc.toResponse(await this.svc.mustFindWithItems(orderId));
  }

  /**
   * Merchant v2 K3 "+5 min" (ledger D-77): the kitchen pushes the ready time back five minutes without
   * cancelling. The ready time is prep start + prep minutes, so this moves the dispatch lead too. The
   * customer gets a silent push with the new time (owner decision 2026-10-04). A cap keeps a slow order
   * from drifting for ever: past it, the kitchen calls the customer.
   */
  async extendPrep(profileId: string, orderId: string, expectedPrepMinutes?: number): Promise<MerchantOrderResponse> {
    const order = await this.svc.findOwnAsMerchant(profileId, orderId);
    if (order.merchantPhase !== "preparing" || !order.prepStartedAt) throw new ConflictException("This order isn't in prep");
    // MJ-RM19: the page says which prep time it was adding five to. A retry of a tap that already landed
    // (2G: the client timed out, the POST still arrived) finds it moved and adds nothing — the CAS below
    // pins the same value, so two racing taps can't both land either. An older page sends none.
    if (expectedPrepMinutes !== undefined && (order.prepMinutes ?? 0) !== expectedPrepMinutes) {
      throw new ConflictException({ reason: "prep_changed", message: "The ready time already moved. Check it before adding more." });
    }
    const prepMinutes = (order.prepMinutes ?? 0) + PREP_EXTEND_MIN;
    if (prepMinutes > PREP_MAX_MIN) {
      throw new ConflictException({ reason: "prep_too_long", message: "That’s as late as it can go. Call the customer if it needs longer." });
    }
    const claimed = await this.svc.prisma.order.updateMany({
      where: { id: orderId, merchantPhase: "preparing", prepMinutes: order.prepMinutes },
      data: { prepMinutes },
    });
    if (claimed.count === 0) throw new ConflictException("Order changed, retry");
    this.svc.notifyQueue(order.merchantId, orderId);
    const readyAt = new Date(order.prepStartedAt.getTime() + prepMinutes * 60_000).toISOString();
    await this.svc.notifications.notifyProfiles([order.customerId], {
      title: "",
      body: "",
      silent: true,
      collapseKey: `food-ready-${orderId}`,
      data: { orderId, status: "preparing", to: "customer", orderType: "merchant", kind: "food_ready_time", readyAt },
    });
    return this.svc.forMerchant(await this.svc.mustFindWithItems(orderId));
  }

  /** N-16 reveal: the ONLY way the tablet learns (or re-learns, after a reload or on a second staff phone)
   *  the current code to read out to the rider at the counter.
   *
   *  D2 (owner 2026-10-07, MJ-H1): idempotent. The code is stored sealed next to its hash (markReady /
   *  sweepAutoAccepted), so every reveal returns the SAME code and leaves the attempt counter alone — a
   *  second phone or Back-and-reopen no longer kills the code the first phone is showing. A new code is
   *  minted only:
   *   - on a lockout re-issue: the rider used every try (`pickupCodeAttempts` at the cap; confirmPickup tells
   *     the rider to "ask the kitchen to re-check the code"), which also resets the counter. Capped per order
   *     at HANDOVER_CODE_MAX_REISSUES (D2 review: otherwise every reveal at the cap bought the rider 5 more
   *     guesses); past it, 409 `pickup_code_reissue_limit`;
   *   - on a legacy row with no (or an unreadable) ciphertext: mint once, store both, stable from then on.
   *     The tries are NOT reset by this (only a capped lockout re-issue resets them).
   *  A mint is CAS-guarded on the hash it replaces (and a lockout one on the lock and the re-issue count), so
   *  two phones racing it both show the winner's code and only one re-issue happens.
   *
   *  Two windows: `ready_for_pickup` while dispatch searches, and — once a rider accepts, which clears
   *  `merchantPhase` (`FoodDispatchService.acceptDispatch`) — any pre-pickup rider status with a minted
   *  code. The second window is the one the merchant web actually asks in (it reveals only once a rider is
   *  assigned); without it no shop, pharmacy or hand-accepted kitchen order could be collected (E2E
   *  2026-10-05 LB-1). It only ever re-mints an existing code: an order with no code stays codeless. */
  async revealPickupCode(profileId: string, orderId: string): Promise<{ pickupCode: string }> {
    const order = await this.svc.findOwnAsMerchant(profileId, orderId);
    const where = pickupRevealWhere(order);
    if (!where) throw new ConflictException("This order isn't ready for pickup yet");
    const locked = order.pickupCodeAttempts >= DELIVERY_OTP_MAX_ATTEMPTS;
    const stored = openHandoverCode(this.svc.codeCrypto, this.svc.tokens, "pickup", orderId, order.pickupCodeCipher, order.pickupCodeHash);
    if (stored && !locked) return { pickupCode: stored };
    if (locked && order.pickupCodeReissues >= HANDOVER_CODE_MAX_REISSUES) {
      throw new ConflictException({
        reason: "pickup_code_reissue_limit",
        message: "The biker used every try on this code. Call LyniaGo support to hand this order over.",
      });
    }
    const minted = await this.svc.mintPickupCode(orderId, where, order.pickupCodeHash, locked ? order.pickupCodeReissues : null);
    if (minted) return { pickupCode: minted };
    // Lost the mint race (another phone minted first): show the code it minted, while it still stands.
    const fresh = await this.svc.prisma.order.findUnique({
      where: { id: orderId },
      select: { pickupCodeHash: true, pickupCodeCipher: true, pickupCodeAttempts: true },
    });
    const winner =
      fresh && fresh.pickupCodeAttempts < DELIVERY_OTP_MAX_ATTEMPTS
        ? openHandoverCode(this.svc.codeCrypto, this.svc.tokens, "pickup", orderId, fresh.pickupCodeCipher, fresh.pickupCodeHash)
        : null;
    if (winner) return { pickupCode: winner };
    throw new ConflictException("Order changed, retry");
  }

  /** D2: a fresh pickup code (hash + ciphertext), CAS-guarded on the reveal window AND on the hash it
   *  replaces. `lockoutReissues` (the count read with the lock) makes it a lockout re-issue: pinned on the
   *  lock and that count, it resets the tries and counts the re-issue. Without it (the legacy one-time mint)
   *  the tries stay as they are. Null when the row moved under us. */
  async mintPickupCode(
    orderId: string,
    where: Prisma.OrderWhereInput,
    replacesHash: string | null,
    lockoutReissues: number | null,
  ): Promise<string | null> {
    const pickupCode = this.svc.tokens.randomPickupCode();
    const lockout = lockoutReissues != null;
    const claimed = await this.svc.prisma.order.updateMany({
      where: {
        id: orderId,
        ...where,
        pickupCodeHash: replacesHash,
        ...(lockoutReissues != null ? { pickupCodeAttempts: { gte: DELIVERY_OTP_MAX_ATTEMPTS }, pickupCodeReissues: lockoutReissues } : {}),
      },
      data: {
        pickupCodeHash: this.svc.tokens.hash(pickupCode),
        pickupCodeCipher: sealHandoverCode(this.svc.codeCrypto, "pickup", orderId, pickupCode),
        ...(lockout ? { pickupCodeAttempts: 0, pickupCodeReissues: { increment: 1 } } : {}),
      },
    });
    return claimed.count === 0 ? null : pickupCode;
  }

  // ── Rider (N-16 pickup — mechanic only; C3's dispatch owns getting a rider assigned) ───────────────

  /** Mirrors order-lifecycle.service.ts:confirmDelivery's shape one hop earlier. Reachable once C3's
   *  dispatch (`FoodDispatchService.acceptDispatch`) sets `Order.riderId` and moves the order to
   *  `en_route_pickup` — wired live at `POST /merchant/orders/:orderId/confirm-pickup`. */
  async confirmPickup(orderId: string, riderId: string, code: string): Promise<{ orderId: string; status: "picked_up" }> {
    const expectedHash = this.svc.tokens.hash(code);
    const outcome = await this.svc.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<
        Array<{
          status: string;
          rider_id: string | null;
          pickup_code_hash: string | null;
          pickup_code_attempts: number;
          merchant_id: string | null;
          merchant_payment_method: string | null;
          merchant_cash_rule: string | null;
          merchant_goods_total: Prisma.Decimal | null;
          delivery_fee: Prisma.Decimal | null;
          merchant_delivery_share: Prisma.Decimal | null;
        }>
      >`SELECT status, rider_id, pickup_code_hash, pickup_code_attempts, merchant_id, merchant_payment_method, merchant_cash_rule, merchant_goods_total, delivery_fee, merchant_delivery_share FROM orders WHERE id = ${orderId}::uuid FOR UPDATE`;
      const o = rows[0];
      if (!o) throw new NotFoundException("Order not found");
      if (o.rider_id !== riderId) throw new ForbiddenException("Not the assigned biker");
      if (o.status !== "en_route_pickup") throw new ConflictException("Order is not ready for pickup");
      if (o.pickup_code_attempts >= DELIVERY_OTP_MAX_ATTEMPTS) {
        throw new ForbiddenException("Too many attempts — ask the kitchen to re-check the code");
      }
      const ok = !!o.pickup_code_hash && this.svc.tokens.safeEqualHex(expectedHash, o.pickup_code_hash);
      if (!ok) {
        await tx.order.update({ where: { id: orderId }, data: { pickupCodeAttempts: { increment: 1 } } });
        return { ok: false as const, attemptsUsed: o.pickup_code_attempts + 1 };
      }
      await this.svc.commitPickup(tx, orderId, riderId, o);
      return { ok: true as const, merchantId: o.merchant_id };
    });
    if (!outcome.ok) {
      const remaining = Math.max(0, DELIVERY_OTP_MAX_ATTEMPTS - outcome.attemptsUsed);
      throw new BadRequestException(
        remaining > 0 ? `That code doesn't match. ${remaining} attempt${remaining === 1 ? "" : "s"} left.` : "That code doesn't match — no attempts left.",
      );
    }
    this.svc.notifyQueue(outcome.merchantId, orderId);
    return { orderId, status: "picked_up" };
  }

  // ── Merchant v2 (ledger D-77): the offline-rider hand-over fallback ────────────────────────────────

  /** The signature binds the order, its assigned rider, the expiry and the CURRENT pickup-code hash, so a
   *  link dies when it expires, when the rider changes, and when the code is re-minted (a fresh reveal).
   *  Domain-separated HMAC over the server's hash key (TokenService.hash). */
  handoverSig(orderId: string, riderId: string, exp: number, pickupCodeHash: string): string {
    return this.svc.tokens.hash(`handover-link:v1:${orderId}:${riderId}:${exp}:${pickupCodeHash}`).slice(0, 32);
  }

  /** `POST /merchant/orders/:orderId/handover-fallback`: a signed link for the assigned rider, while the
   *  rider is on the way to the counter. Audit-logged (who asked, for which order). */
  async createHandoverLink(profileId: string, orderId: string, now: Date = new Date()): Promise<HandoverFallbackResponse> {
    const base = this.svc.env?.MERCHANT_WEB_URL;
    if (!base) throw new ServiceUnavailableException({ reason: "handover_link_unavailable", message: "This isn't available yet." });
    const order = await this.svc.findOwnAsMerchant(profileId, orderId);
    if (order.status !== "en_route_pickup" || !order.riderId || !order.pickupCodeHash) {
      throw new ConflictException({ reason: "not_at_handover", message: "There's no biker on the way for this order." });
    }
    const exp = Math.floor(now.getTime() / 1000) + HANDOVER_LINK_TTL_S;
    const token = `${orderId}.${exp}.${this.svc.handoverSig(orderId, order.riderId, exp, order.pickupCodeHash)}`;
    await this.svc.prisma.auditLog.create({ data: { actor: profileId, action: "order.handover_link", target: orderId } });
    return {
      // `/h?t=<token>`: the merchant web is a static export, so the token rides in the query string
      // (apps/merchant/app/lib/routes.ts); the old `/h/<token>` form still forwards there.
      link: `${base.replace(/\/+$/, "")}/h?t=${encodeURIComponent(token)}`,
      expiresAt: new Date(exp * 1000).toISOString(),
      riderPhone: order.rider?.profile?.phone || null,
    };
  }

  /** A hand-over link's order, when the token is well-formed, unexpired and still matches the order's
   *  current rider and pickup code; otherwise one uniform 404 (nothing about why leaks to the holder). */
  async verifyHandoverLink(token: string, now: Date) {
    const m = /^([0-9a-f-]{36})\.(\d{10})\.([0-9a-f]{32})$/.exec(token);
    const gone = new NotFoundException({ reason: "handover_link_invalid", message: "This link has expired. Ask the counter for a new one." });
    if (!m) throw gone;
    const [, orderId, expRaw, sig] = m as unknown as [string, string, string, string];
    const exp = Number(expRaw);
    if (exp * 1000 <= now.getTime()) throw gone;
    const order = await this.svc.prisma.order.findUnique({
      where: { id: orderId },
      select: { id: true, status: true, riderId: true, pickupCodeHash: true, merchant: { select: { name: true } } },
    });
    if (!order || order.status !== "en_route_pickup" || !order.riderId || !order.pickupCodeHash) throw gone;
    if (!this.svc.tokens.safeEqualHex(sig, this.svc.handoverSig(orderId, order.riderId, exp, order.pickupCodeHash))) throw gone;
    return { order: order as typeof order & { riderId: string }, exp };
  }

  /** `GET /handover/:token` (public): the order and venue the rider's page names. */
  async handoverLinkInfo(token: string, now: Date = new Date()): Promise<HandoverLinkInfoResponse> {
    const { order, exp } = await this.svc.verifyHandoverLink(token, now);
    return { orderLabel: `#${order.id.slice(0, 4).toUpperCase()}`, venueName: order.merchant?.name ?? "the counter", expiresAt: new Date(exp * 1000).toISOString() };
  }

  /** `POST /handover/:token/confirm` (public): the rider types the code the counter reads out. Exactly the
   *  in-app pickup (confirmPickup): same code check, same attempt cap, same debt opening and queue ping.
   *  Single use by construction — after pickup the order is no longer `en_route_pickup`. Audit-logged. */
  async confirmHandoverLink(token: string, code: string, now: Date = new Date()): Promise<{ orderId: string; status: "picked_up" }> {
    const { order } = await this.svc.verifyHandoverLink(token, now);
    const res = await this.svc.confirmPickup(order.id, order.riderId, code);
    await this.svc.prisma.auditLog.create({ data: { actor: order.riderId, action: "order.handover_link_used", target: order.id } });
    return res;
  }

  /**
   * Auto-accept safeguard 2: "Collected" — the rider's no-code pickup at an auto-accept restaurant (the
   * kitchen may not be in the app to read a code out). Accepted only when the rider's position is within
   * RESTAURANTS_AUTO_ACCEPT.pickupGeofenceM of the restaurant's pin, so a rider can't mark food collected
   * from down the road. Everything else is the code path's: same guards, same debt opening, same event.
   */
  async confirmCollected(orderId: string, riderId: string, point: LatLng): Promise<{ orderId: string; status: "picked_up" }> {
    const merchantId = await this.svc.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<
        Array<{
          status: string;
          rider_id: string | null;
          auto_accepted: boolean;
          merchant_id: string | null;
          merchant_payment_method: string | null;
          merchant_cash_rule: string | null;
          merchant_goods_total: Prisma.Decimal | null;
          delivery_fee: Prisma.Decimal | null;
          merchant_delivery_share: Prisma.Decimal | null;
        }>
      >`SELECT status, rider_id, auto_accepted, merchant_id, merchant_payment_method, merchant_cash_rule, merchant_goods_total, delivery_fee, merchant_delivery_share FROM orders WHERE id = ${orderId}::uuid FOR UPDATE`;
      const o = rows[0];
      if (!o) throw new NotFoundException("Order not found");
      if (o.rider_id !== riderId) throw new ForbiddenException("Not the assigned biker");
      if (o.status !== "en_route_pickup") throw new ConflictException("Order is not ready for pickup");
      if (!o.auto_accepted) {
        throw new ConflictException({ reason: "code_required", message: "Ask the kitchen for the pickup code." });
      }
      const merchant = o.merchant_id ? await tx.merchant.findUnique({ where: { id: o.merchant_id }, select: { location: true } }) : null;
      const pin = (merchant?.location as Waypoint | null)?.point;
      if (!pin) throw new ConflictException("This restaurant has no location");
      const distanceM = haversineKm(pin, point) * 1000;
      if (distanceM > RESTAURANTS_AUTO_ACCEPT.pickupGeofenceM) {
        throw new ConflictException({
          reason: "not_at_restaurant",
          message: "You're not at the restaurant yet. Move closer and try again.",
          distanceM: Math.round(distanceM),
        });
      }
      await this.svc.commitPickup(tx, orderId, riderId, o);
      return o.merchant_id;
    });
    this.svc.notifyQueue(merchantId, orderId);
    return { orderId, status: "picked_up" };
  }

  /** The food left the counter: status, event and (C4/R-01) the debt, in the caller's transaction and
   *  under its row lock so they commit atomically with the pickup. The debt no-ops for anything other
   *  than a collect-and-return CASH order. */
  async commitPickup(
    tx: Prisma.TransactionClient,
    orderId: string,
    riderId: string,
    o: {
      merchant_id: string | null;
      merchant_payment_method: string | null;
      merchant_cash_rule: string | null;
      merchant_goods_total: Prisma.Decimal | null;
      delivery_fee?: Prisma.Decimal | null;
      merchant_delivery_share?: Prisma.Decimal | null;
    },
  ): Promise<void> {
    // merchantPhase: an order collected while its kitchen phase still read `preparing` (an auto-accepted
    // order found early, "Collected" before anyone tapped "Food is ready") leaves the kitchen's machine
    // here, so the board moves it to ON THE WAY instead of keeping a cooking ticket (MJ-RM1).
    // D2: the code has done its job — its ciphertext goes, so it can never be shown again.
    const picked = await tx.order.update({
      where: { id: orderId },
      data: { status: "picked_up", collectedAt: new Date(), merchantPhase: null, pickupCodeCipher: null },
      select: { fleetMerchantId: true },
    });
    await tx.orderEvent.create({ data: { orderId, status: "picked_up" } });
    await this.svc.debt.openDebtIfNeeded(tx, {
      id: orderId,
      merchantId: o.merchant_id,
      riderId,
      merchantPaymentMethod: o.merchant_payment_method,
      merchantCashRule: o.merchant_cash_rule,
      merchantGoodsTotal: o.merchant_goods_total,
      // D-71: the debt is the venue's net (goods less its delivery share), never the goods alone.
      deliveryFee: o.delivery_fee ?? null,
      merchantDeliveryShare: o.merchant_delivery_share ?? null,
      // OV-F5: an Own biker of this venue's owner brings the delivery fee back too.
      fleetMerchantId: picked?.fleetMerchantId ?? null,
    });
  }

  // ── Reconciler sweeps (DB-only, RESTAURANTS_TIMING.sweepIntervalMs) ─────────────────────────────────

  /**
   * N-03 + owner decision D1 (2026-10-07): an order the venue never answers is cancelled `shop_closed` —
   * never a silent hang (D-13) — but only RESTAURANTS_TIMING.merchantWaitCapMs (24 h) after its answer
   * window opened, not when the drawn 3:00 countdown (`acceptDeadlineAt`) reaches 0:00. Until then it
   * keeps ringing and the customer keeps a free cancel (cancelUnpaid) and is nudged (sweepStillWaiting).
   *
   * C1 = MJ-H2 + U31: this used to pause an OFFLINE merchant's clock by pushing `acceptDeadlineAt` one
   * sweep tick (20 s) forward. A tablet back online then had at most 20 s to answer, and the customer's
   * countdown looped 0:20 → 0:00. D1 folds the offline case into the one 24 h cap, so presence is no
   * longer read here and `acceptDeadlineAt` is never moved after it is stamped.
   *
   * The window opened at `acceptDeadlineAt − acceptWindowMs` (placement; a scheduled order's ring), so
   * the cap is reached once `acceptDeadlineAt < now − (merchantWaitCapMs − acceptWindowMs)`.
   */
  async sweepExpiredAcceptWindows(now: Date = new Date()): Promise<{ cancelled: number }> {
    let cancelled = 0;
    const capCutoff = new Date(now.getTime() - (RESTAURANTS_TIMING.merchantWaitCapMs - RESTAURANTS_TIMING.acceptWindowMs));
    const stale = await this.svc.prisma.order.findMany({
      where: { orderType: "merchant", status: "requested", merchantPhase: "awaiting_accept", acceptDeadlineAt: { lt: capCutoff } },
      select: { id: true, merchantId: true, acceptDeadlineAt: true },
      take: 200,
    });
    for (const o of stale) {
      try {
        if (
          await this.svc.commitStaleCancellation(
            o.id,
            o.merchantId,
            { merchantPhase: "awaiting_accept", acceptDeadlineAt: o.acceptDeadlineAt },
            "shop_closed",
          )
        ) {
          cancelled++;
        }
      } catch (err) {
        this.svc.logger.error(`sweepExpiredAcceptWindows failed for order ${o.id}: ${(err as Error).message}`);
      }
    }
    return { cancelled };
  }

  /**
   * Owner decision D1 (2026-10-07), ledger D-87: while the venue hasn't accepted — a ringing order
   * (`awaiting_accept`, rung) or an auto-accepted one the kitchen hasn't confirmed — the customer is
   * pushed "Still waiting for {v}" RESTAURANTS_TIMING.stillWaitingPushAfterMs (3 and 15 min) after the
   * venue's wait started: placement, or a scheduled order's ring (a scheduled order is not late before
   * it rings). `merchantWaitNudges` is the idempotency guard, claimed by compare-and-swap before the
   * push, so each push goes once per order; an order first seen past 15 min (sweeps were down) gets only
   * the 15-min one. A crash between the claim and the push drops that push rather than repeating it —
   * the softer failure for a nudge (the N-22 precedent). An accepted, declined or cancelled order no
   * longer matches the query or the claim, so nothing is pushed after the venue answers.
   */
  async sweepStillWaiting(now: Date = new Date()): Promise<{ pushed: number }> {
    let pushed = 0;
    const steps = RESTAURANTS_TIMING.stillWaitingPushAfterMs;
    // Latest step first: an order already past 15 min is claimed at step 2 and skips step 1.
    for (let step = steps.length; step >= 1; step--) {
      const waitedMs = steps[step - 1]!;
      const due = await this.svc.prisma.order.findMany({
        where: {
          orderType: "merchant",
          status: "requested",
          merchantWaitNudges: { lt: step },
          OR: [
            // Ringing: the wait started acceptWindowMs before acceptDeadlineAt (null = scheduled, not rung).
            { merchantPhase: "awaiting_accept", acceptDeadlineAt: { lte: new Date(now.getTime() - waitedMs + RESTAURANTS_TIMING.acceptWindowMs) } },
            // Auto-accepted, kitchen not confirmed: the wait started at prepStartedAt (placement or ring).
            { merchantPhase: "preparing", autoAccepted: true, kitchenConfirmedAt: null, prepStartedAt: { lte: new Date(now.getTime() - waitedMs) } },
          ],
        },
        select: { id: true, customerId: true, merchant: { select: { name: true, businessType: true } } },
        take: 200,
      });
      for (const o of due) {
        try {
          const claimed = await this.svc.prisma.order.updateMany({
            where: {
              id: o.id,
              status: "requested",
              merchantWaitNudges: { lt: step },
              OR: [{ merchantPhase: "awaiting_accept" }, { merchantPhase: "preparing", autoAccepted: true, kitchenConfirmedAt: null }],
            },
            data: { merchantWaitNudges: step },
          });
          if (claimed.count === 0) continue;
          const fallback = o.merchant?.businessType === "shop" ? "the shop" : "the restaurant";
          await this.svc.notifications.notifyProfiles([o.customerId], {
            ...pushCopy(PUSH_C_STILL_WAITING, { v: o.merchant?.name?.trim() || null }, { v: fallback }),
            // to+orderType so the tap opens the order screen (and its free cancel); one tray slot per order.
            data: { orderId: o.id, status: "requested", to: "customer", orderType: "merchant", kind: "food_still_waiting" },
            collapseKey: `order:${o.id}:still_waiting`,
          });
          pushed++;
        } catch (err) {
          this.svc.logger.error(`sweepStillWaiting failed for order ${o.id}: ${(err as Error).message}`);
        }
      }
    }
    return { pushed };
  }

  /** N-18: unanswered 60s item-approval window — mocked default (surfaced in the PR): treated as a
   *  decline, same as the customer declining explicitly. U33 (C8): it stamps its own reason, not the
   *  venue's `other`, so the history, the feed, the push and the order screen don't blame the venue. */
  async sweepExpiredItemApprovals(): Promise<{ cancelled: number }> {
    return this.svc.sweepExpiredPhase("awaiting_item_approval", "itemApprovalDeadlineAt", "item_approval_expired");
  }

  async sweepExpiredPhase(
    phase: "awaiting_accept" | "awaiting_item_approval",
    deadlineField: "acceptDeadlineAt" | "itemApprovalDeadlineAt",
    reason: StampedRejectionReason,
  ): Promise<{ cancelled: number }> {
    let cancelled = 0;
    const stale = await this.svc.prisma.order.findMany({
      where: {
        orderType: "merchant",
        status: "requested",
        merchantPhase: phase,
        [deadlineField]: { lt: new Date() },
        // Order flow v2 (D-59): a substitution round's no-answer outcome is "carry on", not cancel — its
        // own sweep (OrderSubstitutionService.sweepExpiredRounds) resolves it.
        ...(phase === "awaiting_item_approval" ? { substitutionRounds: { none: { status: "open" } } } : {}),
      },
      select: { id: true, merchantId: true },
      take: 200,
    });
    for (const o of stale) {
      try {
        if (await this.svc.commitStaleCancellation(o.id, o.merchantId, { merchantPhase: phase }, reason)) {
          cancelled++;
        }
      } catch (err) {
        this.svc.logger.error(`sweepExpiredPhase(${phase}) failed for order ${o.id}: ${(err as Error).message}`);
      }
    }
    return { cancelled };
  }

  /** Shared CAS-cancel + notify commit for the reconciler sweeps above and below: claim the order via
   *  a compare-and-swap `updateMany` scoped to `whereExtra` (each caller's own stale-read guard on top
   *  of the common `status: "requested"` check), then on success write the cancellation event, the
   *  customer notification, and the kitchen-queue push. Returns whether this call won the claim (false
   *  = another sweep tick already claimed the row first, a normal race under concurrent ticks). */
  async commitStaleCancellation(
    orderId: string,
    merchantId: string | null | undefined,
    whereExtra: Prisma.OrderWhereInput,
    reason: StampedRejectionReason,
    // Admin console v2 §3: the kitchen phase it was cancelled in — the CAS's own phase guard by default.
    stage: string | null = typeof whereExtra.merchantPhase === "string" ? whereExtra.merchantPhase : null,
  ): Promise<boolean> {
    const claimed = await this.svc.prisma.order.updateMany({
      where: { id: orderId, status: "requested", ...whereExtra },
      data: {
        status: "cancelled",
        cancelledAt: new Date(),
        rejectionReason: reason,
        merchantPhase: null,
        ...cancelAttribution({ by: "system", status: "requested", merchantPhase: stage, reasonCode: reason }),
      },
    });
    if (claimed.count === 0) return false;
    await this.svc.prisma.orderEvent.create({ data: { orderId, status: "cancelled" } });
    await this.svc.notifyCancelledCustomer(orderId, reason);
    this.svc.notifyQueue(merchantId, orderId);
    return true;
  }

  /** N-23: end-of-day close is the only automatic exit for an unpaid WALLET order (R-17 — no payment
   *  clocks otherwise). Nothing charged; customer notified. */
  async sweepEndOfDayClose(): Promise<{ cancelled: number }> {
    let cancelled = 0;
    const stale = await this.svc.prisma.order.findMany({
      where: { orderType: "merchant", status: "requested", merchantPhase: "awaiting_payment" },
      select: { id: true, merchantId: true },
      take: 200,
    });
    if (stale.length === 0) return { cancelled: 0 };
    const merchantIds = [...new Set(stale.map((o) => o.merchantId).filter((id): id is string => !!id))];
    const merchants = await this.svc.prisma.merchant.findMany({ where: { id: { in: merchantIds } }, select: { id: true, hours: true } });
    const hoursById = new Map(merchants.map((m) => [m.id, m.hours as Record<string, { open: string; close: string }> | null]));
    for (const o of stale) {
      if (!o.merchantId || !isPastClosingTime(hoursById.get(o.merchantId) ?? null)) continue;
      try {
        if (await this.svc.commitStaleCancellation(o.id, o.merchantId, { merchantPhase: "awaiting_payment" }, "shop_closed")) {
          cancelled++;
        }
      } catch (err) {
        this.svc.logger.error(`sweepEndOfDayClose failed for order ${o.id}: ${(err as Error).message}`);
      }
    }
    return { cancelled };
  }

  /** N-22: one soft reminder push ~15 min after an unanswered payment request — no threat language,
   *  nothing at risk (R-17 retired the payment clock; only end-of-day close, N-23, is automatic).
   *  `paymentReminderSentAt` is the idempotency guard: a claimed row can never be reminded twice, and
   *  a row already reminded is excluded from the next sweep's own query, so a crash between the
   *  claim and the push (best-effort, never throws) at worst drops one reminder rather than repeating
   *  it — the softer failure mode for a "soft, once" nudge. */
  async sweepPaymentReminders(): Promise<{ reminded: number }> {
    let reminded = 0;
    const cutoff = new Date(Date.now() - RESTAURANTS_TIMING.paymentReminderWindowMs);
    const due = await this.svc.prisma.order.findMany({
      where: {
        orderType: "merchant",
        status: "requested",
        merchantPhase: "awaiting_payment",
        paymentRequestedAt: { lt: cutoff },
        paymentReminderSentAt: null,
      },
      select: { id: true, customerId: true },
      take: 200,
    });
    for (const o of due) {
      try {
        const claimed = await this.svc.prisma.order.updateMany({
          where: { id: o.id, paymentReminderSentAt: null },
          data: { paymentReminderSentAt: new Date() },
        });
        if (claimed.count > 0) {
          await this.svc.notifyPaymentRequested(
            o.id,
            o.customerId,
            "Still waiting on your payment",
            "Your order is on hold until payment lands — pay now, or cancel any time, free.",
          );
          reminded++;
        }
      } catch (err) {
        this.svc.logger.error(`sweepPaymentReminders failed for order ${o.id}: ${(err as Error).message}`);
      }
    }
    return { reminded };
  }

  /**
   * Auto-accept safeguard 1. Two jobs for auto-accepted orders still in the kitchen:
   *  - Escalate: unconfirmed RESTAURANTS_AUTO_ACCEPT.escalateAfterMs after placement → marked urgent for
   *    the ops call list (once).
   *  - Cancel: still unconfirmed RESTAURANTS_AUTO_ACCEPT.autoCancelAfterMs after placement (24 h since
   *    owner decision D1 — a merchant wait; it was 60 min) → cancelled, customer told nothing was
   *    charged (a cash order has taken no money yet).
   *  - Food is ready: once CONFIRMED and the prep time has run out with nobody tapping "Food is ready",
   *    the order is marked ready (`ready_for_pickup` while dispatch looks, null once a rider holds it).
   *    The rider search itself starts RESTAURANTS_AUTO_ACCEPT.dispatchLeadMs earlier, without touching
   *    the kitchen's phase (FoodDispatchService.sweepSearch, MJ-RM1 / U32). An unconfirmed order never
   *    reaches dispatch.
   */
  async sweepAutoAccepted(now: Date = new Date()): Promise<{ escalated: number; released: number; cancelled: number }> {
    const escalated = await this.svc.prisma.order.updateMany({
      where: {
        orderType: "merchant",
        status: "requested",
        autoAccepted: true,
        kitchenConfirmedAt: null,
        kitchenEscalatedAt: null,
        // prepStartedAt, not createdAt: the same instant for an ASAP order, but a scheduled order starts
        // cooking when it rings (OrderScheduleService), maybe a day after it was placed.
        prepStartedAt: { lt: new Date(now.getTime() - RESTAURANTS_AUTO_ACCEPT.escalateAfterMs) },
      },
      data: { kitchenEscalatedAt: now },
    });
    if (escalated.count > 0) this.svc.logger.warn(`auto-accept: ${escalated.count} order(s) unconfirmed — urgent on the ops call list`);

    let cancelled = 0;
    const abandoned = await this.svc.prisma.order.findMany({
      where: {
        orderType: "merchant",
        status: "requested",
        autoAccepted: true,
        kitchenConfirmedAt: null,
        prepStartedAt: { lt: new Date(now.getTime() - RESTAURANTS_AUTO_ACCEPT.autoCancelAfterMs) },
      },
      select: { id: true, merchantId: true },
      take: 200,
    });
    for (const o of abandoned) {
      try {
        if (await this.svc.commitStaleCancellation(o.id, o.merchantId, { autoAccepted: true, kitchenConfirmedAt: null }, "kitchen_unconfirmed", "preparing")) {
          cancelled++;
        }
      } catch (err) {
        this.svc.logger.error(`sweepAutoAccepted cancel failed for order ${o.id}: ${(err as Error).message}`);
      }
    }
    if (cancelled > 0) this.svc.logger.warn(`auto-accept: ${cancelled} order(s) never confirmed by the kitchen — cancelled`);

    // MJ-RM1 / U32: the rider search starts dispatchLeadMs early on its own (FoodDispatchService.
    // sweepSearch, phase untouched); the kitchen's ticket only becomes "ready" once the ready time itself
    // has passed and nobody tapped "Food is ready", so readyAt is the real ready time, not 8 min early.
    let released = 0;
    const cooking = await this.svc.prisma.order.findMany({
      where: {
        orderType: "merchant",
        status: { in: ["requested", "open_for_offers", ...RIDER_PRE_PICKUP_STATUSES] },
        merchantPhase: "preparing",
        autoAccepted: true,
        kitchenConfirmedAt: { not: null },
        // Order flow v2 (BRIEF §8): never to a rider while the customer is answering changes.
        substitutionRounds: { none: { status: "open" } },
      },
      select: { id: true, merchantId: true, status: true, prepStartedAt: true, prepMinutes: true },
      orderBy: { prepStartedAt: "asc" },
      take: 200,
    });
    for (const o of cooking) {
      const readyAt = (o.prepStartedAt?.getTime() ?? now.getTime()) + (o.prepMinutes ?? 0) * 60_000;
      if (readyAt > now.getTime()) continue;
      const status = o.status ?? "requested";
      const next = readyPhaseFor(status);
      if (next === undefined) continue;
      try {
        const pickupCode = this.svc.tokens.randomPickupCode();
        const claimed = await this.svc.prisma.order.updateMany({
          where: { id: o.id, status, merchantPhase: "preparing", kitchenConfirmedAt: { not: null } },
          data: {
            merchantPhase: next,
            readyAt: now,
            pickupCodeHash: this.svc.tokens.hash(pickupCode),
            pickupCodeCipher: sealHandoverCode(this.svc.codeCrypto, "pickup", o.id, pickupCode),
            pickupCodeAttempts: 0,
            // As markReady: a parked search resumes now (and the D-34 cap then applies as usual).
            ...(next === "ready_for_pickup" ? { dispatchNextCheckAt: now } : {}),
          },
        });
        if (claimed.count > 0) {
          released++;
          this.svc.notifyQueue(o.merchantId, o.id);
        }
      } catch (err) {
        this.svc.logger.error(`sweepAutoAccepted failed for order ${o.id}: ${(err as Error).message}`);
      }
    }
    return { escalated: escalated.count, released, cancelled };
  }

  /** RD1a–d: what the rider's offer card tags — venue kind, a scheduled slot, a prescription order. */
  async offerJobInfo(orderId: string): Promise<NonNullable<FoodOfferResponse["job"]> | null> {
    const o = await this.svc.prisma.order.findUnique({
      where: { id: orderId },
      select: {
        merchant: { select: { businessType: true, shopKind: true } },
        schedule: { select: { scheduledFor: true } },
        prescription: { select: { status: true } },
        carriedBalance: { select: { amount: true } },
      },
    });
    if (!o?.merchant) return null;
    // FJ-H5: the rider's "collect at the door" figure includes what this order carries.
    const carried = addMoney(0, ...(o.carriedBalance ?? []).map((b) => Number(b.amount)));
    return {
      businessType: o.merchant.businessType,
      shopKind: o.merchant.shopKind ?? null,
      scheduledFor: o.schedule?.scheduledFor.toISOString() ?? null,
      rx: o.prescription?.status === "approved",
      ...(carried > 0 ? { carriedUsd: carried } : {}),
    };
  }
}
