import { Stack } from "expo-router";
import React from "react";

/** `/shops/*` — the Shops section (ledger D-58). Browse only, so no cart provider yet. */
export default function ShopsLayout(): React.ReactElement {
  return <Stack screenOptions={{ headerShown: false }} />;
}
