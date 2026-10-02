// Order flow v2 R5c · a closed venue holding a basket: the storefront's cart bar reads "Order for when they
// open · 10:30–11:00" (the first slot from GET …/schedule-slots) behind a calendar, button "Review".
// Pizza Inn, closed until later today, two items ($13.50). Evidence-only (shoot-order-flow-shops.mjs).
import { installRouter, setParams } from "./_harness.mjs";
import { line, withCart } from "./_food.mjs";
import { D, PIZZA, menuFor } from "./_browse_v2.mjs";

if (typeof window !== "undefined") window.__PARITY_REVERSE_GEOCODE = { name: "12 Lanark Rd", streetNumber: "12", street: "Lanark Rd", district: "Belgravia" };
setParams({ id: PIZZA.id });

const tomorrow = new Date(Date.now() + 86_400_000);
const ymd = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`;
const FIRST = { start: `${ymd}T10:30:00`, end: `${ymd}T11:00:00`, label: "10:30–11:00", full: false };

installRouter([
  { match: /^\/restaurants\/[^/]+\/menu$/, json: menuFor(PIZZA) },
  { match: /\/reopen-reminder$/, json: { set: false } },
  {
    match: /^\/restaurants\/[^/]+\/schedule-slots$/,
    json: { slotMinutes: 30, openNow: false, leadMinutes: 35, today: { date: "today", slots: [] }, tomorrow: { date: ymd, slots: [FIRST] }, firstAvailable: FIRST },
  },
]);

export default {
  wrap: withCart([line(D.tbone, 1), line(D.rice, 1)], { restaurantId: PIZZA.id, restaurantName: PIZZA.name, kind: { businessType: "restaurant", shopKind: null } }),
};
