import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
  type OnModuleDestroy,
  type OnModuleInit,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  addMoney,
  DELIVERY_OTP_MAX_ATTEMPTS,
  deliveryFeeForDistance,
  fromCents,
  haversineKm,
  BUSY_MODE_EXTRA_MIN,
  type MerchantAcceptOrderRequest,
  type MerchantConfirmPaymentRequest,
  type MerchantOrderItemView,
  type MerchantOrderResponse,
  type MerchantRejectionReasonCode,
  type PlaceMerchantOrderRequest,
  rejectionCopy,
  RESTAURANTS_TIMING,
  roundToCents,
  smallOrderFeeForSubtotal,
  toCents,
  type Waypoint,
} from "@lynia/shared";
import { TokenService } from "../auth/token.service";
import { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";
import { FoodDebtService } from "./food-debt.service";

// D-24 manual rail: the customer needs the shop's OWN payment-receiving number to send mobile
// money to (never masked — D-17's masking is for a THIRD PARTY's view of the merchant, e.g. a
// rider's navigation card; the customer paying their own order needs the real number, exactly as
// the design source shows it — packages/design/RESTAURANTS-DECISIONS.md D-24). Falls back to the
// merchant account's own registered phone when no pickup-point contactPhone is set yet (toResponse).
const ORDER_WITH_ITEMS_INCLUDE = {
  merchantItems: true,
  merchant: { select: { location: true, ownerProfile: { select: { phone: true } } } },
} satisfies Prisma.OrderInclude;
type OrderWithItems = Prisma.OrderGetPayload<{ include: typeof ORDER_WITH_ITEMS_INCLUDE }>;

function isDishOutOfStock(dish: { outOfStockUntil: Date | null }): boolean {
  return !!dish.outOfStockUntil && dish.outOfStockUntil > new Date();
}

/** Sum of `priceUsd * quantity` across lines, exact (integer cents), never float accumulation error. */
function lineTotal(priceUsd: Prisma.Decimal | number, quantity: number): number {
  return fromCents(toCents(Number(priceUsd)) * quantity);
}

/**
 * C2 — food order lifecycle (pre-dispatch). Owns the `requested` phase of a merchant order end to
 * end: placement → merchant accept (full or item-level, D-23) → payment-confirm-before-cook (R-11) →
 * prep → ready. Once `ready_for_pickup`, the hand-off to C3's dispatch (broadcasting to
 * open_for_offers, assigning a rider) is deliberately NOT this service's job — see
 * order-lifecycle.transitions.ts's MERCHANT_PHASE_TRANSITIONS "ready_for_pickup has no outgoing
 * edge" note. `confirmPickup` is wired ahead of that dependency (mechanic only needs an assigned
 * rider, not the dispatch algorithm) so it's ready the moment C3 lands.
 */
@Injectable()
export class FoodOrderService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(FoodOrderService.name);
  private sweep?: ReturnType<typeof setInterval>;

  constructor(
    private readonly prisma: PrismaService,
    private readonly tokens: TokenService,
    private readonly notifications: NotificationsService,
    private readonly debt: FoodDebtService,
  ) {}

  onModuleInit(): void {
    // DB-only reconciler (no BullMQ per-order scheduling, unlike order-lifecycle.service's rating
    // auto-close) — a tight sweep interval (RESTAURANTS_TIMING.sweepIntervalMs, 20s) keeps N-03's
    // 3:00 accept window reading as "auto-cancel", not "eventually", without the added queue/worker
    // infra. Revisit with a delayed-job precision pass if real usage needs sub-20s accuracy.
    void this.runSweeps();
    this.sweep = setInterval(() => void this.runSweeps(), RESTAURANTS_TIMING.sweepIntervalMs);
    this.sweep.unref?.();
  }

  onModuleDestroy(): void {
    if (this.sweep) clearInterval(this.sweep);
  }

  private async runSweeps(): Promise<void> {
    try {
      await this.sweepExpiredAcceptWindows();
    } catch (err) {
      this.logger.error(`sweepExpiredAcceptWindows failed: ${(err as Error).message}`);
    }
    try {
      await this.sweepExpiredItemApprovals();
    } catch (err) {
      this.logger.error(`sweepExpiredItemApprovals failed: ${(err as Error).message}`);
    }
    try {
      await this.sweepEndOfDayClose();
    } catch (err) {
      this.logger.error(`sweepEndOfDayClose failed: ${(err as Error).message}`);
    }
  }

  // ── Customer ─────────────────────────────────────────────────────────────────────────────────────

  /** `POST /restaurants/:merchantId/orders`. Price is always server-computed (D-35). */
  async placeOrder(customerId: string, merchantId: string, body: PlaceMerchantOrderRequest): Promise<MerchantOrderResponse> {
    if (body.idempotencyKey) {
      const existing = await this.findByIdempotencyKey(customerId, body.idempotencyKey);
      if (existing) return this.toResponse(existing);
    }

    const merchant = await this.prisma.merchant.findFirst({
      where: { id: merchantId, pilotEnabled: true },
      select: { id: true, location: true, cashRule: true },
    });
    if (!merchant) throw new NotFoundException("Restaurant not found");
    const location = merchant.location as Waypoint | null;
    if (!location) throw new ConflictException("This restaurant isn't ready to take orders yet");

    const dishIds = [...new Set(body.items.map((i) => i.dishId))];
    const dishes = await this.prisma.merchantDish.findMany({ where: { id: { in: dishIds }, merchantId } });
    if (dishes.length !== dishIds.length) throw new NotFoundException("One or more dishes are not on this menu");
    const dishById = new Map(dishes.map((d) => [d.id, d]));
    for (const item of body.items) {
      const dish = dishById.get(item.dishId)!;
      if (dish.isDraft) throw new ConflictException(`${dish.name} isn't available yet`);
      if (isDishOutOfStock(dish)) throw new ConflictException(`${dish.name} is out of stock right now`);
    }

    const rawSubtotal = addMoney(...body.items.map((i) => lineTotal(dishById.get(i.dishId)!.priceUsd, i.quantity)));
    const smallOrderFee = smallOrderFeeForSubtotal(rawSubtotal);
    const merchantGoodsTotal = addMoney(rawSubtotal, smallOrderFee);
    const distanceKm = roundToCents(haversineKm(location.point, body.dropoff.point));
    const deliveryFee = deliveryFeeForDistance(distanceKm);
    const agreedFare = addMoney(merchantGoodsTotal, deliveryFee);
    const itemDesc = summarizeMerchantItems(body.items.map((i) => ({ name: dishById.get(i.dishId)!.name, quantity: i.quantity })));

    try {
      const created = await this.prisma.order.create({
        data: {
          orderType: "merchant",
          customerId,
          merchantId,
          pickup: location as unknown as Prisma.InputJsonValue,
          dropoff: body.dropoff as unknown as Prisma.InputJsonValue,
          itemDesc,
          note: body.note ?? null,
          declaredValue: 0,
          distanceKm,
          suggestedFare: agreedFare,
          proposedFare: agreedFare,
          agreedFare,
          currency: "USD",
          status: "requested",
          merchantPhase: "awaiting_accept",
          acceptDeadlineAt: new Date(Date.now() + RESTAURANTS_TIMING.acceptWindowMs),
          merchantPaymentMethod: body.paymentMethod,
          // R-03 snapshot: the merchant's cash rule AT PLACEMENT (C4), so a mid-order shop-setting
          // change never retroactively changes an in-flight order's debt obligations. Null when the
          // customer chose WALLET — the rule never applies.
          merchantCashRule: body.paymentMethod === "cash" ? merchant.cashRule : null,
          merchantGoodsTotal,
          deliveryFee,
          idempotencyKey: body.idempotencyKey ?? null,
          events: { create: { status: "requested" } },
          merchantItems: {
            create: body.items.map((i) => {
              const dish = dishById.get(i.dishId)!;
              return { dishId: dish.id, nameSnapshot: dish.name, priceUsd: dish.priceUsd, quantity: i.quantity, note: i.note ?? null };
            }),
          },
        },
        include: ORDER_WITH_ITEMS_INCLUDE,
      });
      return this.toResponse(created);
    } catch (err) {
      // The idempotencyKey pre-check above races a concurrent duplicate submit; the
      // (customer_id, idempotency_key) partial unique index (shared with parcel orders, migration
      // 0021) is the real guard, so map its violation to the same replay instead of leaking a 500.
      if (body.idempotencyKey && err instanceof Prisma.PrismaClientKnownRequestError && err.code === "P2002") {
        const existing = await this.findByIdempotencyKey(customerId, body.idempotencyKey);
        if (existing) return this.toResponse(existing);
      }
      throw err;
    }
  }

  private async findByIdempotencyKey(customerId: string, idempotencyKey: string): Promise<OrderWithItems | null> {
    return this.prisma.order.findFirst({
      where: { customerId, orderType: "merchant", idempotencyKey },
      include: ORDER_WITH_ITEMS_INCLUDE,
    });
  }

  async getMyOrder(orderId: string, customerId: string): Promise<MerchantOrderResponse> {
    const order = await this.findOwnAsCustomer(orderId, customerId);
    return this.toResponse(order);
  }

  /** D-23: the customer's response to a shortened (item-level accept) order. */
  async approveItems(orderId: string, customerId: string, approve: boolean): Promise<MerchantOrderResponse> {
    const order = await this.findOwnAsCustomer(orderId, customerId);
    if (order.merchantPhase !== "awaiting_item_approval") {
      throw new ConflictException("This order isn't waiting on an item approval");
    }
    if (order.itemApprovalDeadlineAt && order.itemApprovalDeadlineAt.getTime() < Date.now()) {
      throw new ConflictException("The approval window has closed");
    }

    if (!approve) {
      const claimed = await this.prisma.order.updateMany({
        where: { id: orderId, status: "requested", merchantPhase: "awaiting_item_approval" },
        data: { status: "cancelled", cancelledAt: new Date(), cancelledBy: customerId, merchantPhase: null },
      });
      if (claimed.count === 0) throw new ConflictException("Order changed, retry");
      await this.prisma.orderEvent.create({ data: { orderId, status: "cancelled" } });
      return this.toResponse(await this.mustFindWithItems(orderId));
    }

    const nextPhase = order.merchantPaymentMethod === "cash" ? "preparing" : "awaiting_payment";
    const claimed = await this.prisma.order.updateMany({
      where: { id: orderId, status: "requested", merchantPhase: "awaiting_item_approval" },
      data:
        nextPhase === "preparing"
          ? { merchantPhase: "preparing", prepStartedAt: new Date(), itemApprovalDeadlineAt: null }
          : { merchantPhase: "awaiting_payment", itemApprovalDeadlineAt: null },
    });
    if (claimed.count === 0) throw new ConflictException("Order changed, retry");
    return this.toResponse(await this.mustFindWithItems(orderId));
  }

  /** R-17: free, any time before paying — once preparing/ready the kitchen has committed. */
  async cancelUnpaid(orderId: string, customerId: string): Promise<MerchantOrderResponse> {
    const order = await this.findOwnAsCustomer(orderId, customerId);
    const cancellable = new Set(["awaiting_accept", "awaiting_item_approval", "awaiting_payment"]);
    if (!order.merchantPhase || !cancellable.has(order.merchantPhase)) {
      throw new ConflictException("This order can't be cancelled anymore — the kitchen has started");
    }
    const claimed = await this.prisma.order.updateMany({
      where: { id: orderId, status: "requested", merchantPhase: order.merchantPhase },
      data: { status: "cancelled", cancelledAt: new Date(), cancelledBy: customerId, merchantPhase: null },
    });
    if (claimed.count === 0) throw new ConflictException("Order changed, retry");
    await this.prisma.orderEvent.create({ data: { orderId, status: "cancelled" } });
    return this.toResponse(await this.mustFindWithItems(orderId));
  }

  /** D-24 "I paid another way" manual rail — the customer's own submitted reference. */
  async submitPaymentReference(orderId: string, customerId: string, reference: string): Promise<MerchantOrderResponse> {
    const order = await this.findOwnAsCustomer(orderId, customerId);
    if (order.merchantPhase !== "awaiting_payment") throw new ConflictException("This order isn't awaiting payment");
    await this.prisma.order.update({ where: { id: orderId }, data: { merchantPaymentReference: reference } });
    return this.toResponse(await this.mustFindWithItems(orderId));
  }

  // ── Merchant ─────────────────────────────────────────────────────────────────────────────────────

  async listQueue(profileId: string): Promise<MerchantOrderResponse[]> {
    const merchantId = await this.ownMerchantId(profileId);
    const orders = await this.prisma.order.findMany({
      where: { merchantId, orderType: "merchant", status: "requested" },
      orderBy: { createdAt: "asc" },
      include: ORDER_WITH_ITEMS_INCLUDE,
    });
    return orders.map((o) => this.toResponse(o));
  }

  async getQueueOrder(profileId: string, orderId: string): Promise<MerchantOrderResponse> {
    const order = await this.findOwnAsMerchant(profileId, orderId);
    return this.toResponse(order);
  }

  /** C4: the assigned rider's own read view — no MerchantGuard (party-checked below), mirrors
   *  getMyOrder/getQueueOrder. Needed so a rider can see the C4 handshake/debt/PAID fields the
   *  doorstep flow depends on (R-12 "the rider sees PAID at pickup and hand-off"). */
  async getAsRider(orderId: string, riderId: string): Promise<MerchantOrderResponse> {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, riderId, orderType: "merchant" },
      include: ORDER_WITH_ITEMS_INCLUDE,
    });
    if (!order) throw new NotFoundException("Order not found");
    return this.toResponse(order);
  }

  /** D-23: full accept when `unavailableDishIds` is empty, item-level accept otherwise. */
  async acceptOrder(profileId: string, orderId: string, body: MerchantAcceptOrderRequest): Promise<MerchantOrderResponse> {
    const merchantId = await this.ownMerchantId(profileId);
    const merchant = await this.prisma.merchant.findUnique({ where: { id: merchantId }, select: { busyMode: true } });
    // N-17: busy mode bumps the chip at accept time — folded in once, not re-applied on every read.
    const prepMinutes = body.prepMinutes + (merchant?.busyMode ? BUSY_MODE_EXTRA_MIN : 0);

    const order = await this.findOwnAsMerchant(profileId, orderId);
    if (order.merchantPhase !== "awaiting_accept") throw new ConflictException("This order can no longer be accepted");

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
      const agreedFare = addMoney(merchantGoodsTotal, Number(order.deliveryFee ?? 0));

      await this.prisma.$transaction(async (tx) => {
        const claimed = await tx.order.updateMany({
          where: { id: orderId, status: "requested", merchantPhase: "awaiting_accept" },
          data: {
            merchantPhase: "awaiting_item_approval",
            itemApprovalDeadlineAt: new Date(Date.now() + RESTAURANTS_TIMING.itemApprovalWindowMs),
            prepMinutes,
            merchantGoodsTotal,
            agreedFare,
          },
        });
        if (claimed.count === 0) throw new ConflictException("Order changed, retry");
        await tx.merchantOrderItem.updateMany({ where: { orderId, dishId: { in: [...unavailable] } }, data: { available: false } });
        await tx.merchantOrderItem.updateMany({ where: { orderId, dishId: { notIn: [...unavailable] } }, data: { available: true } });
      });
    } else {
      const cash = order.merchantPaymentMethod === "cash";
      const claimed = await this.prisma.order.updateMany({
        where: { id: orderId, status: "requested", merchantPhase: "awaiting_accept" },
        data: cash
          ? { merchantPhase: "preparing", prepMinutes, prepStartedAt: new Date() }
          : { merchantPhase: "awaiting_payment", prepMinutes },
      });
      if (claimed.count === 0) throw new ConflictException("Order changed, retry");
      await this.prisma.merchantOrderItem.updateMany({ where: { orderId }, data: { available: true } });
    }
    return this.toResponse(await this.mustFindWithItems(orderId));
  }

  /** D-11: the reason IS the customer's copy. */
  async rejectOrder(profileId: string, orderId: string, reason: MerchantRejectionReasonCode): Promise<MerchantOrderResponse> {
    const merchantId = await this.ownMerchantId(profileId);
    const claimed = await this.prisma.order.updateMany({
      where: { id: orderId, merchantId, orderType: "merchant", status: "requested", merchantPhase: "awaiting_accept" },
      data: { status: "cancelled", cancelledAt: new Date(), rejectionReason: reason, merchantPhase: null },
    });
    if (claimed.count === 0) throw new ConflictException("This order can no longer be rejected");
    await this.prisma.orderEvent.create({ data: { orderId, status: "cancelled" } });
    await this.notifyCancelledCustomer(orderId, reason);
    return this.toResponse(await this.mustFindWithItems(orderId));
  }

  /** R-16: logged before the request-payment button unlocks. */
  async logCall(profileId: string, orderId: string): Promise<MerchantOrderResponse> {
    const order = await this.findOwnAsMerchant(profileId, orderId);
    if (order.merchantPhase !== "awaiting_payment") throw new ConflictException("This order isn't awaiting payment");
    await this.prisma.order.update({ where: { id: orderId }, data: { paymentCallLoggedAt: new Date() } });
    return this.toResponse(await this.mustFindWithItems(orderId));
  }

  /** R-16: unlocked by a logged call, or the named override for regulars/in-person confirms. */
  async requestPayment(profileId: string, orderId: string, overrideCallLog: boolean): Promise<MerchantOrderResponse> {
    const order = await this.findOwnAsMerchant(profileId, orderId);
    if (order.merchantPhase !== "awaiting_payment") throw new ConflictException("This order isn't awaiting payment");
    if (!order.paymentCallLoggedAt && !overrideCallLog) {
      throw new ConflictException("Log the call before requesting payment (or use the override)");
    }
    await this.prisma.order.update({ where: { id: orderId }, data: { paymentRequestedAt: new Date() } });
    return this.toResponse(await this.mustFindWithItems(orderId));
  }

  /** R-11: matches the customer's rail reference against the merchant's own statement — a mismatched
   *  amount blocks release and names the gap (D-06). THIS is what starts the prep clock. */
  async confirmPayment(profileId: string, orderId: string, body: MerchantConfirmPaymentRequest): Promise<MerchantOrderResponse> {
    const order = await this.findOwnAsMerchant(profileId, orderId);
    if (order.merchantPhase !== "awaiting_payment") throw new ConflictException("This order isn't awaiting payment");
    const expected = Number(order.merchantGoodsTotal ?? 0);
    if (Math.round(body.amount * 100) !== Math.round(expected * 100)) {
      throw new ConflictException(`Amount doesn't match — expected $${expected.toFixed(2)}, got $${body.amount.toFixed(2)}`);
    }
    const claimed = await this.prisma.order.updateMany({
      where: { id: orderId, status: "requested", merchantPhase: "awaiting_payment" },
      data: {
        merchantPhase: "preparing",
        prepStartedAt: new Date(),
        merchantPaymentConfirmedAt: new Date(),
        merchantPaymentReference: body.reference,
      },
    });
    if (claimed.count === 0) throw new ConflictException("Order changed, retry");
    return this.toResponse(await this.mustFindWithItems(orderId));
  }

  /** R-17: no-penalty release — the zombie-order mitigation for a lane that never blocks the board. */
  async releaseUnpaid(profileId: string, orderId: string, reason: MerchantRejectionReasonCode): Promise<MerchantOrderResponse> {
    const merchantId = await this.ownMerchantId(profileId);
    const claimed = await this.prisma.order.updateMany({
      where: { id: orderId, merchantId, orderType: "merchant", status: "requested", merchantPhase: "awaiting_payment" },
      data: { status: "cancelled", cancelledAt: new Date(), rejectionReason: reason, merchantPhase: null },
    });
    if (claimed.count === 0) throw new ConflictException("This order can't be released");
    await this.prisma.orderEvent.create({ data: { orderId, status: "cancelled" } });
    await this.notifyCancelledCustomer(orderId, reason);
    return this.toResponse(await this.mustFindWithItems(orderId));
  }

  /** N-16: mints the 4-digit pickup code (hashed, mirrors otpHash) so it exists by the time C3's
   *  dispatch assigns a rider and confirmPickup can verify it. */
  async markReady(profileId: string, orderId: string): Promise<MerchantOrderResponse> {
    const order = await this.findOwnAsMerchant(profileId, orderId);
    if (order.merchantPhase !== "preparing") throw new ConflictException("This order isn't in prep");
    const pickupCode = this.tokens.randomPickupCode();
    const claimed = await this.prisma.order.updateMany({
      where: { id: orderId, status: "requested", merchantPhase: "preparing" },
      data: {
        merchantPhase: "ready_for_pickup",
        readyAt: new Date(),
        pickupCodeHash: this.tokens.hash(pickupCode),
        pickupCodeAttempts: 0,
      },
    });
    if (claimed.count === 0) throw new ConflictException("Order changed, retry");
    return this.toResponse(await this.mustFindWithItems(orderId));
  }

  // ── Rider (N-16 pickup — mechanic only; C3's dispatch owns getting a rider assigned) ───────────────

  /** Mirrors order-lifecycle.service.ts:confirmDelivery's shape one hop earlier. Unreachable via HTTP
   *  until C3's dispatch sets `Order.riderId`, but the mechanic is correct and tested now. */
  async confirmPickup(orderId: string, riderId: string, code: string): Promise<{ orderId: string; status: "picked_up" }> {
    const expectedHash = this.tokens.hash(code);
    const outcome = await this.prisma.$transaction(async (tx) => {
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
        }>
      >`SELECT status, rider_id, pickup_code_hash, pickup_code_attempts, merchant_id, merchant_payment_method, merchant_cash_rule, merchant_goods_total FROM orders WHERE id = ${orderId}::uuid FOR UPDATE`;
      const o = rows[0];
      if (!o) throw new NotFoundException("Order not found");
      if (o.rider_id !== riderId) throw new ForbiddenException("Not the assigned rider");
      if (o.status !== "en_route_pickup") throw new ConflictException("Order is not ready for pickup");
      if (o.pickup_code_attempts >= DELIVERY_OTP_MAX_ATTEMPTS) {
        throw new ForbiddenException("Too many attempts — ask the kitchen to re-check the code");
      }
      const ok = !!o.pickup_code_hash && this.tokens.safeEqualHex(expectedHash, o.pickup_code_hash);
      if (!ok) {
        await tx.order.update({ where: { id: orderId }, data: { pickupCodeAttempts: { increment: 1 } } });
        return { ok: false as const, attemptsUsed: o.pickup_code_attempts + 1 };
      }
      await tx.order.update({ where: { id: orderId }, data: { status: "picked_up", collectedAt: new Date() } });
      await tx.orderEvent.create({ data: { orderId, status: "picked_up" } });
      // C4/R-01: the debt opens the moment the food leaves the counter unpaid — same transaction, same
      // row lock, so it commits atomically with the pickup itself. No-ops for anything other than a
      // collect-and-return CASH order.
      await this.debt.openDebtIfNeeded(tx, {
        id: orderId,
        merchantId: o.merchant_id,
        riderId,
        merchantPaymentMethod: o.merchant_payment_method,
        merchantCashRule: o.merchant_cash_rule,
        merchantGoodsTotal: o.merchant_goods_total,
      });
      return { ok: true as const };
    });
    if (!outcome.ok) {
      const remaining = Math.max(0, DELIVERY_OTP_MAX_ATTEMPTS - outcome.attemptsUsed);
      throw new BadRequestException(
        remaining > 0 ? `That code doesn't match. ${remaining} attempt${remaining === 1 ? "" : "s"} left.` : "That code doesn't match — no attempts left.",
      );
    }
    return { orderId, status: "picked_up" };
  }

  // ── Reconciler sweeps (DB-only, RESTAURANTS_TIMING.sweepIntervalMs) ─────────────────────────────────

  /** N-03: unanswered merchant accept auto-cancels — never a silent hang (D-13). */
  async sweepExpiredAcceptWindows(): Promise<{ cancelled: number }> {
    return this.sweepExpiredPhase("awaiting_accept", "acceptDeadlineAt", "shop_closed");
  }

  /** N-18: unanswered 60s item-approval window — mocked default (surfaced in the PR): treated as a
   *  decline, same as the customer declining explicitly. */
  async sweepExpiredItemApprovals(): Promise<{ cancelled: number }> {
    return this.sweepExpiredPhase("awaiting_item_approval", "itemApprovalDeadlineAt", "other");
  }

  private async sweepExpiredPhase(
    phase: "awaiting_accept" | "awaiting_item_approval",
    deadlineField: "acceptDeadlineAt" | "itemApprovalDeadlineAt",
    reason: MerchantRejectionReasonCode,
  ): Promise<{ cancelled: number }> {
    let cancelled = 0;
    const stale = await this.prisma.order.findMany({
      where: { orderType: "merchant", status: "requested", merchantPhase: phase, [deadlineField]: { lt: new Date() } },
      select: { id: true },
      take: 200,
    });
    for (const o of stale) {
      try {
        const claimed = await this.prisma.order.updateMany({
          where: { id: o.id, status: "requested", merchantPhase: phase },
          data: { status: "cancelled", cancelledAt: new Date(), rejectionReason: reason, merchantPhase: null },
        });
        if (claimed.count > 0) {
          await this.prisma.orderEvent.create({ data: { orderId: o.id, status: "cancelled" } });
          await this.notifyCancelledCustomer(o.id, reason);
          cancelled++;
        }
      } catch (err) {
        this.logger.error(`sweepExpiredPhase(${phase}) failed for order ${o.id}: ${(err as Error).message}`);
      }
    }
    return { cancelled };
  }

  /** N-23: end-of-day close is the only automatic exit for an unpaid WALLET order (R-17 — no payment
   *  clocks otherwise). Nothing charged; customer notified. */
  async sweepEndOfDayClose(): Promise<{ cancelled: number }> {
    let cancelled = 0;
    const stale = await this.prisma.order.findMany({
      where: { orderType: "merchant", status: "requested", merchantPhase: "awaiting_payment" },
      select: { id: true, merchantId: true },
      take: 200,
    });
    if (stale.length === 0) return { cancelled: 0 };
    const merchantIds = [...new Set(stale.map((o) => o.merchantId).filter((id): id is string => !!id))];
    const merchants = await this.prisma.merchant.findMany({ where: { id: { in: merchantIds } }, select: { id: true, hours: true } });
    const hoursById = new Map(merchants.map((m) => [m.id, m.hours as Record<string, { open: string; close: string }> | null]));
    for (const o of stale) {
      if (!o.merchantId || !isPastClosingTime(hoursById.get(o.merchantId) ?? null)) continue;
      try {
        const claimed = await this.prisma.order.updateMany({
          where: { id: o.id, status: "requested", merchantPhase: "awaiting_payment" },
          data: { status: "cancelled", cancelledAt: new Date(), rejectionReason: "shop_closed", merchantPhase: null },
        });
        if (claimed.count > 0) {
          await this.prisma.orderEvent.create({ data: { orderId: o.id, status: "cancelled" } });
          await this.notifyCancelledCustomer(o.id, "shop_closed");
          cancelled++;
        }
      } catch (err) {
        this.logger.error(`sweepEndOfDayClose failed for order ${o.id}: ${(err as Error).message}`);
      }
    }
    return { cancelled };
  }

  // ── Shared lookups + mapping ─────────────────────────────────────────────────────────────────────

  private async ownMerchantId(profileId: string): Promise<string> {
    const merchant = await this.prisma.merchant.findUnique({ where: { ownerProfileId: profileId }, select: { id: true } });
    if (!merchant) throw new NotFoundException("Merchant not found");
    return merchant.id;
  }

  private async findOwnAsMerchant(profileId: string, orderId: string): Promise<OrderWithItems> {
    const merchantId = await this.ownMerchantId(profileId);
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, merchantId, orderType: "merchant" },
      include: ORDER_WITH_ITEMS_INCLUDE,
    });
    if (!order) throw new NotFoundException("Order not found");
    return order;
  }

  private async findOwnAsCustomer(orderId: string, customerId: string): Promise<OrderWithItems> {
    const order = await this.prisma.order.findFirst({
      where: { id: orderId, customerId, orderType: "merchant" },
      include: ORDER_WITH_ITEMS_INCLUDE,
    });
    if (!order) throw new NotFoundException("Order not found");
    return order;
  }

  private async mustFindWithItems(orderId: string): Promise<OrderWithItems> {
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, include: ORDER_WITH_ITEMS_INCLUDE });
    if (!order) throw new NotFoundException("Order not found");
    return order;
  }

  private async notifyCancelledCustomer(orderId: string, reason: MerchantRejectionReasonCode): Promise<void> {
    const order = await this.prisma.order.findUnique({ where: { id: orderId }, select: { customerId: true } });
    if (!order) return;
    await this.notifications.notifyProfiles([order.customerId], {
      title: "Your order was cancelled",
      body: rejectionCopy(reason),
      data: { orderId, status: "cancelled" },
    });
  }

  private toResponse(order: OrderWithItems): MerchantOrderResponse {
    const items: MerchantOrderItemView[] = order.merchantItems.map((it) => ({
      dishId: it.dishId,
      name: it.nameSnapshot,
      priceUsd: Number(it.priceUsd),
      quantity: it.quantity,
      note: it.note,
      available: it.available,
    }));
    const merchantGoodsTotal = order.merchantGoodsTotal != null ? Number(order.merchantGoodsTotal) : null;
    const deliveryFee = order.deliveryFee != null ? Number(order.deliveryFee) : null;
    const merchantLocation = order.merchant?.location as Waypoint | null;
    const merchantPaymentPhone = merchantLocation?.contactPhone ?? order.merchant?.ownerProfile?.phone ?? null;
    return {
      id: order.id,
      merchantId: order.merchantId!,
      status: order.status,
      merchantPhase: order.merchantPhase,
      items,
      note: order.note,
      paymentMethod: order.merchantPaymentMethod,
      merchantPaymentPhone,
      merchantGoodsTotal,
      deliveryFee,
      total: merchantGoodsTotal != null && deliveryFee != null ? addMoney(merchantGoodsTotal, deliveryFee) : null,
      acceptDeadlineAt: order.acceptDeadlineAt?.toISOString() ?? null,
      itemApprovalDeadlineAt: order.itemApprovalDeadlineAt?.toISOString() ?? null,
      prepMinutes: order.prepMinutes,
      prepStartedAt: order.prepStartedAt?.toISOString() ?? null,
      readyAt: order.readyAt?.toISOString() ?? null,
      rejectionReason: order.rejectionReason,
      paymentCallLoggedAt: order.paymentCallLoggedAt?.toISOString() ?? null,
      paymentRequestedAt: order.paymentRequestedAt?.toISOString() ?? null,
      merchantPaymentReference: order.merchantPaymentReference,
      merchantPaymentConfirmedAt: order.merchantPaymentConfirmedAt?.toISOString() ?? null,
      // C3: dispatch view (see MerchantOrderResponse's docstring).
      riderId: order.riderId,
      dispatchAttempt: order.dispatchAttempt,
      dispatchOfferExpiresAt: order.dispatchOfferExpiresAt?.toISOString() ?? null,
      noRiderHoldAt: order.noRiderHoldAt?.toISOString() ?? null,
      // C4: doorstep handshake (R-04/R-05/N-19).
      cashHandshakeAmount: order.cashHandshakeAmount != null ? Number(order.cashHandshakeAmount) : null,
      customerCashConfirmedAt: order.customerCashConfirmedAt?.toISOString() ?? null,
      riderCashConfirmedAt: order.riderCashConfirmedAt?.toISOString() ?? null,
      cashHandshakeDeadlineAt: order.cashHandshakeDeadlineAt?.toISOString() ?? null,
      cashHandshakeFrozenAt: order.cashHandshakeFrozenAt?.toISOString() ?? null,
      // C4: the collect-and-return merchant-debt ledger's derived state.
      merchantCashRule: order.merchantCashRule,
      debtStatus: order.debtStatus,
      debtAmount: order.debtAmount != null ? Number(order.debtAmount) : null,
      debtOpenedAt: order.debtOpenedAt?.toISOString() ?? null,
      debtSettledAt: order.debtSettledAt?.toISOString() ?? null,
      // C4/D-12: merchant-issued refund.
      refundReference: order.refundReference,
      refundAmount: order.refundAmount != null ? Number(order.refundAmount) : null,
      refundedAt: order.refundedAt?.toISOString() ?? null,
    };
  }
}

/** Compact one-line rendering of a food basket — "2x Sadza · 1x Chicken" — mirrors
 *  packages/shared summarizeItems' grammar for the generic `itemDesc` column every order carries. */
function summarizeMerchantItems(items: readonly { name: string; quantity: number }[]): string {
  return items.map((i) => `${i.quantity}x ${i.name}`).join(" · ");
}

/** N-23: true once "now" is at/after the shop's closing time for today, server-local calendar day
 *  (mirrors merchant.service.ts's endOfToday N-14 boundary). No hours set at all reads as "never
 *  auto-closes on hours" — the accept-window/item-approval sweeps still bound an order's lifetime. */
function isPastClosingTime(hours: Record<string, { open: string; close: string }> | null): boolean {
  if (!hours) return false;
  const now = new Date();
  const dayKey = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"][now.getDay()]!;
  const today = hours[dayKey];
  if (!today) return false;
  const [closeH, closeM] = today.close.split(":").map(Number);
  const closeAt = new Date(now);
  closeAt.setHours(closeH ?? 23, closeM ?? 59, 59, 999);
  return now >= closeAt;
}
