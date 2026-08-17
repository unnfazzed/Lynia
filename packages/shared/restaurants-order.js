// Metro-resolution shim for `@lynia/shared/restaurants-order` (MOB-BOOT-03-SIB-2) — same mechanism
// as ./tokens.js. Exists because apps/mobile/src/logic/food-cart.ts is EAGER at boot (reached via
// app/food/_layout.tsx → cart-context; expo-router evaluates every layout while building the route
// tree), and its RESTAURANTS_PRICING import through the barrel would drag zod back onto the launch
// path. restaurants-order.ts itself is zod-free (it imports only ./money).
module.exports = require("./dist/restaurants-order.js");
