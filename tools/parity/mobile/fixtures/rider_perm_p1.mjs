// First Run v2 P1 — the rider's first permission ask, "Jobs start with location" (ledger D-82). The
// location shim answers "granted" by default, and app/permissions.tsx skips every step with nothing to
// ask, so a default render leaves the screen at once. Stage location as not yet asked: the flow then
// opens on P1, the state the handoff draws.
import { installRouter } from "./_harness.mjs";

window.__PARITY_PERMISSIONS = { location: "undetermined" };
installRouter([]);

export default {};
