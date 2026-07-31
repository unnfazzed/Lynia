import { KYC_DECLINE_REASON_LABELS, type KycDeclineReason } from "@lynia/shared";

/**
 * Reason-code taxonomies for every destructive admin action — lifted verbatim from the DS3 kit's
 * `confirmAction({ reasons: [...] })` calls (packages/design/ui_kits/admin/*.html). These drive the
 * required radio in <ConfirmModal> and become the `reasonCode` on the audit-log row.
 *
 * TODO(A-01): once the api-side AuditLog table + reason-code enums land, these should be imported
 * from `@lynia/shared` (a single source shared by api + admin) rather than typed here. For now the
 * kit is the source of truth and the api has no enum to import — EXCEPT the KYC decline reasons,
 * which now come from the canonical `KYC_DECLINE_REASON_LABELS` in `@lynia/shared` (see below).
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
  // KB-POD-DISPUTE Phase B — why ops is overturning an `undelivered` outcome to `delivered`.
  orderAdjudicateDelivered: [
    "Proof photo + GPS confirm the drop; recipient withheld the code",
    "Recipient confirmed receipt on a follow-up call",
    "Evidence shows delivery; code entry failed for a technical reason",
  ],

  // kyc.html — KYC decline (admin A-02). Canonical source: `KYC_DECLINE_REASON_LABELS` in
  // `@lynia/shared` — a single list shared by the api validation, this admin picker, and the rider-app
  // decline copy. UNLIKE the other taxonomies, the stored reasonCode here is the machine KEY (e.g.
  // `id_expired`), NOT the label — the rider app reads `rider.kycDeclineReason` and maps the key back
  // through `KYC_DECLINE_REASON_LABELS` to show the copy, so a label string wouldn't resolve. The
  // picker therefore submits `{value: key, label}` pairs.
  kycDecline: (Object.entries(KYC_DECLINE_REASON_LABELS) as [KycDeclineReason, string][]).map(
    ([value, label]) => ({ value, label }),
  ),

  // riders.html
  riderSuspend: [
    "Safety report from a customer",
    "Repeated cancellations after accepting",
    "Suspected fare fraud",
    "Failed re-verification",
  ],
  riderLift: ["Issue resolved with the rider", "Report not substantiated", "Suspension period served"],
  riderBan: ["Confirmed fraud", "Serious safety incident", "Repeat offences after suspension"],
  riderClearHold: ["Reliability recovered", "Hold applied in error", "Manual override — ops discretion"],

  // customers.html
  customerFlag: [
    "Cancel pattern hurting riders",
    "Rider report — no-show at pickup",
    "Abusive behaviour reported",
    "Suspected fraud",
  ],
  customerClearFlag: ["Behaviour improved", "Reports not substantiated"],
  customerBan: ["Confirmed fraud", "Repeated no-shows after warnings", "Abuse of riders", "Safety incident"],
  // S·2 customer hold — a reversible pause on broadcasting while ops reviews recent activity.
  customerHold: ["Cancel pattern hurting riders", "Suspected fraud — under review", "Payment dispute open", "Awaiting identity check"],
  customerLift: ["Review complete — no issue", "Dispute resolved", "Customer contacted and cleared"],

  // issues.html
  issueRefund: ["Parcel lost — delivery unconfirmed", "Parcel damaged in transit", "Overcharge confirmed"],
  issueStrike: ["Closed hand-off without the code", "Unconfirmed delivery — parcel missing", "Overcharged the customer"],
  issueClose: ["Resolved between the parties", "Report not substantiated", "Duplicate issue"],

  // cash.html — settlement method (not a "reason" but the same required-radio pattern)
  cashSettle: ["Cash at agent", "EcoCash transfer", "Netted against refund owed to their customer"],

  // X1 — merchant vertical admin alignment
  handshakeResolve: [
    "Called both parties — the amount matches, rider was just slow to confirm",
    "Called both parties — resolved the mismatch, releasing the rider",
    "Rider unreachable — releasing on the customer's confirm alone after follow-up",
  ],
  cashBanLift: ["Customer contacted and cleared", "Payment issue resolved", "Ban applied in error"],
} as const;
