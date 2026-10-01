import { Stack } from "expo-router";
import React from "react";

/** `/pharmacy/*` — the Pharmacy section (ledger D-58). Browse only, so no cart provider yet. */
export default function PharmacyLayout(): React.ReactElement {
  return <Stack screenOptions={{ headerShown: false }} />;
}
