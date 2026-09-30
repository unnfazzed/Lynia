import { type MerchantMemberRole, normalizePhone } from "@lynia/shared";
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

/** The message the owner sends from their own WhatsApp: whose team, and where to sign in with this number. */
export function teamInviteMessage(name: string, businessName: string, signInUrl: string): string {
  return `Hi ${name}, I've added you to ${businessName} on LyniaGo. Sign in with this number to join: ${signInUrl}`;
}

export function teamInviteLink(invitePhone: string, text: string): string {
  return whatsAppLink(invitePhone, text);
}

/** E3's red-wash consequence box. */
export function removeConsequence(name: string): string {
  return `Removing ${name} signs them out now. Bookings they made stay on your record.`;
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

/** The Account avatar's letters (merchant-mobile C4): "Sadza Republic" → "SR"; one word → its first two. */
export function initials(name: string): string {
  const [first = "", second = ""] = name.trim().split(/\s+/).filter(Boolean);
  return (second ? first.charAt(0) + second.charAt(0) : first.slice(0, 2)).toUpperCase();
}

function lastFour(phoneMasked: string): string {
  return phoneMasked.replace(/\D/g, "").slice(-4);
}

/** E2's row line: "•••• 4567". */
export function shortMasked(phoneMasked: string): string {
  return `•••• ${lastFour(phoneMasked)}`;
}

/** E3's number: "+263 •• ••• 2210". */
export function longMasked(phoneMasked: string): string {
  return `+263 •• ••• ${lastFour(phoneMasked)}`;
}

/** E2's invite line: "Invited 2 days ago". */
export function invitedAgo(createdAt: string, now: Date): string {
  const start = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((start(now) - start(new Date(createdAt))) / 86_400_000);
  if (days <= 0) return "Invited today";
  if (days === 1) return "Invited yesterday";
  return `Invited ${days} days ago`;
}
