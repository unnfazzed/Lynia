import { onlineRefusalReason } from "../riders/online-gate";

/**
 * Rider must have a heartbeat newer than this to be selectable at the moment a customer taps "select"
 * (ET3 liveness). Widened 30s → 60s (KB-HEARTBEAT-MARGIN): the mobile client's heartbeat cadence is 20s
 * with a 15s request timeout, so the old 30s TTL left only a ~10s margin — a single delayed/dropped
 * heartbeat on a flaky connection could make a live, foregrounded rider look stale right at selection
 * time, throwing a spurious "rider just became unavailable" that steers the customer to a worse offer.
 * 60s clears a fully-missed heartbeat cycle (20s + the next 20s + the 15s timeout ≈ 55s) with margin,
 * while still catching a genuinely-gone rider within a minute. Distinct from BR-01's separate 120s
 * ghost-supply-count cutoff (tracking.service) — that counts live supply for the broadcast; this gates
 * one selection moment.
 */
export const SELECT_HEARTBEAT_TTL_MS = 60_000;

/** The rider fields the select-time gate reads. */
export interface SelectableRider {
  isOnline: boolean;
  lastHeartbeatAt: Date | null;
  kycStatus: string;
  accountStatus: string;
  onHold: boolean;
  cooldownUntil: Date | null;
}

/** The Prisma `select` for {@link SelectableRider}. */
export const SELECTABLE_RIDER_SELECT = {
  isOnline: true,
  lastHeartbeatAt: true,
  kycStatus: true,
  accountStatus: true,
  onHold: true,
  cooldownUntil: true,
} as const;

/**
 * MJ-RL2 / U62 (C10): the ONE select-time rider gate — online with a fresh heartbeat (ET3), and in good
 * standing (P2-1, the shared online gate). `selectOffer` refuses an offer whose rider fails it, so
 * `listForOrder` uses the same check to keep such an offer off the customer's list. (The merchant
 * cash-obligation soft-lock is the third gate; it needs a read, so callers check it separately.)
 */
export function riderSelectableNow(rider: SelectableRider, nowMs: number = Date.now()): boolean {
  const hb = rider.lastHeartbeatAt?.getTime() ?? 0;
  if (!rider.isOnline || nowMs - hb >= SELECT_HEARTBEAT_TTL_MS) return false;
  return onlineRefusalReason(rider, new Date(nowMs)) === null;
}
