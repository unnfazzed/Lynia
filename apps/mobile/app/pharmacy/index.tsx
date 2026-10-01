import React from "react";
import { ShopListScreen } from "../../src/ui/browse/ShopListScreen";

/** Pharmacy list — Browse v2 B4 (ledger D-58). */
export default function PharmacyListRoute(): React.ReactElement {
  return <ShopListScreen service="pharmacy" />;
}
