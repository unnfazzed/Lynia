import { FleetJoinRefusal, SELECT_OFFER_CONFLICT_REASONS } from "./contracts";

/**
 * R-2 (QA 2026-10-20): every API error body is `{ statusCode, reason, message }` (validation errors keep their
 * `formErrors` / `fieldErrors` too). Apps branch on `reason`; `message` is what a person reads. This is the registry of
 * every reason the API sends, so a new one is a deliberate, reviewed addition (`api-error-reasons.spec.ts` in apps/api
 * fails on an unregistered code).
 *
 * The change is additive: no status code moved, and no reason string an app already reads was renamed. A body that
 * had no reason now carries the status's default (below). Apps read the first of `code`, `reason`, `error`
 * (apps/mobile/src/api/client.ts), so nothing may ever send a `code` that disagrees with `reason`.
 */

/** The reason a body gets when its thrower named none. */
export const DEFAULT_ERROR_REASONS = {
  400: "bad_request",
  401: "unauthorized",
  403: "forbidden",
  404: "not_found",
  405: "method_not_allowed",
  409: "conflict",
  410: "gone",
  413: "payload_too_large",
  415: "unsupported_media_type",
  422: "unprocessable",
  429: "rate_limited",
  500: "internal_error",
  502: "bad_gateway",
  503: "unavailable",
} as const;

/** The default reason for an HTTP status (by class when the status has no entry). */
export function defaultErrorReason(status: number): string {
  const known = (DEFAULT_ERROR_REASONS as Record<number, string>)[status];
  if (known) return known;
  return status >= 500 ? "internal_error" : "bad_request";
}

/** Domain reasons thrown by name across the API. */
export const DOMAIN_ERROR_REASONS = [
  "account_banned", "account_on_hold", "account_restricted", "account_suspended", "admin_sign_in_refused",
  "already_biker", "already_member", "already_on_team", "already_owner", "already_paid", "already_rider",
  "already_taken", "already_verified", "bad_amount", "bad_cash_on_delivery", "bad_phone", "bad_reject_reason",
  "bad_week", "balance_changed", "branch_limit", "branch_name_taken", "business_on_hold", "business_owner",
  "cash_banned", "category_window", "changed", "checklist_incomplete", "code_reissue_limit", "code_required",
  "commission_low_balance", "cooldown_active", "country_not_served", "fleet_biker", "fleet_disabled", "fleet_off",
  "fleet_paused", "handed_to_required", "handover_link_invalid", "handover_link_unavailable", "id_in_use",
  "idempotency_key_reused", "invalid_request", "invite_expired", "kyc", "kyc_daily_limit", "kyc_in_progress",
  "kyc_in_review", "kyc_locked", "kyc_mint_limit", "licence_incomplete", "licence_not_verified", "line_removed",
  "location_required", "member_elsewhere", "merchant_order_fare", "name_required", "no_account",
  "no_cash_on_delivery", "no_items_left", "no_licence", "no_live_dishes", "no_location", "no_nudge",
  "no_prescription", "no_selfie_recheck", "not_a_biker", "not_a_member", "not_a_merchant", "not_a_pharmacy",
  "not_approved", "not_assigned", "not_at_handover", "not_at_restaurant", "not_auto_accepted", "not_cancellable",
  "not_changeable", "not_checkable", "not_delivered", "not_editable", "not_in_fleet", "not_pharmacist",
  "not_picked_up", "not_scheduled", "not_verified", "not_waiting", "not_your_link", "nothing_to_confirm",
  "offer_gone", "offline", "on_hold", "one_active_ride", "otp_expired", "otp_invalid", "otp_locked", "out_of_area",
  "outside_service_area", "own_member", "own_order", "owner_only", "owner_stays", "phone_country",
  "pickup_check_required", "pickup_code_reissue_limit", "prep_changed", "prep_too_long", "prescription_checked",
  "prescription_not_needed", "prescription_pending", "prescription_required", "reason_required",
  "reserved_item_text", "restaurant_closed", "review_stale", "ride_not_found", "role_not_allowed", "round_closed",
  "round_expired", "rx_original_not_seen", "rx_pharmacy_only", "rx_swap_needs_pharmacist",
  "rx_swap_needs_prescription", "rx_unavailable", "scheduled_not_started", "scheduled_started",
  "selfie_recheck_unavailable", "slot_full", "slot_unavailable", "standing_changed", "still_live",
  "substitution_open", "swaps_off", "too_late", "too_many_invites", "topup_rail_unavailable", "trip_in_progress",
  "unreadable_link", "upload_missing", "uploads_unavailable", "verified_id_in_use", "wallet_not_accepted",
  "whatsapp_unavailable", "wrong_state",
] as const;

/** Every reason an API error body can carry. */
export const API_ERROR_REASONS: readonly string[] = [
  ...Object.values(DEFAULT_ERROR_REASONS),
  ...DOMAIN_ERROR_REASONS,
  ...SELECT_OFFER_CONFLICT_REASONS,
  ...FleetJoinRefusal.options,
];

export type ApiErrorReason =
  | (typeof DEFAULT_ERROR_REASONS)[keyof typeof DEFAULT_ERROR_REASONS]
  | (typeof DOMAIN_ERROR_REASONS)[number]
  | (typeof SELECT_OFFER_CONFLICT_REASONS)[number]
  | FleetJoinRefusal;

/** The body every API error sends. */
export interface ApiErrorBody {
  statusCode: number;
  reason: string;
  message: string | string[];
  [extra: string]: unknown;
}
