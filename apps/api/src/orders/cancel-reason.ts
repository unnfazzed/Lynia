/**
 * Customer-safe cancel-reason mapping (roadmap 3.4 — extracted from orders.service.ts).
 *
 * Fix 6: ops-internal cancel-reason strings that must NOT be shown verbatim to the customer/rider. The
 * admin cancel taxonomy (apps/admin/app/lib/reasons.ts `orderCancel`) includes trust & safety language
 * — "Suspected fraud", "Safety concern" — that reads as an accusation with no context or next step when
 * rendered raw on a party's cancelled terminal. Map those to calm, actionable copy at the snapshot
 * boundary. Reasons already safe to show ("Rider unreachable", "Customer asked ops to cancel") and any
 * free-text party-initiated reason are left untouched (unknown ⇒ pass through). The RAW reason stays
 * intact everywhere ops sees it (admin views + the audit trail) — only the customer/rider view is remapped.
 */
export const CUSTOMER_SAFE_CANCEL_MESSAGE = "Cancelled by the LyniaGo team — contact support if you have questions.";
export const OPS_INTERNAL_CANCEL_REASONS = new Set<string>(["Suspected fraud", "Safety concern"]);

/** Remap an ops-internal cancel reason to calm customer-facing copy; pass anything else (incl. null) through. */
export function customerSafeCancelReason(raw: string | null): string | null {
  if (raw == null) return null;
  return OPS_INTERNAL_CANCEL_REASONS.has(raw) ? CUSTOMER_SAFE_CANCEL_MESSAGE : raw;
}
