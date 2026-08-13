// RC.list_loading — the restaurant browse list on a COLD load: fetching with no data yet, so
// app/food/index.tsx early-returns its FoodListLoadingView (content-shaped skeletons, never a spinner).
// The Food flag resolves (default route → restaurantsEnabled on) so the screen gets past the flag-off
// state, but GET /restaurants is left hanging (a never-resolving promise) so the list query stays
// pending — `feed.isFetching && no data` — which is exactly the loading branch.
import { installRouter, withQuery } from "./_harness.mjs";

installRouter([]); // feature-flags on (default route); everything else inert 200
const inner = globalThis.fetch;
globalThis.fetch = (input, init) => {
  const raw = typeof input === "string" ? input : input && input.url ? input.url : String(input);
  let path = raw;
  try {
    path = new URL(raw, "http://parity.local").pathname;
  } catch {
    /* keep raw */
  }
  // The cursor-paginated list feed hits GET /restaurants (with query params) — hang it so the query
  // never settles and the cold-load skeleton stays on screen. The menu sub-route is untouched.
  if (/^\/restaurants$/.test(path)) return new Promise(() => {});
  return inner(input, init);
};

export default { wrap: withQuery() };
