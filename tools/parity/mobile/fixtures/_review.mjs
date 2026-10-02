// Shared staging for the Order flow v2 Review & place shoots (tools/parity/shoot-order-flow-review.mjs and
// shoot-order-flow-shops.mjs, ledger D-59). Each of_r* fixture calls `stage()` with the one thing that
// differs. The handoff's own samples (PROMPT.md Part 2 §7: Gava’s Kitchen, 2× Sadza & beef stew "Extra
// gravy" + Roast chicken (half); Avondale Fresh; Avondale Pharmacy; 12 Lanark Rd, Belgravia, 0771 234 567)
// are used so the app column reads like the mock column.
import * as React from "react";
import * as SecureStore from "expo-secure-store";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { FoodCartProvider, useFoodCart } from "../../../../apps/mobile/src/food/cart-context";
import { __setProbeFetch, reportUnreachable } from "../../../../apps/mobile/src/net/reachability";
import { HOURS, LOC, RID } from "./_food.mjs";
import { installRouter, setParams } from "./_harness.mjs";

const w = typeof window !== "undefined" ? window : globalThis;
const id = (n) => `0a1b2c3d-0000-4000-8000-0000000003${String(n).padStart(2, "0")}`;
const dish = (n, name, priceUsd, extra = {}) => ({ id: id(n), name, description: null, priceUsd, photoUrl: null, outOfStock: false, ...extra });

export const VENUE = "Gava’s Kitchen";
export const SADZA = dish(1, "Sadza & beef stew", 4.5);
export const CHICKEN = dish(2, "Roast chicken (half)", 6);
export const DRINK = dish(3, "Mazoe orange (500ml)", 1.5);
export const GREENS = dish(4, "Muriwo (side)", 1.8);

const line = (d, quantity, note = "") => ({ dishId: d.id, name: d.name, priceUsd: d.priceUsd, quantity, note, ...(d.rxRequired ? { rxRequired: true } : {}) });
export const GAVA_LINES = [line(SADZA, 2, "Extra gravy"), line(CHICKEN, 1)];
export const SMALL_LINES = [line(DRINK, 1), line(GREENS, 1)];

// ── Shops & pharmacy (R2a / R2b / R8) — the handoff's Avondale Fresh and Avondale Pharmacy ──────────
export const SID = "0a1b2c3d-0000-4000-8000-0000000004a0";
const FRESH_ITEMS = [dish(11, "Bread (Lobels 700g)", 1.1), dish(12, "Eggs (tray of 30)", 5.5), dish(13, "Mazoe orange 2L", 3.2), dish(14, "Cooking oil 2L", 4.8)];
const AMOX = dish(20, "Amoxicillin 500mg (21 caps)", 4.2, { rxRequired: true });
const PHARM_ITEMS = [dish(21, "Paracetamol 500mg (20 tabs)", 1.5), dish(22, "ORS sachets (x5)", 2), dish(23, "Plasters (20)", 1.8)];
export const FRESH_LINES = FRESH_ITEMS.map((d) => line(d, 1));
export const PHARM_LINES = PHARM_ITEMS.map((d) => line(d, 1));
export const RX_LINES = [line(AMOX, 1), ...PHARM_LINES];
const SHOPS = {
  shops: { name: "Avondale Fresh", shopKind: "grocery", items: FRESH_ITEMS },
  pharmacy: { name: "Avondale Pharmacy", shopKind: "pharmacy", items: [AMOX, ...PHARM_ITEMS] },
};

const BELGRAVIA = { label: "12 Lanark Rd", area: "Belgravia", lat: -17.8105, lng: 31.0405 };
/** Well outside the 25 km service corridor (R3b). */
export const FAR = { label: "Chitungwiza, Unit L", area: "Chitungwiza", lat: -18.1, lng: 31.25 };

