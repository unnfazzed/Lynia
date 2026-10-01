import { Tabs } from "expo-router";
import React from "react";
import { APP_TABS, ShellTabBar, TabBarSpaceProvider, useCustomerTabBadges } from "../../src/ui";

/**
 * Root tab shell (plan `docs/plans/2026-07-28-restaurants-send-joint-launch-plan.md` §5 Lane A1):
 * Home | Orders | Account. Routes inside this `(tabs)` group keep the segment name in their path (e.g.
 * `app/(tabs)/home.tsx` → `/home`) — the group folder itself is invisible to the URL.
 *
 * `tabBar` renders the tab bar v1 floating pill (`packages/design/handoff/tab-bar-v1/`, ledger D-56).
 * It floats over the screens, so `TabBarSpaceProvider` hands each tab root its bottom reserve
 * (`useTabBarSpace`). `tab.id` is deliberately the route's file name, so a press needs no lookup table.
 */
export default function TabsLayout(): React.ReactElement {
  const badges = useCustomerTabBadges();
  return (
    <TabBarSpaceProvider>
      <Tabs screenOptions={{ headerShown: false }} tabBar={({ state, navigation }) => <ShellTabBar tabs={APP_TABS} state={state} navigation={navigation} badges={badges} />}>
        {APP_TABS.map((t) => (
          <Tabs.Screen key={t.id} name={t.id} options={{ title: t.label }} />
        ))}
      </Tabs>
    </TabBarSpaceProvider>
  );
}
