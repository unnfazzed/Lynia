// Orders v2 O18 — only a running order, nothing earlier (ledger D-63).
import { cooking, ordersFixture, SADZA } from "./_orders_v2.mjs";
export default ordersFixture({ active: [cooking(SADZA)], history: [] });
