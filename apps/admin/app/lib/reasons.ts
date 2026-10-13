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
  orderCancel: ["Biker unreachable", "Customer asked ops to cancel", "Safety concern", "Suspected fraud"],
  // Auto-accept: "Can't make it" on the Orders to confirm list — why the kitchen can't take the order.
  kitchenCancel: [
    "The restaurant can't make it",
    "The restaurant is closed",
    "Items not available and the customer didn't agree a change",
    "Couldn't reach the restaurant",
  ],
  // Auto-accept: why ops changed how a restaurant takes orders.
  merchantOrderSettings: [
    "The restaurant takes orders by phone",
    "The restaurant now uses the merchant app",
    "The restaurant agreed to show its number",
    "The restaurant asked to hide its number",
    // D-71: free delivery paid by the business.
    "The business asked to pay for delivery",
    "The business asked to stop paying for delivery",
  ],
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
  riderLift: ["Issue resolved with the biker", "Report not substantiated", "Suspension period served"],
  riderBan: ["Confirmed fraud", "Serious safety incident", "Repeat offences after suspension"],
  riderClearHold: ["Reliability recovered", "Hold applied in error", "Manual override — ops discretion"],
  // First Run v2 E4 (D-82): how ops checked a plate the rider saved from Bike & documents.
  riderPlateVerify: ["Matches the bike photo", "Checked in person", "Checked with the biker on a call"],

  // customers.html
  customerFlag: [
    "Cancel pattern hurting bikers",
    "Biker report — no-show at pickup",
    "Abusive behaviour reported",
    "Suspected fraud",
  ],
  customerClearFlag: ["Behaviour improved", "Reports not substantiated"],
  customerBan: ["Confirmed fraud", "Repeated no-shows after warnings", "Abuse of bikers", "Safety incident"],
  // S·2 customer hold — a reversible pause on broadcasting while ops reviews recent activity.
  customerHold: ["Cancel pattern hurting bikers", "Suspected fraud — under review", "Payment dispute open", "Awaiting identity check"],
  customerLift: ["Review complete — no issue", "Dispute resolved", "Customer contacted and cleared"],

  // issues.html
  issueRefund: ["Parcel lost — delivery unconfirmed", "Parcel damaged in transit", "Overcharge confirmed"],
  issueStrike: ["Closed hand-off without the code", "Unconfirmed delivery — parcel missing", "Overcharged the customer"],
  issueClose: ["Resolved between the parties", "Report not substantiated", "Duplicate issue"],

  // cash.html — settlement method (not a "reason" but the same required-radio pattern)
  cashSettle: ["Cash at agent", "EcoCash transfer", "Netted against refund owed to their customer"],

  // cash.html — bulk seed-credit (flip-day tooling). Verbatim from the kit's `seedConfirm()` reasons.
  walletSeedCampaign: [
    "Pre-flip grace credit",
    "Rehearsal / test campaign",
    "Corridor top-up before rate change",
  ],

  // riders.html — the `commission_freeze` wallet hold (design OV-4A). Verbatim from the kit's
  // `freezeWallet()` / `clearFreeze()` reasons.
  walletFreeze: [
    "Suspected top-up fraud",
    "Disputed EcoCash reference",
    "Under investigation",
    "Chargeback / reversed deposit",
  ],
  walletClearFreeze: ["Investigation closed — no issue", "Dispute resolved", "Deposit reference confirmed"],

  // X1 — merchant vertical admin alignment
  handshakeResolve: [
    "Called both parties — the amount matches, biker was just slow to confirm",
    "Called both parties — resolved the mismatch, releasing the biker",
    "Biker unreachable — releasing on the customer's confirm alone after follow-up",
  ],
  // D3 (2026-10-07, MJ-RH1): closing a merchant's non-return report after support followed it up.
  debtWriteOff: [
    "Biker confirmed they kept the goods or the cash",
    "Biker unreachable after follow-up",
    "Goods spoiled or lost on the way back",
  ],
  cashBanLift: ["Customer contacted and cleared", "Payment issue resolved", "Ban applied in error"],
  // Merchant web upgrade L1: the go-live switch (docs/MERCHANT-GO-LIVE-RUNBOOK.md).
  merchantGoLive: ["Ops call done — every go-live check passed"],
  // Admin console v2 §5: the merchant application. A call's reason is its outcome (only `reached` ticks
  // the checklist); reject's are the merchant-readable codes (MERCHANT_REJECT_REASON_LABELS).
  merchantCall: [
    { value: "reached", label: "Spoke to the business" },
    { value: "no_answer", label: "No answer" },
  ],
  merchantReview: ["Called — starting the checks", "Reopening after they fixed it"],
  merchantApprove: ["Every check passed"],
  merchantSuspend: ["The owner asked to pause", "Quality or safety concern", "Missed too many orders", "Closed or no longer trading"],
  merchantResume: ["The owner is ready again", "The concern is resolved"],
  merchantLicenceVerify: ["Licence seen — number and pharmacist match"],
  // Merchant web upgrade L4: support hands a business over after an identity check (runbook §8).
  merchantOwnerTransfer: ["Sold or handed over — both people confirmed", "The owner lost their number — ID checked", "Family takeover — ID checked"],
} as const;

/** A stored KYC decline key (e.g. `face_mismatch`) as the reviewer reads it; an unknown key shows as-is. */
export function kycDeclineLabel(code: string): string {
  return (KYC_DECLINE_REASON_LABELS as Record<string, string>)[code] ?? code;
}
