import { Redirect } from "expo-router";
import React from "react";

/**
 * `/food/cart` is no longer a screen: Order flow v2 merges cart and checkout into ONE Review & place
 * screen (R1, ledger D-59) at `/food/checkout`. Kept as a redirect so an old link or a stale back-stack
 * entry still lands on the cart.
 */
export default function FoodCartRedirect(): React.ReactElement {
  return <Redirect href="/food/checkout" />;
}
