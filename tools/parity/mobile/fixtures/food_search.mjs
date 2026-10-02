// RC.search — search inside Restaurants (Browse v2 X3, ledger D-57), populated with results. The query
// arrives as the route's `q` param (the storefront's "Search all" passes one), so nothing is typed; the
// screen's 300 ms debounce runs before the settle. GET /restaurants/search answers PLACES + DISHES.
import { installRouter, setParams, withQuery } from "./_harness.mjs";
import { searchRoutes } from "./_browse_v2.mjs";

if (typeof window !== "undefined") window.__PARITY_SETTLE_MS = 1500;
setParams({ scope: "food", q: "sadza" });
installRouter(searchRoutes("sadza"));

export default { wrap: withQuery() };
