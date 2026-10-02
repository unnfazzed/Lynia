// Order flow v2 customer shoot fixture (tools/parity/shoot-order-flow-customer.mjs, ledger D-59).
import { stage, T } from "./_order_flow.mjs";

const ln = (id, over) => ({ id: `b0000000-0000-4000-8000-00000000000${id}`, itemId: `c0000000-0000-4000-8000-00000000000${id}`, action: "swap", name: "Bread (Lobels 700g)", priceUsd: 1.1, quantity: 1, newQuantity: null, swapDishId: "d0000000-0000-4000-8000-000000000001", swapName: "Bakers Inn 700g", swapPriceUsd: 1.2, swapQuantity: 1, swapPhotoUrl: null, answer: null, ...over });
const round = (over) => ({ id: "a0000000-0000-4000-8000-000000000001", kind: "at_accept", status: "open", createdAt: T(-19_000), deadlineAt: T(161_000), resolvedAt: null, lines: [ln(1)], wasTotal: 16.1, keptSubtotal: 13.5, ...over });

// Mid-prep "Change items": the roast chicken for rice & chicken (−$1.00).
export default stage({ status: "requested", phase: "preparing", food: { merchantGoodsTotal: 9, total: 10.5, substitution: round({ kind: "mid_prep", wasTotal: 16.5, keptSubtotal: 9, lines: [ln(1, { name: "Roast chicken (half)", priceUsd: 6, swapName: "Rice & chicken", swapPriceUsd: 5 })] }) } });
