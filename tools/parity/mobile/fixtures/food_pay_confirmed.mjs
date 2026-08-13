// RC.pay_confirmed (R5·b2) — the customer has submitted their transaction reference and is now waiting
// for the restaurant to confirm it against their own statement (merchantPhase "awaiting_payment",
// merchantPaymentReference set, merchantPaymentConfirmedAt still null). FoodOrderAwaitingPaymentView
// renders its "Payment sent — waiting for the restaurant" sub-state (the clock hero + amount/reference
// rows). Driven by GET /restaurants/orders/:id alone (riderId null → no live tracker read).
import { installRouter, setParams } from "./_harness.mjs";
import { MENU, OID, foodOrder, withOrder } from "./_food.mjs";

setParams({ orderId: OID });

installRouter([
  {
    match: /^\/restaurants\/orders\//,
    json: foodOrder({
      status: "confirmed",
      merchantPhase: "awaiting_payment",
      paymentMethod: "wallet",
      riderId: null,
      paymentRequestedAt: new Date(Date.now() - 120_000).toISOString(),
      paymentCallLoggedAt: new Date(Date.now() - 180_000).toISOString(),
      merchantPaymentPhone: "+263 77 246 8135",
      merchantPaymentReference: "EC-77241180-4471",
      merchantPaymentConfirmedAt: null,
    }),
  },
  { match: /^\/restaurants\/[^/]+\/menu$/, json: MENU },
]);

export default { wrap: withOrder() };
