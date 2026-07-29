import { Tabs } from "expo-router";
import React from "react";
import { APP_TABS, TabBar } from "../../src/ui";

/**
 * Root tab shell (plan `docs/plans/2026-07-28-restaurants-send-joint-launch-plan.md` §5 Lane A1):
 * Home | Orders | Account, replacing the old rootless single-composer app. Routes inside this
 * `(tabs)` group keep the segment name in their path (e.g. `app/(tabs)/home.tsx` → `/home`) —
 * the group folder itself is invisible to the URL — so `bootDestination()`'s existing `"/home"`
 * return value now lands on the launcher with no change there.
 *
 * `tabBar` renders the design-matching `TabBar` primitive instead of React Navigation's default
 * chrome; `tab.id` is deliberately the same string as its route's file name, so a press needs no
 * id→route lookup table.
 */
export default function TabsLayout(): React.ReactElement {
  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={({ state, navigation }) => (
        <TabBar
          active={state.routeNames[state.index]}
          onTab={(id) => {
            if (id !== state.routeNames[state.index]) navigation.navigate(id);
          }}
        />
      )}
    >
      {APP_TABS.map((t) => (
        <Tabs.Screen key={t.id} name={t.id} options={{ title: t.label }} />
      ))}
    </Tabs>
  );
}
