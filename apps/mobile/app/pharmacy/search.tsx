import React from "react";
import { ShopSearchScreen } from "../../src/ui/browse/ShopSearchScreen";

/** Search inside Pharmacy — Browse v2 X3 scoped to the section (ledger D-58). */
export default function PharmacySearchRoute(): React.ReactElement {
  return <ShopSearchScreen service="pharmacy" />;
}
