// Browse v2 X4a — no results (D-57 part 3). Evidence-only (tools/parity/shoot-browse-v2.mjs).
import * as SecureStore from "expo-secure-store";
import { installRouter, setParams, withQuery } from "./_harness.mjs";
import { RECENT, searchRoutes } from "./_browse_v2.mjs";

if (typeof window !== "undefined") {
  window.__PARITY_REVERSE_GEOCODE = { name: "12 Lanark Rd", streetNumber: "12", street: "Lanark Rd", district: "Belgravia" };
  window.__PARITY_SETTLE_MS = 1500;
}
void SecureStore.setItemAsync("lynia.recentSearches.v1", JSON.stringify(RECENT));
setParams({ scope: "all", q: "fufu" });
installRouter(searchRoutes("fufu"));

export default { wrap: withQuery() };
