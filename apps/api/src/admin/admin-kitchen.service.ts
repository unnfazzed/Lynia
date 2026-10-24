import { ConflictException, Injectable, NotFoundException, Optional } from "@nestjs/common";
import { foodOrderMoney, RESTAURANTS_AUTO_ACCEPT, type EditMerchantOrderItemsRequest, type Waypoint } from "@lynia/shared";
import { confirmKitchen, editOrderItems } from "../merchant/food-order-ops";
import { NotificationsService } from "../notifications/notifications.service";
import { PrismaService } from "../prisma/prisma.service";
import { TrackingGateway } from "../tracking/tracking.gateway";
import { auditData } from "./admin.shared";

/** Kitchen phases/statuses that still count as "waiting on the kitchen" for the ops call list. */
const LIVE_STATUSES = ["requested", "open_for_offers", "assigned", "confirmed", "en_route_pickup"] as const;
/** The call list's read cap — newest rows first, so the cap only ever drops the stalest (D1: 24 h backlog). */
const LIST_CAP = 300;

/**
 * Auto-accept (docs/plans/2026-09-30-restaurant-auto-accept.md), the ops side. Restaurants still taking
 * orders by phone have every order auto-accepted; LyniaGo ops phone the restaurant, then record the
 * outcome here: Confirmed (a rider may be sent), No answer (logged, call again), or Can't make it (the
 * existing admin cancel). Ops can also change the items the restaurant and customer agreed by phone,
 * and switch a restaurant's order settings on its behalf. Every mutation writes an audit row.
 */
