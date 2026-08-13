// RC.list_error — the restaurant browse list on a COLD offline/fetch failure: the fetch settles in
// error with NO data (not even a stale copy), so app/food/index.tsx early-returns its FoodListErrorView
// (offline banner → AppBar → Card → EmptyState with a Try-again). The Food flag resolves (default route)
// so the screen gets past the flag-off state; GET /restaurants answers 500, which apiFetch throws on and
// the list query (retry:false in the parity QueryClient) surfaces as `feed.isError` with no restaurants.
import { installRouter, withQuery } from "./_harness.mjs";

installRouter([{ match: /^\/restaurants$/, json: { message: "offline" }, status: 500 }]);

export default { wrap: withQuery() };
