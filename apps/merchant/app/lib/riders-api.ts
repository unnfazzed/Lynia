import type { AddMerchantRiderRequest, MerchantPreferredRiderResponse, MerchantRidersResponse } from "@lynia/shared";
import { authedFetch } from "./api-client";

/**
 * Your riders (merchant web upgrade L3): `/merchant/riders`. The whole team reads the list; only the owner
 * adds or removes (a staff member gets 403 `owner_only`).
 */

export function listRiders(): Promise<MerchantRidersResponse> {
  return authedFetch<MerchantRidersResponse>("/merchant/riders");
}

export function addRider(body: AddMerchantRiderRequest): Promise<MerchantPreferredRiderResponse> {
  return authedFetch<MerchantPreferredRiderResponse>("/merchant/riders", { method: "POST", body });
}

export function removeRider(id: string): Promise<{ ok: true }> {
  return authedFetch<{ ok: true }>(`/merchant/riders/${id}`, { method: "DELETE" });
}
