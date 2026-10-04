import { type BecomeMerchantRequest, type LatLng, type MerchantBusinessType, normalizePhone } from "@lynia/shared";
import { insideServiceArea } from "./geo";

/**
 * "What do you sell?" and "Your business" — the self-serve sign-up (merchant-mobile A3/A4, ledger
 * D-48). Pure form logic, kept out of the page so every rule is unit-tested.
 *
 * The redesign drops the map pin, the landmark, the contact-phone field and the privacy tick: the
 * location comes from the phone's GPS or an address search, the contact phone is the number the person
 * signed in with, and the privacy notice was accepted on the sign-in screen.
 */

export interface SignUpLocation {
  point: LatLng;
  /** "5th Street, Mbare" — from the search result or the reverse-geocoded fix. Empty when neither
   *  could name the place (no key, or Google had nothing); the card then says "Your current location". */
  address: string;
  source: "gps" | "search";
}

/** Step 1's three cards. A pharmacy is a shop of kind `pharmacy` (ledger D-76). */
export type SellChoice = MerchantBusinessType | "pharmacy";

export interface SignUpForm {
  businessType: MerchantBusinessType | null;
  /** True when "Pharmacy" was picked: a shop whose kind is `pharmacy`, listed under Pharmacy. */
  pharmacy?: boolean;
  ownerName: string;
  name: string;
  location: SignUpLocation | null;
  /** The signed-in number, from the person's account. */
  contactPhone: string;
}

export type SignUpField = "ownerName" | "name" | "location";
export type SignUpErrors = Partial<Record<SignUpField, string>>;

export const OUTSIDE_AREA_MESSAGE = "That place is outside the area LyniaGo covers for now.";

/** Which card is ticked. */
export function sellChoice(form: SignUpForm): SellChoice | null {
  if (form.businessType === "shop" && form.pharmacy) return "pharmacy";
  return form.businessType;
}

/** Picking a card sets the type and, for Pharmacy, the kind. */
export function pickSellChoice(form: SignUpForm, choice: SellChoice): SignUpForm {
  return choice === "pharmacy" ? { ...form, businessType: "shop", pharmacy: true } : { ...form, businessType: choice, pharmacy: false };
}

/** Step 2's checks, with the same limits the API's `BecomeMerchantRequest` enforces. */
export function validateDetails(form: SignUpForm): SignUpErrors {
  const errors: SignUpErrors = {};
  const ownerName = form.ownerName.trim();
  const name = form.name.trim();
  if (!name) errors.name = "Enter the business name.";
  else if (name.length > 120) errors.name = "Keep the business name under 120 letters.";
  if (!ownerName) errors.ownerName = "Enter your name.";
  else if (ownerName.length > 60) errors.ownerName = "Keep your name under 60 letters.";
  if (!form.location) errors.location = "Use your current location, or search for your street.";
  else if (!insideServiceArea(form.location.point)) errors.location = OUTSIDE_AREA_MESSAGE;
  return errors;
}

/** The `POST /merchant/become` body. Only call once a type is picked and `validateDetails` passes. */
export function toBecomeRequest(form: SignUpForm): BecomeMerchantRequest {
  if (!form.businessType) throw new Error("toBecomeRequest: no business type");
  if (!form.location) throw new Error("toBecomeRequest: no location");
  const address = form.location.address.trim();
  return {
    ownerName: form.ownerName.trim(),
    name: form.name.trim(),
    businessType: form.businessType,
    ...(form.businessType === "shop" && form.pharmacy ? { shopKind: "pharmacy" as const } : {}),
    location: {
      point: form.location.point,
      ...(address ? { address: address.slice(0, 200) } : {}),
      contactPhone: normalizePhone(form.contactPhone) ?? form.contactPhone,
    },
    termsAccepted: true,
  };
}

/** Which field an API refusal belongs to, so it shows next to that field rather than as a banner. */
export function fieldForReason(reason: string | undefined): SignUpField | null {
  return reason === "outside_service_area" ? "location" : null;
}
