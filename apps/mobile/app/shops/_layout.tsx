import { Stack } from "expo-router";
import React from "react";
import { FoodCartProvider } from "../../src/food/cart-context";

/** `/shops/*` — the Shops section (ledgers D-58, D-59). It shares the one cart with `/food`: the provider
 *  reads the same store, so the cart bar's Review (under `/food`) sees this basket. */
export default function ShopsLayout(): React.ReactElement {
  return (
    <FoodCartProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </FoodCartProvider>
  );
}
