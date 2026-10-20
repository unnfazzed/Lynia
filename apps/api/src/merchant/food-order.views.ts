/**
 * Reads and the shared plumbing: the customer's order, the response shape, signed photo URLs, lookups and
 * pushes. A part of FoodOrderService (R-6): `this.svc` is the service itself.
 */
import { NotFoundException } from "@nestjs/common";
import { DEFAULT_COUNTRY_CODE, foodOrderMoney, merchantAmountDueUsd, type MerchantOrderItemView, type MerchantOrderResponse, rejectionCopy, RESTAURANTS_DEBT, type Waypoint, type CustomerBalanceResponse } from "@lynia/shared";
import { pushCopy, PUSH_C } from "../notifications/merchant-order-push";
import { resolveOwnMerchantId } from "./merchant-lookup.util";
import { PROOF_PHOTO_URL_CACHE_TTL_MS, PROOF_READ_URL_TTL_SECONDS, proofViews } from "./merchant-order-proof.service";
import { MERCHANT_PHOTO_URL_CACHE_TTL_MS, PHOTO_READ_URL_TTL_SECONDS } from "./merchant.service";
import { MicroCache } from "../common/micro-cache";
import { toSubstitutionRoundView } from "./order-substitution.service";
import { customerBalance } from "./customer-balance";
import { venueNoteOf } from "./venue-note";
import { ORDER_WITH_ITEMS_INCLUDE, type OrderWithItems, RESPONSE_NULL_OMIT_FIELDS, type StampedRejectionReason, VENUE_DECLINED, keptSubtotalOf, orderFlowV2BFields, orderFlowV2Fields } from "./food-order.helpers";
import type { FoodOrderService } from "./food-order.service";

export class FoodOrderViews {
  constructor(private readonly svc: FoodOrderService) {}
  /** The MICRO_CACHE_DISABLED kill-switch plus "TTL 0 disables it" — OrdersService.microCacheBypassed. */
  microCacheBypassed(ttlMs: number): boolean {
    return this.svc.env?.MICRO_CACHE_DISABLED === "true" || ttlMs <= 0;
  }

  /** C4: one read URL per object key, reused until its cache entry expires (see the cache fields).
   *  A rejected mint is never cached (MicroCache contract); callers map it to null. */
  signCached(cache: MicroCache<string>, key: string, signedTtlSeconds: number, cacheTtlMs: number): Promise<string> {
    const storage = this.svc.storage;
    if (!storage) return Promise.reject(new Error("no storage"));
    const mint = (): Promise<string> => storage.createReadUrl(key, signedTtlSeconds);
    return this.svc.microCacheBypassed(cacheTtlMs) ? mint() : cache.getOrLoad(key, cacheTtlMs, mint);
  }

  /** Pickup / door proof photos (15-min URLs). The env override shares the parcel pickup photo's
   *  bounded knob — same signed validity, same ≤600 s ceiling. */
  signProofPhoto(key: string): Promise<string | null> {
    return this.svc.signCached(
      this.svc.proofPhotoUrlCache,
      key,
      PROOF_READ_URL_TTL_SECONDS,
      this.svc.env?.MICRO_CACHE_TTL_MS_PICKUP_PHOTO_URL ?? PROOF_PHOTO_URL_CACHE_TTL_MS,
    );
  }

  /** Swap-dish photos (24 h URLs, the menu's dish-photo validity and its bounded env knob). */
  signSwapPhoto(key: string): Promise<string | null> {
    return this.svc.signCached(
      this.svc.swapPhotoUrlCache,
      key,
      PHOTO_READ_URL_TTL_SECONDS,
      this.svc.env?.MICRO_CACHE_TTL_MS_MERCHANT_PHOTO_URL ?? MERCHANT_PHOTO_URL_CACHE_TTL_MS,
    );
  }

  async getMyOrder(orderId: string, customerId: string): Promise<MerchantOrderResponse> {
    const order = await this.svc.findOwnAsCustomer(orderId, customerId);
    return this.svc.withDetail(order, this.svc.toResponse(order));
  }

