// RC.refunded (R6·b4) — the refund landed: FoodOrderCancelledView's refunded branch renders the accent
// "Refunded in full" card with the time, amount and the merchant's refund reference (kept forever as
// the customer's evidence). Driven by GET /restaurants/orders/:id: status "cancelled" with refundedAt
// set (so the refunded branch wins over both the refund-pending and generic-cancel branches) plus the
// refundAmount and refundReference the card draws.
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
      merchantPaymentConfirmedAt: new Date(Date.now() - 1_200_000).toISOString(),
      refundedAt: new Date(Date.now() - 300_000).toISOString(),
      refundAmount: 15.5,
      refundReference: "EC-4471-RF9920",
    }),
  },
  { match: /^\/restaurants\/[^/]+\/menu$/, json: MENU },
]);

export default { wrap: withOrder() };
