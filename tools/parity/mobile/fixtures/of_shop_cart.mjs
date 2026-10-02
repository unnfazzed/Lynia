// Order flow v2 · the Shop storefront (S3) with ordering: + in each tile, the stepper under a tile in the
// cart, and the cart bar. Evidence-only (shoot-order-flow-shops.mjs).
import { FRESH, I, shopStore } from "./_shop_store.mjs";

export default shopStore({ shop: FRESH, cart: [[I.eggs, 1], [I.bread, 2]] });
