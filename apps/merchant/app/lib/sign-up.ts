import {
  type BecomeMerchantRequest,
  type LatLng,
  MERCHANT_SHOP_KIND_LABELS,
  type MerchantBusinessType,
  MerchantShopKind,
  normalizePhone,
} from "@lynia/shared";
import { insideServiceArea } from "./geo";

/**
 * "Set up your business" — the self-serve sign-up (merchant web upgrade L1, docs/designs/merchant-web-
 * upgrade.md L1.4). Pure form logic, kept out of the page so every rule is unit-tested: the kinds and
 * their words, what each field needs, and which API refusal belongs to which field.
 */

/** Every kind the API accepts, in the design doc's order and words (L1.4), shared with the admin console. */
export const SHOP_KINDS: readonly { kind: MerchantShopKind; label: string }[] = MerchantShopKind.options.map((kind) => ({
  kind,
  label: MERCHANT_SHOP_KIND_LABELS[kind],
}));

export function shopKindLabel(kind: MerchantShopKind): string {
  return MERCHANT_SHOP_KIND_LABELS[kind] ?? "Shop";
}

export interface SignUpForm {
  businessType: MerchantBusinessType | null;
  shopKind: MerchantShopKind | null;
  ownerName: string;
  name: string;
  point: LatLng;
  /** False until the merchant has placed the pin themselves (a drag, the arrow keys, or "Use my
   *  location"). The Harare CBD starting point is never taken as their address. */
  pinConfirmed: boolean;
  landmark: string;
  contactPhone: string;
  termsAccepted: boolean;
}

export type SignUpField = "ownerName" | "name" | "point" | "landmark" | "contactPhone" | "termsAccepted";
export type SignUpErrors = Partial<Record<SignUpField, string>>;

/** Step 1 is done once the type is picked, plus the kind for a shop. */
export function typeStepComplete(form: Pick<SignUpForm, "businessType" | "shopKind">): boolean {
  return form.businessType === "restaurant" || (form.businessType === "shop" && form.shopKind !== null);
}

export const OUTSIDE_AREA_MESSAGE = "That pin is outside the area LyniaGo covers for now.";

/** Step 2's checks, with the same limits the API's `BecomeMerchantRequest` enforces. */
export function validateDetails(form: SignUpForm): SignUpErrors {
  const errors: SignUpErrors = {};
  const ownerName = form.ownerName.trim();
  const name = form.name.trim();
  const landmark = form.landmark.trim();
  const phone = form.contactPhone.trim();
  if (!ownerName) errors.ownerName = "Enter your name.";
  else if (ownerName.length > 60) errors.ownerName = "Keep your name under 60 letters.";
  if (!name) errors.name = "Enter the business name.";
  else if (name.length > 120) errors.name = "Keep the business name under 120 letters.";
  if (!form.pinConfirmed) errors.point = "Drag the map until the pin sits on your door, or tap “Use my location”.";
  else if (!insideServiceArea(form.point)) errors.point = OUTSIDE_AREA_MESSAGE;
  if (!landmark) errors.landmark = "Tell riders what to look for.";
  else if (landmark.length > 160) errors.landmark = "Keep the landmark under 160 letters.";
  if (phone.length > 20 || !normalizePhone(phone)) errors.contactPhone = "Enter the phone number riders can call, like 0771234567.";
  if (!form.termsAccepted) errors.termsAccepted = "Tick the box to accept the privacy notice.";
  return errors;
}

/** The `POST /merchant/become` body. Only call once `typeStepComplete` and `validateDetails` pass. */
export function toBecomeRequest(form: SignUpForm): BecomeMerchantRequest {
  if (!form.businessType) throw new Error("toBecomeRequest: no business type");
  return {
    ownerName: form.ownerName.trim(),
    name: form.name.trim(),
    businessType: form.businessType,
    ...(form.businessType === "shop" && form.shopKind ? { shopKind: form.shopKind } : {}),
    location: { point: form.point, landmark: form.landmark.trim(), contactPhone: form.contactPhone.trim() },
    termsAccepted: true,
  };
}

/** Which field an API refusal belongs to, so it shows next to that field rather than as a banner. */
export function fieldForReason(reason: string | undefined): SignUpField | null {
  return reason === "outside_service_area" ? "point" : null;
}
