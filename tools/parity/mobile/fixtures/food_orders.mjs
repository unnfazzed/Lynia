// RC.orders — the Orders tab, populated: a live order pinned on top + an "EARLIER" cross-service
// list (food + parcel rows). Two feeds — GET /orders/mine/active-order (the pinned live card) and
// GET /orders/history (the earlier list). Fares are wire STRINGS; uuids uuid-shaped.
import { installRouter, withQuery, UUID } from "./_harness.mjs";

const LOC = { lat: -17.8292, lng: 31.0522 };
const DROP = { lat: -17.8145, lng: 31.045 };

const activeOrder = {
  id: UUID.order,
  status: "en_route_dropoff",
  orderType: "parcel",
  viewerRole: "customer",
  agreedFare: "6.00",
  proposedFare: "6.00",
  pickup: { point: LOC, landmark: "Avondale Shops" },
  dropoff: { point: DROP, landmark: "12 Fife Avenue" },
  items: null,
  note: null,
  rider: { profileId: "0a1b2c3d-0000-4000-8000-0000000000f1", currentLat: -17.82, currentLng: 31.048, updatedAt: new Date().toISOString() },
  events: [
    { status: "assigned", createdAt: new Date(Date.now() - 900_000).toISOString() },
    { status: "en_route_dropoff", createdAt: new Date(Date.now() - 120_000).toISOString() },
  ],
  counterpartyPhone: null,
  expiresAt: null,
};

function histRow(i, over) {
  return {
    id: `0a1b2c3d-0000-4000-8000-0000000003${String(i).padStart(2, "0")}`,
    orderType: "parcel",
    merchantName: null,
    role: "customer",
    pickup: { point: LOC, landmark: "Avondale" },
    dropoff: { point: DROP, landmark: "Belgravia" },
    itemDesc: "Documents",
    note: null,
    proposedFare: "5.00",
    agreedFare: "5.00",
    status: "completed",
    createdAt: new Date(Date.now() - 86_400_000).toISOString(),
    rating: null,
    counterpartyName: "Tendai M.",
    ...over,
  };
}

const history = [
  histRow(1, {
    orderType: "merchant",
    merchantName: "Gava's Kitchen",
    itemDesc: "Food order",
    proposedFare: "12.50",
    agreedFare: "12.50",
    status: "delivered",
    counterpartyName: "Rudo K.",
    createdAt: new Date(Date.now() - 2 * 86_400_000).toISOString(),
  }),
  histRow(2, { dropoff: { point: DROP, landmark: "Mount Pleasant" }, itemDesc: "Parcel", proposedFare: "4.00", agreedFare: "4.00" }),
  histRow(3, {
    orderType: "merchant",
    merchantName: "Nando's Avondale",
    itemDesc: "Food order",
    proposedFare: "18.00",
    agreedFare: "18.00",
    status: "completed",
    counterpartyName: "Farai N.",
    createdAt: new Date(Date.now() - 5 * 86_400_000).toISOString(),
  }),
];

installRouter([
  { match: /^\/orders\/mine\/active-order$/, json: activeOrder },
  { match: "/orders/history", json: history },
]);

export default { wrap: withQuery() };
