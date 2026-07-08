// Counterparty action: sign in as the QA customer and mint a fresh plaintext delivery hand-off code
// for their latest order (the same "Re-issue delivery code" action the customer's own order screen
// exposes) — used by rider/06-track-and-finish.yaml so the rider side can type in a real code without
// a second device showing the customer's screen. The code is stored hashed server-side, so this
// rotate-and-read is the only way to get a plaintext code programmatically.
const { signIn, req, latestOrder } = require("./api.js");

const token = signIn(CUSTOMER_PHONE);
const order = latestOrder(token);
const rotated = req("post", `/orders/${order.id}/delivery-code/rotate`, token);

output.orderId = order.id;
output.deliveryCode = rotated.deliveryCode;
