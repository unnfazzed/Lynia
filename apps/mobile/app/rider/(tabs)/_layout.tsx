import { Tabs } from "expo-router";
import React, { useEffect, useState } from "react";
import { ensureJobAlertChannel } from "../../../src/permissions/notifications";
import { RIDER_TABS, ShellTabBar, TabBarSpaceProvider, useRiderTabBadges } from "../../../src/ui";

/**
 * Rider tab shell (plan `docs/plans/2026-07-28-restaurants-send-joint-launch-plan.md` §5 Lane B1):
 * Jobs | Money | Account. Nested under the existing `/rider` segment (not the app root) — the board tab
 * is `index.tsx`, so its route stays exactly `"/rider"`. Mirrors `app/(tabs)/_layout.tsx` with
 * `RIDER_TABS` and the rider badges (new jobs, top-up needed, verification).
 */
export default function RiderTabsLayout(): React.ReactElement {
  const [active, setActive] = useState<string | undefined>("index");
  const badges = useRiderTabBadges(active);
  // The `job-alerts` Android channel (loud: HIGH + sound) exists before the first job ping or food-offer alarm
  // posts on it — the API sends both there (First Run v2 P12, ledger D-81). Idempotent.
  useEffect(() => {
    void ensureJobAlertChannel();
  }, []);
  return (
    <TabBarSpaceProvider>
      <Tabs
        screenOptions={{ headerShown: false }}
        screenListeners={{ state: (e) => setActive(activeRoute(e.data)) }}
        tabBar={({ state, navigation }) => <ShellTabBar tabs={RIDER_TABS} state={state} navigation={navigation} badges={badges} />}
      >
        {RIDER_TABS.map((t) => (
          <Tabs.Screen key={t.id} name={t.id} options={{ title: t.label }} />
        ))}
      </Tabs>
    </TabBarSpaceProvider>
  );
}

/** The focused tab's route name from a `state` event — the Jobs badge clears while Jobs is open. */
function activeRoute(data: unknown): string | undefined {
  const s = (data as { state?: { index?: number; routeNames?: string[] } } | undefined)?.state;
  return s?.routeNames && s.index != null ? s.routeNames[s.index] : undefined;
}
