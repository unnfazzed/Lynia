import type {
  CreateFleetBookingRequest,
  CreateFleetBookingResponse,
  CreateFleetInviteRequest,
  FleetBillsResponse,
  FleetInviteLinkResponse,
  FleetRidesResponse,
  MerchantBookingResponse,
  OwnerFleetResponse,
} from "@lynia/shared";
import { authedFetch } from "./api-client";

/**
 * Own bikers (ledger D-117): `/merchant/fleet`. The whole team reads the roster (staff see masked numbers and no
 * invite links); only the owner invites, revokes, removes and sees the bill (403 `owner_only` otherwise). The
 * routes answer 503 while Own bikers isn't live yet (`FLEET_UI_LIVE`).
 */

export function getFleet(): Promise<OwnerFleetResponse> {
  return authedFetch<OwnerFleetResponse>("/merchant/fleet");
}

/** OB-M13/M14: this branch's fleet rides this week (owner and staff). */
export function getFleetRides(): Promise<FleetRidesResponse> {
  return authedFetch<FleetRidesResponse>("/merchant/fleet/rides");
}

export function getFleetBills(): Promise<FleetBillsResponse> {
  return authedFetch<FleetBillsResponse>("/merchant/fleet/bills");
}

/** A phone-bound invite link (D-117: no SMS); a live invite to the same number comes back as the same link. */
export function createFleetInvite(
  body: CreateFleetInviteRequest,
): Promise<FleetInviteLinkResponse> {
  return authedFetch<FleetInviteLinkResponse>("/merchant/fleet/invites", {
    method: "POST",
    body,
  });
}

/** "Share again": the same link again. */
export function getFleetInviteLink(
  id: string,
): Promise<FleetInviteLinkResponse> {
  return authedFetch<FleetInviteLinkResponse>(
    `/merchant/fleet/invites/${id}/link`,
  );
}

export function revokeFleetInvite(id: string): Promise<{ ok: true }> {
  return authedFetch<{ ok: true }>(`/merchant/fleet/invites/${id}/revoke`, {
    method: "POST",
  });
}

export function removeFleetBiker(riderId: string): Promise<{ ok: true }> {
  return authedFetch<{ ok: true }>(`/merchant/fleet/bikers/${riderId}`, {
    method: "DELETE",
  });
}

/** OB-M5's ✕: the Preferred-rider suggestions are gone for good. */
export function dismissFleetSuggestions(): Promise<{ ok: true }> {
  return authedFetch<{ ok: true }>("/merchant/fleet/suggestions/dismiss", {
    method: "POST",
  });
}

/** OB-M8 "Ring my bikers": the booking rings the business's own bikers. The delivery code comes back once, now. */
export function createFleetBooking(
  body: CreateFleetBookingRequest,
): Promise<CreateFleetBookingResponse> {
  return authedFetch<CreateFleetBookingResponse>("/merchant/fleet/bookings", {
    method: "POST",
    body,
  });
}

/** OB-M10 "Try my bikers again". */
export function retryFleetBooking(
  bookingId: string,
): Promise<MerchantBookingResponse> {
  return authedFetch<MerchantBookingResponse>(
    `/merchant/fleet/bookings/${bookingId}/retry`,
    { method: "POST" },
  );
}

/** OB-M10/M11 "Send to any biker": the same booking, the same code, to the public at this fare. */
export function sendFleetBookingToAny(
  bookingId: string,
  proposedFare: number,
): Promise<MerchantBookingResponse> {
  return authedFetch<MerchantBookingResponse>(
    `/merchant/fleet/bookings/${bookingId}/any-biker`,
    { method: "POST", body: { proposedFare } },
  );
}
