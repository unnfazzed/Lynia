import { type CreateMerchantBranchRequest, normalizePhone } from "@lynia/shared";
import type { SignUpLocation } from "./sign-up";

/**
 * C7 · Add a branch → `POST /merchant/branches` (handoff branches/README.md §4). The location travels as
 * A4's does: the point, the address line when there is one, and the owner's sign-in number as the
 * branch's contact (no phone field, the same rule as A4).
 */
export function toBranchRequest(form: { name: string; location: SignUpLocation; copyMenu: boolean; contactPhone: string }): CreateMerchantBranchRequest {
  const address = form.location.address.trim();
  return {
    name: form.name.trim(),
    location: {
      point: form.location.point,
      ...(address ? { address: address.slice(0, 200) } : {}),
      contactPhone: normalizePhone(form.contactPhone) ?? form.contactPhone,
    },
    copyMenu: form.copyMenu,
  };
}
