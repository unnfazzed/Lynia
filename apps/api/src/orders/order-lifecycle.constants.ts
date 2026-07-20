/**
 * Order-lifecycle policy constants + shared types (roadmap 3.4 — first extraction from the 1084-line
 * `order-lifecycle.service.ts`). These are the pure, behaviour-defining declarations the service reads:
 * the forward-transition map, the server-enforced cancellation matrix, the optional-photo attach
 * windows, the strike/rating/reconcile timings, and the BullMQ connection shape. Pulled out verbatim so
 * the god service shrinks toward its actual logic, and so the policy (which status can cancel, which
 * window a proof attaches in) is greppable + unit-testable on its own. No behaviour change: the service
 * imports exactly these values.
 */
import { CUSTOMER_CANCELLABLE_STATUSES, RIDER_CANCELLABLE_STATUSES } from "@lynia/shared";
import type { OrderStatus } from "@prisma/client";

/** Forward, rider-driven transitions. `delivered` (OTP-gated) and `completed` (rating/auto-close)
 *  are handled by their own methods, not this map. Each edge stamps one milestone timestamp. */
export const FORWARD = {
  confirmed: { from: "assigned", stamp: "confirmedAt" },
  en_route_pickup: { from: "confirmed", stamp: "pickupStartedAt" },
  picked_up: { from: "en_route_pickup", stamp: "collectedAt" },
  en_route_dropoff: { from: "picked_up", stamp: undefined },
} as const;
export type ForwardStatus = keyof typeof FORWARD;

/** Cancellation matrix (INTERFACE-AUDIT C3), server-enforced. Customer: any live status (pre- OR
 *  post-pickup). Rider: ONLY up to arrival at pickup — blocked from `picked_up` onward (the parcel is
 *  on the bike; a post-pickup failure is an `undelivered(breakdown)`, not a cancel). Both sets are the
 *  shared source of truth the clients import for the cancel affordance. */
export const CUSTOMER_CANCELLABLE = new Set<string>(CUSTOMER_CANCELLABLE_STATUSES);
export const RIDER_CANCELLABLE = new Set<string>(RIDER_CANCELLABLE_STATUSES);
/** A hand-off can only FAIL after the parcel is collected (C6/F-02): picked_up or en_route_dropoff. */
export const POST_PICKUP_FOR_UNDELIVERED = new Set<string>(["picked_up", "en_route_dropoff"]);
/** The pickup-photo attach window (§5c "Mark collected (+ pickup photo)"): at the pickup, or just
 *  collected. Wider than the checklist's en_route_pickup-only gate on purpose — the photo is optional
 *  and must never delay the collect, so an upload still in flight when the rider taps "Confirm
 *  collected" can land after the advance to picked_up instead of 409ing into the void. Typed as the
 *  Prisma enum (not a Set<string>) because the CAS `where` reuses it verbatim. */
export const PICKUP_PHOTO_STATUSES: readonly OrderStatus[] = ["en_route_pickup", "picked_up"];
/** KB-POD-DISPUTE Phase A — the proof-of-drop attach window: at the door before giving up
 *  (en_route_dropoff) OR just after marking the hand-off failed (undelivered), so a rider can attach
 *  evidence either while disputing or right after. Optional, never gates a status. Typed as the Prisma
 *  enum because the CAS `where` reuses it verbatim. */
export const DELIVERY_PROOF_STATUSES: readonly OrderStatus[] = ["en_route_dropoff", "undelivered"];
/** Repeated rider cancels earn a cooldown that blocks going online (T4 no-show penalty). */
export const CANCEL_STRIKE_LIMIT = 3;
// DS20-03: the cooldown duration is the shared RIDER_STRIKE_COOLDOWN_MS (policy.ts) — the same value
// the dispute-strike path in issues.service uses, both writing `riders.cooldownUntil`. Sourced from one
// constant so the two axes can't drift into a silent-truncation bug.
/** How long after delivery a customer has to rate before the order auto-closes (so completion
 *  metrics never stall on an un-rated order — D6a / T3). Pilot value; tune on real behaviour. */
export const RATING_WINDOW_MS = 6 * 60 * 60 * 1000;
/** How often the DB reconciler sweeps for orphaned delivered orders (Redis-independent backstop). */
export const RECONCILE_INTERVAL_MS = 15 * 60 * 1000;
export const QUEUE_NAME = "rating-autoclose";

export interface LifecycleResult {
  orderId: string;
  status: string;
}
export interface CancelResult {
  orderId: string;
  status: "cancelled";
  cancelledBy: "customer" | "rider";
  cooldownUntil: Date | null;
}

/** Plain ioredis options so BullMQ owns its connections (mirrors offer-expiry.service.ts). */
export function connectionFromUrl(url: string) {
  const u = new URL(url);
  return {
    host: u.hostname,
    port: u.port ? Number(u.port) : 6379,
    username: u.username || undefined,
    password: u.password || undefined,
    maxRetriesPerRequest: null,
  };
}
