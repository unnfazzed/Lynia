// Browse v2 (packages/design/handoff/browse-v2, ledger D-57) — the handoff's sample venues and dishes
// (`browse-kit.js` V / D) as API payloads, for the evidence sheet (tools/parity/shoot-browse-v2.mjs).
// Photos point at https://parity.local/food/<name>.jpg, which the shoot script serves from the
// handoff's assets/food/. Opening hours are computed against the render clock, so "Closes in 15 min"
// and "Opens HH:MM" show whatever time the sheet is shot.
import { LOC } from "./_food.mjs";

export const PHOTO = (name) => `https://parity.local/food/${name}.jpg`;
const pad = (n) => String(n).padStart(2, "0");
const hhmm = (d) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
const week = (w) => ({ mon: w, tue: w, wed: w, thu: w, fri: w, sat: w, sun: w });
const now = new Date();
export const OPEN_LATE = week({ open: "00:00", close: "23:59" });
/** Open now, closing in 15 minutes. */
export const CLOSING = week({ open: "00:00", close: hhmm(new Date(now.getTime() + 15 * 60 * 1000)) });
/** Closed now, opening later today (an hour from now) — "Opens HH:MM". */
export const LATER = week({ open: hhmm(new Date(now.getTime() + 60 * 60 * 1000)), close: "23:59" });
const atKm = (km) => ({ lat: LOC.lat + km / 111.19 / 1.3, lng: LOC.lng });

const id = (n) => `0b2c3d4e-0000-4000-8000-0000000001${pad(n)}`;
function venue(n, name, tags, price, km, rating, count, img, hours = OPEN_LATE, logo = null) {
  return {
    id: id(n),
    name,
    coverPhotoUrl: img ? PHOTO(img) : null,
    logoUrl: logo ? PHOTO(logo) : null,
    cuisineTags: tags,
    priceLevel: price,
    hours,
    location: atKm(km),
    ratingAvg: rating,
    ratingCount: count,
    prepBaselineMinutes: 20,
  };
}

export const GAVA = venue(1, "Gava’s Kitchen", ["Zimbabwean", "Grills"], 2, 1.2, 4.7, 210, "rice-3", OPEN_LATE, "butter-chicken-3");
export const VENUES = [
  GAVA,
  venue(2, "Golden Bao", ["Chinese"], 2, 2.1, 4.9, 388, "biryani-1"),
  venue(3, "Mbuya’s Kitchen", ["Traditional"], 1, 1.8, 4.8, 156, "rice-1"),
  venue(4, "Sadza Republic", ["Zimbabwean"], 1, 2.4, 4.6, 96, "butter-chicken-2", CLOSING),
  venue(5, "Chicken Slice", ["Chicken", "Fast food"], 1, 3.1, null, 0, "burger-1"),
  venue(6, "Pizza Inn", ["Pizza"], 2, 2.8, 4.8, 44, "pizza-1", LATER),
];
export const PIZZA = VENUES[5];

const dishId = (n) => `0b2c3d4e-0000-4000-8000-0000000002${pad(n)}`;
const dish = (n, name, description, priceUsd, img, outOfStock = false) => ({ id: dishId(n), name, description, priceUsd, photoUrl: PHOTO(img), outOfStock });
export const D = {
  stew: dish(1, "Sadza & beef stew", "Slow-cooked beef in tomato gravy, with white sadza and covo.", 4.5, "butter-chicken-2"),
  roast: dish(2, "Roast chicken (half)", "Flame-roasted with peri-peri or lemon. Chips not included.", 6, "butter-chicken-1"),
  rice: dish(3, "Rice & chicken", "Quarter chicken on spiced rice with coleslaw.", 5, "rice-1"),
  burger: dish(4, "Beef burger", "Grilled beef patty, tomato, onion and house sauce.", 5.5, "burger-2"),
  tbone: dish(5, "T-bone & sadza", "Char-grilled T-bone with sadza and gravy.", 8.5, "rice-2"),
  chips: dish(6, "Chips (large)", null, 2, "burger-3"),
  mazoe: dish(7, "Mazoe orange 2L", null, 3.2, "dosa-1"),
};
const cat = (n, name, dishes) => ({ id: `0b2c3d4e-0000-4000-8000-0000000003${pad(n)}`, name, dishes, availableFrom: null, availableTo: null });
export function menuFor(restaurant) {
  return {
    restaurant,
    categories: [cat(1, "Mains", [D.rice, D.tbone, D.burger, D.stew, D.roast]), cat(2, "Sides", [D.chips]), cat(3, "Drinks", [D.mazoe])],
    popularDishIds: [D.stew.id, D.roast.id, D.rice.id],
  };
}

// ── Part 3: Search (X1–X4). The query arrives as the route's `q` param (what the storefront's "Search all"
// passes), so a fixture needs no typing; the screen's 300 ms debounce runs before the settle. The harness
// routes by path, not query string, so `/shops/search` answers one section: these fixtures switch
// Pharmacy off (the X2a mock draws no PHARMACY group either). ──
export const FLAGS_SHOPS_ONLY = { match: "/app/service-flags", json: { shopsEnabled: true, pharmacyEnabled: false } };
const shopId = (n) => `0b2c3d4e-0000-4000-8000-0000000003${pad(n)}`;
const BORROW = { ...venue(14, "Borrowdale Butchery", [], null, 5.0, 4.8, 92, null), id: shopId(14), prepBaselineMinutes: 10, shopKind: "butchery" };
const hit = (id, name, priceUsd, photoUrl, v) => ({ dishId: id, name, priceUsd, photoUrl, merchantId: v.id, merchantName: v.name });
const SEARCH = {
  chicken: {
    food: {
      restaurants: [VENUES[4]],
      dishes: [hit(D.roast.id, D.roast.name, D.roast.priceUsd, D.roast.photoUrl, GAVA), hit(D.rice.id, D.rice.name, D.rice.priceUsd, D.rice.photoUrl, GAVA), hit(dishId(80), "Roast chicken (quarter)", 3.5, null, VENUES[2]), hit(dishId(81), "Chicken & rice", 4.8, null, VENUES[1])],
    },
    shops: { shops: [BORROW], items: [hit(dishId(82), "Chicken pieces (1 kg)", 5.2, null, BORROW), hit(dishId(83), "Whole chicken (1.5kg)", 7.5, null, BORROW), hit(dishId(84), "Chicken livers (500g)", 2.4, null, BORROW)] },
  },
  sadza: { food: { restaurants: [VENUES[3]], dishes: [hit(D.stew.id, D.stew.name, D.stew.priceUsd, D.stew.photoUrl, GAVA), hit(D.tbone.id, D.tbone.name, D.tbone.priceUsd, D.tbone.photoUrl, GAVA)] } },
};
export const RECENT = ["sadza", "brake pads", "paracetamol"];
/** Route the search endpoints for one staged query. */
export function searchRoutes(q) {
  const s = SEARCH[q] ?? {};
  return [
    FLAGS_SHOPS_ONLY,
    { match: "/restaurants/search/popular", json: { terms: ["Roast chicken", "Pizza", "Bread", "Plasters", "Brake pads"] } },
    { match: "/restaurants/search", json: s.food ?? { restaurants: [], dishes: [] } },
    { match: "/shops/search", json: s.shops ?? { shops: [], items: [] } },
  ];
}
