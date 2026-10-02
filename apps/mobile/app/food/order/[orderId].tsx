import { Redirect, useLocalSearchParams } from "expo-router";
import React from "react";

/**
 * Retired (Order flow v2, ledger D-59): a restaurant order now lives on the one order screen,
 * `app/order/[id].tsx`. The route stays so an old push, deep link or saved history row still lands on
 * the order.
 */
export default function FoodOrderRedirect(): React.ReactElement {
  const { orderId } = useLocalSearchParams<{ orderId: string }>();
  return <Redirect href={`/order/${typeof orderId === "string" ? orderId : ""}`} />;
}
