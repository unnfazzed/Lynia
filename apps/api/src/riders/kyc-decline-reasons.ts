/**
 * KYC decline reason codes (admin A-02). Lifted from the DS3 kit's KYC review screen
 * (packages/design/ui_kits/admin/kyc.html `decline()` reasons). The admin console shows these as the
 * required radio when an ops reviewer declines a rider; the chosen code is written back via
 * `POST /admin/riders/:id/kyc` and stored on `riders.kyc_decline_reason` (surfaced to the rider app
 * so they know what to fix, and recorded on the audit-log row).
 *
 * TODO(A-01): these strings are DUPLICATED in the admin console (`apps/admin/app/lib/reasons.ts` →
 * `kycDecline`). Once the api-side AuditLog table + shared reason-code enums land, both should import
 * a single source from `@lynia/shared`. `@lynia/shared` is off-limits for this change, so the list is
 * defined here (api, the compliance source of truth) and mirrored in the admin — keep them in sync.
 */
export const KYC_DECLINE_REASONS = [
  "ID photo unreadable — retake",
  "Selfie doesn't match the ID",
  "ID expired or not a valid national ID",
  "Bike registration invalid or missing",
  "Suspected fraud or stolen identity",
] as const;

export type KycDeclineReason = (typeof KYC_DECLINE_REASONS)[number];
