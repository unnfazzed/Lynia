// RC.home — the customer launcher home, populated to the MOCK'S drawn state: service tiles + one
// live-order card PER RUNNING JOB (r-customer-a.jsx RC.home draws a food order and a parcel side by
// side, food first/newest) + the "Restaurants near you" rail. Feeds: GET /orders/mine/active-orders
// (one card per live order), GET /orders/history (the reorder rail, hidden while live cards show),
// GET /restaurants (the rail). Feature flags default ON (harness) so the Food tile + rail render.
import * as SecureStore from "expo-secure-store";
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

const PARCEL_ORDER_ID = UUID.order;
const FOOD_ORDER_ID = "0a1b2c3d-0000-4000-8000-000000000002";

// The mock's FOOD job (RC_LIVE_FOOD): picked up, rider heading to the customer, "6 min away",
// "Cash at the door · $15.50". Rider ~1.5 km from the drop-off → liveEta = ceil(1.5·1.3/22·60) = 6.
const foodDropoff = { lat: -17.8145, lng: 31.045 };
const foodOrder = {
  id: FOOD_ORDER_ID,
  status: "picked_up",
  orderType: "merchant",
  merchantName: "Sadza Republic",
  merchantPhase: null,
  merchantPaymentMethod: "cash",
  viewerRole: "customer",
  agreedFare: "15.50",
  proposedFare: "15.50",
  pickup: { point: LOC, landmark: "Sadza Republic" },
  dropoff: { point: foodDropoff, landmark: "12 Fife Avenue" },
  items: null,
  note: null,
  rider: { profileId: "0a1b2c3d-0000-4000-8000-0000000000f2", currentLat: -17.828, currentLng: 31.045, updatedAt: new Date().toISOString() },
  events: [
    { status: "assigned", createdAt: new Date(Date.now() - 1_200_000).toISOString() },
    { status: "picked_up", createdAt: new Date(Date.now() - 120_000).toISOString() },
  ],
  counterpartyPhone: null,
  expiresAt: null,
};

// The mock's PARCEL job (RC_LIVE_RIDE): en route to the drop-off, "rider 4 min away",
// "Delivery code 4192 · $3.36". Rider ~1.0 km from the drop-off → liveEta = ceil(1.0·1.3/22·60) = 4.
const parcelDropoff = { lat: -17.81, lng: 31.1 };
const parcelOrder = {
  id: PARCEL_ORDER_ID,
  status: "en_route_dropoff",
  orderType: "parcel",
  merchantName: null,
  viewerRole: "customer",
  agreedFare: "3.36",
  proposedFare: "3.36",
  pickup: { point: LOC, landmark: "Avondale Shops" },
  dropoff: { point: parcelDropoff, landmark: "Msasa" },
  items: null,
  note: null,
  rider: { profileId: "0a1b2c3d-0000-4000-8000-0000000000f1", currentLat: -17.819, currentLng: 31.1, updatedAt: new Date().toISOString() },
  events: [
    { status: "assigned", createdAt: new Date(Date.now() - 900_000).toISOString() },
    { status: "picked_up", createdAt: new Date(Date.now() - 300_000).toISOString() },
    { status: "en_route_dropoff", createdAt: new Date(Date.now() - 120_000).toISOString() },
  ],
  counterpartyPhone: null,
  expiresAt: null,
};

// The customer's stored delivery code for the parcel (per-order SecureStore, same key the tracking
// screen writes) — the parcel card's meta leads with it, exactly as the mock draws.
void SecureStore.setItemAsync(`lynia.deliveryCode.${PARCEL_ORDER_ID}`, "4192");

installRouter([
  // Newest first: the food job is the more recent of the two (mock stacks it on top).
  { match: /^\/orders\/mine\/active-orders$/, json: [foodOrder, parcelOrder] },
  { match: /^\/orders\/mine\/active-order$/, json: parcelOrder },
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
