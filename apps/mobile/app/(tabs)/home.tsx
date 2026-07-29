import { useRouter } from "expo-router";
import React from "react";
import { ScrollView, View } from "react-native";
import { useFeatureFlags } from "../../src/net/use-feature-flags";
import { AppScreen, BrandHeader, getServiceTiles, ServiceTiles } from "../../src/ui";

/**
 * The launcher — root home after login (plan §5 A1). Green `BrandHeader` (the one sanctioned
 * accent-filled surface) → service tiles. `LiveOrderCard` / "Send again" / "Restaurants near you"
 * content lands in A2; this screen only needs to be a real, navigable root.
 */
export default function LauncherHomeScreen(): React.ReactElement {
  const router = useRouter();
  const { restaurantsEnabled } = useFeatureFlags();
  const services = getServiceTiles(restaurantsEnabled);

  const onService = (id: string): void => {
    if (id === "express") router.push("/send");
    // Food tile only renders live when restaurantsEnabled (getServiceTiles), so this branch is only
    // reachable with the flag on — D1 shipped the browse route it pushes to.
    else if (id === "food") router.push("/food");
  };

  return (
    <AppScreen
      dark
      banner={
        <BrandHeader
          address="Harare"
          onAddress={() => router.push("/send")}
          onSearch={() => router.push("/send")}
          onBell={() => router.push("/notifications")}
          onProfile={() => router.push("/account")}
        />
      }
    >
      <ScrollView contentContainerStyle={{ paddingTop: 8 }} showsVerticalScrollIndicator={false}>
        <View style={{ paddingHorizontal: 10 }}>
          <ServiceTiles services={services} onService={onService} />
        </View>
      </ScrollView>
    </AppScreen>
  );
}
