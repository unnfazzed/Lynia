// LJ.perm_loc — first-run permission priming, the LOCATION step. permissions.tsx reads the primed flag
// from SecureStore (an inert no-op in parity ⇒ "not primed"), so it renders rather than forwarding, and
// `step` starts at "location". We set `next=/home` so the copy is customer-framed ("set your pickup pin
// … match you with the closest riders"). The NOTIFICATIONS step (LJ.perm_notif) is reached only by
// advancing internal state, which a fixture can't drive, so it's not reachable here.
import { setParams } from "./_harness.mjs";

setParams({ next: "/home" });

export default {};
