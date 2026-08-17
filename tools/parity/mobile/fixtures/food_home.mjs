// RC.home — the customer launcher home, populated to the MOCK'S drawn state.
//
// The mock is now **home 8c** (packages/design/explorations/home-redesign/home-8c.jsx, handoff at
// packages/design/handoff/home-8c): a mint header with a time-aware greeting and the DETECTED
// current location, three sticker service tiles, ONE live tracker pill ("Tendai M. · on the way",
// 12 min, 5 of 7 segments) and a 2×2 "Popular near you" grid. The pre-8c state this fixture used to
// stage (two live cards + a three-venue rail) is retired with the screen it belonged to.
//
// A fixture's job is to stage the mock's drawn state, so the sample data IS the mock's sample data —
// otherwise a rendered-conformance run reports fixture bookkeeping as parity drift. Where the app's
// own arithmetic cannot reproduce a drawn number (the mock's "$1.00" is below the $1.50 delivery-fee
// FLOOR the app and the server both price with), that stays a per-string `dynamic` escape in
// tools/parity/expected/RC.home.json rather than a fixture that lies about pricing.
//
// Feeds: GET /auth/me (the greeting name), GET /notifications/unread-count (the bell's gold dot),
// GET /orders/mine/active-orders (the tracker pill), GET /restaurants (the venue grid).
// Feature flags default ON (harness) so the Restaurants tile and the grid render.
import * as SecureStore from "expo-secure-store";
import { installRouter, withQuery, UUID } from "./_harness.mjs";

const open = { open: "00:00", close: "23:59" };
const HOURS = { mon: open, tue: open, wed: open, thu: open, fri: open, sat: open, sun: open };

/** The customer's detected position — the same fixed Harare point both expo-location shims serve. */
const CUSTOMER = { lat: -17.8292, lng: 31.0522 };

/**
 * Venue distances are chosen so the app's OWN arithmetic reproduces the mock's drawn ETAs:
 * `prepBaselineMinutes + ceil(km · 1.3 / 22 · 60)`. Every distance below lands in the 5-minute
 * delivery-leg bucket (km ∈ (1.13, 1.41]), so prep 20 → "25 min" and prep 25 → "30 min" exactly as
 * drawn, while the four venues stay in the mock's order (nearest first). One degree of latitude is
 * ~111.195 km at this corridor.
 */
const KM_PER_DEG_LAT = 111.195;
const northOf = (km) => ({ lat: CUSTOMER.lat + km / KM_PER_DEG_LAT, lng: CUSTOMER.lng });

function restaurant(i, name, tags, ratingAvg, ratingCount, prep, km) {
  return {
    id: `0a1b2c3d-0000-4000-8000-0000000001${String(i).padStart(2, "0")}`,
    name,
    // The mock draws a photo band on every card; without a URL the card falls back to its tinted
    // initial (a different element entirely).
    coverPhotoUrl: `https://parity.local/venue-${i}.jpg`,
    logoUrl: null,
    cuisineTags: tags,
    priceLevel: 2,
    hours: HOURS,
    location: northOf(km),
    ratingAvg,
    ratingCount,
    prepBaselineMinutes: prep,
  };
}

// The mock's four venues, in the mock's order (home-8c.jsx :: VENUES).
const VENUES = [
  restaurant(1, "Golden Bao", ["Asian", "Dumplings"], 4.9, 210, 20, 1.15),
  restaurant(2, "Mbuya's Kitchen", ["Zimbabwean", "Grills"], 4.8, 96, 20, 1.2),
  restaurant(3, "Fresh Press", ["Juice", "Breakfast"], 4.5, 44, 25, 1.25),
  restaurant(4, "Harare Grill Co.", ["Grills", "Burgers"], 4.6, 132, 25, 1.3),
];

// The ONE running job the mock draws. A parcel en route to the drop-off, so the phrase is the mock's
// verbatim "on the way"; `en_route_dropoff` is step index 4 of 7, which lights 5 segments as drawn.
// The rider sits 3.2 km from the drop-off → liveEta = ceil(3.2 · 1.3 / 22 · 60) = 12, the gold chip.
const PARCEL_ORDER_ID = UUID.order;
const RIDER_ID = "0a1b2c3d-0000-4000-8000-0000000000f1";
const parcelDropoff = { lat: -17.81, lng: 31.1 };
const parcelOrder = {
  id: PARCEL_ORDER_ID,
  status: "en_route_dropoff",
  orderType: "parcel",
  merchantName: null,
  viewerRole: "customer",
  agreedFare: "3.36",
  proposedFare: "3.36",
  pickup: { point: CUSTOMER, landmark: "Avondale Shops" },
  dropoff: { point: parcelDropoff, landmark: "Msasa" },
  items: null,
  note: null,
  rider: { profileId: RIDER_ID, currentLat: parcelDropoff.lat - 3.2 / KM_PER_DEG_LAT, currentLng: parcelDropoff.lng, updatedAt: new Date().toISOString() },
  events: [
    { status: "assigned", createdAt: new Date(Date.now() - 900_000).toISOString() },
    { status: "picked_up", createdAt: new Date(Date.now() - 300_000).toISOString() },
    { status: "en_route_dropoff", createdAt: new Date(Date.now() - 120_000).toISOString() },
  ],
  counterpartyPhone: null,
  expiresAt: null,
};

// The chosen rider's cached public identity — the ONLY place the app knows a rider's name (the
// active-orders snapshot carries a profileId and GPS, nothing more), and therefore what turns the
// pill's fallback service copy into the mock's drawn "Tendai M.".
void SecureStore.setItemAsync(
  "lynia.riderIdentity.v1",
  JSON.stringify({
    orderId: PARCEL_ORDER_ID,
    profileId: RIDER_ID,
    firstName: "Tendai",
    lastName: "Moyo",
    photoUrl: null,
    ratingAvg: "4.9",
    ratingCount: 210,
    tripsCount: 640,
  }),
);

installRouter([
  { match: /^\/auth\/me$/, json: { profileId: "0a1b2c3d-0000-4000-8000-0000000000c1", role: "customer", firstName: "Rudo", lastName: "Chikafu" } },
  // > 0 so the bell paints the mock's gold unread dot.
  { match: /^\/notifications\/unread-count$/, json: { count: 2 } },
  { match: /^\/orders\/mine\/active-orders$/, json: [parcelOrder] },
  { match: /^\/orders\/mine\/active-order$/, json: parcelOrder },
  { match: "/orders/history", json: [] },
  { match: "/restaurants", json: { restaurants: VENUES } },
]);

export default { wrap: withQuery() };
