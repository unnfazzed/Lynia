// LJ.splash — the brand-green boot moment (app/splash.view.tsx, rendered by app/index.tsx while the
// boot reads settle). Pure presentation: no route params, no queries, no providers — the fixture only
// installs the inert router so nothing reaches the network.
import { installRouter } from "./_harness.mjs";

installRouter([]);

export default {};
