import type {
  MerchantAcceptOrderRequest,
  MerchantConfirmPaymentRequest,
  MerchantOrderResponse,
  MerchantRejectionReasonCode,
} from "@lynia/shared";
import { authedFetch } from "./api-client";

export type { MerchantOrderResponse, MerchantOrderItemView, MerchantPhase, MerchantRejectionReasonCode } from "@lynia/shared";

/** The kitchen queue — every pre-handoff order (E2 board §5 Lane E). */
export function listQueue(): Promise<MerchantOrderResponse[]> {
  return authedFetch<MerchantOrderResponse[]>("/merchant/orders");
}

export function getOrder(orderId: string): Promise<MerchantOrderResponse> {
  return authedFetch<MerchantOrderResponse>(`/merchant/orders/${orderId}`);
}

/** D-23: full accept when `unavailableDishIds` is omitted/empty, item-level otherwise. */
export function acceptOrder(orderId: string, body: MerchantAcceptOrderRequest): Promise<MerchantOrderResponse> {
  return authedFetch<MerchantOrderResponse>(`/merchant/orders/${orderId}/accept`, { method: "POST", body });
}

/** D-11: the reason IS the customer's copy. */
export function rejectOrder(orderId: string, reason: MerchantRejectionReasonCode): Promise<MerchantOrderResponse> {
  return authedFetch<MerchantOrderResponse>(`/merchant/orders/${orderId}/reject`, { method: "POST", body: { reason } });
}

/** R-16: unlocks the request-payment button. */
export function logCall(orderId: string): Promise<MerchantOrderResponse> {
  return authedFetch<MerchantOrderResponse>(`/merchant/orders/${orderId}/log-call`, { method: "POST" });
}

export function requestPayment(orderId: string, overrideCallLog = false): Promise<MerchantOrderResponse> {
  return authedFetch<MerchantOrderResponse>(`/merchant/orders/${orderId}/request-payment`, {
    method: "POST",
    body: { overrideCallLog },
  });
}

/** R-11/D-06: a mismatched amount 409s with a message naming the gap in dollars — surface it verbatim. */
export function confirmPayment(orderId: string, body: MerchantConfirmPaymentRequest): Promise<MerchantOrderResponse> {
  return authedFetch<MerchantOrderResponse>(`/merchant/orders/${orderId}/confirm-payment`, { method: "POST", body });
}

/** R-17: no-penalty release of a zombie awaiting_payment order (M2·7 — no clock, never blocks the board). */
export function releaseUnpaid(orderId: string, reason: MerchantRejectionReasonCode): Promise<MerchantOrderResponse> {
  return authedFetch<MerchantOrderResponse>(`/merchant/orders/${orderId}/release-unpaid`, { method: "POST", body: { reason } });
}

export function markReady(orderId: string): Promise<MerchantOrderResponse> {
  return authedFetch<MerchantOrderResponse>(`/merchant/orders/${orderId}/mark-ready`, { method: "POST" });
}

/** N-16: the raw code is hashed-then-discarded server-side at markReady — this is the only way to
 *  learn/re-learn it to read out to the rider at the counter. Safe to call repeatedly. */
export function revealPickupCode(orderId: string): Promise<{ pickupCode: string }> {
  return authedFetch<{ pickupCode: string }>(`/merchant/orders/${orderId}/pickup-code/reveal`, { method: "POST" });
}

/** D-34 hold-screen "keep searching". */
export function dispatchResume(orderId: string): Promise<{ orderId: string; resumed: true }> {
  return authedFetch(`/merchant/orders/${orderId}/dispatch/resume`, { method: "POST" });
}

/** D-34 hold-screen "cancel the order" (D-13 no-fault). */
export function dispatchCancel(orderId: string): Promise<{ orderId: string; status: "cancelled" }> {
  return authedFetch(`/merchant/orders/${orderId}/dispatch/cancel`, { method: "POST" });
}
