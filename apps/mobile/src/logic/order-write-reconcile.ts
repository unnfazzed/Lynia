import { OrderStatus } from "@lynia/shared";

/**
 * JQ-R6-01/02 (JQ-R5-01): a customer write on a weak link can commit server-side while its answer is
 * lost. Before the order screen shows "couldn't …" with a Try again that can only 400/409, it re-reads
 * the order and asks these: did the write land, or is the failure moot? The rider's cancel does the
 * same re-read on error (UX15-08).
 */
type Snap = { status: OrderStatus; proposedFare?: string | null };

/** The cancel landed, or the order ended another way — "still active" and Try again are both false. */
export function cancelMoot(o: Snap | null | undefined): boolean {
  if (!o) return false;
  return o.status === OrderStatus.CANCELLED || o.status === OrderStatus.DELIVERED || o.status === OrderStatus.COMPLETED
    || o.status === OrderStatus.EXPIRED || o.status === OrderStatus.UNDELIVERED;
}

/** The raise landed: the order's price is already at (or above) what was asked for. */
export function raiseLanded(o: Snap | null | undefined, to: number): boolean {
  if (!o || o.proposedFare == null) return false;
  return Math.round(Number(o.proposedFare) * 100) >= Math.round(to * 100);
}
