// RC.cart_empty — the food cart with nothing in it. The cart lives in the real FoodCartProvider
// (withCart), seeded with [] so cart.ready flips true with zero lines, which is the exact condition
// app/food/cart.tsx early-returns its CartEmptyView on (the generated RC.cart_empty view: "Your cart
// is empty" + "Browse restaurants"). No menu read is needed — there are no lines to reconcile.
import { withCart } from "./_food.mjs";

export default { wrap: withCart([]) };
