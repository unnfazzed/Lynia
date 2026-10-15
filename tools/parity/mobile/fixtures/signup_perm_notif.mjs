// D-109 — the customer's second after-sign-up permission screen, "Know when it's at the gate"
// (app/setup-permissions.tsx). Location already allowed, notifications not yet asked: it opens on updates.
import { installRouter } from "./_harness.mjs";

window.__PARITY_PERMISSIONS = { location: "granted", notifications: "undetermined" };
window.__PARITY_ROUTE_PARAMS = { next: "/home" };
installRouter([]);

export default {};
