// Counterparty action: sign in as the QA rider and advance their assigned order ONE lifecycle step —
// used by customer/06-accept-and-track.yaml between UI assertions, so the tracking screen's status
// elements can be checked at each step (confirmed → en_route_pickup → picked_up → en_route_dropoff)
// rather than jumping straight to the end state. Call rider-advance-and-deliver.js's approach instead
// when you just need the order at `delivered` with no intermediate assertions.
const { signIn, req, latestOrder } = require("./api.js");

const NEXT = {
  assigned: "confirmed",
  confirmed: "en_route_pickup",
  en_route_pickup: "picked_up",
  picked_up: "en_route_dropoff",
};

const riderToken = signIn(RIDER_PHONE);
const order = latestOrder(riderToken);
const to = NEXT[order.status];
if (!to) throw new Error(`Order ${order.id} is in status "${order.status}" — nothing to advance to.`);

req("post", `/orders/${order.id}/status`, riderToken, { to });
output.orderId = order.id;
output.status = to;
