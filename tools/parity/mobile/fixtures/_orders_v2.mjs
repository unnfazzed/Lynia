// Orders v2 staging (ledger D-63; tools/parity/shoot-orders-v2.mjs): the Orders tab's feeds with the
// handoff's own sample people and places (packages/design/handoff/orders-v2/design/o-kit.js RUN / HIST),
// so the app column reads like the handoff column beside it. Fields the API doesn't carry yet (a row's
// shop kind, charged amount, cancel reason) can't be staged: those rows fall back as README §9 says.
import { installRouter, withQuery } from "./_harness.mjs";

const now = Date.now();
const at = (ms) => new Date(now + ms).toISOString();
const dayAt = (daysAgo, h, m) => {
  const d = new Date();
  d.setDate(d.getDate() - daysAgo);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
};
const EASTGATE = { lat: -17.8292, lng: 31.0522 };
const BELGRAVIA = { lat: -17.8105, lng: 31.0405 };
const NEAR = { lat: -17.8175, lng: 31.0445 };
const TENDAI = { firstName: "Tendai", lastName: "Moyo", photoUrl: null, ratingAvg: 4.8, ratingCount: 40, tripsCount: 132, plate: "ABH 4721", verified: true };

let n = 0;
const id = () => `0a1b2c3d-0000-4000-8000-0000000008${String(++n).padStart(2, "0")}`;

/** A running parcel: `on_the_way` (Tendai, fresh fix near Belgravia) or `finding` (window open). */
export function parcel(stage) {
  const way = stage === "on_the_way";
  return {
    snap: {
      id: id(),
      status: way ? "en_route_dropoff" : "open_for_offers",
      orderType: "parcel",
      viewerRole: "customer",
      agreedFare: way ? "3.36" : null,
      proposedFare: "3.36",
      pickup: { point: EASTGATE, landmark: "Eastgate Mall, CBD" },
      dropoff: { point: BELGRAVIA, landmark: "Belgravia, Harare" },
      items: null,
      note: null,
      rider: way ? { profileId: "0a1b2c3d-0000-4000-8000-000000000003", currentLat: NEAR.lat, currentLng: NEAR.lng, updatedAt: at(-5000) } : null,
      riderCard: way ? TENDAI : null,
      events: [],
      counterpartyPhone: null,
      expiresAt: way ? null : at(252_000),
    },
  };
}

/** A running merchant order the kitchen is preparing (restaurant or shop). */
export function cooking(venue) {
  const oid = id();
  return {
    snap: {
      id: oid,
      status: "requested",
      orderType: "merchant",
      merchantName: venue.name,
      merchantPhase: "preparing",
      viewerRole: "customer",
      agreedFare: "15.50",
      proposedFare: "15.50",
      pickup: { point: EASTGATE, landmark: venue.name },
      dropoff: { point: BELGRAVIA, landmark: "12 Lanark Rd, Belgravia" },
      items: null,
      note: null,
      rider: null,
      events: [],
      counterpartyPhone: null,
      expiresAt: null,
    },
    order: {
      id: oid,
      merchantId: "0a1b2c3d-0000-4000-8000-0000000001a0",
      status: "requested",
      merchantPhase: "preparing",
      autoAccepted: true,
      kitchenConfirmedAt: at(-10 * 60_000),
      items: [],
      note: null,
      paymentMethod: "cash",
      merchantGoodsTotal: 14,
      deliveryFee: 1.5,
      total: 15.5,
      acceptDeadlineAt: null,
      itemApprovalDeadlineAt: null,
      prepMinutes: 30,
      prepStartedAt: at(-8 * 60_000),
      readyAt: null,
      riderId: null,
      rider: null,
      venue,
      createdAt: at(-12 * 60_000),
    },
  };
}
export const SADZA = { name: "Sadza Republic", businessType: "restaurant", shopKind: null };
export const AVP = { name: "Avondale Pharmacy", businessType: "shop", shopKind: "pharmacy" };

