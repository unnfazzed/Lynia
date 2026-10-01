import * as base from "./rv2_gate_failed.mjs";
import { withTabBar } from "./_tab_bar.mjs";

export default withTabBar(base, { role: "rider", active: "index" });
