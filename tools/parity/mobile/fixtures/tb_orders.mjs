import * as base from "./food_orders.mjs";
import { withTabBar } from "./_tab_bar.mjs";

export default withTabBar(base, { active: "orders", badges: { orders: { kind: "live", n: 1 } } });
