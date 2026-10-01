// Shared Rider v2 fixtures (ledger D-54; packages/design/handoff/rider-v2/). The sample people and
// places are the handoff's own (Tendai Moyo, Rudo, Eastgate Mall → 14 Glenara Ave …) so the app column
// of tools/parity/shoot-rider-v2.mjs reads like the handoff column beside it.
import { installRouter, setParams, withQuery } from "./_harness.mjs";
import { withAuthQuery } from "./_auth.mjs";

const ago = (min) => new Date(Date.now() - min * 60_000).toISOString();
const todayAt = (h, m) => {
  const d = new Date();
  d.setHours(h, m, 0, 0);
  return d.toISOString();
};

export function me({ rider = true, kycStatus = "verified", cancelStrikes = 1, kycPendingState = null } = {}) {
  return {
    profileId: "0a1b2c3d-0000-4000-8000-00000000me01",
    role: rider ? "rider" : "customer",
    firstName: "Tendai",
    lastName: "Moyo",
    phone: "+263772451180",
    email: null,
    photoUrl: null,
    ordersCount: 18,
    idNumber: null,
    onHold: false,
    rider: rider
      ? { bikeReg: "ABH 4721", kycStatus, kycDeclineReason: null, kycAttempts: 1, cancelStrikes, ratingAvg: 4.9, ratingCount: 128, tripsCount: 312, isOnline: true, kycMode: "auto", kycPendingState }
      : null,
  };
}

const job = (id, from, to, fare, h, m, extra = {}) => ({
  id: `0a1b2c3d-0000-4000-8000-0000000000${id}`,
  orderType: "parcel",
  merchantName: null,
  role: "rider",
  pickup: { point: { lat: -17.83, lng: 31.05 }, landmark: from },
  dropoff: { point: { lat: -17.8, lng: 31.04 }, landmark: to },
  itemDesc: "Documents envelope",
  note: null,
  proposedFare: fare,
  agreedFare: fare,
  status: "delivered",
  createdAt: todayAt(h, m),
  rating: null,
  counterpartyName: "Rudo K.",
  ...extra,
});

export const HISTORY = [
  job("b1", "Eastgate Mall", "Avenues", "3.20", 9, 31),
  job("b2", "Mama's Kitchen", "Avondale", "2.80", 8, 50, { orderType: "merchant", merchantName: "Mama's Kitchen" }),
  job("b3", "Fife Ave Shops", "Belgravia", "2.50", 7, 40),
  job("b4", "Copacabana Rank", "Mbare Musika", "4.00", 7, 5, { status: "cancelled" }),
  job("c1", "Eastgate Mall", "14 Glenara Ave", "3.36", 6, 30, { role: "customer" }),
  job("c2", "Avondale Shops", "Mt Pleasant", "4.00", 6, 0, { role: "customer" }),
];

const entry = (n, type, amount, title, createdAt, extra = {}) => ({ id: `led_${n}`, type, amount, balanceAfter: 7.6, title, meta: "", createdAt, ...extra });
const LEDGER = {
  entries: [
    entry(1, "commission", -0.32, "Commission", todayAt(9, 31), { ratePct: 10, fare: 3.2 }),
    entry(2, "commission", -0.25, "Commission", todayAt(7, 40), { ratePct: 10, fare: 2.5 }),
    entry(3, "topup", 5, "Top-up · EcoCash", todayAt(7, 2), { rail: "ecocash" }),
  ],
};

