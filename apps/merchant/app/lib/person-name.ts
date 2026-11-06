/**
 * The person's own name on the merchant sign-up (A4) and Join (A5): First name · Surname, both required —
 * the same pair the customer and biker sign-ups ask for (customer C5, ledger D-124). The team keeps one
 * line (`displayName`, at most 60 letters), so the two parts are checked against that too.
 */

export interface PersonName {
  firstName: string;
  lastName: string;
}

export type PersonNameErrors = Partial<Record<keyof PersonName, string>>;

/** The team's one-line name holds at most this many letters (`BecomeMerchantRequest.ownerName`, `JoinMerchantInviteRequest.name`). */
export const FULL_NAME_MAX = 60;

export const EMPTY_PERSON_NAME: PersonName = { firstName: "", lastName: "" };

/** "Tendai" + "Moyo" → "Tendai Moyo", each part trimmed. */
export function joinPersonName(name: PersonName): string {
  return `${name.firstName.trim()} ${name.lastName.trim()}`.trim();
}

export function validatePersonName(name: PersonName): PersonNameErrors {
  const errors: PersonNameErrors = {};
  if (!name.firstName.trim()) errors.firstName = "Enter your first name.";
  if (!name.lastName.trim()) errors.lastName = "Enter your surname.";
  if (!errors.firstName && !errors.lastName && joinPersonName(name).length > FULL_NAME_MAX) {
    errors.lastName = `Keep your name under ${FULL_NAME_MAX} letters.`;
  }
  return errors;
}

/** The account's own name, trimmed — what both screens start from (never the name an owner typed on an invite). */
export function accountPersonName(me: { firstName?: string | null; lastName?: string | null } | null | undefined): PersonName {
  return { firstName: (me?.firstName ?? "").trim(), lastName: (me?.lastName ?? "").trim() };
}
