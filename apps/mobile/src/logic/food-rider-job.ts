/**
 * D5 (rider food jobs) — pure helpers for the rider's side of a food delivery, framework-free so the
 * state derivation unit-tests off-device. Reuses rider-job.ts's ACTIVE/advanceReconciled/
 * reconcileOtpAttempts verbatim where they already generalize (the two order types share the same
 * OrderStatus staircase and OTP-attempt-reconcile shape) — this file only adds what's genuinely
 * food-specific: the pre-pickup step labels, the D-33 drop window, the offer variant a rider decides
 * accept/decline against, the R-06 cash-collected breakdown, and N-10's wait+call-log gate.
 */
import { RESTAURANTS_DEBT, type AdvanceStatusRequest } from "@lynia/shared";

/** Mirrors rider-job.ts's NEXT map, but only the two edges the rider drives with a plain "advance"
 *  tap — en_route_pickup→picked_up is N-16 code-gated (confirmFoodPickup), and en_route_dropoff→
 *  delivered is the doorstep handshake + delivery code (confirmDelivery), neither a bare button. */
export const RIDER_FOOD_NEXT: Record<string, { to: AdvanceStatusRequest["to"]; label: string }> = {
  assigned: { to: "confirmed", label: "Confirm the job" },
  confirmed: { to: "en_route_pickup", label: "Navigate to the restaurant" },
  picked_up: { to: "en_route_dropoff", label: "Navigate to the customer" },
};

/** D-33: a secured rider may drop only before collecting the food — mirrors food-dispatch.service.ts's
 *  own `droppable` set exactly. */
export const FOOD_DROPPABLE = new Set(["assigned", "confirmed", "en_route_pickup"]);

export type FoodOfferVariant = "cash_collect" | "cash_upfront" | "wallet" | "unknown";

/** R-01/R-03/R-10/R-12: which offer card to render before the rider accepts/declines. `unknown` only
 *  ever happens against an older API that hasn't populated the two new offer fields yet — the caller
 *  falls back to neutral "confirm at the counter" copy rather than guessing a money figure. */
export function foodOfferVariant(offer: { merchantPaymentMethod: string | null; merchantCashRule: string | null }): FoodOfferVariant {
  if (offer.merchantPaymentMethod === "wallet") return "wallet";
  if (offer.merchantPaymentMethod === "cash") return offer.merchantCashRule === "pay_upfront" ? "cash_upfront" : "cash_collect";
  return "unknown";
}

/** R-06/D-06: what the rider collects at the door vs. keeps vs. owes back, for a CASH collect-and-
 *  return order — "$15.50 collected → $2.50 kept (the delivery fee) → $13.00 owed to the kitchen".
 *  Only meaningful when {@link foodOfferVariant} (or the live order's own fields) is "cash_collect". */
export function foodCashBreakdown(order: { merchantGoodsTotal: number | null; deliveryFee: number | null }): {
  collected: number;
  kept: number;
  owed: number;
} {
  const goods = order.merchantGoodsTotal ?? 0;
  const fee = order.deliveryFee ?? 0;
  return { collected: goods + fee, kept: fee, owed: goods };
}

/** True once a delivered CASH collect-and-return order still has cash riding back to the kitchen —
 *  drives whether the return-the-cash leg + hand-back-confirm UI shows after delivery. */
export function returnLegNeeded(order: { paymentMethod: string | null; merchantCashRule: string | null; debtStatus: string | null }): boolean {
  return order.paymentMethod === "cash" && order.merchantCashRule === "collect_and_return" && order.debtStatus === "open";
}

/** N-10: the no-show gate — 2 logged calls AND an 8:00 wait since the FIRST call, both read off the
 *  server's own timestamps (never a client-started timer, so a backgrounded app can't drift). */
export function noShowStatus(
  callTimestamps: readonly string[],
  nowMs: number,
): { callsLogged: number; callsNeeded: number; waitRemainingMs: number; eligible: boolean } {
  const callsLogged = callTimestamps.length;
  const callsNeeded = Math.max(0, RESTAURANTS_DEBT.noShowMinCalls - callsLogged);
  if (callsLogged === 0) {
    return { callsLogged, callsNeeded, waitRemainingMs: RESTAURANTS_DEBT.noShowWindowMs, eligible: false };
  }
  const earliest = Math.min(...callTimestamps.map((t) => new Date(t).getTime()));
  const waitRemainingMs = Number.isFinite(earliest) ? Math.max(0, RESTAURANTS_DEBT.noShowWindowMs - (nowMs - earliest)) : RESTAURANTS_DEBT.noShowWindowMs;
  return { callsLogged, callsNeeded, waitRemainingMs, eligible: callsNeeded === 0 && waitRemainingMs === 0 };
}
