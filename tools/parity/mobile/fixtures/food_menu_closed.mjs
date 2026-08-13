// RC.menu_closed — the restaurant menu when the kitchen is CLOSED. The container app/food/[id].tsx
// derives open/closed from the restaurant's `hours` (isMerchantOpenNow) and, when closed, renders the
// inline closed notice (clock + "<name> is closed" copy) with the working RemindWhenOpen control above
// the category tabs. Same populated MENU as RC.menu, but the restaurant's hours are emptied ({} = every
// day absent = closed always, independent of the render clock), so the closed state renders
// deterministically. GET …/reopen-reminder feeds the reminder control's initial (unset) state.
import { installRouter, setParams } from "./_harness.mjs";
import { MENU, RESTAURANT, RID, withCart } from "./_food.mjs";

setParams({ id: RID });

const closedMenu = { ...MENU, restaurant: { ...RESTAURANT, hours: {} } };

installRouter([
  { match: /^\/restaurants\/[^/]+\/menu$/, json: closedMenu },
  { match: /\/reopen-reminder$/, json: { set: false } },
]);

export default { wrap: withCart([]) };
