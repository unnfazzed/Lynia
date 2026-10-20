/**
 * The customer's side of a food order up to the kitchen: placing, item approval, payment, cancel while
 * unpaid, schedule changes. A part of FoodOrderService (R-6): `this.svc` is the service itself.
 */
import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { addMoney, categoryServedNow, isInServiceArea, serviceTownsLabel, deliveryFeeForDistance, foodOrderMoney, merchantDeliveryShareAtPlacement, effectiveMerchantHours, isMerchantOpenNow, type MerchantHours, nextOpenDescription, RESTAURANTS_AUTO_ACCEPT, haversineKm, BUSY_MODE_EXTRA_MIN, type MerchantOrderResponse, type PaymentPromptRail, type PlaceMerchantOrderRequest, RESTAURANTS_TIMING, roundToCents, smallOrderFeeForSubtotal, type Waypoint } from "@lynia/shared";
import { penaltiesSuspended } from "../common/penalties";
import { harareWallClock } from "./harare-clock";
import { CUSTOMER_VISIBLE_RESTAURANT, customerVisibleShop, isDishOutOfStock } from "./merchant-lookup.util";
import { createOnce, replayFirst } from "../common/idempotency";
import { carryBalance, openBalance } from "./customer-balance";
import { cancelAttribution } from "../common/cancel-attribution";
import { ownerAlertText } from "../owner-alerts/owner-alerts.service";
import { ORDER_WITH_ITEMS_INCLUDE, type OrderWithItems, SECTIONS_OFF, lineTotal, noRiderHeld, summarizeMerchantItems } from "./food-order.helpers";
import type { FoodOrderHost } from "./food-order.host";

export class FoodOrderPlacing {
  constructor(private readonly svc: FoodOrderHost) {}
  // ── Customer ─────────────────────────────────────────────────────────────────────────────────────

