// RC.list — the restaurant browse list, populated (default state). The Food vertical is flag-gated,
// so the router turns restaurantsEnabled on (via the default route) and answers GET /restaurants with
// a small corridor of open kitchens; useRestaurantListFeed then paints the real RestaurantRow list.
import { installRouter, withQuery, UUID } from "./_harness.mjs";

// All-day hours so isMerchantOpenNow() reads Open regardless of the render clock (a browse-list mock
// shows open kitchens). A fixture aligning the closed/opens-at state would narrow these instead.
const open = { open: "00:00", close: "23:59" };
const HOURS = { mon: open, tue: open, wed: open, thu: open, fri: open, sat: open, sun: open };

// The header's deliver-to is the customer's live fix (`home-location.ts`), and the mock's corridor is
// Belgravia — override the shim's default Harare-district answer so the drawn address and the
// "deliver to <area>" count line render the corridor RC.list actually draws.
if (typeof window !== "undefined") {
  window.__PARITY_REVERSE_GEOCODE = { name: "12 Lanark Rd", streetNumber: "12", street: "Lanark Rd", district: "Belgravia" };
}

// The shim's fixed device position — merchants are laid out at increasing distance from it so the
// distance-dependent pills (Nearest, Under $2 fee) and the count line's ETA range have real spread
// to work with. 1 degree of latitude is ~111.19 km.
const ME_LAT = -17.8292;
const ME_LNG = 31.0522;
const atKm = (km) => ({ lat: ME_LAT + km / 111.19, lng: ME_LNG });

function restaurant(i, name, tags, price, km, ratingAvg, ratingCount) {
  return {
    id: `0a1b2c3d-0000-4000-8000-0000000001${String(i).padStart(2, "0")}`,
    name,
    coverPhotoUrl: null,
    logoUrl: null,
    cuisineTags: tags,
    priceLevel: price,
    hours: HOURS,
    location: atKm(km),
    // #673 discovery fields — the header's rating sort and fee filter read these.
    ratingAvg,
    ratingCount,
    prepBaselineMinutes: 20,
  };
}

installRouter([
  {
    match: "/restaurants",
    json: {
      restaurants: [
        restaurant(1, "Gava's Kitchen", ["Zimbabwean", "Grills"], 2, 1.2, 4.7, 210),
        restaurant(2, "Nando's Avondale", ["Chicken", "Portuguese"], 3, 2.4, 4.5, 96),
        restaurant(3, "Pizza Inn", ["Pizza", "Fast food"], 1, 3.1, 4.8, 44),
        restaurant(4, "Chicken Slice", ["Chicken", "Fast food"], 1, 4.0, 4.4, 158),
        // Unrated, like the mock's "★ new" row — proves the rating sort holds it behind rated ones.
        restaurant(5, "Amanzi Restaurant", ["Fine dining", "Continental"], 3, 5.2, null, 0),
      ],
    },
  },
]);

export default { wrap: withQuery() };
