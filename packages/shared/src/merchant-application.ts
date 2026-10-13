/**
 * Admin console v2 §5 (docs/plans/2026-10-13-admin-console-v2.md): a merchant's application, from sign-up
 * to live. The API stores it as `Merchant.applicationStatus` (Prisma enum `MerchantApplicationStatus`, kept
 * in lockstep with this list by a spec); the admin console reads the labels and the SLA from here.
 *
 *   applied → reviewing → approved → live      side states: rejected, suspended (live ↔ suspended)
 *
 * `pilotEnabled` stays the one switch the customer paths read: it is true exactly while the status is `live`.
 */
export const MERCHANT_APPLICATION_STATUSES = ["applied", "reviewing", "approved", "live", "rejected", "suspended"] as const;
export type MerchantApplicationStatus = (typeof MERCHANT_APPLICATION_STATUSES)[number];

export const MERCHANT_APPLICATION_STATUS_LABELS: Readonly<Record<MerchantApplicationStatus, string>> = {
  applied: "Applied",
  reviewing: "In review",
  approved: "Approved",
  live: "Live",
  rejected: "Rejected",
  suspended: "Suspended",
};

/**
 * Why an application was turned down. The code is stored on the merchant and the label is written for the
 * merchant to read (the merchant app can show it), so it is plain and says what to do.
 */
export const MERCHANT_REJECT_REASONS = [
  "unreachable",
  "outside_area",
  "not_a_business",
  "menu_incomplete",
  "licence_missing",
  "duplicate",
  "other",
] as const;
export type MerchantRejectReason = (typeof MERCHANT_REJECT_REASONS)[number];

export const MERCHANT_REJECT_REASON_LABELS: Readonly<Record<MerchantRejectReason, string>> = {
  unreachable: "We couldn't reach you on your contact number.",
  outside_area: "Your business is outside the area LyniaGo covers for now.",
  not_a_business: "We couldn't confirm the business is trading.",
  menu_incomplete: "Add photos and prices to your menu first.",
  licence_missing: "We need a valid pharmacy licence and a named pharmacist.",
  duplicate: "This business is already on LyniaGo.",
  other: "Message LyniaGo on WhatsApp for details.",
};

/** The application queue's SLA: amber after 24h waiting, red after 48h. */
export const MERCHANT_APPLICATION_SLA = { amberMs: 24 * 60 * 60 * 1000, redMs: 48 * 60 * 60 * 1000 } as const;

/** The statuses that are waiting on ops (the SLA clock runs). */
export const MERCHANT_APPLICATION_WAITING: readonly MerchantApplicationStatus[] = ["applied", "reviewing"];

export type MerchantApplicationSla = "ok" | "amber" | "red";

export function merchantApplicationSla(ageMs: number): MerchantApplicationSla {
  if (ageMs >= MERCHANT_APPLICATION_SLA.redMs) return "red";
  if (ageMs >= MERCHANT_APPLICATION_SLA.amberMs) return "amber";
  return "ok";
}
