import {
  ACTIVE_RIDE_STATUSES,
  type AdvanceStatusRequest,
  DELIVERY_OTP_MAX_ATTEMPTS,
  RIDER_CANCELLABLE_STATUSES,
  UndeliveredReason,
} from "@lynia/shared";
import type { RiderJobTerminal } from "../auth/session";
import type { IconName } from "../ui/Icon";

export const ACTIVE = ACTIVE_RIDE_STATUSES as string[];
// R2: the rider may only cancel pre-pickup — the server rejects a cancel once the parcel is collected,
// so the button must hide there (post-pickup, "Can't complete delivery" is the exit, not Cancel).
export const RIDER_CANCELLABLE = RIDER_CANCELLABLE_STATUSES as string[];
export const NEXT: Record<string, { to: AdvanceStatusRequest["to"]; label: string }> = {
  assigned: { to: "confirmed", label: "Confirm the job" },
  confirmed: { to: "en_route_pickup", label: "Head to pickup" },
  en_route_pickup: { to: "picked_up", label: "Mark parcel collected" },
  picked_up: { to: "en_route_dropoff", label: "Head to drop-off" },
};

// Delivery-OTP cap (R9), re-exported from @lynia/shared so the server's lock and the client's
// attempts-remaining display can't drift apart.
export { DELIVERY_OTP_MAX_ATTEMPTS };

// The post-pickup "can't complete delivery" reasons (R1) — the shared UndeliveredReason enum paired
// with rider-facing copy + an icon, mirroring the "Couldn't deliver" mockup (rider-screens.jsx).
export const UNDELIVERED_OPTIONS: { reason: UndeliveredReason; label: string; icon: IconName }[] = [
  { reason: UndeliveredReason.UNREACHABLE, label: "Recipient unreachable", icon: "phone" },
  { reason: UndeliveredReason.REFUSED, label: "Recipient refused", icon: "circle-alert" },
  { reason: UndeliveredReason.WRONG_ADDRESS, label: "Wrong address", icon: "map-pin" },
  { reason: UndeliveredReason.BREAKDOWN, label: "Couldn't complete (breakdown)", icon: "bike" },
];
export const UNDELIVERED_LABEL = Object.fromEntries(UNDELIVERED_OPTIONS.map((o) => [o.reason, o.label])) as Record<UndeliveredReason, string>;

/**
 * KB-OTP-COUNT-SYNC: reconcile the locally-shown delivery-OTP attempt count against the server's
 * authoritative `deliveryOtpAttempts`. Returns the count to apply, or null for "leave it as-is".
 *
 * Previously the caller only ever pulled the local count DOWN (to catch a customer re-issue that zeroes the
 * server counter). But if a `confirmDelivery` response is lost AFTER the server committed the attempt
 * increment (the client never saw the 401), the local count stayed too low and the rider was shown more
 * attempts remaining than they really had — until an eventual 403 snapped it to the max. So now we converge
 * to the server's value in BOTH directions.
 *
 * Flash-safety is the CALLER's responsibility and rests on WHEN this runs: it must be invoked only on a
 * freshly-FETCHED server value (i.e. keyed on `deliveryOtpAttempts` changing), never on the local counter
 * changing. The optimistic post-401 increment therefore can't retrigger it, so a stale-lower cached server
 * value can never stomp the optimistic bump before its refetch lands — by the time a new server value is
 * fetched it already reflects that committed attempt, and local == server ⇒ no-op.
 */
export function reconcileOtpAttempts(input: {
  local: number;
  serverAttempts: number | null | undefined;
}): number | null {
  const { local, serverAttempts } = input;
  if (serverAttempts == null) return null; // no server signal yet
  if (serverAttempts === local) return null; // already in sync
  return serverAttempts; // converge — up as well as down
}

/**
 * KB-CONFIRMITEMS-RETRY: decide what to do with a durable "confirmItems still pending for order X" marker
 * against the current active-job snapshot. The rider's pickup-item confirmation is best-effort and fired as
 * they advance to `picked_up`; a lost response / app-kill right then can leave the order with no
 * confirmed-items record. The server accepts confirmItems ONLY at `en_route_pickup`, so a retry can land
 * only while the order is still there and has no record yet.
 *
 *   - "retry": the marker matches the live order, it's still at `en_route_pickup`, and no record exists yet.
 *   - "clear": the record is now present, OR a DIFFERENT order is active (the pending one is gone) — the
 *              marker is stale and should be dropped so it can't linger.
 *   - "wait":  no marker, or no snapshot yet, or the SAME order has moved past the pickup window (a retry
 *              would 409 forever) — keep the marker but do nothing (don't discard on optimistic/lost state).
 */
export function reconcileConfirmItemsPending(input: {
  pendingOrderId: string | null | undefined;
  order: { id: string; status: string; itemsCollected?: number[] | null } | null;
}): "retry" | "clear" | "wait" {
  const { pendingOrderId, order } = input;
  if (!pendingOrderId) return "wait"; // nothing pending
  if (!order) return "wait"; // no snapshot yet (loading/offline) — don't discard the marker
  if (order.id !== pendingOrderId) return "clear"; // a different order is active now — the pending one is gone
  if (order.itemsCollected != null) return "clear"; // the server already has the record — done
  if (order.status === "en_route_pickup") return "retry"; // still at pickup — the retry can land
  return "wait"; // same order, past the pickup window with no record — can't retry, but keep the marker
}

/**
 * Decide whether a durable rider-job terminal marker (delivered/undelivered — see `saveRiderJobTerminal`
 * in session.ts) should be promoted into the live in-memory terminal state this session. The marker
 * exists precisely because the delivered/undelivered terminals are frozen component state that an app
 * kill between the mutation's success and the rider dismissing the terminal previously erased outright.
 *
 * Only fires the first time this session sees no active job: a genuinely live/new job (which can never
 * itself be `delivered`/`undelivered`, per `ACTIVE_RIDE_STATUSES`) always wins over a stale marker, and a
 * terminal already resolved via the live mutation flow this session is never re-clobbered by the marker.
 */
export function reconcileRiderJobTerminal(input: {
  persistedTerminal: RiderJobTerminal | null | "loading";
  jobLoading: boolean;
  hasActiveOrder: boolean;
  alreadyResolved: boolean;
}): RiderJobTerminal | null {
  const { persistedTerminal, jobLoading, hasActiveOrder, alreadyResolved } = input;
  if (jobLoading || persistedTerminal === "loading") return null;
  if (hasActiveOrder || alreadyResolved) return null;
  return persistedTerminal;
}
