import { type MerchantPreferredRiderResponse, normalizePhone } from "@lynia/shared";
import { whatsAppLink } from "./whatsapp";

/**
 * Your riders' pure rules (merchant web upgrade L3, docs/designs/merchant-web-upgrade.md "L3"): the words
 * for each status, the WhatsApp invite for a number that isn't a LyniaGo rider yet, and the add form.
 */

/** "Become a rider" on the LyniaGo website: where a rider signs up. */
export const RIDER_SIGNUP_URL = "https://lyniago.com/#riders";

/** E4's pill for a rider: Online / Offline for one who can take jobs, Paused for one who can't right now,
 *  none for a number that isn't a LyniaGo rider yet (its line says so). What, never why. */
export function riderPill(r: Pick<MerchantPreferredRiderResponse, "status" | "online">): { label: string; tone: "online" | "offline" | "paused" } | null {
  if (r.status === "unavailable") return { label: "Paused", tone: "paused" };
  if (r.status === "not_on_lyniago") return null;
  return r.online ? { label: "Online", tone: "online" } : { label: "Offline", tone: "offline" };
}

/** The message the owner sends from their own WhatsApp to a rider who isn't on LyniaGo yet. */
export function riderInviteMessage(label: string, businessName: string): string {
  return `Hi ${label}, it's ${businessName}. We'd like you to deliver for us on LyniaGo. Sign up as a rider with this number: ${RIDER_SIGNUP_URL}`;
}

/** The WhatsApp chat with the rider, the message ready to send. */
export function riderInviteLink(invitePhone: string, text: string): string {
  return whatsAppLink(invitePhone, text);
}

/** E4's line: "12 trips for you · ★ 4.9", "No trips yet", "Paused by LyniaGo". A number that isn't a rider
 *  yet reads "Not on LyniaGo" and gets the sign-up link beside it. */
export function riderLine(r: Pick<MerchantPreferredRiderResponse, "status" | "jobs" | "ratingAvg">): string {
  if (r.status === "not_on_lyniago") return "Not on LyniaGo";
  if (r.status === "unavailable") return "Paused by LyniaGo";
  if (r.jobs === 0) return "No trips yet";
  const trips = `${r.jobs} trip${r.jobs === 1 ? "" : "s"} for you`;
  return r.ratingAvg == null ? trips : `${trips} · ★ ${r.ratingAvg.toFixed(1)}`;
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
