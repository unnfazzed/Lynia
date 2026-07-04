/**
 * Reason-code taxonomies for every destructive admin action — lifted verbatim from the DS3 kit's
 * `confirmAction({ reasons: [...] })` calls (packages/design/ui_kits/admin/*.html). These drive the
 * required radio in <ConfirmModal> and become the `reasonCode` on the audit-log row.
 *
 * TODO(A-01): once the api-side AuditLog table + reason-code enums land, these should be imported
 * from `@lynia/shared` (a single source shared by api + admin) rather than typed here. For now the
 * kit is the source of truth and the api has no enum to import.
 */
export const REASONS = {
  // orders.html
  orderAdjustFare: [
    "Parcel damaged",
    "Parcel lost",
    "Wrong fare agreed / overcharge",
    "Service failure — late or incomplete",
  ],
  orderCancel: ["Rider unreachable", "Customer asked ops to cancel", "Safety concern", "Suspected fraud"],

  // kyc.html — KYC decline (admin A-02). MIRRORS the api's canonical list in
  // apps/api/src/riders/kyc-decline-reasons.ts (KYC_DECLINE_REASONS). @lynia/shared is off-limits for
  // this change, so the strings are duplicated across the two packages — keep them in sync until the
  // A-01 shared enum lands and both import a single source.
  kycDecline: [
    "ID photo unreadable — retake",
    "Selfie doesn't match the ID",
    "ID expired or not a valid national ID",
    "Bike registration invalid or missing",
    "Suspected fraud or stolen identity",
  ],

  // riders.html
  riderSuspend: [
    "Safety report from a customer",
    "Repeated cancellations after accepting",
    "Suspected fare fraud",
    "Failed re-verification",
  ],
  riderLift: ["Issue resolved with the rider", "Report not substantiated", "Suspension period served"],
  riderBan: ["Confirmed fraud", "Serious safety incident", "Repeat offences after suspension"],

  // customers.html
  customerFlag: [
    "Cancel pattern hurting riders",
    "Rider report — no-show at pickup",
    "Abusive behaviour reported",
    "Suspected fraud",
  ],
  customerClearFlag: ["Behaviour improved", "Reports not substantiated"],
  customerBan: ["Confirmed fraud", "Repeated no-shows after warnings", "Abuse of riders", "Safety incident"],

  // issues.html
  issueRefund: ["Parcel lost — delivery unconfirmed", "Parcel damaged in transit", "Overcharge confirmed"],
  issueStrike: ["Closed hand-off without the code", "Unconfirmed delivery — parcel missing", "Overcharged the customer"],
  issueClose: ["Resolved between the parties", "Report not substantiated", "Duplicate issue"],

  // cash.html — settlement method (not a "reason" but the same required-radio pattern)
  cashSettle: ["Cash at agent", "EcoCash transfer", "Netted against refund owed to their customer"],
} as const;
