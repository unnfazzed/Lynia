

// R-6 (QA 2026-10-20): the contracts live in topic modules under ./contracts/; this file is the front door,
// so every `from "./contracts"` / `@lynia/shared` import is unchanged. Add a new schema to its topic's module.
export * from "./contracts/core";
export * from "./contracts/realtime";
export * from "./contracts/rum";
export * from "./contracts/version-gate";
export * from "./contracts/wallet";
export * from "./contracts/merchant";
export * from "./contracts/browse";
export * from "./contracts/food-order";
export * from "./contracts/order-flow-v2";
export * from "./contracts/merchant-money";
export * from "./contracts/merchant-bookings";
export * from "./contracts/merchant-team";
export * from "./contracts/own-bikers";
