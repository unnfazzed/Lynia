import type { OfferType } from "@lynia/shared";

/**
 * Pure decision helpers for the new customer/rider journey flows — extracted from the screens so the
 * rules (which carry real product semantics) are unit-testable without rendering.
 */

/**
 * F-07 counter-offer: a `counter` bid strictly ABOVE the customer's ask surfaces as an Accept/Decline
 * card. Decline is client-side dismissal only (`declined = true`) — the bid stays live server-side, so
 * once declined it stops being a "pending counter" and reverts to a normal choosable offer. An
 * `accept`-type bid, or a counter at/below the ask, is never a pending counter.
 */
export function isPendingCounter(type: OfferType, offeredFare: number, ask: number, declined: boolean): boolean {
  return type === "counter" && offeredFare > ask && !declined;
}

/**
 * Pickup item verification: the collect CTA counts PIECES across the ticked line-items, not rows —
 * a 1× + 2× selection reads "Confirm 3 items collected". Unticked rows contribute nothing.
 */
export function collectedItemCount(items: readonly { quantity: number }[], checked: ReadonlySet<number>): number {
  return items.reduce((sum, it, i) => (checked.has(i) ? sum + it.quantity : sum), 0);
}
