import * as base from "./rv2_account_rider.mjs";
import { withTabBar } from "./_tab_bar.mjs";

export default withTabBar(base, { role: "rider", active: "account", badges: { index: { kind: "count", n: 3 }, account: { kind: "dot" } } });
