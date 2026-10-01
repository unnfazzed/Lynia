import * as base from "./rv2_money_floor.mjs";
import { withTabBar } from "./_tab_bar.mjs";

export default withTabBar(base, { role: "rider", active: "money", badges: { index: { kind: "count", n: 3 }, money: { kind: "warn" } } });
