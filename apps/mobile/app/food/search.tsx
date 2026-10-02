import { useLocalSearchParams } from "expo-router";
import React from "react";
import { BrowseSearchScreen } from "../../src/ui/browse/BrowseSearchScreen";

/** Search — Browse v2 X1–X4 (`packages/design/handoff/browse-v2`, ledger D-57). `?scope=all` from Home
 *  searches every switched-on section; otherwise it searches Restaurants (X3). A storefront's "Search all"
 *  carries its query as `?q=`. Shops and Pharmacy search lives in their own sections (D-58). */
export default function SearchScreen(): React.ReactElement {
  const { scope, q } = useLocalSearchParams<{ scope?: string; q?: string }>();
  return <BrowseSearchScreen scope={scope === "all" ? "all" : "food"} initialQuery={typeof q === "string" ? q : ""} />;
}
