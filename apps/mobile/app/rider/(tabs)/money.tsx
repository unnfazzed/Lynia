import { tokens } from "@lynia/shared";
import { useRouter } from "expo-router";
import React from "react";
import { View } from "react-native";
import { AppScreen, Button, Card, Heading, Sub } from "../../../src/ui";

/**
 * Money tab (plan §5 B1 shell — merging `app/wallet/*` + `app/earnings/*` into one Money tab, with
 * the "yours" vs "owed to a kitchen" cash split, is B3's job). A working, honest bridge in the
 * meantime: balance/top-up and earnings history still live at the standalone `/wallet` and
 * `/earnings` routes until B3 folds them in here directly.
 */
export default function RiderMoneyTabScreen(): React.ReactElement {
  const router = useRouter();
  return (
    <AppScreen>
      <View style={{ flex: 1, padding: tokens.space.screen }}>
        <Heading>Money</Heading>
        <Sub>Your commission balance and earnings, in one place.</Sub>
        <Card>
          <Button label="Wallet & top-up" onPress={() => router.push("/wallet")} />
          <Button label="Earnings history" variant="ghost" onPress={() => router.push("/earnings")} />
        </Card>
      </View>
    </AppScreen>
  );
}
