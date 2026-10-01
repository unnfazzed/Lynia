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

export function stage({ rider = true, kycStatus, cancelStrikes, balance = 7.6, side, kycPendingState } = {}) {
  if (side) setParams({ side });
  installRouter([
    { match: "/auth/me", json: me({ rider, kycStatus, cancelStrikes, kycPendingState }) },
    { match: "/notifications/unread-count", json: { count: 3 } },
    { match: "/orders/mine/active", json: null },
    { match: "/orders/history", json: HISTORY },
    { match: "/wallet/config", json: { enabled: true, ratePct: 10, floor: 2, graceCredit: 3, minTopUp: 2, maxTopUp: 100 } },
    { match: "/wallet/ledger", json: LEDGER },
    { match: "/wallet", method: "GET", json: { balance, currency: "USD", updatedAt: ago(2) } },
  ]);
}

export const wrap = withQuery();
export const wrapAuth = withAuthQuery();
