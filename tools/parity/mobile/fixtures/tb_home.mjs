import * as base from "./food_home.mjs";
import { withTabBar } from "./_tab_bar.mjs";

export default withTabBar(base, { active: "home", badges: { orders: { kind: "live", n: 1 } } });
