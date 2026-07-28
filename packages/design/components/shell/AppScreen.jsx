import React from "react";
import { StatusBar } from "./StatusBar.jsx";
import { TabBar } from "./TabBar.jsx";

/**
 * Phone screen scaffold — status bar, optional banner strip, body, sticky footer, root tab bar.
 * Every app screen in the mocks and the prototype sits in one of these, so chrome never drifts
 * between journeys.
 */
export function AppScreen({ children, footer, tab, tabs, tabDot, banner, bg = "var(--bg)", dark = false, onTab, style, ...rest }) {
  return (
    <div style={{ position: "relative", height: "100%", background: bg, display: "flex", flexDirection: "column", overflow: "hidden", fontFamily: "var(--font-sans)", ...style }} {...rest}>
      <StatusBar dark={dark} />
      {banner}
      <div style={{ flex: 1, minHeight: 0, overflowY: "auto", overflowX: "hidden", paddingBottom: tab ? 58 : 0, scrollbarWidth: "none", msOverflowStyle: "none" }}>{children}</div>
      {footer ? <div style={{ padding: "8px 16px 12px", background: "var(--bg)", borderTop: "1px solid var(--line)", marginBottom: tab ? 58 : 0 }}>{footer}</div> : null}
      {tab ? <TabBar active={tab} tabs={tabs} dot={tabDot} onTab={onTab} /> : null}
    </div>
  );
}
