// Counterparty action: sign in as the QA customer and rate the rider on their latest (delivered)
// order — used by rider/06-track-and-finish.yaml. Rating is the action that flips the order to
// `completed` server-side (order-lifecycle.service.ts's rate()), so this is also how the rider's
// "finish the ride" step becomes reflected in their earnings.
const { signIn, req, latestOrder } = require("./api.js");

const token = signIn(CUSTOMER_PHONE);
const order = latestOrder(token);
req("post", `/orders/${order.id}/rating`, token, { score: 5 });

output.orderId = order.id;