// The board's open jobs (J1): the handoff's own sample places around Avondale, nearest first.
const AVONDALE = { lat: -17.8009, lng: 31.0389 };
const open = (n, from, fromPt, to, toPt, item, fare, km, name) => ({
  id: `0a1b2c3d-0000-4000-8000-0000000op${String(n).padStart(3, "0")}`,
  pickup: { point: fromPt, landmark: from },
  dropoff: { point: toPt, landmark: to },
  itemDesc: item,
  suggestedFare: fare,
  proposedFare: fare,
  distanceKm: km,
  createdAt: ago(n),
  customerFirstName: name,
});
export const OPEN_ORDERS = [
  open(1, "Eastgate Mall", { lat: -17.8306, lng: 31.0525 }, "14 Glenara Ave", { lat: -17.8125, lng: 31.0712 }, "Documents envelope", "3.00", 2.4, "Rudo"),
  open(2, "Avondale Shops", AVONDALE, "Mt Pleasant", { lat: -17.775, lng: 31.045 }, "Small box", "3.50", 3.1, "Farai"),
  open(3, "Fife Ave Shops", { lat: -17.818, lng: 31.047 }, "Belgravia", { lat: -17.81, lng: 31.04 }, "Phone + charger", "2.50", 1.6, "Chipo"),
];

export function stage({ rider = true, kycStatus, cancelStrikes, balance = 7.6, side, kycPendingState, openOrders = [], active = false, extra = [] } = {}) {
  if (side) setParams({ side });
  installRouter([
    { match: "/auth/me", json: me({ rider, kycStatus, cancelStrikes, kycPendingState }) },
    { match: "/notifications/unread-count", json: { count: 3 } },
    // `false`, not `null`: the harness coalesces a null body to `{}`, which would read as an active job.
    { match: "/orders/mine/active", json: active },
    ...extra,
    { match: "/orders/open", json: openOrders },
    { match: "/orders/history", json: HISTORY },
    { match: "/wallet/config", json: { enabled: true, ratePct: 10, floor: 2, graceCredit: 3, minTopUp: 2, maxTopUp: 100 } },
    { match: "/wallet/ledger", json: LEDGER },
    { match: "/wallet", method: "GET", json: { balance, currency: "USD", updatedAt: ago(2) } },
  ]);
}

export const wrap = withQuery();
export const wrapAuth = withAuthQuery();

// The rider's live parcel job (A1–A8): the handoff's Eastgate Mall → 14 Glenara Ave with Rudo sending.
export function activeJob(status) {
  return {
    id: "0a1b2c3d-0000-4000-8000-0000000job01",
    orderType: "parcel",
    status,
    agreedFare: "3.20",
    proposedFare: "3.20",
    customerFirstName: "Rudo",
    pickup: { point: { lat: -17.8306, lng: 31.0525 }, landmark: "Eastgate Mall", contactPhone: "+263772451180" },
    dropoff: { point: { lat: -17.8125, lng: 31.0712 }, landmark: "14 Glenara Ave", contactPhone: "+263773112233" },
    items: [{ description: "Documents envelope", quantity: 1 }],
    itemsCollected: null,
    note: null,
    pickupPhotoUrl: null,
    rider: { profileId: "0a1b2c3d-0000-4000-8000-00000000me01", currentLat: -17.8251, currentLng: 31.0471, updatedAt: ago(0) },
    events: [],
    counterpartyPhone: "+263772451180",
    expiresAt: null,
    deliveryOtpAttempts: 0,
    distanceKm: 3.1,
  };
}

// A live food offer (F1/F2): Mama's Kitchen → Belgravia, 42 s left.
export function foodOffer(cashRule) {
  return {
    orderId: "0a1b2c3d-0000-4000-8000-0000000food1",
    merchantId: "0a1b2c3d-0000-4000-8000-0000000mer01",
    pickup: { point: { lat: -17.8009, lng: 31.0389 }, landmark: "Mama's Kitchen" },
    dropoff: { point: { lat: -17.81, lng: 31.04 }, landmark: "Belgravia" },
    itemDesc: "2 items",
    merchantGoodsTotal: 12.5,
    deliveryFee: 3.2,
    distanceKm: 3.1,
    expiresAt: new Date(Date.now() + 42_000).toISOString(),
    merchantPaymentMethod: "cash",
    merchantCashRule: cashRule,
  };
}
