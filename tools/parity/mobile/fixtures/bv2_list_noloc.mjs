// Browse v2 B7 — the restaurants list with no location: no fee, time or distance; the mint card on
// top. Evidence-only (tools/parity/shoot-browse-v2.mjs).
import { installRouter, withQuery } from "./_harness.mjs";
import { VENUES } from "./_browse_v2.mjs";

if (typeof window !== "undefined") window.__PARITY_PERMISSIONS = { location: "never" };
else globalThis.__PARITY_PERMISSIONS = { location: "never" };

installRouter([{ match: "/restaurants", json: { restaurants: VENUES } }]);

export default { wrap: withQuery() };
