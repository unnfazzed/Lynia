import { type MerchantPreferredRiderResponse, type MerchantRiderStatus, normalizePhone } from "@lynia/shared";
import { whatsAppLink } from "./whatsapp";

/**
 * Your riders' pure rules (merchant web upgrade L3, docs/designs/merchant-web-upgrade.md "L3"): the words
 * for each status, the WhatsApp invite for a number that isn't a LyniaGo rider yet, and the add form.
 */

/** "Become a rider" on the LyniaGo website: where a rider signs up. */
export const RIDER_SIGNUP_URL = "https://lyniago.com/#riders";

/** What the business may know about a number, never why (the API's three statuses). */
export const RIDER_STATUS_LABEL: Record<MerchantRiderStatus, string> = {
  on_lyniago: "On LyniaGo",
  not_on_lyniago: "Not on LyniaGo yet",
  unavailable: "Can't take jobs right now",
};

/** The message the owner sends from their own WhatsApp to a rider who isn't on LyniaGo yet. */
export function riderInviteMessage(label: string, businessName: string): string {
  return `Hi ${label}, it's ${businessName}. We'd like you to deliver for us on LyniaGo. Sign up as a rider with this number: ${RIDER_SIGNUP_URL}`;
}

/** The WhatsApp chat with the rider, the message ready to send. */
export function riderInviteLink(invitePhone: string, text: string): string {
  return whatsAppLink(invitePhone, text);
}

/** "12 deliveries for you · ★ 4.9", once they've worked for the business. */
export function riderTrackRecord(r: Pick<MerchantPreferredRiderResponse, "jobs" | "ratingAvg">): string | null {
  if (r.jobs === 0) return null;
  const jobs = `${r.jobs} deliver${r.jobs === 1 ? "y" : "ies"} for you`;
  return r.ratingAvg == null ? jobs : `${jobs} · ★ ${r.ratingAvg.toFixed(1)}`;
}

export interface AddRiderForm {
  label: string;
  phone: string;
}
export type AddRiderErrors = Partial<Record<keyof AddRiderForm, string>>;

export function validateAddRider(form: AddRiderForm): AddRiderErrors {
  const errors: AddRiderErrors = {};
  const label = form.label.trim();
  if (!label) errors.label = "Give them a name you'll recognise.";
  else if (label.length > 40) errors.label = "Keep it under 40 letters.";
  if (!normalizePhone(form.phone.trim()) || form.phone.trim().length > 20) errors.phone = "Enter the number they sign in with, like 0771234567.";
  return errors;
}