  /** Order flow v2 (D-59): what only single-order reads carry — the pickup/door proof with signed read
   *  URLs, and the swap photos of the substitution round. Never on the queue poll. Best-effort. */
  async withDetail(order: OrderWithItems, response: MerchantOrderResponse): Promise<MerchantOrderResponse> {
    const { pickupProof, doorProof } = await proofViews((key) => this.svc.signProofPhoto(key), order);
    const out: MerchantOrderResponse = { ...response };
    if (pickupProof) out.pickupProof = pickupProof;
    if (doorProof) out.doorProof = doorProof;
    const round = order.substitutionRounds?.[0];
    const swapDishIds = round ? [...new Set(round.lines.map((l) => l.swapDishId).filter((id): id is string => !!id))] : [];
    if (round && swapDishIds.length > 0 && this.svc.storage) {
      try {
        const dishes = await this.svc.prisma.merchantDish.findMany({ where: { id: { in: swapDishIds } }, select: { id: true, photoUrl: true } });
        const photos = new Map<string, string | null>(
          await Promise.all(
            dishes.map(async (d) => [d.id, d.photoUrl ? await this.svc.signSwapPhoto(d.photoUrl).catch(() => null) : null] as const),
          ),
        );
        out.substitution = toSubstitutionRoundView(round, { keptSubtotal: keptSubtotalOf(order), swapPhotos: photos });
      } catch (err) {
        this.svc.logger.warn(`swap photos skipped for order ${order.id}: ${(err as Error).message}`);
      }
    }
    return out;
  }

  /** BRIEF D3f: the customer's owed balance (`GET /restaurants/balance`). */
  async myBalance(customerId: string): Promise<CustomerBalanceResponse> {
    return customerBalance(this.svc.prisma, customerId);
  }

  // ── Shared lookups + mapping ─────────────────────────────────────────────────────────────────────

  async ownMerchantId(profileId: string): Promise<string> {
    return resolveOwnMerchantId(this.svc.prisma, profileId);
  }

  async findOwnAsMerchant(profileId: string, orderId: string): Promise<OrderWithItems> {
    const merchantId = await this.svc.ownMerchantId(profileId);
    const order = await this.svc.prisma.order.findFirst({
      where: { id: orderId, merchantId, orderType: "merchant" },
      include: ORDER_WITH_ITEMS_INCLUDE,
    });
    if (!order) throw new NotFoundException("Order not found");
    return order;
  }

  async findOwnAsCustomer(orderId: string, customerId: string): Promise<OrderWithItems> {
    const order = await this.svc.prisma.order.findFirst({
      where: { id: orderId, customerId, orderType: "merchant" },
      include: ORDER_WITH_ITEMS_INCLUDE,
    });
    if (!order) throw new NotFoundException("Order not found");
    return order;
  }

  async mustFindWithItems(orderId: string): Promise<OrderWithItems> {
    const order = await this.svc.prisma.order.findUnique({ where: { id: orderId }, include: ORDER_WITH_ITEMS_INCLUDE });
    if (!order) throw new NotFoundException("Order not found");
    return order;
  }

  /** The restaurant's own view adds the customer's contact number, so it can call about changes
   *  (auto-accept safeguard 5), and their first name (Merchant v2, D-77). Never on the rider's view. */
  forMerchant(order: OrderWithItems): MerchantOrderResponse {
    const dropoff = order.dropoff as Waypoint | null;
    // The customer's own venue rating stays on the customer's read.
    const { venueRating: _venueRating, ...rest } = this.svc.toResponse(order);
    // Merchant v2 (D-77, owner decision): the customer's FIRST name only ("Rudo asked for 4 items").
    const firstName = order.customer?.firstName?.trim() || null;
    // Merchant v2 (D-77): the assigned rider's number, so the counter can call them (K4) and about late cash (T2).
    const riderPhone = order.rider?.profile?.phone || null;
    return {
      ...rest,
      customerPhone: dropoff?.contactPhone ?? null,
      ...(firstName ? { customerFirstName: firstName } : {}),
      ...(riderPhone ? { riderPhone } : {}),
      // Own bikers (D-117, OB-M13): the shop's own biker carries it and brings the delivery fee back too.
      ...(order.fleetMerchantId && order.riderId ? { ownBiker: true as const } : {}),
      // Merchant v2 (D-77): "at your counter" and "arrives 07:38", from the rider's location pings.
      ...(order.riderArrivedAt ? { riderArrivedAt: order.riderArrivedAt.toISOString() } : {}),
      ...(order.riderEtaAt ? { riderEtaAt: order.riderEtaAt.toISOString() } : {}),
    };
  }

  async notifyCancelledCustomer(orderId: string, reason: StampedRejectionReason, note: string | null = null): Promise<void> {
    const order = await this.svc.prisma.order.findUnique({ where: { id: orderId }, select: { customerId: true, merchant: { select: { name: true } } } });
    if (!order) return;
    // Order flow v2 G3a (O.g.push.c[8]/[9]): the venue declined → "{v} couldn’t take your order"; no
    // rider → "We couldn’t find a rider". Every other reason keeps its own sentence.
    const venue = order.merchant?.name?.trim() || null;
    const copy =
      reason === "no_rider"
        ? pushCopy(PUSH_C.noRider, {})
        : venue && VENUE_DECLINED.has(reason)
          ? pushCopy(PUSH_C.venueCouldnt, { v: venue })
          : { title: "Your order was cancelled", body: rejectionCopy(reason) };
    await this.svc.notifications.notifyProfiles([order.customerId], {
      ...copy,
      // D-77 S2a: "Rudo sees this note" — the venue's own words follow the push's sentence.
      ...(note ? { body: `${copy.body} “${note}”` } : {}),
      // to+orderType so the tap opens the food tracker, not the parcel /order/:id. Additive.
      data: { orderId, status: "cancelled", to: "customer", orderType: "merchant" },
    });
  }

