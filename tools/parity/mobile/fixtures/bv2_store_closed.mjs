// Browse v2 S8a — Pizza Inn, closed until later today: prices and photos stay, no + anywhere, the
// Remind me row. Evidence-only (shoot-browse-v2.mjs).
import { installRouter, setParams } from "./_harness.mjs";
import { withCart } from "./_food.mjs";
import { PIZZA, menuFor } from "./_browse_v2.mjs";

if (typeof window !== "undefined") window.__PARITY_REVERSE_GEOCODE = { name: "12 Lanark Rd", streetNumber: "12", street: "Lanark Rd", district: "Belgravia" };
setParams({ id: PIZZA.id });

installRouter([
  { match: /^\/restaurants\/[^/]+\/menu$/, json: menuFor(PIZZA) },
  { match: /\/reopen-reminder$/, json: { set: false } },
]);

export default { wrap: withCart([]) };
