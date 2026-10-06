// LJ.force_update — the hard version gate, now First Run v2 U1 (docs/DESIGN-DEVIATIONS.md D-80). No props.
//
// The one thing it DOES need staged is config: `src/config.ts` resolves STORE_URL once at module
// init, and `app/force-update.tsx` hides its primary button when there is no store URL. Without a
// store URL the screen renders without the mock's "Update now" — a fixture artefact, not a parity
// defect. Set it here (before the screen's module graph initializes — see mobile/bundle.mjs) so the
// screen stages the state the mock draws.
process.env.EXPO_PUBLIC_STORE_URL = process.env.EXPO_PUBLIC_STORE_URL || "https://play.google.com/store/apps/details?id=zw.co.lynia";

export default {};

// U1 draws the online state with the server's "New · Faster live tracking" line. Without a router the
// screen's requests fail, the reachability store flips offline and the render shows U3 instead; and the
// `whatsNew` line comes from the version gate the root layout fetches, which a lone screen never does.
import { installRouter } from "./_harness.mjs";
import { setServerVersionGateForTest } from "../../../../apps/mobile/src/net/use-server-version-gate";

installRouter([]);
setServerVersionGateForTest({ min: "99.0.0", recommended: null, whatsNew: "Faster live tracking" });
