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
    // T13a "Change time": the schedule sheet's slots (R5a's sample — 11:00 and 13:00 tomorrow are full).
    { match: /^\/restaurants\/[^/]+\/schedule-slots/, json: () => scheduleSlots() },
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

// ── Round 3 (shops, pharmacy, scheduled, Rx): the handoff's other two sample venues (of-kit.js `V` / `ORD`) ──
const item = (n, name, priceUsd, over = {}) => ({
  itemId: `0a1b2c3d-0000-4000-8000-0000000004${String(n).padStart(2, "0")}`,
  dishId: `0a1b2c3d-0000-4000-8000-0000000005${String(n).padStart(2, "0")}`,
  name,
  priceUsd,
  quantity: 1,
  note: null,
  available: true,
  ...over,
});

/** Avondale Fresh (a grocery shop): Bread, Eggs, Mazoe, oil — $14.60 + $1.50 = $16.10. */
export const AVF = {
  food: {
    venue: { name: "Avondale Fresh", businessType: "shop", shopKind: "grocery" },
    items: [item(1, "Bread (Lobels 700g)", 1.1), item(2, "Eggs (tray of 30)", 5.5), item(3, "Mazoe orange 2L", 3.2), item(4, "Cooking oil 2L", 4.8)],
    merchantGoodsTotal: 14.6,
    total: 16.1,
    restaurantPhone: "0242 333 210",
  },
  snap: { merchantName: "Avondale Fresh", pickup: { point: VENUE, landmark: "Avondale Fresh" } },
};

/** Avondale Pharmacy: Paracetamol, ORS, Plasters — $5.30 + $1.50 = $6.80 (the Rx order adds Amoxicillin). */
export const AVP = {
  food: {
    venue: { name: "Avondale Pharmacy", businessType: "shop", shopKind: "pharmacy" },
    items: [item(11, "Paracetamol 500mg (20 tabs)", 1.5), item(12, "ORS sachets (x5)", 2), item(13, "Plasters (20)", 1.8)],
    merchantGoodsTotal: 5.3,
    total: 6.8,
    restaurantPhone: "0242 335 090",
  },
  snap: { merchantName: "Avondale Pharmacy", pickup: { point: VENUE, landmark: "Avondale Pharmacy" } },
};

/** The pharmacy's Rx order: Amoxicillin (needs the prescription) + the three OTC lines. */
export const rxItems = (amoxAvailable = true) => [item(10, "Amoxicillin 500mg (21 caps)", 4.2, { rxRequired: true, available: amoxAvailable }), ...AVP.food.items];

/** A device-local clock time `days` from today (the slot pickers speak the phone's day). */
export const localAt = (days, h, m) => {
  const d = new Date();
  d.setDate(d.getDate() + days);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
};

/** R5a's slot grid, tomorrow 11:00–15:00 (11:00 and 13:00 full); today has none left. */
function scheduleSlots() {
  const pad = (n) => String(n).padStart(2, "0");
  const slot = (h, m, full = false) => {
    const eh = m === 30 ? h + 1 : h;
    const em = m === 30 ? 0 : 30;
    return { start: localAt(1, h, m), end: localAt(1, eh, em), label: `${pad(h)}:${pad(m)}–${pad(eh)}:${pad(em)}`, full };
  };
  const tomorrow = [slot(11, 0, true), slot(11, 30), slot(12, 0), slot(12, 30), slot(13, 0, true), slot(13, 30), slot(14, 0), slot(14, 30)];
  return {
    slotMinutes: 30,
    openNow: true,
    leadMinutes: 25,
    today: { date: localAt(0, 0, 0).slice(0, 10), slots: [] },
    tomorrow: { date: localAt(1, 0, 0).slice(0, 10), slots: tomorrow },
    firstAvailable: tomorrow[1],
  };
}
