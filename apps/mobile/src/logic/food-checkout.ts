/**
 * D2 (checkout + kitchen-confirms) — pure helpers, framework-free so the math/branching unit-tests
 * off-device. The checkout/order screens hold the React state; this file only shapes it.
 */
import { deliveryFeeForDistance, haversineKm, roundToCents, type LatLng, type MerchantPhase } from "@lynia/shared";

/**
 * A client-side ESTIMATE of the delivery fee (N-01), mirroring exactly what
 * `food-order.service.ts:placeOrder` computes server-side (haversineKm → deliveryFeeForDistance) so
 * checkout can show an honest total before submitting. Null when the merchant hasn't set a location
 * yet (`RestaurantListItem.location`) — placeOrder itself would 409 in that case, so checkout must
 * not fabricate a number. The server's own computation at placeOrder time is always authoritative;
 * this is a preview only.
 */
export function estimateDeliveryFee(merchantLocation: LatLng | null, dropoff: LatLng): number | null {
  if (!merchantLocation) return null;
  const distanceKm = roundToCents(haversineKm(merchantLocation, dropoff));
  return deliveryFeeForDistance(distanceKm);
}

/** R-17: free, any time before the kitchen has committed to cooking — mirrors
 *  `food-order.service.ts:cancelUnpaid`'s own gate exactly, so the UI never offers a cancel the
 *  server would 409 on. */
const FREELY_CANCELLABLE_PHASES = new Set<MerchantPhase>(["awaiting_accept", "awaiting_item_approval", "awaiting_payment"]);
export function canCancelFreely(merchantPhase: MerchantPhase | null): boolean {
  return merchantPhase != null && FREELY_CANCELLABLE_PHASES.has(merchantPhase);
}

/** N-22: the soft "still unpaid" reminder is due once a payment request has waited this long with no
 *  reference submitted yet — the client-side cue for switching the pay screen to the R5·b1 "still
 *  waiting" copy (no server flag exists for this; R-17 removed every payment clock, so this is
 *  purely a presentational nudge, never a deadline the server enforces). */
export const STILL_UNPAID_REMINDER_MS = 15 * 60 * 1000;

export function isStillUnpaidReminderDue(paymentRequestedAt: string | null, now: number = Date.now()): boolean {
  if (!paymentRequestedAt) return false;
  const requestedAt = new Date(paymentRequestedAt).getTime();
  if (!Number.isFinite(requestedAt)) return false;
  return now - requestedAt >= STILL_UNPAID_REMINDER_MS;
}
