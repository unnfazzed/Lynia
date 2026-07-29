import { Tabs } from "expo-router";
import React from "react";
import { RIDER_TABS, TabBar } from "../../../src/ui";

/**
 * Rider tab shell (plan `docs/plans/2026-07-28-restaurants-send-joint-launch-plan.md` §5 Lane B1):
 * Jobs | Money | Account. Nested under the existing `/rider` segment (not the app root) — the
 * board tab is `index.tsx`, so its route stays exactly `"/rider"`, the same string every existing
 * call site (`boot-route.ts`, `role.tsx`, `push.ts`, the rider onboarding screens, …) already uses.
 * Mirrors `app/(tabs)/_layout.tsx`'s `tabBar` override 1:1, swapped to `RIDER_TABS`.
 */
export default function RiderTabsLayout(): React.ReactElement {
  return (
    <Tabs
      screenOptions={{ headerShown: false }}
      tabBar={({ state, navigation }) => (
        <TabBar
          tabs={RIDER_TABS}
          active={state.routeNames[state.index]}
          onTab={(id) => {
            if (id !== state.routeNames[state.index]) navigation.navigate(id);
          }}
        />
      )}
    >
      {RIDER_TABS.map((t) => (
        <Tabs.Screen key={t.id} name={t.id} options={{ title: t.label }} />
      ))}
    </Tabs>
  );
}
