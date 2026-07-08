// Counterparty action: sign in as the QA rider and respond to the CUSTOMER's latest order — used by
// the CUSTOMER flows (04-review-bids, 05-respond-to-counter, 06-accept-and-track) so a bid exists for
// the customer screen to react to. `OFFER_MODE` ("accept" | "counter") is set by the calling flow's
// `env:` block before this script runs.
const { signIn, req, latestOrder } = require("./api.js");
const { ASK_FARE, COUNTER_FARE, ETA_MINUTES } = require("./env.js");

const customerToken = signIn(CUSTOMER_PHONE);
const order = latestOrder(customerToken);

const riderToken = signIn(RIDER_PHONE);
const mode = (typeof OFFER_MODE !== "undefined" && OFFER_MODE) || "accept";
const offeredFare = mode === "counter" ? COUNTER_FARE : Number(order.proposedFare ?? ASK_FARE);

const offer = req("post", `/orders/${order.id}/offers`, riderToken, {
  type: mode,
  offeredFare,
  etaMinutes: ETA_MINUTES,
});

output.orderId = order.id;
output.offerId = offer.id;
output.offeredFare = String(offeredFare);
