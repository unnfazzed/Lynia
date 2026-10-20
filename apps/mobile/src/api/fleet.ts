import type { FleetJobOffer, FleetJobOffersResponse, FleetMoneyResponse, MyFleetResponse } from "@lynia/shared";
import { apiFetch } from "./client";

/**
 * Own bikers (ledger D-117): the biker's side, under `/fleet` (fleet.controller.ts `RiderFleetController`). The
 * routes answer 503 until Own bikers is live (`FLEET_UI_LIVE`), so callers ask only while `useOrderFlags().fleetLive`.
 */

/** The fleet they ride for, and live invites to their number (OB-R1/R2). */
export function getMyFleet(): Promise<MyFleetResponse> {
  return apiFetch<MyFleetResponse>("/fleet/me");
}

/** OB-R2 "Join". A refusal arrives as an ApiError whose `reason` is a `FleetJoinRefusal` and whose message is the
 *  sentence to show (OB-R3). */
export function joinFleet(inviteId: string): Promise<MyFleetResponse> {
  return apiFetch<MyFleetResponse>(`/fleet/invites/${inviteId}/join`, { method: "POST" });
}

/** OB-R12 "Leave": refused with `on_a_job` during a delivery. */
export function leaveFleet(): Promise<{ ok: true }> {
  return apiFetch<{ ok: true }>("/fleet/leave", { method: "POST" });
}

/** The jobs ringing this biker now (OB-R4's cards; the poll behind `fleet:offer`). */
export function getFleetOffers(): Promise<FleetJobOffer[]> {
  return apiFetch<FleetJobOffersResponse>("/fleet/jobs/offers").then((r) => r.offers);
}

/** OB-R7 "Accept this job". */
export function acceptFleetJob(orderId: string): Promise<{ orderId: string; status: "assigned" }> {
  return apiFetch(`/fleet/jobs/${orderId}/accept`, { method: "POST" });
}

/** OB-R7 "Not this one": passing never counts against them. */
export function declineFleetJob(orderId: string): Promise<{ orderId: string; declined: true }> {
  return apiFetch(`/fleet/jobs/${orderId}/decline`, { method: "POST" });
}

/** OB-R10: the cash the biker holds for the business, and its recent movements. */
export function getFleetMoney(): Promise<FleetMoneyResponse> {
  return apiFetch<FleetMoneyResponse>("/fleet/money");
}
