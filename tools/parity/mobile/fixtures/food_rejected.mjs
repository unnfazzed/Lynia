// RC.rejected (R6·b3) — the merchant couldn't take the order AFTER a wallet payment had already gone
// out, and no refund is recorded yet: FoodOrderRefundPendingView renders "REFUND PENDING" with the
// amount, the paid-to / reference / refund-due rows and the get-help escalation. Driven by
// GET /restaurants/orders/:id: status "cancelled", a wallet payment reference on the order
// (paidOut = wallet && reference set), refundedAt still null so the pending — not the refunded —
// branch wins. rejectionReason "out_of_ingredient" states why (the mock: "ran out of beef stew").
import { installRouter, setParams } from "./_harness.mjs";
import { MENU, OID, foodOrder, withOrder } from "./_food.mjs";

setParams({ orderId: OID });

installRouter([
  {
    match: /^\/restaurants\/orders\//,
    json: foodOrder({
      status: "cancelled",
      merchantPhase: null,
      paymentMethod: "wallet",
      riderId: null,
      rejectionReason: "out_of_ingredient",
      merchantPaymentReference: "EC-77241180-4471",
      merchantPaymentConfirmedAt: new Date(Date.now() - 600_000).toISOString(),
      refundedAt: null,
      refundAmount: null,
      refundReference: null,
    }),
  },
  { match: /^\/restaurants\/[^/]+\/menu$/, json: MENU },
]);

export default { wrap: withOrder() };
