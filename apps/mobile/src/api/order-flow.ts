import type { CustomerBalanceResponse, ScheduleSlotsResponse } from "@lynia/shared";
import { apiFetch } from "./client";

/**
 * Order flow v2 customer reads (ledger D-59, backend B). The place-order call itself stays
 * `placeFoodOrder` (food-orders.ts): `POST /restaurants/:merchantId/orders` takes shops and pharmacies too.
 */

/** BRIEF §12 (R5a): the Today / Tomorrow 30-minute slots the venue can meet for THIS drop-off — the lead
 *  time includes the delivery estimate, so the drop-off's lat/lng is passed whenever it is known. */
export function getScheduleSlots(merchantId: string, at: { lat: number; lng: number } | null): Promise<ScheduleSlotsResponse> {
  const qs = at ? `?lat=${at.lat}&lng=${at.lng}` : "";
  return apiFetch(`/restaurants/${merchantId}/schedule-slots${qs}`);
}

/** BRIEF D3f: what the customer still owes from a cancel after collection. */
export function getCustomerBalance(): Promise<CustomerBalanceResponse> {
  return apiFetch("/restaurants/balance");
}
