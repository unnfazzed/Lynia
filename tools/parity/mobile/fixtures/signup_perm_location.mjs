// D-109 — the customer's first after-sign-up permission screen, "Deliver to your door" (app/setup-permissions.tsx).
// The shims answer "granted" by default and the screen skips every step with nothing to ask, so stage location
// and notifications as not yet asked: it then opens on the location step.
import { installRouter } from "./_harness.mjs";

window.__PARITY_PERMISSIONS = { location: "undetermined", notifications: "undetermined" };
window.__PARITY_ROUTE_PARAMS = { next: "/home" };
installRouter([]);

export default {};
