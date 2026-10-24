import { ConflictException, NotFoundException } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  addMoney,
  foodOrderMoney,
  fromCents,
  merchantAmountDueUsd,
  recomputeMerchantDeliveryShare,
  smallOrderFeeForSubtotal,
  toCents,
  type EditMerchantOrderItemsRequest,
} from "@lynia/shared";
import type { NotificationsService } from "../notifications/notifications.service";
import type { PrismaService } from "../prisma/prisma.service";
import type { TrackingGateway } from "../tracking/tracking.gateway";
import { notifyFoodQueueChanged } from "./merchant-lookup.util";
import { domainEvents } from "../common/domain-events";

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

/** A write that must commit with the change it records (an ops audit row), run inside its transaction. */
export type InTx = (tx: Prisma.TransactionClient) => Promise<unknown>;

/** The kitchen is making it: an auto-accepted order may now be sent to a rider. Idempotent. Returns
 *  false when there is nothing to confirm (not auto-accepted, already confirmed, or no longer live).
 *  `alsoInTx` (ops' audit row) commits in the same transaction as the confirm, and only when it claims. */
export async function confirmKitchen(
  prisma: PrismaService,
  gateway: TrackingGateway,
  orderId: string,
  by: "merchant" | "ops",
  merchantId?: string,
  alsoInTx?: InTx,
): Promise<boolean> {
  const claim = (db: Pick<Prisma.TransactionClient, "order">) =>
    db.order.updateMany({
      where: {
        id: orderId,
        orderType: "merchant",
        autoAccepted: true,
        kitchenConfirmedAt: null,
        status: { in: [...EDITABLE_STATUSES] },
        ...(merchantId ? { merchantId } : {}),
      },
      // Admin console v2 §3: an auto-accepted order's "accept" is the kitchen's confirm. A "Food is ready"
      // that confirmed it first (markReady) already stamped merchantAcceptedAt, and kitchenConfirmedAt guards this.
      data: { kitchenConfirmedAt: new Date(), kitchenConfirmedBy: by, merchantAcceptedAt: new Date() },
    });
  const count = alsoInTx
    ? await prisma.$transaction(async (tx) => {
        const c = await claim(tx);
        if (c.count > 0) await alsoInTx(tx);
        return c.count;
      })
    : (await claim(prisma)).count;
  if (count === 0) return false;
  const order = await prisma.order.findUnique({ where: { id: orderId }, select: { merchantId: true } });
  // Best-effort (no transaction here): the confirm above is committed.
  await domainEvents.merchantPhase(prisma, {
    orderId,
    merchantId: order?.merchantId ?? null,
    phase: "kitchen_confirmed",
    actorRole: by === "ops" ? "admin" : "merchant",
    data: { by },
  });
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
  alsoInTx?: InTx,
): Promise<void> {
  const order = await prisma.order.findFirst({
    where: { id: orderId, orderType: "merchant", ...(merchantId ? { merchantId } : {}) },
    include: {
      merchantItems: true,
      merchant: { select: { name: true } },
      // Order flow v2 (BRIEF §8): an open substitution round blocks a second change.
      substitutionRounds: { where: { status: "open" }, select: { id: true } },
      // C9 (U13): an earlier owed balance this order collects — part of the "New total" cash at the door.
      carriedBalance: { select: { amount: true } },
    },
  });
  if (!order) throw new NotFoundException("Order not found");
  if (!(EDITABLE_STATUSES as readonly string[]).includes(order.status)) {
    throw new ConflictException({ reason: "not_editable", message: "The biker has the food now, so the items can't change." });
  }
  if (order.status === "requested" && (!order.merchantPhase || !EDITABLE_PHASES.has(order.merchantPhase))) {
    throw new ConflictException({ reason: "not_editable", message: "Accept the order first, then change the items." });
  }
  // Order flow v2 (BRIEF §8): one change at a time — not while the customer is answering a substitution.
  if ((order.substitutionRounds?.length ?? 0) > 0) {
    throw new ConflictException({ reason: "substitution_open", message: "The customer is still answering your last changes." });
  }

  // The editor sent the quantities it was showing: refuse when the order has changed since (another edit, a
  // substitution), so a stale screen can't silently overwrite it.
  if (body.expected) {
    const shown = new Map(body.expected.map((l) => [l.itemId, l.quantity]));
    const stale =
      shown.size !== order.merchantItems.length || order.merchantItems.some((it) => shown.get(it.id) !== (it.available === false ? 0 : it.quantity));
    if (stale) throw new ConflictException({ reason: "items_changed", message: "The order changed since you opened it. Refresh and try again." });
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
  const deliveryFee = Number(order.deliveryFee ?? 0);
  // D-71: a free-delivery order stays free, the venue's share capped by the new goods total.
  const merchantDeliveryShare = recomputeMerchantDeliveryShare(order.merchantDeliveryShare, merchantGoodsTotal, deliveryFee);
  const agreedFare = foodOrderMoney({ goodsTotal: merchantGoodsTotal, deliveryFee, merchantDeliveryShare }).customerTotal;
  const now = new Date();

  await prisma.$transaction(async (tx) => {
    const claimed = await tx.order.updateMany({
      // itemsEditedAt is the lines' version: an edit committed since this one read the order makes it a 409.
      where: { id: orderId, status: order.status, merchantPhase: order.merchantPhase, itemsEditedAt: order.itemsEditedAt },
      data: {
        merchantGoodsTotal,
        merchantDeliveryShare,
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
    if (alsoInTx) await alsoInTx(tx);
  });

  notifyFoodQueueChanged(gateway, order.merchantId, orderId);
  await notifications.notifyProfiles([order.customerId], {
    title: `${order.merchant?.name ?? "The restaurant"} updated your order`,
    // C9 (U13): the one amount due at the door — the new agreed total plus any carried balance.
    body: `New total $${(merchantAmountDueUsd({ agreedFare, carriedBalance: order.carriedBalance }) ?? agreedFare).toFixed(2)}, cash at the door.`,
    data: { orderId, status: order.status, to: "customer", orderType: "merchant", kind: "food_items_edited" },
  });
}
