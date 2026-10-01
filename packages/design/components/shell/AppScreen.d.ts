import * as React from "react";

export interface AppScreenProps {
  children?: React.ReactNode;
  /** Sticky footer content (primary action). */
  footer?: React.ReactNode;
  /** Active root tab id — omit for pushed screens with no tab bar. */
  tab?: string;
  /** Override the tab set (e.g. the rider's Jobs · Money · Account). Defaults to the customer tabs. */
  tabs?: { id: string; glyph: "home" | "orders" | "account" | "jobs" | "money"; label: string }[];
  /** Tab id showing an unread dot (deprecated — use `tabBadges`). */
  tabDot?: string;
  /** Typed tab badges (tab-bar v1): `{ [tabId]: { kind: "dot" | "count" | "live" | "warn", n? } }`. */
  tabBadges?: Record<string, { kind: "dot" | "count" | "live" | "warn"; n?: number }>;
  /** Tab set role — "rider" selects Jobs · Money · Account. Default "customer". */
  role?: "customer" | "rider";
  /** Bottom safe-area inset in px (gesture nav ≈ 24, 3-button nav 0). */
  inset?: number;
  /** Full-width strip under the status bar (offline banner, alerts). */
  banner?: React.ReactNode;
  /** Page background. Default var(--bg). Use var(--accent) when the top is the brand header. */
  bg?: string;
  /** Light-on-accent status bar. */
  dark?: boolean;
  onTab?: (id: string) => void;
  style?: React.CSSProperties;
}

/**
 * Phone screen scaffold: status bar → banner → body → sticky footer → root tab bar. Wrap every
 * app screen in this so chrome is identical across journeys.
 * @dsCard group="Components"
 */
export declare function AppScreen(props: AppScreenProps): React.ReactElement;
