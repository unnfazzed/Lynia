import type { CreateFleetInviteRequest, FleetBillsResponse, FleetInviteLinkResponse, OwnerFleetResponse } from "@lynia/shared";
import { authedFetch } from "./api-client";

/**
 * Own bikers (ledger D-117): `/merchant/fleet`. The whole team reads the roster (staff see masked numbers and no
 * invite links); only the owner invites, revokes, removes and sees the bill (403 `owner_only` otherwise). The
 * routes answer 503 while Own bikers isn't live yet (`FLEET_UI_LIVE`).
 */

export function getFleet(): Promise<OwnerFleetResponse> {
  return authedFetch<OwnerFleetResponse>("/merchant/fleet");
}

export function getFleetBills(): Promise<FleetBillsResponse> {
  return authedFetch<FleetBillsResponse>("/merchant/fleet/bills");
}

/** A phone-bound invite link (D-117: no SMS); a live invite to the same number comes back as the same link. */
export function createFleetInvite(body: CreateFleetInviteRequest): Promise<FleetInviteLinkResponse> {
  return authedFetch<FleetInviteLinkResponse>("/merchant/fleet/invites", { method: "POST", body });
}

/** "Share again": the same link again. */
export function getFleetInviteLink(id: string): Promise<FleetInviteLinkResponse> {
  return authedFetch<FleetInviteLinkResponse>(`/merchant/fleet/invites/${id}/link`);
}

export function revokeFleetInvite(id: string): Promise<{ ok: true }> {
  return authedFetch<{ ok: true }>(`/merchant/fleet/invites/${id}/revoke`, { method: "POST" });
}

export function removeFleetBiker(riderId: string): Promise<{ ok: true }> {
  return authedFetch<{ ok: true }>(`/merchant/fleet/bikers/${riderId}`, { method: "DELETE" });
}

/** OB-M5's ✕: the Preferred-rider suggestions are gone for good. */
export function dismissFleetSuggestions(): Promise<{ ok: true }> {
  return authedFetch<{ ok: true }>("/merchant/fleet/suggestions/dismiss", { method: "POST" });
}
