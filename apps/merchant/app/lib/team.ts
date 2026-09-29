import { type MerchantBusinessType, type MerchantMemberRole, normalizePhone } from "@lynia/shared";
import { whatsAppLink } from "./whatsapp";

/**
 * Team's pure rules (merchant web upgrade L4, docs/designs/merchant-web-upgrade.md "L4 — Team"): the role
 * words, the owner's WhatsApp invite, the add form, and what each role may do. The permission table itself
 * is enforced by the API; these only decide what the web offers.
 */

export const ROLE_LABEL: Record<MerchantMemberRole, string> = { owner: "Owner", staff: "Staff" };

/** The first word of a name, as the top bar and the invite line say it. */
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? "";
}

/** "Tendai · Staff": who is signed in, in the top bar. */
export function signedInLabel(name: string | undefined, role: MerchantMemberRole): string {
  const first = name ? firstName(name) : "";
  return first ? `${first} · ${ROLE_LABEL[role]}` : ROLE_LABEL[role];
}

/** What Staff do, in the Team page's opening line (the permission table's Staff column). */
export function staffCanLine(businessType: MerchantBusinessType): string {
  return businessType === "shop"
    ? "Everyone signs in with their own phone. Staff book riders and mark items out of stock. Only you change prices, see money or add people."
    : "Everyone signs in with their own phone. Staff take orders, book riders and mark dishes out of stock. Only you change prices, see money or add people.";
}

/** The message the owner sends from their own WhatsApp: whose team, and where to sign in with this number. */
export function teamInviteMessage(name: string, businessName: string, signInUrl: string): string {
  return `Hi ${name}, I've added you to ${businessName} on LyniaGo. Sign in with this number to join: ${signInUrl}`;
}

export function teamInviteLink(invitePhone: string, text: string): string {
  return whatsAppLink(invitePhone, text);
}

/** The Team page's warning before a removal (design doc "Shared devices"). */
export function removeWarning(name: string): string {
  return `If ${name} is signed in on the counter tablet, sign it in again with someone else.`;
}

export interface InviteForm {
  name: string;
  phone: string;
}
export type InviteErrors = Partial<Record<keyof InviteForm, string>>;

export function validateInvite(form: InviteForm): InviteErrors {
  const errors: InviteErrors = {};
  const name = form.name.trim();
  if (!name) errors.name = "Give them a name you'll recognise.";
  else if (name.length > 60) errors.name = "Keep it under 60 letters.";
  if (!normalizePhone(form.phone.trim()) || form.phone.trim().length > 20) errors.phone = "Enter their phone number, like 0771234567.";
  return errors;
}

/** Join asks for the person's own name, as they want the team to see it. */
export function validateJoinName(name: string): string | null {
  const n = name.trim();
  if (!n) return "Enter your name.";
  if (n.length > 60) return "Keep it under 60 letters.";
  return null;
}
