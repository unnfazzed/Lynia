import type {
  ApprovePrescriptionRequest,
  DeclinePrescriptionRequest,
  OrderFlagsResponse,
  PrescriptionPhotosResponse,
  ProposeSubstitutionRequest,
  EditMerchantOrderItemsRequest,
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

/** R-16: asks a wallet order's customer to pay (a wallet order placed before D-74 only). The API wants a
 *  logged call first unless `overrideCallLog` says the customer confirmed another way. */
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

/** D-48 (merchant mobile B6/B7): close the merchant's side after pickup without counting cash —
 *  "no_cash" is "No cash on this one · mark completed", "force" is "Mark ride completed". */
export function closeOrder(orderId: string, reason: "no_cash" | "force"): Promise<MerchantOrderResponse> {
  return authedFetch<MerchantOrderResponse>(`/merchant/orders/${orderId}/close`, { method: "POST", body: { reason } });
}

/** D-48 (merchant mobile B3): "Can't finish this order" on a cash order still cooking. */
export function cancelPreparing(orderId: string): Promise<MerchantOrderResponse> {
  return authedFetch<MerchantOrderResponse>(`/merchant/orders/${orderId}/cancel`, { method: "POST" });
}

// ── Auto-accept: the kitchen's confirmation and item changes ───────────────────────────────────────

/** "Got it, we're making it": confirms an auto-accepted order, which is what lets a rider be sent. */
export function confirmKitchen(orderId: string): Promise<MerchantOrderResponse> {
  return authedFetch<MerchantOrderResponse>(`/merchant/orders/${orderId}/confirm-kitchen`, { method: "POST" });
}

/** Change the items after agreeing it with the customer (before pickup): every line's new quantity, 0
 *  removes it. A 409 (`not_editable` / `no_items_left`) carries a message to show as-is. */
export function editOrderItems(orderId: string, body: EditMerchantOrderItemsRequest): Promise<MerchantOrderResponse> {
  return authedFetch<MerchantOrderResponse>(`/merchant/orders/${orderId}/edit-items`, { method: "POST", body });
}

// ── Order flow v2 (ledger D-59): substitution, scheduled orders, prescription check ─────────────────

/** U1a / U4a: per-line Remove it / Swap for… At `awaiting_accept` this IS the accept (`prepMinutes`
 *  required); mid-prep it opens a 3-minute round. 409s (`not_changeable`, `substitution_open`,
 *  `swaps_off`) carry a message to show as-is. */
export function proposeSubstitution(orderId: string, body: ProposeSubstitutionRequest): Promise<MerchantOrderResponse> {
  return authedFetch<MerchantOrderResponse>(`/merchant/orders/${orderId}/substitution`, { method: "POST", body });
}

/** M7a: scheduled orders that haven't rung yet ("Rings at 12:05 like a new order"). */
export function listScheduledOrders(): Promise<MerchantOrderResponse[]> {
  return authedFetch<MerchantOrderResponse[]>("/merchant/scheduled-orders");
}

/** M8a: the prescription's pages as short-lived signed URLs (pharmacists only). */
export function getPrescriptionPhotos(orderId: string): Promise<PrescriptionPhotosResponse> {
  return authedFetch<PrescriptionPhotosResponse>(`/merchant/orders/${orderId}/prescription`);
}

/** M8a / P1 "Approve": with Merchant v2's checklist (D-77), every box ticked, for the audit trail. */
export function approvePrescription(orderId: string, body?: ApprovePrescriptionRequest): Promise<MerchantOrderResponse> {
  return authedFetch<MerchantOrderResponse>(`/merchant/orders/${orderId}/prescription/approve`, { method: "POST", ...(body ? { body } : {}) });
}

/** M8b "Decline and tell the customer": the reason chip and an optional note. */
export function declinePrescription(orderId: string, body: DeclinePrescriptionRequest): Promise<MerchantOrderResponse> {
  return authedFetch<MerchantOrderResponse>(`/merchant/orders/${orderId}/prescription/decline`, { method: "POST", body });
}

/** Order flow v2's switches: `rxEnabled` (prescriptions, BRIEF §13), on by default (D-76). Public. */
export function getOrderFlags(): Promise<OrderFlagsResponse> {
  return authedFetch<OrderFlagsResponse>("/app/order-flags");
}

/** Merchant v2 K3 (ledger D-77): "+5 min" pushes the ready time back five minutes. */
export function extendPrep(orderId: string): Promise<MerchantOrderResponse> {
  return authedFetch<MerchantOrderResponse>(`/merchant/orders/${orderId}/extend-prep`, { method: "POST" });
}

/**
 * Merchant v2 BRIEF open question 1 (owner decision 2026-10-04: build it behind a flag that stays off):
 * "Rider can't enter code" — the rider gets an SMS link to finish the hand-over. A typed stub: the API
 * route doesn't exist yet, and the button only shows with `NEXT_PUBLIC_MERCHANT_HANDOVER_FALLBACK=1`.
 */
export function requestHandoverFallback(orderId: string): Promise<MerchantOrderResponse> {
  return authedFetch<MerchantOrderResponse>(`/merchant/orders/${orderId}/handover-fallback`, { method: "POST" });
}
