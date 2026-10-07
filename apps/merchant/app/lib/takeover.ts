import type { MerchantOrderResponse } from "@lynia/shared";
import { needsKitchenConfirm } from "./order-groups";

/**
 * Which order the K2 / S2 ringing screen shows (Merchant v2, ledger D-77; presented over any screen,
 * decision D4, ledger D-86). Pure, so the choice is testable without the screen.
 *
 * The candidates, in the order they take the screen: every new order waiting for an answer, then every
 * auto-accepted one the kitchen hasn't confirmed (Order flow v2 M1a, D-59). An order a screen is
 * answering in its own way — the Rx check (P1) for that order — is `held` and never covers that screen.
 */
export function takeoverCandidates(orders: readonly MerchantOrderResponse[], held: ReadonlySet<string> = new Set()): MerchantOrderResponse[] {
  const free = orders.filter((o) => !held.has(o.id));
  return [...free.filter((o) => o.merchantPhase === "awaiting_accept"), ...free.filter(needsKitchenConfirm)];
}

/**
 * MJ-M10 (2026-10-07): the order on screen stays there until it is resolved. Keyed on "the first
 * candidate", an older scheduled order that started ringing jumped to the front and remounted the
 * screen under the merchant's finger (a half-picked ready-in, a half-made swap, a reasons sheet: gone).
 * Now the one being answered (`currentId`) keeps the screen while it is still a candidate; the next one
 * waits its turn.
 */
export function pickTakeover(candidates: readonly MerchantOrderResponse[], currentId: string | null): MerchantOrderResponse | null {
  if (currentId) {
    const current = candidates.find((o) => o.id === currentId);
    if (current) return current;
  }
  return candidates[0] ?? null;
}
