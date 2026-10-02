// Order flow v2 R6a · changed since the cart: the chicken sold out, the stew went up to $5.00. See _review.mjs.
import { stage, SADZA, CHICKEN, DRINK, GREENS } from "./_review.mjs";

export default stage({ dishes: [{ ...SADZA, priceUsd: 5 }, { ...CHICKEN, outOfStock: true }, DRINK, GREENS] });
