// Browse v2 S1 — Gava's Kitchen, open, with the Popular rail. Evidence-only (shoot-browse-v2.mjs).
import { installRouter, setParams } from "./_harness.mjs";
import { withCart } from "./_food.mjs";
import { GAVA, menuFor } from "./_browse_v2.mjs";

if (typeof window !== "undefined") window.__PARITY_REVERSE_GEOCODE = { name: "12 Lanark Rd", streetNumber: "12", street: "Lanark Rd", district: "Belgravia" };
setParams({ id: GAVA.id });

installRouter([
  { match: /^\/restaurants\/[^/]+\/menu$/, json: menuFor(GAVA) },
  { match: /\/reopen-reminder$/, json: { set: false } },
]);

export default { wrap: withCart([]) };
