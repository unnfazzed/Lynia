// Shared staging for the Order flow v2 Review & place shoot (tools/parity/shoot-order-flow-review.mjs,
// ledger D-59). Each of_r* fixture calls `stage()` with the one thing that differs. The handoff's own
// sample (PROMPT.md Part 2 §7: Gava’s Kitchen, 2× Sadza & beef stew "Extra gravy" + Roast chicken (half),
// 12 Lanark Rd, Belgravia, 0771 234 567) is used so the app column reads like the mock column.
import * as React from "react";
import * as SecureStore from "expo-secure-store";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { FoodCartProvider, useFoodCart } from "../../../../apps/mobile/src/food/cart-context";
import { __setProbeFetch, reportUnreachable } from "../../../../apps/mobile/src/net/reachability";
import { HOURS, LOC, RID } from "./_food.mjs";
import { installRouter } from "./_harness.mjs";

const w = typeof window !== "undefined" ? window : globalThis;
const id = (n) => `0a1b2c3d-0000-4000-8000-0000000003${String(n).padStart(2, "0")}`;
const dish = (n, name, priceUsd, extra = {}) => ({ id: id(n), name, description: null, priceUsd, photoUrl: null, outOfStock: false, ...extra });

export const VENUE = "Gava’s Kitchen";
export const SADZA = dish(1, "Sadza & beef stew", 4.5);
export const CHICKEN = dish(2, "Roast chicken (half)", 6);
export const DRINK = dish(3, "Mazoe orange (500ml)", 1.5);
export const GREENS = dish(4, "Muriwo (side)", 1.8);

const line = (d, quantity, note = "") => ({ dishId: d.id, name: d.name, priceUsd: d.priceUsd, quantity, note });
export const GAVA_LINES = [line(SADZA, 2, "Extra gravy"), line(CHICKEN, 1)];
export const SMALL_LINES = [line(DRINK, 1), line(GREENS, 1)];

const BELGRAVIA = { label: "12 Lanark Rd", area: "Belgravia", lat: -17.8105, lng: 31.0405 };
/** Well outside the 25 km service corridor (R3b). */
export const FAR = { label: "Chitungwiza, Unit L", area: "Chitungwiza", lat: -18.1, lng: 31.25 };

function menu({ closed = false, dishes = [SADZA, CHICKEN, DRINK, GREENS] } = {}) {
  return {
    restaurant: { id: RID, name: VENUE, coverPhotoUrl: null, logoUrl: null, cuisineTags: ["Zimbabwean"], priceLevel: 2, hours: closed ? {} : HOURS, location: LOC, ratingAvg: 4.7, ratingCount: 210, prepBaselineMinutes: 20 },
    categories: [{ id: id(90), name: "Mains", dishes }],
  };
}

/** Mounts the screen only once the cart is seeded (the real customer arrives from the storefront). */
function Seeder({ lines, children }) {
  const cart = useFoodCart();
  const seeded = React.useRef(false);
  const [go, setGo] = React.useState(false);
  React.useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;
    for (const l of lines) cart.addItem(RID, VENUE, l);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  React.useEffect(() => {
    if (cart.ready && (lines.length === 0 || cart.cart.lines.length > 0)) setGo(true);
  }, [cart.ready, cart.cart.lines.length, lines.length]);
  return go ? children : null;
}

export function stage({ lines = GAVA_LINES, place = BELGRAVIA, dishes, closed = false, offline = false, placeFails = false, placeHangs = false } = {}) {
  if (place) void SecureStore.setItemAsync("lynia.homeLocation.v1", JSON.stringify({ ...place, manual: true }));
  else w.__PARITY_PERMISSIONS = { location: "denied" };
  void SecureStore.setItemAsync("lynia.myPickupPhone.v1", "0771234567");
  const m = menu({ closed, dishes });
  installRouter([
    { match: /^\/restaurants\/[^/]+\/menu$/, json: m },
    { match: /^\/restaurants\/[^/]+\/orders$/, method: "POST", json: { message: "Internal error" }, status: placeFails ? 500 : 201 },
  ]);
  if (placeHangs) {
    const routed = globalThis.fetch;
    globalThis.fetch = (input, init = {}) => (String(init.method || "GET").toUpperCase() === "POST" ? new Promise(() => undefined) : routed(input, init));
  }
  if (offline) {
    __setProbeFetch(async () => false);
    reportUnreachable();
  }
  return {
    wrap: (el) => {
      const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity, staleTime: Infinity } } });
      qc.setQueryData(["restaurants", RID, "menu"], m);
      return React.createElement(QueryClientProvider, { client: qc }, React.createElement(FoodCartProvider, null, React.createElement(Seeder, { lines }, el)));
    },
  };
}
