// Order flow v2 · the Pharmacy storefront (S4) with ordering, rxEnabled on: the + on each row, a stepper
// under a row in the cart, "Prescription needed" on the Rx item, and the cart bar. Evidence-only.
import { I, PHARMACY, shopStore } from "./_shop_store.mjs";

export default shopStore({ shop: PHARMACY, cart: [[I.para, 1]], rx: true });
