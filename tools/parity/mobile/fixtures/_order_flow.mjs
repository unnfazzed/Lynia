// Shared staging for the Order flow v2 customer shoot (tools/parity/shoot-order-flow-customer.mjs, ledger
// D-59). Each of_* fixture calls `stage()` with what differs. The handoff's own sample (PROMPT.md Part 2
// §7: Gava's Kitchen, $15.00 + $1.50 = $16.50, Tendai M. / ABH 4721, code 418 290) is used so the app
// column reads like the frames. The map is the react-native-maps web shim (a grey field, no markers).
import * as SecureStore from "expo-secure-store";
import { installRouter, setParams } from "./_harness.mjs";
import { withAuthQuery } from "./_auth.mjs";
import { __setProbeFetch, reportUnreachable } from "../../../../apps/mobile/src/net/reachability";

export const ORDER_ID = "a1b20000-0000-4000-8000-000000000001";
const MERCHANT_ID = "0a1b2c3d-0000-4000-8000-0000000001a0";
const RIDER_ID = "0a1b2c3d-0000-4000-8000-000000000003";
const now = Date.now();
const at = (ms) => new Date(now + ms).toISOString();

const VENUE = { lat: -17.8292, lng: 31.0522 };
const DROP = { lat: -17.8105, lng: 31.0705 };
const POS = {
  far: { lat: -17.845, lng: 31.035 },
  venue: { lat: -17.8294, lng: 31.0523 },
  mid: { lat: -17.8195, lng: 31.0615 },
  door: { lat: -17.8107, lng: 31.0704 },
};
const RIDER = { firstName: "Tendai", lastName: "Moyo", photoUrl: null, ratingAvg: 4.8, ratingCount: 40, tripsCount: 132, plate: "ABH 4721", verified: true };

const ITEMS = [
  { itemId: "0a1b2c3d-0000-4000-8000-0000000003a1", dishId: "0a1b2c3d-0000-4000-8000-000000000201", name: "Sadza & beef stew", priceUsd: 4.5, quantity: 2, note: "Extra gravy", available: true },
  { itemId: "0a1b2c3d-0000-4000-8000-0000000003a2", dishId: "0a1b2c3d-0000-4000-8000-000000000202", name: "Roast chicken (half)", priceUsd: 6, quantity: 1, note: null, available: true },
];

/**
 * @param {object} o
 * @param {string} o.status            the order status
 * @param {string|null} [o.phase]      merchantPhase
 * @param {object} [o.food]            MerchantOrderResponse overrides
 * @param {object} [o.snap]            OrderSnapshot overrides
 * @param {keyof POS} [o.pos]          the rider's fix
 * @param {number} [o.fixAgoMs]
 * @param {boolean} [o.rider]          a rider holds the job
 * @param {boolean} [o.code]           the device already holds the delivery code
 * @param {boolean} [o.offline]
 * @param {number} [o.loadStatus]      the food order GET answers this status
 * @param {number} [o.snapStatus]     the snapshot GET answers this status
 * @param {boolean} [o.hang]           the food order GET never answers (T14a)
 */
export function stage({ status, phase = null, food = {}, snap = {}, pos, fixAgoMs = 4_000, rider = false, code = false, offline = false, loadStatus, snapStatus, hang = false, sawRider = false }) {
  const withRider = rider || ["assigned", "confirmed", "en_route_pickup", "picked_up", "en_route_dropoff", "delivered", "completed", "undelivered"].includes(status);
  const order = {
    id: ORDER_ID,
    merchantId: MERCHANT_ID,
    status,
    merchantPhase: phase,
    items: ITEMS,
    note: null,
    paymentMethod: "cash",
    merchantPaymentPhone: null,
    merchantGoodsTotal: 15,
    deliveryFee: 1.5,
    total: 16.5,
    acceptDeadlineAt: null,
    itemApprovalDeadlineAt: null,
    prepMinutes: 20,
    prepStartedAt: at(-8 * 60_000),
    readyAt: null,
    rejectionReason: null,
    paymentCallLoggedAt: null,
    paymentRequestedAt: null,
    merchantPaymentReference: null,
    merchantPaymentConfirmedAt: null,
    riderId: withRider ? RIDER_ID : null,
    rider: withRider
      ? { profileId: RIDER_ID, firstName: "Tendai", lastName: "Moyo", photoUrl: null, ratingAvg: 4.8, ratingCount: 40, tripsCount: 132, vehicleInfo: "Bike", plate: "ABH 4721", kycVerified: true }
      : null,
    dispatchAttempt: withRider ? 1 : 0,
    dispatchOfferExpiresAt: null,
    noRiderHoldAt: null,
    pickupCodeAttempts: 0,
    noShowCallTimestamps: [],
    createdAt: at(-20 * 60_000),
    restaurantPhone: "0242 700 111",
    ...food,
  };
  const snapshot = {
    id: ORDER_ID,
    status,
    orderType: "merchant",
    merchantName: "Gava’s Kitchen",
    viewerRole: "customer",
    agreedFare: "1.50",
    proposedFare: "1.50",
    pickup: { point: VENUE, landmark: "Gava’s Kitchen" },
    dropoff: { point: DROP, landmark: "12 Lanark Rd" },
    rider: withRider ? { profileId: RIDER_ID, currentLat: pos ? POS[pos].lat : null, currentLng: pos ? POS[pos].lng : null, updatedAt: pos ? at(-fixAgoMs) : null } : null,
    riderCard: withRider ? RIDER : null,
    rating: null,
    events: [{ status: "requested", createdAt: at(-20 * 60_000) }, ...(withRider ? [{ status: "assigned", createdAt: at(-9 * 60_000) }] : [])],
    counterpartyPhone: withRider && status !== "delivered" && status !== "completed" ? "+263771234580" : null,
    expiresAt: null,
    deliveryOtpAttempts: 0,
    codeRotatedAt: null,
    ...snap,
  };
  installRouter([
    { match: /^\/restaurants\/orders\/[^/]+\/cash\/customer-confirm$/, method: "POST", json: { orderId: ORDER_ID, customerCashConfirmedAt: at(0) } },
    { match: /^\/orders\/[^/]+\/delivery-code\/rotate$/, method: "POST", json: { deliveryCode: "418290" } },
    { match: /^\/restaurants\/orders\/[^/]+$/, status: loadStatus ?? 200, json: () => (loadStatus ? { message: "x" } : order) },
    { match: /^\/orders\/[^/]+$/, status: snapStatus ?? 200, json: () => (snapStatus ? { message: "x" } : snapshot) },
  ]);
  if (hang) {
    const routed = globalThis.fetch;
    globalThis.fetch = (input, init) => {
      const url = typeof input === "string" ? input : input.url;
      if (/\/restaurants\/orders\/[^/]+$/.test(new URL(url, "http://p").pathname)) return new Promise(() => undefined);
      return routed(input, init);
    };
  }
  setParams({ id: ORDER_ID });
  if (sawRider) void SecureStore.setItemAsync("lynia.food-order.snapshot.v1", JSON.stringify({ orderId: ORDER_ID, status, merchantPhase: phase, sawRider: true, savedAt: at(-60_000) }));
  if (code) void SecureStore.setItemAsync(`lynia.deliveryCode.${ORDER_ID}`, "418290");
  if (offline) {
    __setProbeFetch(async () => false);
    setTimeout(() => reportUnreachable(), 50);
  }
  return { wrap: withAuthQuery() };
}

export const T = at;
