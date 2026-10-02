import type {
  CreateMerchantInviteRequest,
  JoinMerchantInviteRequest,
  MerchantProfileResponse,
  MerchantTeamInviteResponse,
  MerchantTeamResponse,
  MyMerchantInvitesResponse,
} from "@lynia/shared";
import { authedFetch } from "./api-client";

/**
 * Team (merchant web upgrade L4). `/merchant/team` is the owner's (a staff member gets 403 `owner_only`),
 * except Leave. `/merchant/invites` is for a signed-in number that isn't on a business yet.
 */

export function getTeam(): Promise<MerchantTeamResponse> {
  return authedFetch<MerchantTeamResponse>("/merchant/team");
}

export function invitePerson(body: CreateMerchantInviteRequest): Promise<MerchantTeamInviteResponse> {
  return authedFetch<MerchantTeamInviteResponse>("/merchant/team/invites", { method: "POST", body });
}

export function cancelInvite(id: string): Promise<{ ok: true }> {
  return authedFetch<{ ok: true }>(`/merchant/team/invites/${id}`, { method: "DELETE" });
}

export function removeMember(profileId: string): Promise<{ ok: true }> {
  return authedFetch<{ ok: true }>(`/merchant/team/members/${profileId}`, { method: "DELETE" });
}

/** Order flow v2 (BRIEF §13, ledger D-59): the owner marks who may approve or decline prescriptions. */
export function setPharmacist(profileId: string, isPharmacist: boolean): Promise<{ ok: true }> {
  return authedFetch<{ ok: true }>(`/merchant/team/members/${profileId}/pharmacist`, { method: "POST", body: { isPharmacist } });
}

/** "Leave this business" (Staff). */
export function leaveBusiness(): Promise<{ ok: true }> {
  return authedFetch<{ ok: true }>("/merchant/team/leave", { method: "POST" });
}

export function listMyInvites(): Promise<MyMerchantInvitesResponse> {
  return authedFetch<MyMerchantInvitesResponse>("/merchant/invites");
}

export function joinInvite(id: string, body: JoinMerchantInviteRequest): Promise<MerchantProfileResponse> {
  return authedFetch<MerchantProfileResponse>(`/merchant/invites/${id}/join`, { method: "POST", body });
}

/** "Not me". */
export function declineInvite(id: string): Promise<{ ok: true }> {
  return authedFetch<{ ok: true }>(`/merchant/invites/${id}/decline`, { method: "POST" });
}

/** Where a signed-in number that isn't on a business goes (L4): Join when an invite is waiting for it,
 *  otherwise "Set up your business". An API without Team yet, or a failed read, means the sign-up. */
export async function noBusinessPath(): Promise<"/join" | "/onboarding"> {
  try {
    const { invites } = await listMyInvites();
    return invites.length > 0 ? "/join" : "/onboarding";
  } catch {
    return "/onboarding";
  }
}
