// Order flow v2 customer shoot fixture (tools/parity/shoot-order-flow-customer.mjs, ledger D-59).
import { stage, T } from "./_order_flow.mjs";

const ln = (id, over) => ({ id: `b0000000-0000-4000-8000-00000000000${id}`, itemId: `c0000000-0000-4000-8000-00000000000${id}`, action: "swap", name: "Bread (Lobels 700g)", priceUsd: 1.1, quantity: 1, newQuantity: null, swapDishId: "d0000000-0000-4000-8000-000000000001", swapName: "Bakers Inn 700g", swapPriceUsd: 1.2, swapQuantity: 1, swapPhotoUrl: null, answer: null, ...over });
const round = (over) => ({ id: "a0000000-0000-4000-8000-000000000001", kind: "at_accept", status: "open", createdAt: T(-19_000), deadlineAt: T(161_000), resolvedAt: null, lines: [ln(1)], wasTotal: 16.1, keptSubtotal: 13.5, ...over });

// The handoff's sample: $16.10, one bread swap (+$0.10) that needs a yes.
export default stage({ status: "requested", phase: "awaiting_item_approval", food: { merchantGoodsTotal: 13.5, total: 15, itemApprovalDeadlineAt: T(161_000), substitution: round() } });
