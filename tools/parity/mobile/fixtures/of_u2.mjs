// Order flow v2 customer shoot fixture (tools/parity/shoot-order-flow-customer.mjs, ledger D-59).
import { stage, T } from "./_order_flow.mjs";

export default stage({ status: "requested", phase: "awaiting_item_approval", food: { itemApprovalDeadlineAt: T(52_000), merchantGoodsTotal: 9, total: 10.5, items: [
    { dishId: "0a1b2c3d-0000-4000-8000-000000000201", name: "Sadza & beef stew", priceUsd: 4.5, quantity: 2, note: "Extra gravy", available: true },
    { dishId: "0a1b2c3d-0000-4000-8000-000000000202", name: "Roast chicken (half)", priceUsd: 6, quantity: 1, note: null, available: false },
  ] } });
