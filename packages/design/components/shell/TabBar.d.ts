import * as React from "react";

export interface AppTab {
  id: string;
  icon: string;
  label: string;
}

export interface TabBarProps {
  /** Id of the active tab. Default "home". */
  active?: string;
  /** Defaults to Home · Orders · Account. */
  tabs?: AppTab[];
  /** Tab id that shows an unread dot. */
  dot?: string;
  onTab?: (id: string) => void;
  style?: React.CSSProperties;
}

/**
 * Root bottom navigation — three tabs, never a product switcher (verticals are tiles on Home).
 * @dsCard group="Components"
 */
export declare function TabBar(props: TabBarProps): React.ReactElement;
