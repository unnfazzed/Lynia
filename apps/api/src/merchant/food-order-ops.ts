import { ConflictException, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { addMoney, fromCents, smallOrderFeeForSubtotal, toCents, type EditMerchantOrderItemsRequest } from "@lynia/shared";
import type { NotificationsService } from "../notifications/notifications.service";
import type { PrismaService } from "../prisma/prisma.service";
import type { TrackingGateway } from "../tracking/tracking.gateway";
import { notifyFoodQueueChanged } from "./merchant-lookup.util";

/**
 * Auto-accept (docs/plans/2026-09-30-restaurant-auto-accept.md): the two things both the restaurant
 * (merchant app) and LyniaGo ops (admin console, after phoning the restaurant) can do to a live food
 * order. One implementation, two callers, so the rules can't drift between them.
 */

/** Statuses an order's items may still change in: the food hasn't left the counter. */
const EDITABLE_STATUSES = ["requested", "open_for_offers", "assigned", "confirmed", "en_route_pickup"] as const;
/** Kitchen phases an edit is allowed in once `status` is still `requested` (before accept/payment the
 *  existing accept flow owns the items). A null phase means a rider is already on it. */
const EDITABLE_PHASES: ReadonlySet<string> = new Set(["preparing", "ready_for_pickup"]);

/** The kitchen is making it: an auto-accepted order may now be sent to a rider. Idempotent. Returns
 *  false when there is nothing to confirm (not auto-accepted, already confirmed, or no longer live). */
export async function confirmKitchen(
  prisma: PrismaService,
  gateway: TrackingGateway,
  orderId: string,
  by: "merchant" | "ops",
  merchantId?: string,
): Promise<boolean> {
  const claimed = await prisma.order.updateMany({
    where: {
      id: orderId,
      orderType: "merchant",
      autoAccepted: true,
      kitchenConfirmedAt: null,
      status: { in: [...EDITABLE_STATUSES] },
      ...(merchantId ? { merchantId } : {}),
    },
    data: { kitchenConfirmedAt: new Date(), kitchenConfirmedBy: by },
  });
  if (claimed.count === 0) return false;
  const order = await prisma.order.findUnique({ where: { id: orderId }, select: { merchantId: true } });
  notifyFoodQueueChanged(gateway, order?.merchantId, orderId);
  return true;
}

/**
 * Change an order's items after the restaurant and customer agreed it by phone: a new quantity per
 * line (0 takes it off). The goods total and the customer's total are recomputed server-side (the
 * delivery fee is unchanged); the customer gets a push with the new total. No approval step: the
 * change was already agreed on the call. Only before pickup, and at least one line must stay.
 */
export async function editOrderItems(
  prisma: PrismaService,
  notifications: NotificationsService,
  gateway: TrackingGateway,
  orderId: string,
  body: EditMerchantOrderItemsRequest,
  merchantId?: string,
): Promise<void> {
  const order = await prisma.order.findFirst({
    where: { id: orderId, orderType: "merchant", ...(merchantId ? { merchantId } : {}) },
    include: { merchantItems: true, merchant: { select: { name: true } } },
  });
  if (!order) throw new NotFoundException("Order not found");
  if (!(EDITABLE_STATUSES as readonly string[]).includes(order.status)) {
    throw new ConflictException({ reason: "not_editable", message: "The rider has the food now, so the items can't change." });
  }
  if (order.status === "requested" && (!order.merchantPhase || !EDITABLE_PHASES.has(order.merchantPhase))) {
    throw new ConflictException({ reason: "not_editable", message: "Accept the order first, then change the items." });
  }

  const byId = new Map(order.merchantItems.map((it) => [it.id, it]));
  const quantities = new Map<string, number>();
  for (const line of body.lines) {
    if (!byId.has(line.itemId)) throw new NotFoundException("One or more lines are not on this order");
    quantities.set(line.itemId, line.quantity);
  }
  // Lines the edit doesn't mention keep their current quantity (0 for a line already taken off).
  const next = order.merchantItems.map((it) => {
    const current = it.available === false ? 0 : it.quantity;
    const quantity = quantities.get(it.id) ?? current;
    return { it, quantity };
  });
  const kept = next.filter((n) => n.quantity > 0);
  if (kept.length === 0) {
    throw new ConflictException({ reason: "no_items_left", message: "At least one item must stay — cancel the order instead." });
  }

  const rawSubtotal = addMoney(...kept.map((n) => fromCents(toCents(Number(n.it.priceUsd)) * n.quantity)));
  const merchantGoodsTotal = addMoney(rawSubtotal, smallOrderFeeForSubtotal(rawSubtotal));
  const agreedFare = addMoney(merchantGoodsTotal, Number(order.deliveryFee ?? 0));
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    const claimed = await tx.order.updateMany({
      where: { id: orderId, status: order.status, merchantPhase: order.merchantPhase },
      data: {
        merchantGoodsTotal,
        agreedFare,
        itemsEditedAt: now,
        ...(body.prepMinutes !== undefined && order.merchantPhase === "preparing" ? { prepMinutes: body.prepMinutes } : {}),
      },
    });
    if (claimed.count === 0) throw new ConflictException("Order changed, retry");
    for (const n of next) {
      const data: Prisma.MerchantOrderItemUpdateInput =
        n.quantity > 0 ? { quantity: n.quantity, available: true } : { available: false };
      await tx.merchantOrderItem.update({ where: { id: n.it.id }, data });
    }
  });

  notifyFoodQueueChanged(gateway, order.merchantId, orderId);
  await notifications.notifyProfiles([order.customerId], {
    title: `${order.merchant?.name ?? "The restaurant"} updated your order`,
    body: `New total $${addMoney(merchantGoodsTotal, Number(order.deliveryFee ?? 0)).toFixed(2)}, cash at the door.`,
    data: { orderId, status: order.status, to: "customer", orderType: "merchant", kind: "food_items_edited" },
  });
}
