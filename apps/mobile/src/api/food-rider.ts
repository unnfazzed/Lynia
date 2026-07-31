import type { FoodOfferEvent, MerchantOrderResponse } from "@lynia/shared";
import { apiFetch } from "./client";

/**
 * D5 (rider food jobs) — the RIDER's own actions against a merchant order, all under
 * `/merchant/orders` (merchant-order.controller.ts). None of these need a MerchantGuard token: the
 * server checks the caller is the candidate/assigned rider inside each service method, exactly like
 * order-lifecycle.service.ts's confirmDelivery needs no role gate either. The customer-side sibling
 * calls (checkout, doorstep's customer confirm) live in food-orders.ts under `/restaurants` — two
 * files because the two roles hit two different controllers.
 */

// ── C5 dispatch — offer intake (poll fallback for `food:offer` / reconnect source of truth) ────────

export function getFoodDispatchOffer(): Promise<FoodOfferEvent | null> {
  return apiFetch<{ offer: FoodOfferEvent | null }>("/merchant/orders/dispatch/offer").then((r) => r.offer);
}

export function acceptFoodDispatch(orderId: string): Promise<{ orderId: string; status: "assigned" }> {
  return apiFetch(`/merchant/orders/${orderId}/dispatch/accept`, { method: "POST" });
}

export function declineFoodDispatch(orderId: string): Promise<{ orderId: string; declined: true }> {
  return apiFetch(`/merchant/orders/${orderId}/dispatch/decline`, { method: "POST" });
}

/** D-33: pre-pickup only (assigned/confirmed/en_route_pickup) — enforced server-side. No reason body:
 *  unlike a parcel bail (CancelRequest.reason), dropDispatch re-dispatches in place with nothing to
 *  carry forward (see food-dispatch.service.ts's own docstring on why). */
export function dropFoodDispatch(orderId: string): Promise<{ orderId: string; status: "requested" }> {
  return apiFetch(`/merchant/orders/${orderId}/dispatch/drop`, { method: "POST" });
}

// ── C4 — the assigned rider's own read view + doorstep/handshake actions ────────────────────────────

export function getFoodOrderAsRider(orderId: string): Promise<MerchantOrderResponse> {
  return apiFetch(`/merchant/orders/${orderId}/mine`);
}

/** N-16: the 4-digit pickup code the kitchen reads out at the counter. */
export function confirmFoodPickup(orderId: string, code: string): Promise<{ orderId: string; status: "picked_up" }> {
  return apiFetch(`/merchant/orders/${orderId}/confirm-pickup`, { method: "POST", body: { code } });
}

/** R-04: the rider's "I received $X" — second half of the dual-confirm handshake, always after the
 *  customer's own confirm (food-orders.ts's confirmFoodCustomerCash). Unlocks the delivery code. */
export function confirmFoodRiderCash(orderId: string): Promise<{ orderId: string; riderCashConfirmedAt: string }> {
  return apiFetch(`/merchant/orders/${orderId}/cash/rider-confirm`, { method: "POST" });
}

/** R-05: the rider's explicit "the amount doesn't match" — freezes the handshake immediately instead
 *  of waiting out the full N-19 window. */
export function disputeFoodCash(orderId: string): Promise<{ orderId: string; frozen: true }> {
  return apiFetch(`/merchant/orders/${orderId}/cash/dispute`, { method: "POST" });
}

/** N-10: a call attempt logged before a no-show report is accepted (mirrors the merchant's own
 *  R-16 call-log gate). */
export function logFoodDoorstepCall(orderId: string): Promise<{ orderId: string; callsLogged: number }> {
  return apiFetch(`/merchant/orders/${orderId}/doorstep/log-call`, { method: "POST" });
}

/** N-10: 8:00 wait + 2 logged calls, then the food rides back like any failed hand-off. */
export function reportFoodNoShow(orderId: string): Promise<{ orderId: string; status: "undelivered" }> {
  return apiFetch(`/merchant/orders/${orderId}/doorstep/no-show`, { method: "POST" });
}

/** R-08: the customer refused or couldn't pay — costs them nothing in money, everything in access
 *  (cash-banned from here on). Blocked once the customer has already confirmed cash. */
export function reportFoodCustomerRefused(orderId: string): Promise<{ orderId: string; status: "undelivered" }> {
  return apiFetch(`/merchant/orders/${orderId}/doorstep/refused`, { method: "POST" });
}
