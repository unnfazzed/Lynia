// Tab bar v1 (ledger D-56; packages/design/handoff/tab-bar-v1/): wraps an existing tab-root fixture in
// the real tab shell — the bar-space provider + the floating `TabBar` — so tools/parity/shoot-tab-bar.mjs
// shows the bar over the actual screen, exactly as the `(tabs)` layouts mount it.
import * as React from "react";
import { View } from "react-native";
import { APP_TABS, RIDER_TABS, TabBar } from "../../../../apps/mobile/src/ui/shell/TabBar.tsx";
import { TabBarSpaceProvider } from "../../../../apps/mobile/src/ui/shell/TabShell.tsx";

export function withTabBar(base, { role = "customer", active, badges = {} }) {
  const baseWrap = (base && (base.default?.wrap || base.wrap)) || ((el) => el);
  const tabs = role === "rider" ? RIDER_TABS : APP_TABS;
  return {
    wrap: (el) =>
      baseWrap(
        React.createElement(
          TabBarSpaceProvider,
          null,
          React.createElement(View, { style: { flex: 1, position: "relative" } }, el, React.createElement(TabBar, { tabs, active, badges, reduceMotion: true })),
        ),
      ),
  };
}
