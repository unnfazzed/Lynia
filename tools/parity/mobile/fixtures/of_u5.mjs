// Order flow v2 customer shoot fixture (tools/parity/shoot-order-flow-customer.mjs, ledger D-59).
import { stage } from "./_order_flow.mjs";

export default stage({ status: "cancelled", food: { rejectionReason: "all_out_of_stock" }, snap: { cancelledBy: null } });
