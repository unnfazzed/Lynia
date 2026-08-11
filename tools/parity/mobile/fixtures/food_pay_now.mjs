// RC.pay_now — the WALLET pay screen: the kitchen has accepted and requested payment, so the
// awaiting_payment view renders its "PAY EXACTLY" manual rail (merchant number, exact amount,
// reference) plus the transaction-reference field. Driven by GET /restaurants/orders/:id alone
// (riderId null → no live tracker read). paymentRequestedAt is recent so the R5·b1 "still waiting"
// reminder isn't due yet, and no reference has been submitted, which is exactly the pay-now state.
import { installRouter, setParams } from "./_harness.mjs";
import { MENU, OID, foodOrder , withOrder } from "./_food.mjs";

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
      merchantPaymentReference: null,
      merchantPaymentConfirmedAt: null,
    }),
  },
  { match: /^\/restaurants\/[^/]+\/menu$/, json: MENU },
]);

export default { wrap: withOrder() };
