/**
 * D-125 delivery price ceiling: the two audience-specific views of an order's delivery price.
 *
 * - The CUSTOMER sees their ceiling ("Pay no more than"), the "at most" total, and once a rider accepts the exact
 *   price and the saving. Never the offer riders see, never the shop's top-up: no number above goods + ceiling.
 * - The MERCHANT sees the offer riders see, its own top-up and when the customer will be asked to raise.
 * - The RIDER sees neither: only `deliveryFee`, the current offer (toResponse, unchanged).
 */
import {
  addMoney,
  ceilingBounds,
  type DeliveryCeilingView,
  type DeliveryTopUpView,
  type MerchantOrderResponse,
  subMoney,
  topUpChoices,
} from "@lynia/shared";
import type { OrderWithItems } from "./food-order.helpers";

type Num = { toString(): string } | number | null | undefined;
const num = (v: Num): number | null => (v == null ? null : Number(v));

/** Statuses in which no rider holds the order yet (the price is still "at most"). */
const SEARCHING = new Set(["requested", "open_for_offers"]);

/** The customer's view, or undefined on an order placed without a ceiling. */
export function customerCeilingView(order: OrderWithItems, now: Date = new Date()): DeliveryCeilingView | undefined {
  const ceiling = num(order.deliveryCeiling);
  const recommended = num(order.deliveryRecommended);
  if (ceiling == null || recommended == null) return undefined;
  const venueFunded = order.deliveryVenueFunded === true;
  const goods = num(order.merchantGoodsTotal);
  const carried = addMoney(0, ...(order.carriedBalance ?? []).map((b) => Number(b.amount)));
  const accepted = order.deliveryAcceptedRound != null && order.riderId != null;
  const fee = num(order.deliveryFee) ?? 0;
  const share = num(order.merchantDeliveryShare) ?? 0;
  const customerPart = venueFunded ? 0 : subMoney(fee, share);
  const max = ceilingBounds(recommended).max;
  const askAt = order.deliveryAskCustomerAt;
  const askRaise =
    !venueFunded &&
    !accepted &&
    order.riderId == null &&
    SEARCHING.has(order.status) &&
    askAt != null &&
    askAt.getTime() <= now.getTime() &&
    ceiling < max;
  const saved = accepted && !venueFunded ? subMoney(ceiling, customerPart) : null;
  return {
    recommended,
    ceiling,
    max,
    distanceKm: num(order.distanceKm),
    totalAtMost: goods == null ? null : addMoney(goods, venueFunded ? 0 : ceiling, carried),
    acceptedPrice: accepted ? customerPart : null,
    saved: saved != null && saved > 0 ? saved : null,
    venueFunded,
    askRaise,
  };
}

/**
 * The customer's whole response: the ceiling view added, and on a shop top-up the delivery fields rewritten to the
 * customer's own part, so the rider's larger fee never reaches the customer's screen.
 */
export function withCustomerCeiling(order: OrderWithItems, response: MerchantOrderResponse): MerchantOrderResponse {
  const view = customerCeilingView(order);
  if (!view) return response;
  const out: MerchantOrderResponse = { ...response, deliveryCeiling: view };
  if (!view.venueFunded && out.deliveryFee != null && out.merchantDeliveryShare != null) {
    out.deliveryFee = subMoney(out.deliveryFee, out.merchantDeliveryShare);
    delete out.merchantDeliveryShare;
    delete out.customerDeliveryFee;
  }
  return out;
}

/** The merchant's view, or undefined on an order placed without a ceiling. */
export function merchantTopUpView(order: OrderWithItems): DeliveryTopUpView | undefined {
  if (order.deliveryCeiling == null) return undefined;
  const topUp = num(order.merchantTopUp) ?? 0;
  const goods = num(order.merchantGoodsTotal) ?? 0;
  return {
    offer: num(order.deliveryFee) ?? 0,
    topUp,
    choices: topUpChoices(goods, topUp),
    askCustomerAt:
      order.deliveryVenueFunded === true || order.deliveryAcceptedRound != null || order.riderId != null
        ? null
        : (order.deliveryAskCustomerAt?.toISOString() ?? null),
  };
}
