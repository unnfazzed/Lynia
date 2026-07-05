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
 * Q2), `cooldown` (recent cancel cool-off).
 */
export type OnlineGateReason = "kyc" | "suspended" | "banned" | "on_hold" | "cooldown";

const ONLINE_GATE_REASONS: readonly OnlineGateReason[] = ["kyc", "suspended", "banned", "on_hold", "cooldown"];

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
  const m = (err.message ?? "").toLowerCase();
  if (m.includes("on hold") || m.includes("on-hold") || m.includes("on_hold")) return "on_hold";
  // Check banned before suspended: they're distinct states and a message could mention both.
  if (m.includes("banned") || m.includes("ban ")) return "banned";
  if (m.includes("suspend")) return "suspended";
  if (m.includes("cooldown") || m.includes("cool-down") || m.includes("cool down")) return "cooldown";
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
      "Your reliability score dropped below what's needed to accept deliveries. Complete a few clean trips to recover it, or contact support.",
  },
  cooldown: {
    title: "You're on a short cooldown",
    message: "You were taken offline after a recent cancellation. Wait a few minutes, then tap Go online to try again.",
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
 * Optional client-side pre-check (server is authority): is a point inside the launch service corridor?
 * Uses the same SERVICE_CORRIDOR constant the server enforces, so a match here can't diverge from it.
 */
export function isWithinServiceCorridor(point: LatLng): boolean {
  const center: LatLng = { lat: SERVICE_CORRIDOR.centerLat, lng: SERVICE_CORRIDOR.centerLng };
  return haversineKm(center, point) <= SERVICE_CORRIDOR.radiusKm;
}
