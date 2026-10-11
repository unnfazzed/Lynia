/**
 * U33 (C8, reviewed list 2026-10-07): ONE reading of who ended an order, shared by the Orders tab history
 * (`OrdersService.customerOrderOutcome`), the Notifications feed (`cancelledByOf`), the customer push
 * (`FoodOrderService.notifyCancelledCustomer`) and the order screen's endings (mobile
 * `MerchantOrderScreen`). Four classifiers used to decide it on their own, so a venue's "Something else"
 * (`rejectionReason: "other"`) read as "Cancelled by LyniaGo" on the tab and in the feed while the push and
 * the order screen blamed the venue.
 *
 * `other` is the venue's own reason ("Something else" on S2a / K3b, a kitchen's wallet refund). The
 * automatic and ops cancels that used to borrow it now stamp their own reasons (additive values of the
 * free-text `rejection_reason` column):
 *  - `item_approval_expired` — N-18: the customer didn't answer the 60 s item-approval window;
 *  - `lynia_cancelled` — an ops cancel from the admin console.
 * A row cancelled before this change with `other` reads as the venue's (the common case).
 */

/** The reasons only the server stamps (never in a merchant's request, `MerchantRejectionReasonCode`). */
export type LyniaCancelReason = "item_approval_expired" | "lynia_cancelled";

/** The reasons LyniaGo (a sweep, dispatch or ops) stamps — never the venue's own answer. */
export const LYNIA_CANCEL_REASONS: ReadonlySet<string> = new Set(["no_rider", "kitchen_unconfirmed", "item_approval_expired", "lynia_cancelled"]);

/** How a customer order ended, as the Orders tab names it (orders-v2 README §4 outcome table). */
export type CustomerOrderOutcome =
  | "delivered"
  | "cancelled_by_you"
  | "cancelled_by_rider"
  | "cancelled_by_lynia"
  | "kitchen_timeout"
  | "venue_declined"
  | "no_rider"
  | "not_delivered";

/** Who cancelled, as the Notifications feed names it. */
export type OrderCanceller = "customer" | "rider" | "merchant" | "lynia";

/** Whose call a merchant order's `rejectionReason` was: the venue's, LyniaGo's, or none stamped. */
export function cancelReasonParty(reason: string | null | undefined): "merchant" | "lynia" | null {
  if (!reason) return null;
  return LYNIA_CANCEL_REASONS.has(reason) ? "lynia" : "merchant";
}

export interface OrderEndFacts {
  status: string;
  /** The canceller's profile id (a customer or rider cancel); null for a venue, sweep or ops cancel. */
  cancelledBy?: string | null;
  customerId?: string | null;
  riderId?: string | null;
  rejectionReason?: string | null;
}

/**
 * How the order ended. A customer or rider cancel stamps `cancelledBy` with their profile id; an ops cancel
 * stores null `cancelledBy` (admin-orders.service.ts); a venue, a sweep or dispatch letting a merchant order
 * go stamps `rejectionReason` instead.
 */
export function customerOrderOutcome(o: OrderEndFacts): CustomerOrderOutcome {
  if (o.status === "delivered" || o.status === "completed") return "delivered";
  if (o.status === "expired") return "no_rider";
  if (o.status === "undelivered") return "not_delivered";
  if (o.cancelledBy && o.cancelledBy === o.customerId) return "cancelled_by_you";
  if (o.cancelledBy && o.cancelledBy === o.riderId) return "cancelled_by_rider";
  if (o.rejectionReason === "kitchen_unconfirmed") return "kitchen_timeout";
  if (o.rejectionReason === "no_rider") return "no_rider";
  if (cancelReasonParty(o.rejectionReason) === "merchant") return "venue_declined";
  return o.cancelledBy ? "cancelled_by_rider" : "cancelled_by_lynia";
}

/** Who ended a cancelled order — the feed's word for {@link customerOrderOutcome}. */
export function cancelledByOf(o: Omit<OrderEndFacts, "status">): OrderCanceller {
  switch (customerOrderOutcome({ ...o, status: "cancelled" })) {
    case "cancelled_by_you":
      return "customer";
    case "cancelled_by_rider":
      return "rider";
    case "venue_declined":
      return "merchant";
    default:
      return "lynia";
  }
}
