import type {
  ConfirmSubstitutionRequest,
  MerchantOrderResponse,
  PlaceMerchantOrderRequest,
  RateVenueRequest,
  VenueRatingView,
} from "@lynia/shared";
import { apiFetch } from "./client";

/** T13a "Change time": move a scheduled order to another slot before the venue starts it. */
export function changeFoodOrderSchedule(orderId: string, scheduledFor: string): Promise<MerchantOrderResponse> {
  return apiFetch(`/restaurants/orders/${orderId}/schedule`, { method: "POST", body: { scheduledFor } });
}

/** D2 (checkout + kitchen-confirms). Price is always server-computed (D-35) — the client sends the
 *  basket + dropoff + payment method, never a total. */
export function placeFoodOrder(merchantId: string, body: PlaceMerchantOrderRequest): Promise<MerchantOrderResponse> {
  return apiFetch(`/restaurants/${merchantId}/orders`, { method: "POST", body });
}

export function getFoodOrder(orderId: string): Promise<MerchantOrderResponse> {
  return apiFetch(`/restaurants/orders/${orderId}`);
}

/** D-23: the customer's response to a shortened (item-level accept) order. */
export function respondToFoodOrderItems(orderId: string, approve: boolean): Promise<MerchantOrderResponse> {
  return apiFetch(`/restaurants/orders/${orderId}/items-response`, { method: "POST", body: { approve } });
}

/** Order flow v2 U2 (BRIEF §8): answer every swap of the open substitution round; returns the order. */
export function confirmFoodSubstitution(orderId: string, body: ConfirmSubstitutionRequest): Promise<MerchantOrderResponse> {
  return apiFetch(`/restaurants/orders/${orderId}/substitution/confirm`, { method: "POST", body });
}

/** Order flow v2 D1 (BRIEF §11): rate the venue once, after delivery (idempotent). */
export function rateFoodVenue(orderId: string, body: RateVenueRequest): Promise<VenueRatingView> {
  return apiFetch(`/restaurants/orders/${orderId}/venue-rating`, { method: "POST", body });
}

/** R-17: free, any time before the kitchen starts cooking. */
export function cancelUnpaidFoodOrder(orderId: string): Promise<MerchantOrderResponse> {
  return apiFetch(`/restaurants/orders/${orderId}/cancel`, { method: "POST" });
}

/** D4/C4: the customer's half of the doorstep dual-confirm handshake (R-04 "food first" — always
 *  first). The rider's own confirm/dispute are the RIDER app's job (D5), not this screen's. */
export function confirmFoodCustomerCash(orderId: string): Promise<{ orderId: string; customerCashConfirmedAt: string }> {
  return apiFetch(`/restaurants/orders/${orderId}/cash/customer-confirm`, { method: "POST" });
}
