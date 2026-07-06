// Smoke: 1 VU, one full offer-loop, to validate the harness + target before a real load run.
// Run: BASE_URL=https://<staging> k6 run apps/api/load/smoke.js
import { check, sleep } from "k6";
import { signIn, createOrder, makeOffer, selectOffer, json } from "./lib.js";

export const options = { vus: 1, iterations: 1, thresholds: { checks: ["rate>0.9"] } };

// Two allow-listed OTP_TEST_PHONES numbers on the staging deploy (a customer + a rider).
const CUSTOMER = __ENV.CUSTOMER_PHONE || "+263771234567";
const RIDER = __ENV.RIDER_PHONE || "+263770000002";

export default function () {
  const customer = signIn(CUSTOMER);
  const rider = signIn(RIDER);
  check(customer, { "customer signed in": (c) => !!c?.accessToken });
  check(rider, { "rider signed in": (r) => !!r?.accessToken });
  if (!customer || !rider) return;

  const orderId = createOrder(customer.accessToken);
  check(orderId, { "order id returned": (id) => !!id });
  if (!orderId) return;

  sleep(1);
  const offer = makeOffer(rider.accessToken, orderId, 5.0);
  check(offer, { "offer accepted (201)": (o) => o.status === 201 });
  if (offer.id) {
    const sel = selectOffer(customer.accessToken, orderId, offer.id);
    check(sel, { "select assigned (200/201)": (s) => s.status === 200 || s.status === 201 });
    console.log(`smoke: order ${orderId} → select ${sel.status} ${JSON.stringify(json(sel))}`);
  }
}
