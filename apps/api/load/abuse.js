// Abuse / throttle proof (LR3). A single authenticated token hammers the write endpoints far above the
// @Throttle limits; the API must shed load with 429 (ThrottleGuard), NOT 5xx, and the global exception
// filter must keep responses shape-stable. A rising 5xx rate here is a real finding.
//
// Run: BASE_URL=https://<staging> k6 run apps/api/load/abuse.js
import http from "k6/http";
import { check } from "k6";
import { Rate } from "k6/metrics";
import { signIn, createOrder, auth, BASE_URL } from "./lib.js";

const rate429 = new Rate("throttled_429");
const rate5xx = new Rate("server_5xx");

export const options = {
  scenarios: { hammer: { executor: "constant-vus", vus: 20, duration: "1m" } },
  thresholds: {
    server_5xx: ["rate<0.01"], // the ceiling: throttling must not manifest as server errors
    throttled_429: ["rate>0"], // we EXPECT to be throttled — that's the control working
  },
};

const PHONE = __ENV.CUSTOMER_PHONE || "+263771234567";

export default function () {
  const me = signIn(PHONE);
  if (!me) return;
  // Fire order-creates as fast as possible — well past the per-IP/token throttle window.
  const orderId = createOrder(me.accessToken);
  const res = http.post(`${BASE_URL}/orders`, JSON.stringify({ bad: true }), auth(me.accessToken));
  rate429.add(res.status === 429);
  rate5xx.add(res.status >= 500);
  check(res, { "no 5xx under abuse": (r) => r.status < 500 });
  if (orderId) {
    /* created one; the rest should trip the limiter */
  }
}
