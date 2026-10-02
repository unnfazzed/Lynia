// RC.cart_empty — the food cart with nothing in it. The cart lives in the real FoodCartProvider
// (withCart), seeded with [] so cart.ready flips true with zero lines — the condition the Review & place
// screen (app/food/checkout.tsx, Order flow v2 R9a, D-59) shows "Your cart is empty" + "Browse places" on.
// No menu read is needed — there are no lines to reconcile.
import { withCart } from "./_food.mjs";

export default { wrap: withCart([]) };
