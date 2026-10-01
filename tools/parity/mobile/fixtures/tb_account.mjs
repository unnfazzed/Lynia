import * as base from "./rv2_account_customer.mjs";
import { withTabBar } from "./_tab_bar.mjs";

export default withTabBar(base, { active: "account", badges: { orders: { kind: "live", n: 1 } } });
