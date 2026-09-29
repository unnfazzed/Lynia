import type { MerchantProfileResponse } from "@lynia/shared";

/** A complete `GET /merchant/me` body for tests — a dormant restaurant owned by the caller, unless a test
 *  overrides fields (merchant web upgrade L1 added `businessType`, `shopKind` and `myRole`). */
export function merchantProfile(overrides: Partial<MerchantProfileResponse> = {}): MerchantProfileResponse {
  return {
    id: "m1",
    name: "Test Kitchen",
    ownerPhoneMasked: "+263•••••4567",
    description: null,
    coverPhotoUrl: null,
    logoUrl: null,
    cuisineTags: [],
    priceLevel: null,
    hours: null,
    cashRule: "collect_and_return",
    busy: false,
    pilotEnabled: false,
    businessType: "restaurant",
    shopKind: null,
    myRole: "owner",
    ...overrides,
  };
}
