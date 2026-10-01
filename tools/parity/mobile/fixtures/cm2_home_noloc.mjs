// Calm Mint v2 H6 (packages/design/handoff/calm-mint-v2-2026-10, ledger D-55): Home with no address
// yet. Location is refused for good, so the header reads "NO ADDRESS YET · Set your location" and the
// rails give way to the "Where should we deliver?" card. Evidence-only (tools/parity/shoot-calm-mint.mjs).
import { installRouter, withQuery } from "./_harness.mjs";

if (typeof window !== "undefined") window.__PARITY_PERMISSIONS = { location: "never" };
else globalThis.__PARITY_PERMISSIONS = { location: "never" };

installRouter([
  { match: /^\/auth\/me$/, json: { profileId: "0a1b2c3d-0000-4000-8000-0000000000c1", role: "customer", firstName: "Rudo", lastName: "Chikafu" } },
  { match: /^\/notifications\/unread-count$/, json: { count: 0 } },
  { match: /^\/orders\/mine\/active-orders$/, json: [] },
  { match: /^\/orders\/mine\/active-order$/, json: null },
  { match: "/restaurants", json: { restaurants: [] } },
]);

export default { wrap: withQuery() };
