// Counterparty action: sign in as the QA customer and accept the QA rider's counter-offer on their
// own latest order — used by rider/05-counter-offer.yaml so the rider's screen sees an assignment
// without a second device driving the customer side.
const { signIn, req, latestOrder } = require("./api.js");

const token = signIn(CUSTOMER_PHONE);
const order = latestOrder(token);
const offers = req("get", `/orders/${order.id}/offers`, token);
const counter = offers.find((o) => o.type === "counter");
if (!counter) throw new Error("No counter-offer found on order " + order.id + " to accept.");

req("post", `/orders/${order.id}/offers/${counter.id}/select`, token);
output.orderId = order.id;
