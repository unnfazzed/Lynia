import type {
  AttachMerchantDoorProofRequest,
  AttachMerchantPickupProofRequest,
  ConfirmCollectedRequest,
  FoodOfferEvent,
  FoodOfferResponse,
  MerchantOrderResponse,
} from "@lynia/shared";
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

/** Order flow v2 RD1a–d (ledger D-59): the same read with the offer card's tags — the venue kind (SHOP /
 *  PHARMACY), a scheduled slot, a prescription order. `job` is a sibling of `offer`, absent on an older
 *  API, and never on the `food:offer` socket payload. */
export type FoodOfferJob = NonNullable<FoodOfferResponse["job"]>;
export function getFoodDispatchOfferWithJob(): Promise<{ offer: FoodOfferEvent | null; job: FoodOfferJob | null }> {
  return apiFetch<FoodOfferResponse>("/merchant/orders/dispatch/offer").then((r) => ({ offer: r.offer, job: r.job ?? null }));
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

/** N-16: the pickup code the kitchen reads out at the counter (6 digits since D-59). */
export function confirmFoodPickup(orderId: string, code: string): Promise<{ orderId: string; status: "picked_up" }> {
  return apiFetch(`/merchant/orders/${orderId}/confirm-pickup`, { method: "POST", body: { code } });
}

/** Auto-accept: the no-code pickup ("Collected") at a restaurant that skipped the accept window.
 *  The server only takes it within RESTAURANTS_AUTO_ACCEPT.pickupGeofenceM of the restaurant's pin —
 *  a 409 with reason `not_at_restaurant` otherwise. */
export function confirmFoodCollected(orderId: string, point: ConfirmCollectedRequest["point"]): Promise<{ orderId: string; status: "picked_up" }> {
  const body: ConfirmCollectedRequest = { point };
  return apiFetch(`/merchant/orders/${orderId}/collected`, { method: "POST", body });
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

// ── Order flow v2 (ledger D-59): proof at hand-over, the prescription tick ─────────────────────────

/** RD2b: the sealed-bag photo (key from `POST /uploads/pickup-photo`) and/or the "Bag is sealed" tick.
 *  Shops and pharmacies need the photo before the pickup completes (409 `pickup_photo_required`). */
export function attachFoodPickupProof(orderId: string, body: AttachMerchantPickupProofRequest): Promise<{ orderId: string; photoAttached: boolean; bagSealed: boolean }> {
  return apiFetch(`/merchant/orders/${orderId}/pickup-proof`, { method: "POST", body });
}

/** RD4c/RD4d: why the delivery code couldn't be used, who took it, and the photo of where it was left
 *  (key from `POST /uploads/delivery-proof`). Evidence only — it never finishes the delivery. */
export function attachFoodDoorProof(orderId: string, body: AttachMerchantDoorProofRequest): Promise<{ orderId: string; reason: string; handedTo: string | null }> {
  return apiFetch(`/merchant/orders/${orderId}/door-proof`, { method: "POST", body });
}

/** RD3: "I saw the original prescription" — required before an approved prescription order is delivered. */
export function confirmRxSawOriginal(orderId: string): Promise<unknown> {
  return apiFetch(`/merchant/orders/${orderId}/prescription/saw-original`, { method: "POST" });
}
