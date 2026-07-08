// Counterparty action: sign in as the QA rider and walk their assigned order all the way to
// `delivered` over the API — used by customer/06-accept-and-track.yaml and
// customer/07-collect-and-rate.yaml so the customer's tracking/rating screens have live status
// transitions to react to without a second device driving the rider side.
const { signIn, req, latestOrder } = require("./api.js");

const riderToken = signIn(RIDER_PHONE);
const order = latestOrder(riderToken);

["confirmed", "en_route_pickup", "picked_up", "en_route_dropoff"].forEach((to) => {
  req("post", `/orders/${order.id}/status`, riderToken, { to });
});

// The delivery code is hashed server-side — mint a fresh plaintext one as the customer (the same
// "Re-issue delivery code" action), then confirm hand-off as the rider.
const customerToken = signIn(CUSTOMER_PHONE);
const rotated = req("post", `/orders/${order.id}/delivery-code/rotate`, customerToken);
req("post", `/orders/${order.id}/deliver`, riderToken, { code: rotated.deliveryCode });

output.orderId = order.id;
