// RC.home — the customer launcher home, populated: service tiles + a live active-order card +
// the "Restaurants near you" rail. Three feeds drive it — GET /orders/mine/active-order (the live
// order card), GET /orders/history (the reorder rail, hidden while the live card shows), and
// GET /restaurants (the rail). Feature flags default ON (harness) so the Food tile + rail render.
import { installRouter, withQuery, UUID } from "./_harness.mjs";

const open = { open: "00:00", close: "23:59" };
const HOURS = { mon: open, tue: open, wed: open, thu: open, fri: open, sat: open, sun: open };
const LOC = { lat: -17.8292, lng: 31.0522 };

function restaurant(i, name, tags, price) {
  return {
    id: `0a1b2c3d-0000-4000-8000-0000000001${String(i).padStart(2, "0")}`,
    name,
    coverPhotoUrl: null,
    logoUrl: null,
    cuisineTags: tags,
    priceLevel: price,
    hours: HOURS,
    location: LOC,
  };
}

// A live parcel delivery in flight — order/offer fares are wire STRINGS ("6.00"), uuids uuid-shaped.
const activeOrder = {
  id: UUID.order,
  status: "en_route_dropoff",
  orderType: "parcel",
  viewerRole: "customer",
  agreedFare: "6.00",
  proposedFare: "6.00",
  pickup: { point: LOC, landmark: "Avondale Shops" },
  dropoff: { point: { lat: -17.8145, lng: 31.045 }, landmark: "12 Fife Avenue" },
  items: null,
  note: null,
  rider: { profileId: "0a1b2c3d-0000-4000-8000-0000000000f1", currentLat: -17.82, currentLng: 31.048, updatedAt: new Date().toISOString() },
  events: [
    { status: "assigned", createdAt: new Date(Date.now() - 900_000).toISOString() },
    { status: "picked_up", createdAt: new Date(Date.now() - 300_000).toISOString() },
    { status: "en_route_dropoff", createdAt: new Date(Date.now() - 120_000).toISOString() },
  ],
  counterpartyPhone: null,
  expiresAt: null,
};

installRouter([
  { match: /^\/orders\/mine\/active-order$/, json: activeOrder },
  { match: "/orders/history", json: [] },
  {
    match: "/restaurants",
    json: {
      restaurants: [
        restaurant(1, "Gava's Kitchen", ["Zimbabwean", "Grills"], 2),
        restaurant(2, "Nando's Avondale", ["Chicken", "Portuguese"], 3),
        restaurant(3, "Pizza Inn", ["Pizza", "Fast food"], 1),
        restaurant(4, "Chicken Slice", ["Chicken", "Fast food"], 1),
      ],
    },
  },
]);

export default { wrap: withQuery() };