  /** C5 "merchant accepted — pay now": shared by the initial request (requestPayment) and the N-22
   *  reminder sweep — same `kind` (the client renders both as the same persistent pay-now push),
   *  different copy. */
  async notifyPaymentRequested(orderId: string, customerId: string, title: string, body: string): Promise<void> {
    await this.svc.notifications.notifyProfiles([customerId], {
      title,
      body,
      data: { orderId, status: "awaiting_payment", to: "customer", kind: "food_pay_now", orderType: "merchant" },
    });
  }

  toResponse(order: OrderWithItems): MerchantOrderResponse {
    const items: MerchantOrderItemView[] = order.merchantItems.map((it) => ({
      itemId: it.id,
      dishId: it.dishId,
      name: it.nameSnapshot,
      priceUsd: Number(it.priceUsd),
      quantity: it.quantity,
      note: it.note,
      available: it.available,
      ...(it.rxRequired ? { rxRequired: true } : {}),
      // Order flow v2: the line an accepted swap replaced — only on swap lines.
      ...(it.replacesItemId ? { replacesItemId: it.replacesItemId } : {}),
    }));
    const merchantGoodsTotal = order.merchantGoodsTotal != null ? Number(order.merchantGoodsTotal) : null;
    const deliveryFee = order.deliveryFee != null ? Number(order.deliveryFee) : null;
    const money = foodOrderMoney({ goodsTotal: merchantGoodsTotal, deliveryFee, merchantDeliveryShare: order.merchantDeliveryShare });
    const merchantLocation = order.merchant?.location as Waypoint | null;
    // The owner's sign-in number stands in only when it is a Zimbabwe one: since D-116 an owner can sign
    // in from abroad, and customers and riders in Zimbabwe must not be sent to pay or call a +44 number.
    const ownerPhone = order.merchant?.ownerProfile?.phone ?? null;
    const shopPhone = merchantLocation?.contactPhone ?? (ownerPhone?.startsWith(`+${DEFAULT_COUNTRY_CODE}`) ? ownerPhone : null);
    // Safeguard 5: the shop's number is only for paying it directly (legacy WALLET orders), or when the
    // restaurant agreed to show it to its customers.
    const merchantPaymentPhone = order.merchantPaymentMethod === "wallet" ? shopPhone : null;
    const restaurantPhone = order.merchant?.showPhoneToCustomers ? shopPhone : null;
    // C9 (reviewed list 2026-10-07): the one amount due at the door — the agreed total plus any carried
    // balance — the same figure the handshake (FoodDebtService.confirmCustomerCash), the pushes and the
    // Orders history row use.
    const amountDueUsd = merchantAmountDueUsd(order);
    const response: MerchantOrderResponse = {
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
      // D-71: the customer's total has the venue's delivery share taken off; the rider's fee doesn't.
      total: merchantGoodsTotal != null && deliveryFee != null ? money.customerTotal : null,
      // Both omitted (A-O14) on an order the venue doesn't fund — the customer then pays `deliveryFee`.
      merchantDeliveryShare: order.merchantDeliveryShare != null ? Number(order.merchantDeliveryShare) : null,
      customerDeliveryFee: order.merchantDeliveryShare != null && deliveryFee != null ? money.customerDeliveryFee : null,
      acceptDeadlineAt: order.acceptDeadlineAt?.toISOString() ?? null,
      itemApprovalDeadlineAt: order.itemApprovalDeadlineAt?.toISOString() ?? null,
      prepMinutes: order.prepMinutes,
      prepStartedAt: order.prepStartedAt?.toISOString() ?? null,
      readyAt: order.readyAt?.toISOString() ?? null,
      rejectionReason: order.rejectionReason,
      // Brief 07 (U66, D-97): the venue's "Something else" note, for the customer's D3g ending.
      venueNote: venueNoteOf(order),
      paymentCallLoggedAt: order.paymentCallLoggedAt?.toISOString() ?? null,
      paymentRequestedAt: order.paymentRequestedAt?.toISOString() ?? null,
      merchantPaymentReference: order.merchantPaymentReference,
      merchantPaymentConfirmedAt: order.merchantPaymentConfirmedAt?.toISOString() ?? null,
      // #670: the payment-prompt lifecycle (null/omitted until a prompt is sent). rail/status are a
      // controlled vocabulary the wire contract validates; stored as text on the order row.
      paymentPromptStatus: (order.paymentPromptStatus as MerchantOrderResponse["paymentPromptStatus"]) ?? null,
      paymentPromptRail: (order.paymentPromptRail as MerchantOrderResponse["paymentPromptRail"]) ?? null,
      paymentPromptRef: order.paymentPromptRef,
      paymentPromptSentAt: order.paymentPromptSentAt?.toISOString() ?? null,
      // C3: dispatch view (see MerchantOrderResponse's docstring).
      riderId: order.riderId,
      // #671: the assigned rider's public identity for the food live tracker. Populated only once a
      // rider is joined (order.rider is null pre-dispatch); omitted otherwise via the null-omit pass.
      rider: order.rider
        ? {
            profileId: order.rider.profileId,
            firstName: order.rider.profile.firstName,
            lastName: order.rider.profile.lastName,
            photoUrl: order.rider.photoUrl,
            ratingAvg: order.rider.ratingAvg,
            ratingCount: order.rider.ratingCount,
            tripsCount: order.rider.tripsCount,
            vehicleInfo: order.rider.vehicleInfo,
            plate: order.rider.bikeReg,
            kycVerified: order.rider.kycStatus === "verified",
          }
        : null,
      dispatchAttempt: order.dispatchAttempt,
      dispatchOfferExpiresAt: order.dispatchOfferExpiresAt?.toISOString() ?? null,
      noRiderHoldAt: order.noRiderHoldAt?.toISOString() ?? null,
      // N-16: mirrors deliveryOtpAttempts's resync purpose for the pickup code (D5).
      pickupCodeAttempts: order.pickupCodeAttempts,
      // C4: doorstep handshake (R-04/R-05/N-19).
      cashHandshakeAmount: order.cashHandshakeAmount != null ? Number(order.cashHandshakeAmount) : null,
      customerCashConfirmedAt: order.customerCashConfirmedAt?.toISOString() ?? null,
      riderCashConfirmedAt: order.riderCashConfirmedAt?.toISOString() ?? null,
      cashHandshakeDeadlineAt: order.cashHandshakeDeadlineAt?.toISOString() ?? null,
      cashHandshakeFrozenAt: order.cashHandshakeFrozenAt?.toISOString() ?? null,
      // N-10: the rider's logged pre-no-show call attempts (D5).
      noShowCallTimestamps: order.noShowCallTimestamps.map((t) => t.toISOString()),
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
      // D-48: the Orders screens' times and the cash-back due time.
      // Optional in the contract; a row always has it.
      createdAt: (order.createdAt as Date | undefined)?.toISOString(),
      deliveredAt: order.deliveredAt?.toISOString() ?? null,
      cashDueAt:
        order.debtStatus === "open" && order.deliveredAt
          ? new Date(order.deliveredAt.getTime() + RESTAURANTS_DEBT.cashReturnWindowMs).toISOString()
          : null,
      merchantClosedAt: order.merchantClosedAt?.toISOString() ?? null,
      merchantCloseReason: (order.merchantCloseReason as MerchantOrderResponse["merchantCloseReason"]) ?? null,
      autoAccepted: order.autoAccepted,
      kitchenConfirmedAt: order.kitchenConfirmedAt?.toISOString() ?? null,
      kitchenConfirmedBy: (order.kitchenConfirmedBy as MerchantOrderResponse["kitchenConfirmedBy"]) ?? null,
      itemsEditedAt: order.itemsEditedAt?.toISOString() ?? null,
      // D5 (U10): the rider's "I'm here" at the drop-off — a hint for the customer's door card, never a gate.
      riderAtDropoffAt: order.riderAtDropoffAt?.toISOString() ?? null,
      restaurantPhone,
      ...orderFlowV2Fields(order),
      ...orderFlowV2BFields(order),
    };
    // C9 (U35/U37): `total` is that same amount, so the order screen, the receipt and the handshake can't
    // disagree (it used to rebuild goods + fee + carried and miss an `agreedFare` correction).
    if (response.total != null && amountDueUsd != null) response.total = amountDueUsd;
    response.amountDueUsd = amountDueUsd;
    // A-O14 (LC-A06): the doorstep-handshake/debt-ledger/refund fields above are `null` on the
    // overwhelming majority of polls (wallet orders never touch the handshake/debt fields at all;
    // refund fields only ever populate on a merchant-issued refund) — omit rather than send an
    // explicit `null`, since every consumer already reads these fields via `??`/truthy/`===` and
    // treats a missing key identically to `null` (see contracts.ts's A-O14 comment).
    for (const field of RESPONSE_NULL_OMIT_FIELDS) {
      if (response[field] === null) delete response[field];
    }
    return response;
  }
}
