import * as base from "./rv2_board.mjs";
import { withTabBar } from "./_tab_bar.mjs";

export default withTabBar(base, { role: "rider", active: "index", badges: { money: { kind: "warn" } } });
