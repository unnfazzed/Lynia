import type { MerchantOrderResponse } from "@lynia/shared";

export interface QueueGroups {
  /** M1·3 NEW ORDER takeover candidates — never rendered as a plain column card. */
  awaitingAccept: MerchantOrderResponse[];
  /** D-23: kitchen already answered (item-level), waiting on the customer's 60s approval. */
  awaitingItemApproval: MerchantOrderResponse[];
  /** M2·7: paid-nothing-yet, no clock, never blocks the board. */
  awaitingPayment: MerchantOrderResponse[];
  preparing: MerchantOrderResponse[];
  /** Ready-for-pickup through hand-off: searching → candidate deciding → rider secured → en route. */
  ready: MerchantOrderResponse[];
}

/** Once a rider accepts (D-04 "rider secured"), `merchantPhase` clears to null and `status` carries
 *  the rest of the pre-handoff lifecycle — these are the statuses that still belong in the Ready
 *  column. `picked_up` (and every terminal status) is excluded from `listQueue` server-side already,
 *  which is what makes hand-off a clean disappearance rather than a state this module has to model. */
const READY_POST_SECURED_STATUSES = new Set(["assigned", "confirmed", "en_route_pickup"]);

export function isReadyBucket(o: MerchantOrderResponse): boolean {
  return o.merchantPhase === "ready_for_pickup" || (o.merchantPhase === null && READY_POST_SECURED_STATUSES.has(o.status));
}

export function groupQueue(orders: readonly MerchantOrderResponse[]): QueueGroups {
  const groups: QueueGroups = {
    awaitingAccept: [],
    awaitingItemApproval: [],
    awaitingPayment: [],
    preparing: [],
    ready: [],
  };
  for (const o of orders) {
    if (o.merchantPhase === "awaiting_accept") groups.awaitingAccept.push(o);
    else if (o.merchantPhase === "awaiting_item_approval") groups.awaitingItemApproval.push(o);
    else if (o.merchantPhase === "awaiting_payment") groups.awaitingPayment.push(o);
    else if (o.merchantPhase === "preparing") groups.preparing.push(o);
    else if (isReadyBucket(o)) groups.ready.push(o);
  }
  return groups;
}

/** D-26: the queue becomes a 3-column board at three (or more) live orders; under that it renders as
 *  a single flat list. */
export function shouldUseBoard(orders: readonly MerchantOrderResponse[]): boolean {
  return orders.length >= 3;
}

/** D-04: a rider has been secured for this order (first-class for the merchant too — the "start
 *  cooking"/hand-off-imminent signal). In this locked architecture prep already finished before
 *  dispatch (see plan §5 Lane E's own D-04/D-33 reconciliation note), so this drives a celebratory
 *  one-time takeover, not a cook gate. */
export function isRiderSecured(o: MerchantOrderResponse): boolean {
  return o.riderId != null && isReadyBucket(o);
}

/** D-34: the reconciler exhausted the NO_RIDER cap and is holding for an explicit merchant decision
 *  (keep searching / cancel — "stop and hold" is the passive default, nothing to call). */
export function isNoRiderHold(o: MerchantOrderResponse): boolean {
  return o.merchantPhase === "ready_for_pickup" && o.noRiderHoldAt != null;
}

/** A rider is actively searching/deciding (not yet secured, not yet held) — the quiet in-card state,
 *  distinct from the D-34 hold takeover. */
export function isSearchingForRider(o: MerchantOrderResponse): boolean {
  return o.merchantPhase === "ready_for_pickup" && o.noRiderHoldAt == null && o.riderId == null;
}
