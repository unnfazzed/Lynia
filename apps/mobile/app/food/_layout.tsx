import { Stack } from "expo-router";
import React from "react";
import { FoodCartProvider } from "../../src/food/cart-context";

/** Every `/food/*` route shares one cart (survives navigating list → menu → cart, and an app
 *  restart via FoodCartProvider's own SecureStore persistence — §3 of RESTAURANTS-DECISIONS.md). */
export default function FoodLayout(): React.ReactElement {
  return (
    <FoodCartProvider>
      <Stack screenOptions={{ headerShown: false }} />
    </FoodCartProvider>
  );
}
