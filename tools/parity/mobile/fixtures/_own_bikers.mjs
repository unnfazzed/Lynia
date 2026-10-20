// Own bikers v1 fixtures (ledger D-117; packages/design/handoff/own-bikers-v1/). The handoff's one data set:
// Tendai rides for Chicken Inn Avondale; Kuda is invited. Built on the Rider v2 stage (_rider_v2.mjs).
import * as SecureStore from "expo-secure-store";
import { installRouter, setParams } from "./_harness.mjs";
import { activeJob, OPEN_ORDERS, stage } from "./_rider_v2.mjs";

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

// ── OB-R8–R13 · the job, Done, Money, Account, the end of the fleet ────────────────────────────────────────────────
const ME = "0a1b2c3d-0000-4000-8000-00000000me01";
const JOB = "0a1b2c3d-0000-4000-8000-0000000flj01";
const ago = (s) => new Date(Date.now() - s * 1000).toISOString();
const PICK = { lat: -17.8009, lng: 31.0389 };
const DROP = { lat: -17.79, lng: 31.05 };

/** The fleet food job (handoff: Chicken Inn Avondale → 22 King George Rd, $14.00 cash at the door, all of it back). */
function fleetFood(status, extra = {}) {
  const order = {
    id: JOB,
    status,
    orderType: "merchant",
    viewerRole: "rider",
    agreedFare: "2.50",
    proposedFare: "2.50",
    customerFirstName: "Rudo",
    fleetShop: SHOP,
    pickup: { point: PICK, landmark: SHOP, contactPhone: "+263772100200" },
    dropoff: { point: DROP, landmark: "22 King George Rd, Avondale" },
    items: [
      { description: "2-piece meal", quantity: 1 },
      { description: "Chips", quantity: 1 },
    ],
    rider: { profileId: ME, currentLat: -17.805, currentLng: 31.041, updatedAt: ago(0) },
    events: [
      { status: "assigned", createdAt: ago(600) },
      { status: "en_route_pickup", createdAt: ago(420) },
    ],
    counterpartyPhone: "+263773112233",
    expiresAt: null,
  };
  const food = {
    id: JOB,
    merchantId: "0a1b2c3d-0000-4000-8000-00000000mr01",
    status,
    merchantPhase: null,
    items: [
      { dishId: "0a1b2c3d-0000-4000-8000-00000000d101", name: "2-piece meal", priceUsd: 8.5, quantity: 1, note: null, available: true },
      { dishId: "0a1b2c3d-0000-4000-8000-00000000d102", name: "Chips", priceUsd: 3.0, quantity: 1, note: null, available: true },
    ],
    note: null,
    paymentMethod: "cash",
    merchantPaymentPhone: null,
    merchantGoodsTotal: 11.5,
    deliveryFee: 2.5,
    total: 14.0,
    acceptDeadlineAt: null,
    itemApprovalDeadlineAt: null,
    prepMinutes: 15,
    prepStartedAt: ago(300),
    readyAt: null,
    rejectionReason: null,
    paymentCallLoggedAt: null,
    paymentRequestedAt: null,
    merchantPaymentReference: null,
    merchantPaymentConfirmedAt: null,
    riderId: ME,
    dispatchAttempt: 1,
    dispatchOfferExpiresAt: null,
    noRiderHoldAt: null,
    pickupCodeAttempts: 0,
    cashHandshakeAmount: null,
    customerCashConfirmedAt: null,
    riderCashConfirmedAt: null,
    cashHandshakeDeadlineAt: null,
    cashHandshakeFrozenAt: null,
    noShowCallTimestamps: [],
    merchantCashRule: "collect_and_return",
    debtStatus: null,
    debtAmount: null,
    debtOpenedAt: null,
    debtSettledAt: null,
    fleetShop: SHOP,
    ...extra,
  };
  return { order, food };
}

/** OB-R8 / R11: the live fleet food job at `status`. */
export function stageFleetFoodJob(status) {
  const { order, food } = fleetFood(status);
  installRouter([
    { match: "/orders/mine/active", json: order },
    { match: /\/merchant\/orders\/[^/]+\/mine$/, json: food },
    { match: "/wallet/config", json: { enabled: true, ratePct: 10, floor: 2, graceCredit: 3, minTopUp: 2, maxTopUp: 100 } },
  ]);
}

/**
 * OB-R8 "Return the cash" and OB-R9 Done, through the real screen: the delivered job comes back from the phone's
 * return-leg slot (FJ-H3). `debt` "open" → reopened before the counter confirmed (R8); "settled_cash" → Done (R9);
 * `prepaid` → Done · nothing to return.
 */
export function stageFleetDelivered({ debt = "open", prepaid = false } = {}) {
  const { food } = fleetFood("delivered", { debtStatus: debt, debtAmount: 14.0, debtOpenedAt: ago(120), ...(prepaid ? { paymentMethod: "wallet", merchantCashRule: null } : {}) });
  void SecureStore.setItemAsync(
    "lynia.riderFoodReturn",
    JSON.stringify({
      orderId: JOB,
      kind: "delivered",
      snapshot: {
        orderId: JOB,
        pickupPoint: PICK,
        dropoffPoint: DROP,
        merchantCashRule: prepaid ? null : "collect_and_return",
        paymentMethod: prepaid ? "wallet" : "cash",
        merchantGoodsTotal: 11.5,
        deliveryFee: 2.5,
        merchantDeliveryShare: null,
        merchantName: SHOP,
        kitchenPhone: "+263772100200",
        place: "kitchen",
        fleetShop: SHOP,
      },
    }),
  );
  installRouter([
    { match: "/orders/mine/active", json: false },
    { match: /\/merchant\/orders\/[^/]+\/mine$/, json: food },
    { match: "/wallet/config", json: { enabled: true, ratePct: 10, floor: 2, graceCredit: 3, minTopUp: 2, maxTopUp: 100 } },
  ]);
}

/** OB-R10: Money for an own biker (the handoff's $14.00 held, Collected · #B204, Returned to Chicken Inn). */
export function stageFleetMoney() {
  stage({
    extra: [
      flags,
      member(),
      {
        match: "/fleet/money",
        json: {
          shop: SHOP,
          cashHeld: "14.00",
          lines: [
            { kind: "collected", ref: "#B204", amount: "14.00", at: ago(1800) },
            { kind: "returned", ref: "#B198", amount: "9.50", at: ago(5400) },
            { kind: "collected", ref: "#B198", amount: "9.50", at: ago(7200) },
          ],
        },
      },
    ],
  });
}

/** OB-R12: Account with the fleet row; `onJob` = a delivery is running (Leave waits). */
export function stageFleetAccount({ onJob = false } = {}) {
  stage({ active: onJob ? activeJob("en_route_dropoff") : false, extra: [flags, member(), { match: "/fleet/leave", method: "POST", json: { ok: true } }] });
}

/** OB-R13: the phone remembers Chicken Inn Avondale; the server now says no fleet. */
export function stageFleetEnded() {
  void SecureStore.setItemAsync(`lynia.fleetShop.v1.${ME}`, SHOP);
  stage({ openOrders: OPEN_ORDERS.slice(0, 1), extra: [flags, mine(null)] });
}
