// RC.menu — a restaurant menu, populated: header + category tabs + dish rows. Route param `id` picks
// the restaurant; GET /restaurants/:id/menu returns the categories/dishes. The kitchen is open
// (all-day hours) so the closed card / reminder control stay hidden. Empty cart (no bottom cart bar).
import { installRouter, setParams } from "./_harness.mjs";
import { MENU, RID, withCart } from "./_food.mjs";

setParams({ id: RID });

installRouter([
  { match: /^\/restaurants\/[^/]+\/menu$/, json: MENU },
  { match: /\/reopen-reminder$/, json: { set: false } },
]);

export default { wrap: withCart([]) };
