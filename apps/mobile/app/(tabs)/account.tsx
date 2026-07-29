import { tokens } from "@lynia/shared";
import { useRouter } from "expo-router";
import React from "react";
import { View } from "react-native";
import { AppScreen, Button, Card, Heading, Sub } from "../../src/ui";

/**
 * Account tab (plan §5 A1 shell — absorbing profile/settings/help/notifications is A3's job). A
 * working, honest bridge in the meantime: full account management still lives at the standalone
 * `/profile` route until A3 folds it in here directly.
 */
export default function AccountTabScreen(): React.ReactElement {
  const router = useRouter();
  return (
    <AppScreen>
      <View style={{ flex: 1, padding: tokens.space.screen }}>
        <Heading>Account</Heading>
        <Sub>Your details, trips and settings.</Sub>
        <Card>
          <Button label="View account" onPress={() => router.push("/profile")} />
        </Card>
      </View>
    </AppScreen>
  );
}
