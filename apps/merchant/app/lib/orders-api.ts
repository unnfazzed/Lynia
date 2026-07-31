import type {
  MerchantAcceptOrderRequest,
  MerchantConfirmPaymentRequest,
  MerchantEndOfDaySummaryResponse,
  MerchantOrderResponse,
  MerchantRejectionReasonCode,
  MerchantWeeklyStatementResponse,
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

// ── C4/E3: the collect-and-return debt ledger + merchant refund ────────────────────────────────────

/** R-06/N-21/D-06: a mismatched amount 409s naming the gap in dollars — surface it verbatim, same as confirmPayment. */
export function confirmReturnedCash(orderId: string, amount: number): Promise<{ orderId: string; debtStatus: "settled_cash" }> {
  return authedFetch(`/merchant/orders/${orderId}/debt/confirm-cash`, { method: "POST", body: { amount } });
}

/** The goods-only return (refusal/no-show) — only valid once the order is `undelivered`. */
export function confirmGoodsReturned(orderId: string): Promise<{ orderId: string; debtStatus: "settled_goods" }> {
  return authedFetch(`/merchant/orders/${orderId}/debt/confirm-goods`, { method: "POST" });
}

/** R-07: writes off the debt and suspends + names the rider — the merchant's last-resort action. */
export function reportNonReturn(orderId: string, note?: string): Promise<{ orderId: string; debtStatus: "written_off" }> {
  return authedFetch(`/merchant/orders/${orderId}/debt/report-non-return`, { method: "POST", body: { note } });
}

/** D-12: the merchant cannot cancel an already-WALLET-paid order without a refund reference + the exact amount first. */
export function refundOrder(orderId: string, reference: string, amount: number): Promise<{ orderId: string; status: "cancelled" }> {
  return authedFetch(`/merchant/orders/${orderId}/refund`, { method: "POST", body: { reference, amount } });
}

// ── E3: weekly statement + end-of-day summary (N-13) ────────────────────────────────────────────────

export function getWeeklyStatement(): Promise<MerchantWeeklyStatementResponse> {
  return authedFetch<MerchantWeeklyStatementResponse>("/merchant/statement/weekly");
}

export function getTodaySummary(): Promise<MerchantEndOfDaySummaryResponse> {
  return authedFetch<MerchantEndOfDaySummaryResponse>("/merchant/summary/today");
}
