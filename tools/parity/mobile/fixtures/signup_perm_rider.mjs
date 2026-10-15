// D-109 — the rider's after-sign-up permission steps (app/permissions.tsx ?from=signup): P1 first, then on to R1.
import { installRouter } from "./_harness.mjs";

window.__PARITY_PERMISSIONS = { location: "undetermined", notifications: "undetermined" };
window.__PARITY_ROUTE_PARAMS = { from: "signup", next: "/rider/become" };
installRouter([]);

export default {};