@Injectable()
export class AdminKitchenService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gateway: TrackingGateway,
    @Optional() private readonly notifications?: NotificationsService,
  ) {}

  /** How many orders the "Orders to confirm" list holds (the console's alert strip). */
  async countToConfirm(): Promise<number> {
    return this.prisma.order.count({
      where: { orderType: "merchant", autoAccepted: true, kitchenConfirmedAt: null, status: { in: [...LIVE_STATUSES] } },
    });
  }

  /**
   * "Orders to confirm": auto-accepted orders the kitchen hasn't confirmed, urgent first.
   *
   * Owner decision D1 (2026-10-07): an unconfirmed order now lives 24 h, not 60 min, so the list can hold
   * a day's backlog. The read takes the NEWEST rows (a larger cap, LIST_CAP) so a fresh order never falls
   * off behind stale ones, and within the urgent group the newest comes first — the call most likely to
   * still save the order. Not-yet-urgent orders keep oldest-first (the next to escalate).
   */
  async listToConfirm() {
    const rows = await this.prisma.order.findMany({
      where: { orderType: "merchant", autoAccepted: true, kitchenConfirmedAt: null, status: { in: [...LIVE_STATUSES] } },
      orderBy: { createdAt: "desc" },
      take: LIST_CAP,
      select: {
        id: true,
        createdAt: true,
        dropoff: true,
        prepMinutes: true,
        merchantGoodsTotal: true,
        deliveryFee: true,
        merchantDeliveryShare: true,
        kitchenEscalatedAt: true,
        opsNoAnswerAt: true,
        itemsEditedAt: true,
        merchant: { select: { id: true, name: true, location: true, ownerProfile: { select: { phone: true } } } },
        customer: { select: { firstName: true, lastName: true } },
        merchantItems: { select: { id: true, nameSnapshot: true, priceUsd: true, quantity: true, note: true, available: true } },
      },
    });
    const now = Date.now();
    const out = rows.map((o) => {
      const dropoff = o.dropoff as Waypoint | null;
      const pin = o.merchant?.location as Waypoint | null;
      const goods = Number(o.merchantGoodsTotal ?? 0);
      return {
        orderId: o.id,
        placedAt: o.createdAt.toISOString(),
        waitingMinutes: Math.floor((now - o.createdAt.getTime()) / 60_000),
        urgent: o.kitchenEscalatedAt != null,
        restaurant: { id: o.merchant?.id ?? null, name: o.merchant?.name ?? "—", phone: pin?.contactPhone ?? o.merchant?.ownerProfile?.phone ?? null },
        customer: { name: [o.customer.firstName, o.customer.lastName].filter(Boolean).join(" ") || "Customer", phone: dropoff?.contactPhone ?? null },
        dropoffLandmark: dropoff?.landmark ?? null,
        items: o.merchantItems.map((it) => ({
          itemId: it.id,
          name: it.nameSnapshot,
          priceUsd: Number(it.priceUsd),
          quantity: it.quantity,
          note: it.note,
          removed: it.available === false,
        })),
        goodsTotal: goods,
        deliveryFee: Number(o.deliveryFee ?? 0),
        // D-71: what the customer pays — a free-delivery venue's share is taken off.
        total: foodOrderMoney({ goodsTotal: goods, deliveryFee: o.deliveryFee, merchantDeliveryShare: o.merchantDeliveryShare }).customerTotal,
        prepMinutes: o.prepMinutes,
        noAnswerCalls: o.opsNoAnswerAt.map((t) => t.toISOString()),
        itemsEdited: o.itemsEditedAt != null,
      };
    });
    // Urgent first, newest first among them (D1: a 24 h backlog); not yet urgent, oldest first.
    out.sort((a, b) => Number(b.urgent) - Number(a.urgent) || (a.urgent ? b.placedAt.localeCompare(a.placedAt) : a.placedAt.localeCompare(b.placedAt)));
    // At the cap the oldest orders are the ones left out (the read is newest first): the page says so.
    return { orders: out, escalateAfterMinutes: RESTAURANTS_AUTO_ACCEPT.escalateAfterMs / 60_000, capped: rows.length >= LIST_CAP, cap: LIST_CAP };
  }

  /** Ops phoned the restaurant and it's making the order: a rider may now be sent. */
  async confirm(actor: string, orderId: string, note?: string | null) {
    let auditId: string | null = null;
    // The audit row commits with the confirm (A-01): never a confirm without its row, or a row without one.
    const ok = await confirmKitchen(this.prisma, this.gateway, orderId, "ops", undefined, async (tx) => {
      auditId = (await tx.auditLog.create({ data: { ...auditData(actor, "order.kitchen_confirm", orderId, null, note ?? null), targetType: "order" }, select: { id: true } })).id;
    });
    if (!ok) throw new ConflictException({ reason: "nothing_to_confirm", message: "This order is already confirmed or no longer live." });
    return { orderId, confirmed: true, auditId };
  }

  /** Ops called and nobody answered: logged so the list shows the attempts; call again. */
  async logNoAnswer(actor: string, orderId: string) {
    return this.prisma.$transaction(async (tx) => {
      const claimed = await tx.order.updateMany({
        where: { id: orderId, orderType: "merchant", autoAccepted: true, kitchenConfirmedAt: null, status: { in: [...LIVE_STATUSES] } },
        data: { opsNoAnswerAt: { push: new Date() } },
      });
      if (claimed.count === 0) throw new ConflictException({ reason: "nothing_to_confirm", message: "This order is already confirmed or no longer live." });
      const audit = await tx.auditLog.create({ data: { ...auditData(actor, "order.kitchen_no_answer", orderId), targetType: "order" }, select: { id: true } });
      return { orderId, auditId: audit.id };
    });
  }

  /** Ops changes the items the restaurant and customer agreed by phone (same rules as the restaurant's own edit). */
  async editItems(actor: string, orderId: string, body: EditMerchantOrderItemsRequest) {
    if (!this.notifications) throw new ConflictException("Notifications unavailable");
    let auditId: string | null = null;
    // The audit row commits in the edit's own transaction (A-01).
    await editOrderItems(this.prisma, this.notifications, this.gateway, orderId, body, undefined, async (tx) => {
      auditId = (
        await tx.auditLog.create({ data: { ...auditData(actor, "order.items_edit", orderId, null, JSON.stringify(body.lines)), targetType: "order" }, select: { id: true } })
      ).id;
    });
    return { orderId, auditId };
  }

  /** Ops sets how a restaurant takes orders, on its behalf (it may never open the app). */
  async setOrderSettings(actor: string, merchantId: string, input: { autoAccept?: boolean; showPhoneToCustomers?: boolean; freeDelivery?: boolean; note?: string | null }) {
    return this.prisma.$transaction(async (tx) => {
      const merchant = await tx.merchant.findUnique({
        where: { id: merchantId },
        select: { id: true, businessType: true, autoAccept: true, showPhoneToCustomers: true, freeDelivery: true },
      });
      if (!merchant) throw new NotFoundException("Merchant not found");
      // Shops never take orders automatically (placement and the scheduled ring both skip a shop), so the
      // switch isn't stored for one: it would only read as on.
      if (input.autoAccept === true && merchant.businessType === "shop") {
        throw new ConflictException({ reason: "shop_no_auto_accept", message: "Shops don't take orders automatically." });
      }
      const before = { autoAccept: merchant.autoAccept, showPhoneToCustomers: merchant.showPhoneToCustomers, freeDelivery: merchant.freeDelivery };
      const updated = await tx.merchant.update({
        where: { id: merchantId },
        data: {
          ...(input.autoAccept !== undefined ? { autoAccept: input.autoAccept } : {}),
          ...(input.showPhoneToCustomers !== undefined ? { showPhoneToCustomers: input.showPhoneToCustomers } : {}),
          ...(input.freeDelivery !== undefined ? { freeDelivery: input.freeDelivery } : {}),
        },
        select: { autoAccept: true, showPhoneToCustomers: true, freeDelivery: true },
      });
      const audit = await tx.auditLog.create({
        data: {
          ...auditData(actor, "merchant.order_settings", merchantId, null, [JSON.stringify(updated), input.note].filter(Boolean).join(" · ")),
          targetType: "merchant",
          before,
          after: updated,
        },
        select: { id: true },
      });
      return { id: merchantId, ...updated, auditId: audit.id };
    });
  }
}
