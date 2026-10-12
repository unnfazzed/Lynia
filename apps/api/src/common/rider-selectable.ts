import { onlineRefusalReason } from "../riders/online-gate";
import { heartbeatMaxAgeMsForPush } from "./broadcast-policy";

/**
 * How old a rider's heartbeat may be while their bid is still choosable (ET3 liveness, as amended by the
 * owner 2026-10-12: "a bid counts as presence"). Every caller of {@link riderSelectableNow} is looking at
 * one of the rider's own pending offers, and the bid itself came from the app, so the rider was there when
 * they made it. It used to be 60 s (KB-HEARTBEAT-MARGIN): the foreground heartbeat stops when the phone
 * locks, so a rider who bid and pocketed the phone dropped off the customer's list a minute later — with a
 * handful of riders, most bids were gone before the customer chose. The owner declined keeping a location
 * service running while idle (a new Play foreground-service declaration), so the bid now stays choosable
 * for as long as a push still reaches the rider (heartbeatMaxAgeMsForPush, 15 min by default, longer than
 * any auction window). Going offline, losing standing, a debt or another job still removes it at once.
 * Accepted risk: a rider who walked away without going offline can be chosen; they get the assignment push.
 */
export function selectHeartbeatTtlMs(): number {
  return heartbeatMaxAgeMsForPush();
}

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
 * MJ-RL2 / U62 (C10): the ONE select-time rider gate — online with a heartbeat a push still reaches (ET3), and in good
 * standing (P2-1, the shared online gate). `selectOffer` refuses an offer whose rider fails it, so
 * `listForOrder` uses the same check to keep such an offer off the customer's list. (The merchant
 * cash-obligation soft-lock is the third gate; it needs a read, so callers check it separately.)
 */
export function riderSelectableNow(rider: SelectableRider, nowMs: number = Date.now()): boolean {
  const hb = rider.lastHeartbeatAt?.getTime() ?? 0;
  if (!rider.isOnline || nowMs - hb >= selectHeartbeatTtlMs()) return false;
  return onlineRefusalReason(rider, new Date(nowMs)) === null;
}
