// RC.no_rider (R6·b1) — dispatch exhausted its attempts without finding a rider: the order is
// cancelled with rejectionReason "no_rider". FoodOrderCancelledView's no_rider branch renders the
// apology EmptyState ("We couldn't find a rider" + try-again / see-others) — designed as an apology,
// not an error. CASH payment so nothing was pre-paid (paidOut false → this is the plain cancel, not
// the refund-pending branch). Driven by GET /restaurants/orders/:id alone.
import { installRouter, setParams } from "./_harness.mjs";
import { MENU, OID, foodOrder, withOrder } from "./_food.mjs";

setParams({ orderId: OID });

installRouter([
  {
    match: /^\/restaurants\/orders\//,
    json: foodOrder({
      status: "cancelled",
      merchantPhase: null,
      paymentMethod: "cash",
      riderId: null,
      rejectionReason: "no_rider",
      refundedAt: null,
    }),
  },
  { match: /^\/restaurants\/[^/]+\/menu$/, json: MENU },
]);

export default { wrap: withOrder() };
