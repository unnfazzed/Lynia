// Counterparty action: sign in as the QA customer and broadcast a fresh delivery request over the
// API — used by the RIDER flows (03-view-rides, 04-bid, 05-counter-offer) so the rider's board has
// something open without a second device driving the customer side live.
const { signIn, req } = require("./api.js");
const { PICKUP, DROPOFF, ASK_FARE } = require("./env.js");

const token = signIn(CUSTOMER_PHONE);
req("post", "/orders/disclaimer", token, { policyVersion: "qa-1" });
const order = req("post", "/orders", token, {
  pickup: PICKUP,
  dropoff: DROPOFF,
  itemDescription: "QA test parcel",
  declaredValue: 10,
  proposedFare: ASK_FARE,
  disclaimerVersion: "qa-1",
});

output.orderId = order.id;
