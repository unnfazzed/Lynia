import type { KycGate, OnlineGateReason } from "./gates";

/**
 * Rider v2 gates G1–G14 (`packages/design/handoff/rider-v2/`, ledger D-54): ONE resolver for every wall
 * between a rider and the board, in the README's priority order — first match wins:
 *
 *   not a rider → KYC (unfinished / pending / failed / failed twice / expired / can't open)
 *   → banned → suspended → on hold → cooldown → out of area → no GPS → balance below floor.
 *
 * Force update (G15) is the app-wide force-update screen, which runs before any tab mounts.
 * Every input is live state the board already holds, so a gate clears on its own the moment its input
 * changes (socket, poll, app resume) — the rider never taps a refresh.
 */
export type GateId =
  | "notRider"
  | "pending"
  | "unfinished"
  | "failed"
  | "failed2"
  | "expired"
  | "cantOpen"
  | "banned"
  | "suspended"
  | "hold"
  | "cooldown"
  | "area"
  | "gps"
  | "topup";

export interface GateInput {
  /** The KYC wall for an unverified rider (`resolveKycGate`), or null once verified. */
  kyc: KycGate | null;
  /** The server's last refusal reason (go-online / heartbeat 403), or null. */
  server: OnlineGateReason | null;
  /** Location permission denied. */
  locDenied: boolean;
}

export function resolveGate({ kyc, server, locDenied }: GateInput): GateId | null {
  if (kyc) {
    switch (kyc.kind) {
      case "not_a_rider":
        return "notRider";
      case "expired":
        return "expired";
      case "locked":
        return "failed2";
      case "declined":
        return "failed";
      case "cant_start":
        return "cantOpen";
      case "manual_review":
      case "in_flight":
        return "pending";
      case "unfinished":
        return "unfinished";
    }
  }
  if (server === "kyc_expired") return "expired";
  if (server === "kyc") return "unfinished";
  if (server === "banned") return "banned";
  if (server === "suspended") return "suspended";
  if (server === "on_hold") return "hold";
  if (server === "cooldown") return "cooldown";
  if (server === "out_of_area") return "area";
  if (locDenied) return "gps";
  if (server === "commission_low_balance") return "topup";
  return null;
}

/** Tries left on the self-serve ID check (the "Tries left · 1 of 2" fact). */
export function kycTriesLeft(attempts: number | null | undefined, max = 2): number {
  return Math.max(0, max - (attempts ?? 0));
}

