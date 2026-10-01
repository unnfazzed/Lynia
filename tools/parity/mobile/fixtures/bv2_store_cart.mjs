// Browse v2 S5 — Gava's Kitchen with three dishes in the cart: steppers + the forest cart bar.
// Evidence-only (shoot-browse-v2.mjs).
import { installRouter, setParams } from "./_harness.mjs";
import { line, withCart } from "./_food.mjs";
import { D, GAVA, menuFor } from "./_browse_v2.mjs";

if (typeof window !== "undefined") window.__PARITY_REVERSE_GEOCODE = { name: "12 Lanark Rd", streetNumber: "12", street: "Lanark Rd", district: "Belgravia" };
setParams({ id: GAVA.id });

installRouter([
  { match: /^\/restaurants\/[^/]+\/menu$/, json: menuFor(GAVA) },
  { match: /\/reopen-reminder$/, json: { set: false } },
]);

export default { wrap: withCart([line(D.stew, 1), line(D.roast, 1), line(D.chips, 1)], { restaurantId: GAVA.id, restaurantName: GAVA.name }) };
