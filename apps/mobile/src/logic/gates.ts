import { KYC_DECLINE_REASON_LABELS, type KycDeclineReason, SERVICE_CORRIDOR, haversineKm, type LatLng } from "@lynia/shared";

/**
 * Pure decision helpers for the rider online-gate and the customer service-corridor gate. Both read a
 * reason off an API error whose exact body shape is still being finalised by the RULES API agent, so
 * everything here is defensive: prefer a machine-readable `code`, fall back to sniffing the human
 * `message`, and never throw on an unexpected shape. Extracted from the screens so the mapping (which
 * carries real product semantics) is unit-testable without rendering.
 */

/** A minimal read of an ApiError — just the fields the gates inspect. */
export interface GateError {
  status?: number;
  /** Machine-readable reason code lifted off the error body (ApiError.code). */
  code?: string | null;
  /** The friendly message (ApiError.message) — the sniff fallback. */
  message?: string | null;
}

/**
 * The reasons the rules API can refuse a rider going online (the online-gate). Mirrors the documented
 * contract: `kyc` (not verified), `suspended` (admin/settlement pause, recoverable via support),
 * `banned` (permanent admin removal — a harder state than suspended), `on_hold` (reliability auto-hold,
 * Q2), `cooldown` (recent cancel cool-off), `out_of_area` (rider is outside the launch service corridor,
 * Q1 — recoverable by moving back into the coverage area).
 */
export type OnlineGateReason =
  | "kyc"
  | "kyc_expired"
  | "suspended"
  | "banned"
  | "on_hold"
  | "cooldown"
  | "out_of_area"
  | "commission_low_balance";

const ONLINE_GATE_REASONS: readonly OnlineGateReason[] = [
  "kyc",
  "kyc_expired",
  "suspended",
  "banned",
  "on_hold",
  "cooldown",
  "out_of_area",
  "commission_low_balance",
];

function isOnlineGateReason(v: string): v is OnlineGateReason {
  return (ONLINE_GATE_REASONS as readonly string[]).includes(v);
}

/**
 * Map an online-gate refusal to a known reason, or null (caller shows a generic error). Reads the
 * machine code first; if the RULES API hasn't tagged one yet, sniffs the friendly message for a known
 * token so a refusal still lands on the right state rather than a bare error.
 * // TODO(rules-api): pin to the real error `code` once the online-gate contract lands and drop the
 * // message sniff — it's a best-effort bridge while the exact shape is uncertain.
 */
export function onlineGateReason(err: GateError | null | undefined): OnlineGateReason | null {
  if (!err) return null;
  const code = (err.code ?? "").toLowerCase();
  if (isOnlineGateReason(code)) return code;
  // Out-of-area (Q1): the corridor refusal can carry a corridor-specific code/message (e.g.
  // `outside_service_area`) that isn't the literal `out_of_area` token — reuse the corridor sniff so it
  // still lands on the out-of-area gate rather than a bare error.
  if (isOutOfServiceArea(err)) return "out_of_area";
  const m = (err.message ?? "").toLowerCase();
  // Commission floor block: the server tags `commission_low_balance`; the message sniff ("top up") is a
  // best-effort bridge for an older binary that only sees the friendly string.
  if (m.includes("top up") || m.includes("commission balance")) return "commission_low_balance";
  if (m.includes("on hold") || m.includes("on-hold") || m.includes("on_hold")) return "on_hold";
  // Check banned before suspended: they're distinct states and a message could mention both.
  if (m.includes("banned") || m.includes("ban ")) return "banned";
  if (m.includes("suspend")) return "suspended";
  if (m.includes("cooldown") || m.includes("cool-down") || m.includes("cool down")) return "cooldown";
  // Expired must be checked before the generic kyc sniff — the expired copy says "re-verify", which
  // would otherwise match `verif` and collapse a lapsed ID into the first-time "verify your ID" state.
  if (m.includes("expired")) return "kyc_expired";
  if (m.includes("kyc") || m.includes("verif")) return "kyc";
  return null;
}

/** Copy for each online-gate state — calm, second person, sentence case (no emoji). */
export interface GateCopy {
  title: string;
  message: string;
}
export const ONLINE_GATE_COPY: Record<OnlineGateReason, GateCopy> = {
  kyc: {
    title: "Verify your ID to go online",
    message: "Your ID isn't verified yet. Finish verification, then you can start accepting deliveries.",
  },
  kyc_expired: {
    title: "Your ID has expired",
    message: "You can't go online until you re-verify. Re-submit a valid national ID to keep riding.",
  },
  suspended: {
    title: "Your account is suspended",
    message: "You can't go online while your account is suspended. Contact support to sort this out.",
  },
  banned: {
    title: "Your account is banned",
    message: "Your account has been banned and can no longer go online. If you think this is a mistake, contact support.",
  },
  on_hold: {
    title: "Your account is on hold",
    message:
      "Your reliability score dropped too low to keep riding automatically. Contact support to have your account reviewed.",
  },
  cooldown: {
    title: "You're on a cooldown",
    message:
      "You were taken offline after cancelling too many jobs. The cooldown lasts about 2 hours — tap Go online once it's over to start bidding again.",
  },
  out_of_area: {
    title: "You're outside the service area",
    message: "You can only go online inside the Harare service area for now. Head back toward the city, then refresh.",
  },
  // Calm, specific, actionable — and explicitly not punitive. The go-online screen deep-links the CTA
  // into the wallet's top-up flow.
  commission_low_balance: {
    title: "Top up to keep riding",
    message:
      "Your commission balance is below the floor to go online. This isn't a fine — top up your prepaid balance and you're straight back on.",
  },
};

