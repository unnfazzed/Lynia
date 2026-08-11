// RC.list — the restaurant browse list, populated (default state). The Food vertical is flag-gated,
// so the router turns restaurantsEnabled on (via the default route) and answers GET /restaurants with
// a small corridor of open kitchens; useRestaurantListFeed then paints the real RestaurantRow list.
import { installRouter, withQuery, UUID } from "./_harness.mjs";

// All-day hours so isMerchantOpenNow() reads Open regardless of the render clock (a browse-list mock
// shows open kitchens). A fixture aligning the closed/opens-at state would narrow these instead.
const open = { open: "00:00", close: "23:59" };
const HOURS = { mon: open, tue: open, wed: open, thu: open, fri: open, sat: open, sun: open };

function restaurant(i, name, tags, price) {
  return {
    id: `0a1b2c3d-0000-4000-8000-0000000001${String(i).padStart(2, "0")}`,
    name,
    coverPhotoUrl: null,
    logoUrl: null,
    cuisineTags: tags,
    priceLevel: price,
    hours: HOURS,
    location: { lat: -17.8292, lng: 31.0522 },
  };
}

installRouter([
  {
    match: "/restaurants",
    json: {
      restaurants: [
        restaurant(1, "Gava's Kitchen", ["Zimbabwean", "Grills"], 2),
        restaurant(2, "Nando's Avondale", ["Chicken", "Portuguese"], 3),
        restaurant(3, "Pizza Inn", ["Pizza", "Fast food"], 1),
        restaurant(4, "Chicken Slice", ["Chicken", "Fast food"], 1),
        restaurant(5, "Amanzi Restaurant", ["Fine dining", "Continental"], 3),
      ],
    },
  },
]);

export default { wrap: withQuery() };
