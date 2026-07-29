import { tokens } from "@lynia/shared";
import { useRouter } from "expo-router";
import React from "react";
import { View } from "react-native";
import { AppScreen, Button, EmptyState, Heading, Sub } from "../../src/ui";

/**
 * Orders tab (plan §5 A1 shell — content absorption from `app/history/` is A3's job). A working,
 * honest bridge in the meantime: the full cross-service order list still lives at the standalone
 * `/history` route until A3 folds it in here directly.
 */
export default function OrdersTabScreen(): React.ReactElement {
  const router = useRouter();
  return (
    <AppScreen>
      <View style={{ flex: 1, padding: tokens.space.screen }}>
        <Heading>Orders</Heading>
        <Sub>Every parcel and food order, one list.</Sub>
        <EmptyState icon="history" title="See your orders" message="Your parcels and food orders, across every service.">
          <Button label="View trip history" onPress={() => router.push("/history")} />
        </EmptyState>
      </View>
    </AppScreen>
  );
}
