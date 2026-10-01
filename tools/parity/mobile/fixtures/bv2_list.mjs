// Browse v2 B1 — the restaurants list with the handoff's six venues (one closing soon, one unrated,
// one closed). Evidence-only (tools/parity/shoot-browse-v2.mjs).
import { installRouter, withQuery } from "./_harness.mjs";
import { VENUES } from "./_browse_v2.mjs";

if (typeof window !== "undefined") window.__PARITY_REVERSE_GEOCODE = { name: "12 Lanark Rd", streetNumber: "12", street: "Lanark Rd", district: "Belgravia" };

installRouter([{ match: "/restaurants", json: { restaurants: VENUES } }]);

export default { wrap: withQuery() };
