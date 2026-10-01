import React from "react";
import { ShopSearchScreen } from "../../src/ui/browse/ShopSearchScreen";

/** Search inside Shops — Browse v2 X3 scoped to the section (ledger D-58). */
export default function ShopsSearchRoute(): React.ReactElement {
  return <ShopSearchScreen service="shops" />;
}
