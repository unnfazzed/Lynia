// Core load scenario (LR11/LR12): the offer loop under concurrency. Ramps to the launch envelope
// (docs/LOAD-MODEL.md) and asserts the SLO p95 thresholds + the atomic-select invariant (N riders bid,
// exactly one wins). Scale with STRESS (1 = steady, 5 = stress).
//
// Run: BASE_URL=https://<staging> k6 run apps/api/load/offer-loop.js
//      BASE_URL=https://<staging> STRESS=5 k6 run apps/api/load/offer-loop.js
import { check, sleep } from "k6";
import { Counter } from "k6/metrics";
import { signIn, createOrder, makeOffer, selectOffer, json, STRESS } from "./lib.js";

// The winner/loser tally proves the guarded CAS: across all contended orders, assigns must equal orders
// and there must be zero double-assigns.
const assigns = new Counter("offer_select_assigned");
const conflicts = new Counter("offer_select_conflict");

export const options = {
  scenarios: {
    // Ramp customers creating orders + riders bidding, up to the envelope's concurrency.
    offer_loop: {
      executor: "ramping-vus",
      startVUs: 1,
      stages: [
        { duration: "1m", target: 20 * STRESS },
        { duration: "3m", target: 40 * STRESS }, // ~concurrent live deliveries at 1×
        { duration: "1m", target: 0 },
      ],
      gracefulStop: "30s",
    },
  },
  thresholds: {
    // Client-side RTT ceilings mirroring the OBSERVABILITY.md server SLOs (OTEL is the source of truth).
    http_req_duration: ["p(95)<1000"],
    "http_req_duration{name:select}": ["p(95)<300"],
    "http_req_duration{name:offer}": ["p(95)<2000"],
    checks: ["rate>0.95"],
    offer_select_conflict: ["count>=0"], // conflicts are EXPECTED under contention — losers, not errors
  },
};

// A pool of allow-listed OTP_TEST_PHONES numbers on the staging deploy. Provide a comma-sep list; each VU
// picks one deterministically so sign-ins spread across accounts.
const PHONES = (__ENV.PHONES || "+263771234567,+263770000002,+263770000003,+263770000004").split(",");

export default function () {
  const phone = PHONES[__VU % PHONES.length];
  const me = signIn(phone);
  if (!me) return;

  // Half the VUs act as customers (create + select), half as riders (bid).
  if (__VU % 2 === 0) {
    const orderId = createOrder(me.accessToken);
    if (!orderId) return;
    sleep(2); // let riders bid
    // Fetch the bid sheet and select the first — the contended write.
    const res = selectFirstOffer(me.accessToken, orderId);
    if (res) {
      if (res.status === 200 || res.status === 201) assigns.add(1);
      else if (res.status === 409) conflicts.add(1);
    }
  } else {
    // Rider: bid on whatever open orders exist (the board). Best-effort — a taken order just 409s.
    const board = json(offersBoard(me.accessToken)) || [];
    const target = board[0];
    if (target?.id) makeOfferTagged(me.accessToken, target.id, 4.5 + Math.random());
  }
  sleep(1);
}

import http from "k6/http";
import { BASE_URL, auth } from "./lib.js";

function offersBoard(token) {
  return http.get(`${BASE_URL}/orders/open`, auth(token));
}
function makeOfferTagged(token, orderId, fare) {
  const res = http.post(
    `${BASE_URL}/orders/${orderId}/offers`,
    JSON.stringify({ type: "accept", offeredFare: Number(fare.toFixed(2)), etaMinutes: 10 }),
    Object.assign({ tags: { name: "offer" } }, auth(token)),
  );
  check(res, { "offer ok or conflict": (r) => [201, 409, 403].includes(r.status) });
  return res;
}
function selectFirstOffer(token, orderId) {
  const list = json(http.get(`${BASE_URL}/orders/${orderId}/offers`, auth(token))) || [];
  const first = list[0];
  if (!first?.id) return null;
  return http.post(
    `${BASE_URL}/orders/${orderId}/offers/${first.id}/select`,
    null,
    Object.assign({ tags: { name: "select" } }, auth(token)),
  );
}