  /** `POST /restaurants/:merchantId/orders`. Price is always server-computed (D-35). */
  async placeOrder(customerId: string, merchantId: string, body: PlaceMerchantOrderRequest): Promise<MerchantOrderResponse> {
    // FOOD-STANDING-01: account standing, checked first and before any write — the same gate, in the
    // same { reason, message } shape, as Send's OrdersService.create, so the app's ApiError.code
    // pipeline routes it identically. A held customer, or a banned/suspended rider (F-01: not even as a
    // sender), can't place a food order either. A cash ban (R-08) never blocks ordering: it only takes
    // cash off the table for food, so it's checked against the chosen payment method.
    const account = await this.svc.prisma.profile.findUnique({
      where: { id: customerId },
      // The name and phone ride along for the owner's new-order alert, in the same round-trip.
      select: { onHold: true, cashBanned: true, firstName: true, lastName: true, phone: true, rider: { select: { accountStatus: true } } },
    });
    if (account?.onHold) {
      throw new ForbiddenException({ reason: "on_hold", message: "Your account is on hold." });
    }
    const accountStatus = account?.rider?.accountStatus;
    if (accountStatus === "banned" || accountStatus === "suspended") {
      throw new ForbiddenException({
        reason: accountStatus === "banned" ? "account_banned" : "account_suspended",
        message: "Your account is not in good standing.",
      });
    }
    // Penalty suspension (common/penalties.ts): a cash ban on record is ignored, not cleared.
    if (account?.cashBanned && body.paymentMethod === "cash" && !penaltiesSuspended()) {
      // D-48: food is cash on delivery only now, so a cash ban means no food orders — say who to ask.
      throw new ForbiddenException({ reason: "cash_banned", message: "Food orders are cash on delivery, and cash is off for your account. Message LyniaGo on WhatsApp." });
    }

    const key = body.idempotencyKey;
    const existing = await replayFirst(key, () => this.svc.findByIdempotencyKey(customerId, key));
    if (existing) return this.svc.toResponse(existing);

    // D-74 (owner, 2026-10-03): Order flow v2 is cash only (BRIEF §14), and the app has placed only cash
    // since D-48. An install from before then can still offer wallet, so a NEW order paying by wallet is
    // refused — restaurant, shop or pharmacy alike. `MerchantPaymentMethod` keeps "wallet" so the orders
    // those installs already placed still parse and can be finished; checked after the idempotency
    // replay, so a retry of one of them still gets it back.
    if (body.paymentMethod === "wallet") {
      throw new BadRequestException({ reason: "wallet_not_accepted", message: "Orders are cash on delivery now. Choose cash to place your order." });
    }

    // Order flow v2 (ledger D-59): restaurants AND shops/pharmacies take orders here — a live restaurant,
    // or a live shop whose section (SHOPS_ENABLED / PHARMACY_ENABLED) is on. Same rule as the browse lists.
    const merchant = await this.svc.prisma.merchant.findFirst({
      where: { id: merchantId, OR: [CUSTOMER_VISIBLE_RESTAURANT, customerVisibleShop(this.svc.env ?? SECTIONS_OFF)] },
      select: {
        id: true,
        name: true,
        // The venue's number for the owner's new-order alert (the same one customers see).
        ownerProfile: { select: { phone: true } },
        location: true,
        closedUntil: true,
        hours: true,
        autoAccept: true,
        busyMode: true,
        prepBaselineMinutes: true,
        businessType: true,
        shopKind: true,
        freeDelivery: true,
      },
    });
    if (!merchant) {
      // E2E 2026-10-05 P-5: a shop or pharmacy hidden by its section switch answered "Restaurant not
      // found". Name what it is (error path only; an unknown id keeps the restaurant wording).
      const kind = await this.svc.prisma.merchant.findUnique({ where: { id: merchantId }, select: { businessType: true, shopKind: true } }).catch(() => null);
      const what = kind?.businessType === "shop" ? (kind.shopKind === "pharmacy" ? "Pharmacy" : "Shop") : "Restaurant";
      throw new NotFoundException(`${what} not found`);
    }
    const noun = merchant.businessType === "shop" ? (merchant.shopKind === "pharmacy" ? "pharmacy" : "shop") : "restaurant";
    const location = merchant.location as Waypoint | null;
    if (!location) throw new ConflictException(`This ${noun} isn't ready to take orders yet`);
    // The service area (owner 2026-10-02): the app checks the drop-off before Place, but the server is the
    // authority — a stale or older client must not book a delivery outside the towns we serve. There is NO
    // merchant-to-customer distance cap inside the area; the fee stays per km.
    if (!isInServiceArea(body.dropoff.point)) {
      throw new BadRequestException({
        reason: "outside_service_area",
        message: `That delivery address is outside our service area. We deliver across ${serviceTownsLabel()}.`,
      });
    }
    const distanceKm = roundToCents(haversineKm(location.point, body.dropoff.point));
    // BRIEF §12: a scheduled order names one of the venue's offered slots. It may be placed while the venue
    // is closed ("Order for when they open") — the slot itself is inside its hours.
    const slot = body.scheduledFor ? await this.svc.scheduleService().resolveSlot(merchant, body.scheduledFor, distanceKm) : null;
    // D-48: closed by hand from the merchant's Orders header. Auto-accept safeguard 3: the weekly hours
    // are enforced here too, in Harare time — the app's own check is advisory and an auto-accepted order
    // at a closed kitchen would be cooked by nobody. No hours set at all reads as open (same fail-open
    // rule as every client, packages/shared restaurant-hours.ts).
    const nowWall = harareWallClock(new Date());
    const hours = effectiveMerchantHours((merchant.hours as MerchantHours | null) ?? null, merchant.closedUntil, new Date());
    if (!slot && ((merchant.closedUntil && merchant.closedUntil.getTime() > Date.now()) || !isMerchantOpenNow(hours, nowWall))) {
      const next = nextOpenDescription(hours, nowWall);
      throw new ConflictException({
        reason: "restaurant_closed",
        message: next ? `This ${noun} is closed right now. ${next}.` : `This ${noun} is closed right now.`,
      });
    }

    const dishIds = [...new Set(body.items.map((i) => i.dishId))];
    const dishes = await this.svc.prisma.merchantDish.findMany({
      where: { id: { in: dishIds }, merchantId },
      include: { category: { select: { hidden: true, availableFrom: true, availableTo: true } } },
    });
    if (dishes.length !== dishIds.length) throw new NotFoundException("One or more dishes are not on this menu");
    const dishById = new Map(dishes.map((d) => [d.id, d]));
    // MJ-RM12 / U25: a category is sellable only while it isn't hidden and is inside its serving window
    // (Breakfast 07:00–11:00), in Harare time — at the slot for a scheduled order, else now. The app's
    // storefront check is advisory: a saved basket or a search result could still carry such a dish.
    const servedAt = slot ? harareWallClock(slot.scheduledFor) : nowWall;
    for (const item of body.items) {
      const dish = dishById.get(item.dishId)!;
      if (dish.isDraft) throw new ConflictException(`${dish.name} isn't available yet`);
      if (dish.category.hidden) throw new ConflictException(`${dish.name} isn't available right now`);
      if (!categoryServedNow(dish.category.availableFrom, dish.category.availableTo, servedAt)) {
        // True of "now" and of a scheduled slot alike. Review shows a 4xx message verbatim (its toast).
        throw new ConflictException({ reason: "category_window", message: `${dish.name} isn't served at that time` });
      }
      if (isDishOutOfStock(dish)) throw new ConflictException(`${dish.name} is out of stock right now`);
    }
    // BRIEF §13: "Prescription needed" lines need RX_ENABLED, a pharmacy with a pharmacist, and a prescription.
    const rxLines = body.items.filter((i) => dishById.get(i.dishId)!.rxRequired).length;
    const prescription =
      rxLines > 0 || body.prescription
        ? await this.svc.prescriptionService().prepareForPlacement(customerId, { id: merchant.id, shopKind: merchant.shopKind }, rxLines, body.prescription)
        : null;
    // BRIEF D3f: an earlier cancel-after-collection balance rides on this order as its own line.
    const owed = await openBalance(this.svc.prisma, customerId);

    const rawSubtotal = addMoney(...body.items.map((i) => lineTotal(dishById.get(i.dishId)!.priceUsd, i.quantity)));
    const smallOrderFee = smallOrderFeeForSubtotal(rawSubtotal);
    const merchantGoodsTotal = addMoney(rawSubtotal, smallOrderFee);
    const deliveryFee = deliveryFeeForDistance(distanceKm);
    // D-71: a free-delivery venue pays the rider's fee out of its own cash; the customer pays $0 delivery.
    // Snapshotted here so flipping the switch later never reprices this order.
    const merchantDeliveryShare = merchantDeliveryShareAtPlacement({
      freeDelivery: merchant.freeDelivery,
      paymentMethod: body.paymentMethod,
      goodsTotal: merchantGoodsTotal,
      deliveryFee,
    });
    const agreedFare = foodOrderMoney({ goodsTotal: merchantGoodsTotal, deliveryFee, merchantDeliveryShare }).customerTotal;
    const itemDesc = summarizeMerchantItems(body.items.map((i) => ({ name: dishById.get(i.dishId)!.name, quantity: i.quantity })));
    // Auto-accept: a cash order at an auto-accept restaurant skips the accept window and goes straight
    // to cooking at the restaurant's usual prep time. No rider is sent until the kitchen is confirmed
    // (sweepAutoAccepted). Wallet is refused above (D-74); the wallet orders placed before that keep
    // their accept → payment path.
    // Order flow v2 (README per-service table): shops and pharmacies are never auto-accept — 3 minutes to
    // accept, like a manual restaurant. A scheduled order waits (awaiting_accept, no deadline) until the
    // schedule sweep rings it at `ringsAt` (OrderScheduleService), which applies this same rule then.
    const autoAccept = merchant.businessType !== "shop" && merchant.autoAccept && body.paymentMethod === "cash" && !slot;
    const now = new Date();
    const phase = slot
      ? { merchantPhase: "awaiting_accept" as const, acceptDeadlineAt: null }
      : autoAccept
      ? {
          merchantPhase: "preparing" as const,
          acceptDeadlineAt: null,
          prepMinutes: (merchant.prepBaselineMinutes ?? RESTAURANTS_AUTO_ACCEPT.defaultPrepMinutes) + (merchant.busyMode ? BUSY_MODE_EXTRA_MIN : 0),
          prepStartedAt: now,
          autoAccepted: true,
        }
      : { merchantPhase: "awaiting_accept" as const, acceptDeadlineAt: new Date(now.getTime() + RESTAURANTS_TIMING.acceptWindowMs) };

    {
      const create = (db: Pick<Prisma.TransactionClient, "order">) => db.order.create({
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
          ...phase,
          merchantPaymentMethod: body.paymentMethod,
          // R-03 snapshot, fixed at placement (C4). D-48: every cash food order is collect-and-return —
          // the rider collects at the door and brings the cash back ("Cash back to you") — whatever the
          // older per-shop rule says. Null only on the wallet orders placed before D-74: it never applied.
          merchantCashRule: body.paymentMethod === "cash" ? "collect_and_return" : null,
          merchantGoodsTotal,
          deliveryFee,
          merchantDeliveryShare,
          idempotencyKey: body.idempotencyKey ?? null,
          // Order flow v2 (BRIEF §7): null = never chosen = ask.
          outOfStockPref: body.outOfStockPref ?? null,
          events: { create: { status: "requested" } },
          merchantItems: {
            create: body.items.map((i) => {
              const dish = dishById.get(i.dishId)!;
              return {
                dishId: dish.id,
                nameSnapshot: dish.name,
                priceUsd: dish.priceUsd,
                quantity: i.quantity,
                note: i.note ?? null,
                // Auto-accepted lines are kept as ordered until the restaurant changes them by phone.
                ...(autoAccept ? { available: true } : {}),
                ...(dish.rxRequired ? { rxRequired: true } : {}),
              };
            }),
          },
          ...(slot ? { schedule: { create: { merchantId, scheduledFor: slot.scheduledFor, ringsAt: slot.ringsAt } } } : {}),
          ...(prescription ? { prescription: { create: prescription } } : {}),
        },
        include: ORDER_WITH_ITEMS_INCLUDE,
      });
      // R-3: the (customer_id, idempotency_key) index is shared with parcel orders (migration 0021). A concurrent
      // duplicate replays; a parcel order's key reused here is a 409 — it used to surface as a 500, because the
      // merchant-only re-find found nothing (common/idempotency.ts).
      const once = await createOnce<OrderWithItems>({
        key,
        find: () => this.svc.findByIdempotencyKey(customerId, key),
        heldElsewhere: async () => (await this.svc.prisma.order.count({ where: { customerId, idempotencyKey: key } })) > 0,
        create: () =>
          owed.entries.length === 0
            ? create(this.svc.prisma)
            : this.svc.prisma.$transaction(async (tx) => {
                const order = await create(tx);
                await carryBalance(tx, owed.entries, order.id);
                return { ...order, carriedBalance: [{ amount: new Prisma.Decimal(owed.amount) }] };
              }),
      });
      if (!once.created) return this.svc.toResponse(once.row);
      const created = once.row;
      // A scheduled order stays off the merchant's live queue until it rings — nothing to push yet.
      if (!slot) this.svc.notifyQueue(merchantId, created.id);
      this.svc.ownerAlerts?.notify(
        ownerAlertText.merchantOrder({
          orderId: created.id,
          merchantName: merchant.name,
          merchantPhone: merchant.ownerProfile?.phone ?? null,
          businessType: merchant.businessType,
          shopKind: merchant.shopKind,
          total: agreedFare,
          items: itemDesc,
          paymentMethod: body.paymentMethod,
          merchantPhase: phase.merchantPhase,
          scheduled: !!slot,
          sender: { firstName: account?.firstName ?? "", lastName: account?.lastName ?? "", phone: account?.phone ?? null },
        }),
      );
      return this.svc.toResponse(created);
    }
  }

  async findByIdempotencyKey(customerId: string, idempotencyKey: string | undefined): Promise<OrderWithItems | null> {
    return this.svc.prisma.order.findFirst({
      where: { customerId, orderType: "merchant", idempotencyKey },
      include: ORDER_WITH_ITEMS_INCLUDE,
    });
  }

  /** D-23: the customer's response to a shortened (item-level accept) order. */
  async approveItems(orderId: string, customerId: string, approve: boolean): Promise<MerchantOrderResponse> {
    const order = await this.svc.findOwnAsCustomer(orderId, customerId);
    if (order.merchantPhase !== "awaiting_item_approval") {
      throw new ConflictException("This order isn't waiting on an item approval");
    }
    if (order.itemApprovalDeadlineAt && order.itemApprovalDeadlineAt.getTime() < Date.now()) {
      throw new ConflictException("The approval window has closed");
    }
    // Order flow v2 (D-59): an installed app answering a substitution round it can only see as a
    // shortened order — approve keeps it with every swap declined (OrderSubstitutionService).
    if (approve && (await this.svc.substitutions?.handleLegacyApproval(orderId, customerId, true))) {
      return this.svc.toResponse(await this.svc.mustFindWithItems(orderId));
    }

    if (!approve) {
      const claimed = await this.svc.prisma.order.updateMany({
        where: { id: orderId, status: "requested", merchantPhase: "awaiting_item_approval" },
        data: {
          status: "cancelled",
          cancelledAt: new Date(),
          cancelledBy: customerId,
          merchantPhase: null,
          ...cancelAttribution({ by: "customer", status: "requested", merchantPhase: "awaiting_item_approval", reasonCode: "items_declined" }),
        },
      });
      if (claimed.count === 0) throw new ConflictException("Order changed, retry");
      await this.svc.prisma.orderEvent.create({ data: { orderId, status: "cancelled" } });
      await this.svc.substitutions?.closeRoundsForCancelledOrder(orderId);
      this.svc.notifyQueue(order.merchantId, orderId);
      return this.svc.toResponse(await this.svc.mustFindWithItems(orderId));
    }

    const nextPhase = order.merchantPaymentMethod === "cash" ? "preparing" : "awaiting_payment";
    const claimed = await this.svc.prisma.order.updateMany({
      where: { id: orderId, status: "requested", merchantPhase: "awaiting_item_approval" },
      data:
        nextPhase === "preparing"
          ? { merchantPhase: "preparing", prepStartedAt: new Date(), itemApprovalDeadlineAt: null }
          : { merchantPhase: "awaiting_payment", itemApprovalDeadlineAt: null },
    });
    if (claimed.count === 0) throw new ConflictException("Order changed, retry");
    this.svc.notifyQueue(order.merchantId, orderId);
    return this.svc.toResponse(await this.svc.mustFindWithItems(orderId));
  }

  /** R-17: free, any time before paying — once preparing/ready the kitchen has committed. Also free in the
   *  no-rider hold (U11): nobody is coming for the food, so the customer is never stuck waiting on it. */
  async cancelUnpaid(orderId: string, customerId: string): Promise<MerchantOrderResponse> {
    const order = await this.svc.findOwnAsCustomer(orderId, customerId);
    const cancellable = new Set(["awaiting_accept", "awaiting_item_approval", "awaiting_payment"]);
    // Auto-accept: until the kitchen is confirmed, "cooking" hasn't really started — the customer may
    // still cancel free, exactly as they could while waiting for a manual accept.
    const unconfirmedAuto = order.autoAccepted && !order.kitchenConfirmedAt && order.merchantPhase === "preparing";
    // BRIEF §13 "Cancel the rest — free": after the pharmacist declined the prescription, the customer may
    // drop what's left while it's still being packed.
    const rxDeclinedRest = order.prescription?.status === "declined" && order.merchantPhase === "preparing";
    // Order flow v2 (BRIEF §8): while a substitution round is open, "Cancel the whole order — free" is
    // always there, mid-prep included.
    const openRound = order.merchantPhase === "preparing" && (await this.svc.substitutions?.hasOpenRound(orderId)) === true;
    // U11 (order flow v2 T11a/T11b "Cancel order · free"): dispatch gave up (the D-34 no-rider hold) and
    // nobody is searching until the venue decides. The customer may leave free rather than wait on it.
    const noRiderHold = noRiderHeld(order);
    if (!unconfirmedAuto && !openRound && !rxDeclinedRest && !noRiderHold && (!order.merchantPhase || !cancellable.has(order.merchantPhase))) {
      throw new ConflictException("This order can't be cancelled anymore — the kitchen has started");
    }
    const claimed = await this.svc.prisma.order.updateMany({
      where: {
        id: orderId,
        status: "requested",
        merchantPhase: order.merchantPhase,
        ...(unconfirmedAuto && !openRound && !rxDeclinedRest ? { kitchenConfirmedAt: null } : {}),
        // Still held, still riderless: a "Keep searching" or a rider racing the cancel wins.
        ...(noRiderHold ? { noRiderHoldAt: { not: null }, riderId: null } : {}),
      },
      data: {
        status: "cancelled",
        cancelledAt: new Date(),
        cancelledBy: customerId,
        merchantPhase: null,
        ...cancelAttribution({ by: "customer", status: "requested", merchantPhase: order.merchantPhase, reasonCode: noRiderHold ? "no_rider" : null }),
      },
    });
    if (claimed.count === 0) throw new ConflictException("Order changed, retry");
    await this.svc.prisma.orderEvent.create({ data: { orderId, status: "cancelled" } });
    await this.svc.substitutions?.closeRoundsForCancelledOrder(orderId);
    this.svc.notifyQueue(order.merchantId, orderId);
    return this.svc.toResponse(await this.svc.mustFindWithItems(orderId));
  }

  /** D-24 "I paid another way" manual rail — the customer's own submitted reference. */
  async submitPaymentReference(orderId: string, customerId: string, reference: string): Promise<MerchantOrderResponse> {
    const order = await this.svc.findOwnAsCustomer(orderId, customerId);
    if (order.merchantPhase !== "awaiting_payment") throw new ConflictException("This order isn't awaiting payment");
    await this.svc.prisma.order.update({ where: { id: orderId }, data: { merchantPaymentReference: reference } });
    this.svc.notifyQueue(order.merchantId, orderId);
    return this.svc.toResponse(await this.svc.mustFindWithItems(orderId));
  }

  /** #670: push a mobile-money prompt to the customer's phone for this order (RC.pay_now → pay_wait).
   *  Idempotent — a re-send while a prompt is already pending or confirmed returns the current state
   *  rather than opening a second live charge. Coexists with the manual-reference path; cash orders
   *  settle at the door and never take a prompt. Drives the PaymentRail seam — the default stub returns
   *  `pending`, so this never marks an order paid on its own. */
  async sendPaymentPrompt(orderId: string, customerId: string, rail: PaymentPromptRail): Promise<MerchantOrderResponse> {
    const order = await this.svc.findOwnAsCustomer(orderId, customerId);
    if (order.merchantPhase !== "awaiting_payment") throw new ConflictException("This order isn't awaiting payment");
    if (order.merchantPaymentMethod === "cash") throw new ConflictException("Cash orders are paid at the door, not by prompt");
    // Idempotent: an in-flight (pending) or already-settled (confirmed) prompt is never re-pushed.
    if (order.paymentPromptStatus === "pending" || order.paymentPromptStatus === "confirmed") {
      return this.svc.toResponse(order);
    }
    const profile = await this.svc.prisma.profile.findUnique({ where: { id: customerId }, select: { phone: true } });
    const amount = addMoney(Number(order.merchantGoodsTotal ?? 0), Number(order.deliveryFee ?? 0));
    const result = await this.svc.paymentRail.initiate({ topUpId: orderId, rail, amount, phone: profile?.phone ?? "" });
    await this.svc.prisma.order.update({
      where: { id: orderId },
      data: {
        paymentPromptStatus: "pending",
        paymentPromptRail: rail,
        paymentPromptRef: result.providerRef ?? null,
        paymentPromptSentAt: new Date(),
        paymentPromptResolvedAt: null,
      },
    });
    this.svc.notifyQueue(order.merchantId, orderId);
    return this.svc.toResponse(await this.svc.mustFindWithItems(orderId));
  }

  /** #670: poll the rail for a pending prompt and settle it (RC.pay_wait → pay_confirmed). On a
   *  `confirmed` rail result the prompt's ref is written into merchantPaymentReference too, so the
   *  merchant's existing own-statement confirm (confirmPayment) proceeds unchanged — a confirmed
   *  prompt is just a reference the customer didn't have to type by hand. A `failed` result marks it
   *  declined; `pending` leaves it untouched. No-op (returns current) when there is no pending prompt. */
  async checkPaymentPrompt(orderId: string, customerId: string): Promise<MerchantOrderResponse> {
    const order = await this.svc.findOwnAsCustomer(orderId, customerId);
    if (order.paymentPromptStatus !== "pending" || !order.paymentPromptRef) return this.svc.toResponse(order);
    const result = await this.svc.paymentRail.confirm(order.paymentPromptRef);
    if (result.status === "confirmed") {
      await this.svc.prisma.order.update({
        where: { id: orderId },
        data: {
          paymentPromptStatus: "confirmed",
          paymentPromptResolvedAt: new Date(),
          // Never overwrite a reference the customer already typed; otherwise adopt the rail's ref.
          merchantPaymentReference: order.merchantPaymentReference ?? order.paymentPromptRef,
        },
      });
      this.svc.notifyQueue(order.merchantId, orderId);
    } else if (result.status === "failed") {
      await this.svc.prisma.order.update({
        where: { id: orderId },
        data: { paymentPromptStatus: "declined", paymentPromptResolvedAt: new Date() },
      });
    }
    return this.svc.toResponse(await this.svc.mustFindWithItems(orderId));
  }

  /** BRIEF §12 "Change time" (T13a): move a scheduled order to another offered slot, before it rings. */
  async changeSchedule(orderId: string, customerId: string, scheduledFor: string): Promise<MerchantOrderResponse> {
    const order = await this.svc.findOwnAsCustomer(orderId, customerId);
    if (!order.schedule) throw new ConflictException({ reason: "not_scheduled", message: "This order isn't scheduled." });
    if (order.schedule.rungAt || order.status !== "requested" || order.merchantPhase !== "awaiting_accept") {
      throw new ConflictException({ reason: "scheduled_started", message: "The order has started — its time can't change now." });
    }
    const venue = await this.svc.prisma.merchant.findUnique({
      where: { id: order.merchantId! },
      select: { id: true, hours: true, closedUntil: true, prepBaselineMinutes: true, location: true },
    });
    if (!venue) throw new NotFoundException("Order not found");
    const slot = await this.svc.scheduleService().resolveSlot(venue, scheduledFor, order.distanceKm, orderId);
    const moved = await this.svc.prisma.orderSchedule.updateMany({
      where: { orderId, rungAt: null },
      data: { scheduledFor: slot.scheduledFor, ringsAt: slot.ringsAt },
    });
    if (moved.count === 0) throw new ConflictException({ reason: "scheduled_started", message: "The order has started — its time can't change now." });
    return this.svc.toResponse(await this.svc.mustFindWithItems(orderId));
  }

  /** M7a: the merchant's Scheduled list — orders waiting for their ring time, soonest first. */
  async listScheduled(profileId: string): Promise<MerchantOrderResponse[]> {
    const merchantId = await this.svc.ownMerchantId(profileId);
    const orders = await this.svc.prisma.order.findMany({
      where: { merchantId, orderType: "merchant", status: "requested", schedule: { is: { rungAt: null } } },
      orderBy: { schedule: { scheduledFor: "asc" } },
      include: ORDER_WITH_ITEMS_INCLUDE,
      take: 200,
    });
    return orders.map((o) => this.svc.forMerchant(o));
  }
}