/** Human label for a KYC decline reason, or null when the reason is unknown/absent. */
export function kycDeclineLabel(reason: KycDeclineReason | string | null | undefined): string | null {
  if (!reason) return null;
  return KYC_DECLINE_REASON_LABELS[reason as KycDeclineReason] ?? null;
}

/** After this many failed KYC attempts the rider is locked out of self-resubmit and must contact support (A-02). */
export const KYC_LOCK_ATTEMPTS = 2;

/** Whether the rider has exhausted self-resubmit attempts and should see the "contact support" state. */
export function isKycLocked(attempts: number | null | undefined): boolean {
  return (attempts ?? 0) >= KYC_LOCK_ATTEMPTS;
}

/**
 * BH-11: whether a denied camera/library permission needs an "Open settings" affordance rather than
 * just an error string. `canAskAgain: false` means the OS won't show its own prompt again (a prior
 * "Don't Allow") — the KYC photo is MANDATORY (unlike an optional photo elsewhere in the app), so
 * without a way to the device's Settings screen this permanently blocks onboarding.
 */
export function shouldOfferPermissionSettings(perm: { granted: boolean; canAskAgain: boolean }): boolean {
  return !perm.granted && !perm.canAskAgain;
}

/**
 * Whether an order-create error is the service-corridor 4xx ("outside our service area", Q1). Reads a
 * machine code first, then sniffs the message. Kept narrow so an unrelated 4xx (e.g. a validation error)
 * doesn't get mistaken for out-of-area.
 * // TODO(rules-api): pin to the real corridor error `code` once the order-create contract lands.
 */
const CORRIDOR_CODES = new Set(["out_of_area", "outside_service_area", "service_corridor", "service_area"]);
export function isOutOfServiceArea(err: GateError | null | undefined): boolean {
  if (!err) return false;
  const code = (err.code ?? "").toLowerCase();
  if (CORRIDOR_CODES.has(code)) return true;
  const m = (err.message ?? "").toLowerCase();
  return m.includes("service area") || m.includes("service corridor") || m.includes("out of area") || m.includes("outside our service");
}

/**
 * S·2: whether an order-create error is the "your account is on hold" 403. The server throws the same
 * `{ reason: "on_hold", message }` shape the rider online-gate uses, so this reads the machine code
 * first (authoritative) and falls back to a message sniff. Kept narrow: only an explicit on-hold code
 * or an "on hold" phrase counts, so an unrelated 4xx isn't mistaken for a hold.
 */
export function isAccountOnHold(err: GateError | null | undefined): boolean {
  if (!err) return false;
  const code = (err.code ?? "").toLowerCase();
  if (code === "on_hold" || code === "account_on_hold") return true;
  const m = (err.message ?? "").toLowerCase();
  return m.includes("on hold") || m.includes("on-hold");
}

/** Copy for the customer account-on-hold blocking screen (S·2). */
export const ACCOUNT_ON_HOLD_COPY: GateCopy = {
  title: "Your account is on hold",
  message: "We've paused your account while we review recent activity. You can't send parcels right now — contact support if you think this is a mistake.",
};

/**
 * Optional client-side pre-check (server is authority): is a point inside the launch service corridor?
 * Uses the same SERVICE_CORRIDOR constant the server enforces, so a match here can't diverge from it.
 */
export function isWithinServiceCorridor(point: LatLng): boolean {
  const center: LatLng = { lat: SERVICE_CORRIDOR.centerLat, lng: SERVICE_CORRIDOR.centerLng };
  return haversineKm(center, point) <= SERVICE_CORRIDOR.radiusKm;
}

/** What `retryKyc`'s success handler should do next. */
export interface KycRetryFeedback {
  /** An https verification URL to open in the in-app browser, or null if there's nothing to open. */
  openUrl: string | null;
  /** An error to surface when there's no usable URL — never both this and `openUrl` set. */
  error: string | null;
  /** A calm (non-error) status line to surface when there's no usable URL by design (manual review). */
  info: string | null;
}

/**
 * JOURNEY-BUGS: `retryKyc` succeeding with a missing/non-https `verificationUrl` used to silently do
 * nothing but refetch `["me"]` — the rider saw no feedback and no verification browser opened. Decide
 * once, in a testable place, whether to open the browser or tell the rider it didn't work.
 *
 * BH-03: a missing `verificationUrl` is EXPECTED in manual KYC mode (no vendor to resubmit to —
 * ops reviews it) — that must not surface as the same "couldn't start verification" error auto mode
 * gets on a genuine failure, or a manual-review rider sees a false failure on every retry tap.
 */
export function resolveKycRetryFeedback(
  verificationUrl: string | null | undefined,
  mode: "auto" | "manual" | undefined,
): KycRetryFeedback {
  if (verificationUrl && verificationUrl.startsWith("https://")) {
    return { openUrl: verificationUrl, error: null, info: null };
  }
  if (mode === "manual") {
    return { openUrl: null, error: null, info: "Your ID is still under manual review — we'll notify you once it's checked." };
  }
  return { openUrl: null, error: "Couldn't start verification — try again in a moment.", info: null };
}