function row(daysAgo, h, m, over) {
  return {
    id: id(),
    orderType: "parcel",
    merchantName: null,
    role: "customer",
    pickup: { point: EASTGATE, landmark: "Eastgate Mall, CBD" },
    dropoff: { point: BELGRAVIA, landmark: "Belgravia, Harare" },
    itemDesc: "Documents",
    note: null,
    proposedFare: "5.00",
    agreedFare: "5.00",
    status: "delivered",
    createdAt: dayAt(daysAgo, h, m),
    rating: null,
    counterpartyName: "Rudo Kanengoni",
    // GET /orders/mine/history's own fields (D-63); a row that names none is a delivered parcel.
    service: "parcel",
    outcome: "delivered",
    chargedTotal: "5.00",
    ...over,
  };
}

/** The handoff's HIST, as the history feed carries it (newest first). */
export const HISTORY = [
  row(0, 13, 5, { service: "food", chargedTotal: "12.50", orderType: "merchant", merchantName: "Gava’s Kitchen", itemDesc: "Sadza & beef stew, Mazoe ×2", agreedFare: "12.50", proposedFare: "12.50", counterpartyName: "Tendai Moyo", rating: { score: 4, comment: null } }),
  row(0, 8, 40, {}),
  row(1, 17, 20, { outcome: "no_rider", chargedTotal: null, pickup: { point: EASTGATE, landmark: "Avondale Shops" }, dropoff: { point: BELGRAVIA, landmark: "Mount Pleasant" }, itemDesc: "Laptop bag", status: "expired", agreedFare: null, counterpartyName: null }),
  row(1, 12, 10, { service: "food", outcome: "kitchen_timeout", chargedTotal: null, orderType: "merchant", merchantName: "Nando’s Avondale", itemDesc: "Peri chicken, chips ×2", status: "cancelled", counterpartyName: null }),
  row(4, 16, 45, { service: "pharmacy", chargedTotal: "8.40", orderType: "merchant", merchantName: "Avondale Pharmacy", itemDesc: "3 items", agreedFare: "8.40", proposedFare: "8.40", counterpartyName: "Farai Ncube", rating: { score: 5, comment: null } }),
  row(4, 9, 2, { outcome: "cancelled_by_you", chargedTotal: null, pickup: { point: EASTGATE, landmark: "Avondale Shops" }, itemDesc: "Keys", status: "cancelled", counterpartyName: null }),
  row(6, 15, 30, { outcome: "not_delivered", chargedTotal: null, pickup: { point: EASTGATE, landmark: "Sam Levy’s" }, dropoff: { point: BELGRAVIA, landmark: "Borrowdale" }, itemDesc: "Shoes in a box", status: "undelivered", counterpartyName: "Tendai Moyo" }),
];

/** Install the Orders tab's feeds. `historyStatus` 500 stages O21; `food` false stages the parcels-only app. */
export function ordersFixture({ active = [], history = HISTORY, historyStatus = 200, food = true, shops = true, pharmacy = true } = {}) {
  const reads = new Map(active.filter((o) => o.order).map((o) => [o.snap.id, o.order]));
  installRouter([
    { match: /^\/orders\/mine\/active-orders$/, json: active.map((o) => o.snap) },
    { match: /^\/restaurants\/orders\/[^/]+$/, json: (path) => reads.get(path.split("/").pop()) ?? {} },
    { match: "/orders/history", json: historyStatus === 200 ? history : { message: "down" }, status: historyStatus },
    { match: "/orders/mine/history", json: historyStatus === 200 ? { rows: history, nextCursor: null } : { message: "down" }, status: historyStatus },
    { match: "/app/feature-flags", json: { restaurantsEnabled: food, merchantDispatchAutoEnabled: food, merchantWalletEnabled: false } },
    { match: "/app/service-flags", json: { shopsEnabled: shops, pharmacyEnabled: pharmacy } },
  ]);
  return { wrap: withQuery() };
}
