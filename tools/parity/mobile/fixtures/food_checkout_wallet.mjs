// RC.checkout_wallet — SUPERSEDED (docs/DESIGN-DEVIATIONS.md D-59): food is cash only, so the Order flow
// v2 Review & place screen has no mobile-money row to select. The key stays wired to the same populated
// Review as food_checkout_cash so the render lane still shows what replaced it.
import { installRouter } from "./_harness.mjs";
import { DISHES, MENU, line, withCheckout } from "./_food.mjs";

installRouter([{ match: /^\/restaurants\/[^/]+\/menu$/, json: MENU }]);

export default {
  wrap: withCheckout([line(DISHES.sadza, 2), line(DISHES.chicken, 1), line(DISHES.drink, 2, "Extra cold")]),
};
