/**
 * D4 (doorstep) — pure helpers for the CASH dual-confirm handshake (R-04/R-05/R-09/N-19), framework-
 * free so the state machine unit-tests off-device. The order screen holds the React state; this file
 * only derives what to show from the server's own timestamps.
 */
import { RESTAURANTS_DEBT } from "@lynia/shared";

export type HandshakeState =
  // WALLET orders (or any non-cash method) never go through the handshake at all.
  | "not_cash"
  // CASH, en route, nobody has confirmed yet.
  | "pending"
  // The customer confirmed; waiting on the rider within the N-19 window.
  | "waiting_rider"
  // R-05: the window lapsed (or the rider disputed) — frozen, support auto-called.
  | "frozen"
  // R-04: both sides confirmed — the code may now unlock.
  | "confirmed";

/** R-04: derives the handshake's current state purely off the four server timestamps/method — never
 *  a client-side timer or guess. `frozen` is checked before `confirmed`/`waiting_rider` because a
 *  frozen handshake can only be reached from `waiting_rider` (R-05) and must win the branch. */
export function handshakeState(order: {
  paymentMethod: string | null;
  customerCashConfirmedAt: string | null | undefined;
  riderCashConfirmedAt: string | null | undefined;
  cashHandshakeFrozenAt: string | null | undefined;
}): HandshakeState {
  if (order.paymentMethod !== "cash") return "not_cash";
  if (order.cashHandshakeFrozenAt) return "frozen";
  if (order.customerCashConfirmedAt && order.riderCashConfirmedAt) return "confirmed";
  if (order.customerCashConfirmedAt) return "waiting_rider";
  return "pending";
}

/** R-09: whether the delivery code may be shown/fetched at all right now. WALLET orders are already
 *  paid and were never gated; CASH orders unlock only once both handshake confirms have landed. */
export function codeEligible(order: {
  paymentMethod: string | null;
  customerCashConfirmedAt: string | null | undefined;
  riderCashConfirmedAt: string | null | undefined;
  cashHandshakeFrozenAt: string | null | undefined;
}): boolean {
  const state = handshakeState(order);
  return state === "not_cash" || state === "confirmed";
}

/** N-19: elapsed/total ms for the CountdownRing while `waiting_rider` — the 2:00 window is anchored on
 *  the server's own `customerCashConfirmedAt`, never a client-started timer (a backgrounded app can't
 *  drift from the reconciler's own sweep). Clamped so a late poll tick never reads negative/over-100%. */
export function handshakeCountdown(customerCashConfirmedAt: string, nowMs: number): { elapsedMs: number; totalMs: number } {
  const totalMs = RESTAURANTS_DEBT.handshakeWindowMs;
  const confirmedAt = new Date(customerCashConfirmedAt).getTime();
  const elapsedMs = Number.isFinite(confirmedAt) ? Math.min(totalMs, Math.max(0, nowMs - confirmedAt)) : 0;
  return { elapsedMs, totalMs };
}
