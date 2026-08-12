// LJ.privacy — the in-app privacy screen (three disclosure cards + the data-copy and delete rows).
// Static copy only: no route params, no queries. The QueryClient wrap is there because the screen
// sits under the app's providers in the tree it ships in.
import { installRouter, withQuery } from "./_harness.mjs";

installRouter([]);

export default { wrap: withQuery() };
