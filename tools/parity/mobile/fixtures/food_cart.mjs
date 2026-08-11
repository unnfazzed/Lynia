// RC.cart — the food cart, populated: line items with qty steppers, per-line note affordance, the
// whole-order note field, price math (Food / Total) and the "Go to checkout" CTA. The cart is seeded
// via the real FoodCartProvider (withCart); GET /restaurants/:id/menu is served so the cart's
// reconciliation matches the seeded lines (same prices) instead of dropping them as sold out.
import { installRouter } from "./_harness.mjs";
import { DISHES, MENU, line, withCart } from "./_food.mjs";

installRouter([{ match: /^\/restaurants\/[^/]+\/menu$/, json: MENU }]);

export default {
  wrap: withCart([line(DISHES.sadza, 2), line(DISHES.chicken, 1), line(DISHES.drink, 2, "Extra cold")]),
};
