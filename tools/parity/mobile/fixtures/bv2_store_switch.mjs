// Browse v2 I3 — Golden Bao's storefront while the cart holds Gava's Kitchen's dishes: adding asks
// "Start a new cart?" before anything is cleared. Evidence-only (shoot-browse-v2.mjs).
import { installRouter, setParams } from "./_harness.mjs";
import { line, withCart } from "./_food.mjs";
import { D, VENUES, menuFor } from "./_browse_v2.mjs";

if (typeof window !== "undefined") window.__PARITY_REVERSE_GEOCODE = { name: "12 Lanark Rd", streetNumber: "12", street: "Lanark Rd", district: "Belgravia" };
const GOLDEN = VENUES[1];
setParams({ id: GOLDEN.id });

installRouter([
  { match: /^\/restaurants\/[^/]+\/menu$/, json: menuFor(GOLDEN) },
  { match: /\/reopen-reminder$/, json: { set: false } },
]);

export default { wrap: withCart([line(D.stew, 1), line(D.roast, 1), line(D.chips, 1)], { restaurantId: VENUES[0].id, restaurantName: VENUES[0].name }) };
