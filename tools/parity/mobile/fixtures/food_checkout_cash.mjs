// RC.checkout_cash — the food checkout, CASH path (the screen's default paymentMethod). Populated:
// deliver-to map + address search, landmark/phone fields, the "HOW YOU'LL PAY" rows with "Cash at the
// door" selected, the PriceMath (Food / delivery estimate / Total) and the cash CTA. Cart is seeded
// via the real provider; GET /restaurants/:id/menu is served so the restaurant (name, hours=open,
// location) resolves and the form renders instead of the loading skeleton.
import { installRouter } from "./_harness.mjs";
import { DISHES, MENU, line, withCheckout } from "./_food.mjs";

installRouter([{ match: /^\/restaurants\/[^/]+\/menu$/, json: MENU }]);

export default {
  wrap: withCheckout([line(DISHES.sadza, 2), line(DISHES.chicken, 1), line(DISHES.drink, 2, "Extra cold")]),
};
