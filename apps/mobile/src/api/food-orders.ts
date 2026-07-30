import type { MerchantOrderResponse, PlaceMerchantOrderRequest } from "@lynia/shared";
import { apiFetch } from "./client";

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

/** R-17: free, any time before the kitchen starts cooking. */
export function cancelUnpaidFoodOrder(orderId: string): Promise<MerchantOrderResponse> {
  return apiFetch(`/restaurants/orders/${orderId}/cancel`, { method: "POST" });
}

/** D-24 "I paid another way" manual rail — the customer's own submitted reference. */
export function submitFoodPaymentReference(orderId: string, reference: string): Promise<MerchantOrderResponse> {
  return apiFetch(`/restaurants/orders/${orderId}/payment-reference`, { method: "POST", body: { reference } });
}
