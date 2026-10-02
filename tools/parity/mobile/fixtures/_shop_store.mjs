// Shop / pharmacy storefront with ordering (Browse v2 S3/S4 + Order flow v2, ledgers D-58 / D-59): the
// handoff's Avondale Fresh and Avondale Pharmacy as `GET /shops/:id/catalogue` payloads, with an optional
// basket from that shop (S5/S6 steppers + the cart bar). Evidence-only (shoot-order-flow-shops.mjs).
import { installRouter, setParams } from "./_harness.mjs";
import { HOURS, LOC, withCart } from "./_food.mjs";

const pad = (n) => String(n).padStart(2, "0");
const id = (n) => `0c3d4e5f-0000-4000-8000-0000000002${pad(n)}`;
const item = (n, name, priceUsd, extra = {}) => ({ id: id(n), name, description: null, priceUsd, photoUrl: null, outOfStock: false, ...extra });
const cat = (n, name, dishes) => ({ id: `0c3d4e5f-0000-4000-8000-0000000003${pad(n)}`, name, dishes, availableFrom: null, availableTo: null });
const shop = (n, name, shopKind) => ({
  id: `0c3d4e5f-0000-4000-8000-0000000001${pad(n)}`,
  name,
  coverPhotoUrl: null,
  logoUrl: null,
  cuisineTags: [],
  priceLevel: null,
  hours: HOURS,
  location: { lat: LOC.lat + 1.6 / 111.19 / 1.3, lng: LOC.lng },
  ratingAvg: 4.6,
  ratingCount: 128,
  prepBaselineMinutes: 10,
  shopKind,
});

export const FRESH = shop(1, "Avondale Fresh", "grocery");
export const PHARMACY = { ...shop(2, "Avondale Pharmacy", "pharmacy"), ratingAvg: 4.7, ratingCount: 83 };
export const I = {
  bread: item(1, "Bread (Lobels 700g)", 1.1),
  eggs: item(2, "Eggs (tray of 30)", 5.5),
  milk: item(3, "Dairibord milk 2L", 2.9),
  mazoe: item(4, "Mazoe orange 2L", 3.2),
  para: item(11, "Paracetamol 500mg (20 tabs)", 1.5),
  ors: item(12, "ORS sachets (x5)", 2),
  plasters: item(13, "Plasters (20)", 1.8),
  amox: item(14, "Amoxicillin 500mg (21 caps)", 4.2, { rxRequired: true }),
};

function catalogueFor(s) {
  return s.shopKind === "pharmacy"
    ? { shop: s, categories: [cat(1, "Pain & fever", [I.para, I.amox]), cat(2, "Cold & flu", [I.ors]), cat(3, "First aid", [I.plasters])] }
    : { shop: s, categories: [cat(4, "Bakery & eggs", [I.bread, I.eggs]), cat(5, "Dairy", [I.milk]), cat(6, "Drinks", [I.mazoe])] };
}

const lineOf = (d, quantity) => ({ dishId: d.id, name: d.name, priceUsd: d.priceUsd, quantity, note: "", ...(d.rxRequired ? { rxRequired: true } : {}) });

/** @param {{ shop: object, cart?: Array<[object, number]>, rx?: boolean }} o */
export function shopStore({ shop: s, cart = [], rx = false }) {
  setParams({ id: s.id });
  installRouter([
    { match: /^\/shops\/[^/]+\/catalogue$/, json: catalogueFor(s) },
    { match: "/app/service-flags", json: { shopsEnabled: true, pharmacyEnabled: true } },
    { match: "/app/order-flags", json: { rxEnabled: rx } },
  ]);
  return {
    wrap: withCart(
      cart.map(([d, q]) => lineOf(d, q)),
      { restaurantId: s.id, restaurantName: s.name, kind: { businessType: "shop", shopKind: s.shopKind } },
    ),
  };
}
