// Own bikers v1 fixtures (ledger D-117; packages/design/handoff/own-bikers-v1/). The handoff's one data set:
// Tendai rides for Chicken Inn Avondale; Kuda is invited. Built on the Rider v2 stage (_rider_v2.mjs).
import { setParams } from "./_harness.mjs";
import { OPEN_ORDERS, stage } from "./_rider_v2.mjs";

export const SHOP = "Chicken Inn Avondale";
const inS = (s) => new Date(Date.now() + s * 1000).toISOString();

export const fleetOffer = (n, from, fromPt, to, toPt, collect, km, leftS = 38) => ({
  orderId: `0a1b2c3d-0000-4000-8000-0000000flt0${n}`,
  shop: SHOP,
  pickup: { point: fromPt, landmark: from },
  dropoff: { point: toPt, landmark: to },
  itemsSummary: "2 dishes",
  collect,
  distanceKm: km,
  expiresAt: inS(leftS),
  kind: "app",
});
export const OFFERS = [
  fleetOffer(1, SHOP, { lat: -17.8009, lng: 31.0389 }, "22 King George Rd, Avondale", { lat: -17.79, lng: 31.05 }, "14.00", 3.2),
  fleetOffer(2, "Chicken Inn Borrowdale", { lat: -17.775, lng: 31.075 }, "Sam Levy Village, Borrowdale", { lat: -17.765, lng: 31.085 }, null, 1.8),
];

const flags = { match: "/app/order-flags", json: { rxEnabled: true, fleetLive: true } };
const mine = (fleet, invites = []) => ({ match: "/fleet/me", json: { fleet, invites } });
const member = (paused = false) => mine({ shop: SHOP, paused, joinedAt: "2026-10-01T10:00:00.000Z" });
const invite = (canJoin) => ({ id: "0a1b2c3d-0000-4000-8000-0000000inv01", shop: SHOP, canJoin, expiresAt: inS(5 * 86400) });

/** OB-R4–R6: a fleet biker's board. `offers` = the jobs ringing them, or { status } for a failed read. */
export function stageFleetBoard({ offers = OFFERS, paused = false, status } = {}) {
  stage({ extra: [flags, member(paused), status ? { match: "/fleet/jobs/offers", status, json: { message: "" } } : { match: "/fleet/jobs/offers", json: { offers } }] });
}

/** OB-R2/R3: Kuda, verified, invited — the public board with the Join card. `refusal` = the join's answer. */
export function stageJoin({ refusal } = {}) {
  stage({
    firstName: "Kuda",
    openOrders: OPEN_ORDERS.slice(0, 1),
    extra: [flags, mine(null, [invite(true)]), ...(refusal ? [{ match: /\/fleet\/invites\/.*\/join/, status: refusal.status, json: { reason: refusal.reason, message: refusal.message } }] : [])],
  });
}

/** OB-R1: Kuda invited while the ID check is still running. */
export function stageInviteWaiting() {
  stage({ firstName: "Kuda", kycStatus: "pending", kycPendingState: "in_flight", extra: [flags, mine(null, [invite(false)])] });
}

/** OB-R7: the ringing offer screen (and F4 with none). */
export function stageFleetOffer({ offers = OFFERS.slice(0, 1) } = {}) {
  setParams({ orderId: OFFERS[0].orderId });
  stage({ extra: [flags, member(), { match: "/fleet/jobs/offers", json: { offers } }] });
}