// ── R5 slots — the R5a frame's tomorrow (11:00–11:30 and 13:00–13:30 full). Local-time starts, so the
// "starts cooking at 12:05" line (slot − 25 min lead) reads the same in any shooting timezone. ──────
const tomorrow = new Date(Date.now() + 86_400_000);
const ymd = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`;
const slot = (a, b, full = false) => ({ start: `${ymd}T${a}:00`, end: `${ymd}T${b}:00`, label: `${a}–${b}`, full });
const TOMORROW = [
  slot("11:00", "11:30", true),
  slot("11:30", "12:00"),
  slot("12:00", "12:30"),
  slot("12:30", "13:00"),
  slot("13:00", "13:30", true),
  slot("13:30", "14:00"),
  slot("14:00", "14:30"),
  slot("14:30", "15:00"),
];
export const SLOTS = { slotMinutes: 30, openNow: true, leadMinutes: 25, today: { date: "today", slots: [] }, tomorrow: { date: ymd, slots: TOMORROW }, firstAvailable: TOMORROW[1] };

function menu({ closed = false, dishes = [SADZA, CHICKEN, DRINK, GREENS] } = {}) {
  return {
    restaurant: { id: RID, name: VENUE, coverPhotoUrl: null, logoUrl: null, cuisineTags: ["Zimbabwean"], priceLevel: 2, hours: closed ? {} : HOURS, location: LOC, ratingAvg: 4.7, ratingCount: 210, prepBaselineMinutes: 20 },
    categories: [{ id: id(90), name: "Mains", dishes }],
  };
}

function catalogue(service) {
  const s = SHOPS[service];
  return {
    shop: { id: SID, name: s.name, coverPhotoUrl: null, logoUrl: null, cuisineTags: [], priceLevel: null, hours: HOURS, location: LOC, ratingAvg: 4.6, ratingCount: 128, prepBaselineMinutes: 10, shopKind: s.shopKind },
    categories: [{ id: id(91), name: "Everything", dishes: s.items }],
  };
}

/** Mounts the screen only once the cart is seeded (the real customer arrives from the storefront). */
function Seeder({ lines, venue, children }) {
  const cart = useFoodCart();
  const seeded = React.useRef(false);
  const [go, setGo] = React.useState(false);
  React.useEffect(() => {
    if (seeded.current) return;
    seeded.current = true;
    for (const l of lines) cart.addItem(venue.id, venue.name, l, venue.kind);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  React.useEffect(() => {
    if (cart.ready && (lines.length === 0 || cart.cart.lines.length > 0)) setGo(true);
  }, [cart.ready, cart.cart.lines.length, lines.length]);
  return go ? children : null;
}

/**
 * @param {object} o
 * @param {"food"|"shops"|"pharmacy"} [o.service] the venue the cart belongs to
 * @param {boolean} [o.slots] answer GET …/schedule-slots with the R5a slots
 * @param {boolean} [o.rx] GET /app/order-flags → rxEnabled
 * @param {object} [o.params] route params (R5c's `schedule: "first"`)
 * @param {number} [o.owed] an owed balance carried on this order (D3f)
 */
export function stage({
  service = "food",
  lines,
  place = BELGRAVIA,
  dishes,
  closed = false,
  offline = false,
  placeFails = false,
  placeHangs = false,
  slots = true,
  rx = false,
  params = null,
  owed = 0,
} = {}) {
  if (place) void SecureStore.setItemAsync("lynia.homeLocation.v1", JSON.stringify({ ...place, manual: true }));
  else w.__PARITY_PERMISSIONS = { location: "denied" };
  void SecureStore.setItemAsync("lynia.myPickupPhone.v1", "0771234567");
  if (params) setParams(params);
  const isShop = service !== "food";
  const m = menu({ closed, dishes });
  const cat = isShop ? catalogue(service) : null;
  const cartLines = lines ?? (service === "shops" ? FRESH_LINES : service === "pharmacy" ? PHARM_LINES : GAVA_LINES);
  const venue = isShop
    ? { id: SID, name: SHOPS[service].name, kind: { businessType: "shop", shopKind: SHOPS[service].shopKind } }
    : { id: RID, name: VENUE, kind: { businessType: "restaurant", shopKind: null } };
  let rxPage = 0;
  installRouter([
    { match: /^\/restaurants\/[^/]+\/menu$/, json: m },
    { match: /^\/shops\/[^/]+\/catalogue$/, json: cat ?? {} },
    { match: /^\/restaurants\/[^/]+\/schedule-slots$/, json: slots ? SLOTS : { message: "Not found" }, status: slots ? 200 : 404 },
    { match: "/restaurants/balance", json: { owedUsd: owed, lines: owed > 0 ? [{ orderId: id(99), amount: owed, createdAt: new Date().toISOString(), carriedOnOrderId: null }] : [] } },
    { match: "/app/order-flags", json: { rxEnabled: rx } },
    {
      match: "/uploads/prescription-photo",
      method: "POST",
      json: () => {
        rxPage += 1;
        return { uploadUrl: "https://parity.local/upload", key: `rx/parity/${rxPage}.jpg`, headers: { "Content-Type": "image/jpeg" } };
      },
    },
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
      if (cat) qc.setQueryData(["shops", "catalogue", SID], cat);
      return React.createElement(QueryClientProvider, { client: qc }, React.createElement(FoodCartProvider, null, React.createElement(Seeder, { lines: cartLines, venue }, el)));
    },
  };
}
